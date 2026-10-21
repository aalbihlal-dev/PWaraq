// The Waraq desktop shell: a frameless window (the page draws its own top bar), the files the user asked for
// (command line, second launch, drop), read/write straight to disk, and the Office/CAD converter command.
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{Emitter, Manager};

/// Existing files among the command-line arguments (Windows passes a double-clicked file as the first one).
fn files_in(args: impl Iterator<Item = String>) -> Vec<String> {
    args.filter(|a| !a.starts_with('-') && std::path::Path::new(a).is_file()).collect()
}

#[tauri::command]
fn launch_paths() -> Vec<String> {
    files_in(std::env::args().skip(1))
}

#[tauri::command]
fn read_file(path: String) -> Result<Response, String> {
    std::fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

/// Text arguments ride in headers, percent-encoded (headers are ASCII; file names are not).
fn header(req: &Request, name: &str) -> Result<String, String> {
    let v = req.headers().get(name).ok_or(format!("missing {name}"))?.to_str().map_err(|e| e.to_string())?;
    Ok(percent_encoding::percent_decode_str(v).decode_utf8_lossy().into_owned())
}
fn body(req: &Request) -> Result<&[u8], String> {
    match req.body() {
        InvokeBody::Raw(b) => Ok(b),
        _ => Err("bytes expected".into()),
    }
}

/// Writes the bytes to the `path` header through a temp file, so a crash never leaves a half-written PDF.
#[tauri::command]
fn write_file(request: Request) -> Result<(), String> {
    let path = std::path::PathBuf::from(header(&request, "path")?);
    let tmp = path.with_extension("waraq-tmp");
    std::fs::write(&tmp, body(&request)?)
        .and_then(|_| std::fs::rename(&tmp, &path))
        .map_err(|e| {
            let _ = std::fs::remove_file(&tmp);
            e.to_string()
        })
}

/// Office/CAD → PDF through the 0.3.3 add-on packs. Contract (src/lib/convert.ts `Desktop.convertToPdf`): the file
/// name in the `name` header and its bytes as the body; PDF bytes back, or an error text the page shows.
/// shortcut: the packs (LibreOffice, LibreDWG) are not wired yet, so every call answers NO_PACKS; upgrade when the
/// packs session lands (run `commands()` from convert.ts on the pack folder, pack download + SHA-256 as in 0.3.3).
#[tauri::command]
fn convert_to_pdf(request: Request) -> Result<Response, String> {
    let _name = header(&request, "name")?;
    let _bytes = body(&request)?;
    Err("NO_PACKS".into())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // a second launch (double-clicked file) hands its file to the running window
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
                let _ = w.emit("open-paths", files_in(args.into_iter().skip(1)));
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let mut win = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Waraq")
                .inner_size(1280.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .decorations(false) // the page draws the top bar in its own paper colour
                .shadow(true); // Windows 11 keeps the rounded corners and shadow
            // debug builds: WARAQ_UI=<theme>,<lang> preselects theme and language (screenshots, smoke test)
            if cfg!(debug_assertions) {
                if let Ok(ui) = std::env::var("WARAQ_UI") {
                    let (theme, lang) = ui.split_once(',').unwrap_or((ui.as_str(), "en"));
                    win = win.initialization_script(&format!(
                        "try{{localStorage.setItem('waraq-theme',{});localStorage.setItem('waraq-lang',{})}}catch{{}}",
                        serde_json::to_string(theme).unwrap(),
                        serde_json::to_string(lang).unwrap()
                    ));
                }
            }
            win.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![launch_paths, read_file, write_file, convert_to_pdf])
        .run(tauri::generate_context!())
        .expect("error while running Waraq");
}
