// The Waraq desktop shell: a frameless window (the page draws its own top bar), the files the user asked for
// (command line, second launch, drop), read/write straight to disk, and the Office/CAD converter command.
mod convert;
mod ocrbest;
mod packs;
mod safe;
mod update;
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
fn body<'a>(req: &'a Request<'a>) -> Result<&'a [u8], String> {
    match req.body() {
        InvokeBody::Raw(b) => Ok(b),
        _ => Err("bytes expected".into()),
    }
}

/// Safe save, step 1: the bytes go to a temp file beside the target (the `path` header); its path comes back so the
/// page can read it again and check it opens. Step 2 is `save_commit` (or `save_discard` when the check fails).
#[tauri::command]
fn save_temp(request: Request) -> Result<String, String> {
    let target = std::path::PathBuf::from(header(&request, "path")?);
    let tmp = safe::write_temp(&target, body(&request)?).map_err(|e| e.to_string())?;
    Ok(tmp.to_string_lossy().into_owned())
}
#[tauri::command]
fn save_commit(path: String, tmp: String) -> Result<(), String> {
    safe::commit(std::path::Path::new(&path), std::path::Path::new(&tmp)).map_err(|e| e.to_string())
}
#[tauri::command]
fn save_discard(path: String, tmp: String) {
    if std::path::Path::new(&tmp) == safe::temp_of(std::path::Path::new(&path)) {
        let _ = std::fs::remove_file(tmp);
    }
}

/// Waraq's own folder (drafts, crash log, portfolio versions) in the app data folder.
fn vault(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map(|d| d.join("vault")).map_err(|e| e.to_string())
}
#[tauri::command]
fn vault_put(app: tauri::AppHandle, request: Request) -> Result<(), String> {
    safe::put(&vault(&app)?, &header(&request, "path")?, body(&request)?).map_err(|e| e.to_string())
}
#[tauri::command]
fn vault_get(app: tauri::AppHandle, path: String) -> Result<Response, String> {
    let p = safe::inside(&vault(&app)?, &path).map_err(|e| e.to_string())?;
    std::fs::read(p).map(Response::new).map_err(|e| e.to_string())
}
#[tauri::command]
fn vault_list(app: tauri::AppHandle, dir: String) -> Result<Vec<safe::Entry>, String> {
    safe::list(&vault(&app)?, &dir).map_err(|e| e.to_string())
}
#[tauri::command]
fn vault_remove(app: tauri::AppHandle, path: String) -> Result<(), String> {
    safe::remove(&vault(&app)?, &path).map_err(|e| e.to_string())
}
/// Shows a vault folder (or one file, selected) in Explorer; the full path comes back.
#[tauri::command]
fn vault_reveal(app: tauri::AppHandle, path: String, select: bool) -> Result<String, String> {
    let p = safe::inside(&vault(&app)?, &path).map_err(|e| e.to_string())?;
    let _ = std::fs::create_dir_all(if select { p.parent().unwrap_or(&p) } else { &p });
    #[cfg(windows)]
    {
        let mut c = std::process::Command::new("explorer");
        if select { c.arg(format!("/select,{}", p.display())); } else { c.arg(&p); }
        let _ = c.spawn();
    }
    Ok(p.to_string_lossy().into_owned())
}

/// Opens the mail program, the GitHub issue page or the website's support page — only those targets, only after a click in the page.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    if !(url.starts_with("mailto:support@pwaraq.com") || url.starts_with("https://github.com/tshi-dev/PWaraq/") || url.starts_with("https://www.pwaraq.com/support")) {
        return Err("not allowed".into());
    }
    #[cfg(windows)]
    std::process::Command::new("rundll32").args(["url.dll,FileProtocolHandler", url.as_str()]).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

static CRASH_HOME: std::sync::OnceLock<std::path::PathBuf> = std::sync::OnceLock::new();
/// A Rust panic is written to the crash log (the vault's crash-log folder) before the program goes down.
fn log_panics() {
    std::panic::set_hook(Box::new(|info| {
        let Some(vault) = CRASH_HOME.get() else { return };
        let msg = info.payload().downcast_ref::<&str>().map(|s| s.to_string()).or_else(|| info.payload().downcast_ref::<String>().cloned()).unwrap_or_default();
        let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0);
        let loc = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        let _ = safe::put(vault, &format!("crash-log/{at}-panic.json"), safe::panic_entry(&msg, &loc, at, std::env::var("USERPROFILE").ok().as_deref()).as_bytes());
    }));
}

/// Office/CAD → PDF through the add-on pack (convert.rs). Contract (src/lib/convert.ts `Desktop.convertToPdf`): the
/// file name in the `name` header and its bytes as the body; PDF bytes back, or an error text the page shows —
/// NO_PACKS (the page then offers the download), UNSUPPORTED, CANCELLED, TIMEOUT, CONVERSION_FAILED.
#[tauri::command]
async fn convert_to_pdf(app: tauri::AppHandle, request: Request<'_>) -> Result<Response, String> {
    let name = header(&request, "name")?;
    let bytes = body(&request)?.to_vec();
    if !packs::installed(&app, "office") {
        return Err("NO_PACKS".into());
    }
    let pack = packs::dir(&app, "office");
    tauri::async_runtime::spawn_blocking(move || convert::convert(&pack, &name, &bytes)).await.map_err(|e| e.to_string())?.map(Response::new)
}
#[tauri::command]
fn convert_cancel() {
    convert::CANCEL.store(true, std::sync::atomic::Ordering::Relaxed);
}

/// Colours the 1 px frame Windows 11 draws round a frameless window (else it is the accent colour, or the desktop
/// showing through): the page sends its title bar colour, so the top edge is seamless. `color` is a COLORREF.
#[tauri::command]
fn set_border(window: tauri::WebviewWindow, color: u32) {
    #[cfg(windows)]
    {
        use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};
        if let Ok(hwnd) = window.hwnd() {
            unsafe { DwmSetWindowAttribute(hwnd.0 as *mut core::ffi::c_void, DWMWA_BORDER_COLOR as u32, &color as *const u32 as *const core::ffi::c_void, 4) };
        }
    }
    #[cfg(not(windows))]
    let _ = (window, color);
}

pub fn run() {
    log_panics();
    let context = tauri::generate_context!();
    if let Some(dir) = update::dir_from(&context.config().identifier) {
        update::start_or_roll_back(&dir, &context.package_info().version.to_string()); // may run the last good installer and exit
    }
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(update::Pending::default())
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
            convert::sweep();
            if let Ok(d) = app.path().app_data_dir() {
                let _ = CRASH_HOME.set(d.join("vault"));
            }
            let mut win = tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::default())
                .title("Waraq")
                .inner_size(1280.0, 800.0)
                .min_inner_size(720.0, 480.0)
                .decorations(false) // the page draws the top bar in its own paper colour
                .shadow(true); // Windows 11 keeps the rounded corners and shadow
            // debug builds: WARAQ_UI=<theme>,<lang> preselects theme and language and keeps the crash dialog away (the smoke test kills the app, which is an unclean exit)
            if cfg!(debug_assertions) {
                if let Ok(ui) = std::env::var("WARAQ_UI") {
                    let (theme, lang) = ui.split_once(',').unwrap_or((ui.as_str(), "en"));
                    win = win.initialization_script(&format!(
                        "try{{localStorage.setItem('waraq-theme',{});localStorage.setItem('waraq-lang',{});localStorage.setItem('waraq-crash-ask','no')}}catch{{}}",
                        serde_json::to_string(theme).unwrap(),
                        serde_json::to_string(lang).unwrap()
                    ));
                }
            }
            set_border(win.build()?, 0x00f8fbfa); // paper, until the page reports its title bar colour
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![launch_paths, read_file, save_temp, save_commit, save_discard, vault_put, vault_get, vault_list, vault_remove, vault_reveal, open_external, convert_to_pdf, convert_cancel, packs::pack_status, packs::pack_install, packs::pack_cancel, packs::pack_remove, ocrbest::ocr_best_start, ocrbest::ocr_best_stop, set_border, update::app_started, update::check_update, update::download_update, update::install_update])
        .build(context)
        .expect("error while building Waraq")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                ocrbest::stop(); // no OCR server left behind
            }
        });
}
