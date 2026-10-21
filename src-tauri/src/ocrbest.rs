// "Best quality" OCR (add-on pack "ocr-best"): llama.cpp's server with the Surya OCR 2 model, started on a free port of
// 127.0.0.1 when an OCR job asks for it and stopped when the job ends or the app exits. packs.rs downloads and unpacks the
// pack into <app data>/engines/ocr-best: llama-server(.exe) with its libraries, surya-2.gguf and surya-2-mmproj.gguf. Nothing
// leaves the PC: the server listens on the loopback address only and the page is sent to it from the app's own page.
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

static SERVER: Mutex<Option<Child>> = Mutex::new(None);

#[cfg(windows)]
const EXE: &str = "llama-server.exe";
#[cfg(not(windows))]
const EXE: &str = "llama-server";

/// Starts the server (an earlier one is stopped first) and returns its port once it answers.
#[tauri::command]
pub async fn ocr_best_start(app: tauri::AppHandle) -> Result<u16, String> {
    if !crate::packs::installed(&app, "ocr-best") {
        return Err("NO_PACK".into());
    }
    stop();
    let dir = crate::packs::dir(&app, "ocr-best");
    let port = std::net::TcpListener::bind("127.0.0.1:0").and_then(|l| l.local_addr()).map_err(|e| e.to_string())?.port();
    let mut cmd = Command::new(dir.join(EXE));
    cmd.current_dir(&dir)
        .args(["-m", "surya-2.gguf", "--mmproj", "surya-2-mmproj.gguf", "--host", "127.0.0.1", "--port", &port.to_string(), "--parallel", "1", "--ctx-size", "16384", "--alias", "datalab-to/surya-ocr-2", "--jinja"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    std::os::windows::process::CommandExt::creation_flags(&mut cmd, 0x0800_0000); // no console window
    let child = cmd.spawn().map_err(|e| format!("SPAWN: {e}"))?;
    *SERVER.lock().unwrap() = Some(child);
    let client = reqwest::Client::new();
    for _ in 0..240 {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if client.get(format!("http://127.0.0.1:{port}/health")).send().await.is_ok_and(|r| r.status().is_success()) {
            return Ok(port);
        }
        let gone = SERVER.lock().unwrap().as_mut().is_none_or(|c| c.try_wait().ok().flatten().is_some());
        if gone {
            break;
        }
    }
    stop();
    Err("NOT_STARTED".into())
}

#[tauri::command]
pub fn ocr_best_stop() {
    stop();
}

/// Also called when the app exits, so no server is left running.
pub fn stop() {
    if let Some(mut c) = SERVER.lock().unwrap().take() {
        let _ = c.kill();
        let _ = c.wait();
    }
}
