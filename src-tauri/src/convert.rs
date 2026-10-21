// Office/CAD → PDF with the pack's LibreOffice (and LibreDWG for DWG), on a temp copy of the file. The program
// lines mirror src/lib/convert.ts `commands()` (unit-tested there against the real pack): DWG → dwg2dxf → Draw PDF
// export; DXF → Draw PDF export; Office → PDF. LibreOffice gets a throw-away profile with macros switched off
// (MacroSecurityLevel 3) and Arabic fonts replaced by Amiri, no window, 3 minutes per program, cancel from the page; the temp folder is removed
// whatever happens. No network: the converters only read the temp copy and write beside it.
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

pub static CANCEL: AtomicBool = AtomicBool::new(false);
static N: AtomicU64 = AtomicU64::new(0);
const OFFICE: [&str; 9] = ["doc", "docx", "odt", "xls", "xlsx", "ods", "ppt", "pptx", "odp"];
const TIMEOUT: std::time::Duration = std::time::Duration::from_secs(180);
// Fonts a converted document should use for Arabic: Amiri (SIL OFL, src-tauri/fonts; Noto Naskh Arabic was tried first: its PDF text extracts with doubled letters). The pack has no
// font folder LibreOffice reads, so they are copied into its share/fonts/truetype (idempotent, a few hundred KB).
const FONTS: [(&str, &[u8]); 2] = [("Amiri-Regular.ttf", include_bytes!("../fonts/Amiri-Regular.ttf")), ("Amiri-Bold.ttf", include_bytes!("../fonts/Amiri-Bold.ttf"))];
// Complex-script fonts a document may name (Word writes Mangal, a Devanagari face, for Arabic text it was never given a
// font for): LibreOffice would pick whatever installed font has the glyphs (a Nastaliq one on some PCs), so they are
// replaced, always, by Amiri. Latin fonts are left alone.
const REPLACED: [&str; 21] = ["Mangal", "Aparajita", "Kokila", "Utsaah", "Raavi", "Latha", "Gautami", "Shruti", "Tunga", "Vrinda", "Sylfaen", "Nirmala UI", "Ghalam", "Urdu Typesetting", "Traditional Arabic", "Simplified Arabic", "Arabic Typesetting", "Sakkal Majalla", "Andalus", "Noto Nastaliq Urdu", "Jameel Noori Nastaleeq"];

/// registrymodifications.xcu: macros off (MacroSecurityLevel 3) and the font replacement table above.
fn profile_xcu() -> String {
    let pairs: String = REPLACED.iter().enumerate().map(|(i, f)| format!(r#"<item oor:path="/org.openoffice.Office.Common/Font/Substitution/FontPairs"><node oor:name="_{i}" oor:op="replace"><prop oor:name="Always" oor:op="fuse"><value>true</value></prop><prop oor:name="OnScreenOnly" oor:op="fuse"><value>false</value></prop><prop oor:name="ReplaceFont" oor:op="fuse"><value>{f}</value></prop><prop oor:name="SubstituteFont" oor:op="fuse"><value>Amiri</value></prop></node></item>"#)).collect();
    format!(r#"<?xml version="1.0" encoding="UTF-8"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item><item oor:path="/org.openoffice.Office.Common/Font/Substitution"><prop oor:name="Replacement" oor:op="fuse"><value>true</value></prop></item>{pairs}</oor:items>"#)
}

fn install_fonts(soffice: &Path) {
    let Some(dir) = soffice.parent().and_then(|p| p.parent()).map(|p| p.join("share/fonts/truetype")) else { return };
    let _ = std::fs::create_dir_all(&dir);
    for (name, bytes) in FONTS {
        let f = dir.join(name);
        if std::fs::metadata(&f).map(|m| m.len() != bytes.len() as u64).unwrap_or(true) {
            let _ = std::fs::write(f, bytes);
        }
    }
}

struct Clean(PathBuf);
impl Drop for Clean {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// `file:///C:/...` with spaces and friends escaped, as LibreOffice wants its -env:UserInstallation.
fn file_url(p: &Path) -> String {
    const SET: &percent_encoding::AsciiSet = &percent_encoding::CONTROLS.add(b' ').add(b'#').add(b'%').add(b'?').add(b'[').add(b']');
    format!("file:///{}", percent_encoding::utf8_percent_encode(&p.to_string_lossy().replace('\\', "/"), SET))
}

/// At start: temp folders a killed run left behind (ours are removed on return; a kill skips that).
pub fn sweep() {
    let mine = format!("waraq-convert-{}-", std::process::id());
    if let Ok(rd) = std::fs::read_dir(std::env::temp_dir()) {
        for e in rd.flatten() {
            let n = e.file_name().to_string_lossy().into_owned();
            if n.starts_with("waraq-convert-") && !n.starts_with(&mine) {
                let _ = std::fs::remove_dir_all(e.path());
            }
        }
    }
}

pub fn convert(pack: &Path, name: &str, bytes: &[u8]) -> Result<Vec<u8>, String> {
    let ext = name.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if !OFFICE.contains(&ext.as_str()) && ext != "dwg" && ext != "dxf" {
        return Err("UNSUPPORTED".into());
    }
    let soffice = pack.join("libreoffice/program/soffice.exe");
    let dwg2dxf = pack.join("libredwg/dwg2dxf.exe");
    if !soffice.is_file() || (ext == "dwg" && !dwg2dxf.is_file()) {
        return Err("NO_PACKS".into());
    }
    install_fonts(&soffice);
    let dir = std::env::temp_dir().join(format!("waraq-convert-{}-{}", std::process::id(), N.fetch_add(1, Ordering::Relaxed)));
    let _clean = Clean(dir.clone());
    let (input, outdir, profile) = (dir.join(format!("input.{ext}")), dir.join("out"), dir.join("profile"));
    std::fs::create_dir_all(&outdir).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(profile.join("user")).map_err(|e| e.to_string())?;
    std::fs::write(&input, bytes).map_err(|e| e.to_string())?;
    std::fs::write(profile.join("user/registrymodifications.xcu"), profile_xcu()).map_err(|e| e.to_string())?;
    let lo = |filter: &str, file: PathBuf| {
        (soffice.clone(), vec!["-env:UserInstallation=".to_string() + &file_url(&profile), "--headless".into(), "--nologo".into(), "--nodefault".into(), "--norestore".into(), "--convert-to".into(), filter.into(), "--outdir".into(), outdir.to_string_lossy().into_owned(), file.to_string_lossy().into_owned()])
    };
    let (steps, out) = match ext.as_str() {
        "dwg" => (vec![(dwg2dxf, vec!["-y".into(), "-o".into(), "drawing.dxf".into(), input.to_string_lossy().into_owned()]), lo("pdf:draw_pdf_Export", dir.join("drawing.dxf"))], outdir.join("drawing.pdf")),
        "dxf" => (vec![lo("pdf:draw_pdf_Export", input.clone())], outdir.join("input.pdf")),
        _ => (vec![lo("pdf", input.clone())], outdir.join("input.pdf")),
    };
    CANCEL.store(false, Ordering::Relaxed);
    for (exe, args) in steps {
        run(&exe, &args, &dir)?;
    }
    std::fs::read(&out).map_err(|_| "CONVERSION_FAILED".to_string())
}

/// Runs one program without a window; killed (with its children) on timeout or cancel.
fn run(exe: &Path, args: &[String], cwd: &Path) -> Result<(), String> {
    let mut cmd = std::process::Command::new(exe);
    cmd.args(args).current_dir(cwd).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd.spawn().map_err(|e| format!("CONVERSION_FAILED: {e}"))?;
    let started = std::time::Instant::now();
    loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            return if status.success() { Ok(()) } else { Err("CONVERSION_FAILED".into()) };
        }
        let why = if CANCEL.load(Ordering::Relaxed) { Some("CANCELLED") } else if started.elapsed() > TIMEOUT { Some("TIMEOUT") } else { None };
        if let Some(why) = why {
            #[cfg(windows)]
            let _ = std::process::Command::new("taskkill").args(["/PID", &child.id().to_string(), "/T", "/F"]).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
            let _ = child.kill();
            let _ = child.wait();
            return Err(why.into());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    // The real pack from the 0.3.3 checkout beside this repo (skipped where it is missing).
    fn pack() -> Option<PathBuf> {
        // the installed add-on pack first (the font folder is added to it), else the 0.3.3 one
        let own = PathBuf::from(std::env::var("APPDATA").unwrap_or_default()).join("com.waraq.app/engines/office");
        if own.join("libreoffice/program/soffice.exe").is_file() {
            return Some(own);
        }
        let p = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../waraq/engines/win-x64");
        p.join("libreoffice/program/soffice.exe").is_file().then_some(p)
    }
    #[test]
    fn file_url_escapes_spaces() {
        assert_eq!(file_url(Path::new(r"C:\Users\A B\Temp\profile")), "file:///C:/Users/A%20B/Temp/profile");
    }
    #[test]
    fn unsupported_and_missing_pack() {
        assert_eq!(convert(Path::new("nowhere"), "a.txt", b"x"), Err("UNSUPPORTED".into()));
        assert_eq!(convert(Path::new("nowhere"), "a.docx", b"x"), Err("NO_PACKS".into()));
    }
    #[test]
    fn dxf_to_pdf_with_the_real_pack() {
        let Some(pack) = pack() else { eprintln!("skipped: no pack"); return };
        let dxf = ["0", "SECTION", "2", "ENTITIES", "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "0", "11", "100", "21", "50", "31", "0", "0", "ENDSEC", "0", "EOF"].join("\r\n");
        let pdf = convert(&pack, "plan.dxf", dxf.as_bytes()).unwrap();
        assert!(pdf.starts_with(b"%PDF"));
        assert!(!std::fs::read_dir(std::env::temp_dir()).unwrap().flatten().any(|e| e.file_name().to_string_lossy().starts_with(&format!("waraq-convert-{}", std::process::id()))), "temp folder left behind");
    }
    // Writes target/office-pdfs/<fixture>.pdf for tools/dev/arabic-fonts-test.py (text and embedded font names).
    #[test]
    fn office_fixtures_with_the_real_pack() {
        let Some(pack) = pack() else { eprintln!("skipped: no pack"); return };
        let out = Path::new(env!("CARGO_MANIFEST_DIR")).join("target/office-pdfs");
        std::fs::create_dir_all(&out).unwrap();
        for f in ["arabic.docx", "table.xlsx", "slide.pptx"] {
            let bytes = std::fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("../tests/fixtures/office").join(f)).unwrap();
            std::fs::write(out.join(f.replace('.', "-") + ".pdf"), convert(&pack, f, &bytes).unwrap()).unwrap();
        }
    }
}
