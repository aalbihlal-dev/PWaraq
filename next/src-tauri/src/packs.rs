// Add-on packs: the Office & CAD pack (LibreOffice + LibreDWG, the same tar.zst the 0.3.3 app uses) is downloaded
// the first time a conversion needs it — after a click in the page — from the website's manifest in 16 MB pieces
// (4 in flight, each piece checked, the whole checked against the SHA-256 pinned in packs.json), unpacked into
// <app data>/engines/<name> and used from there. Nothing else is ever downloaded.
use futures_util::StreamExt;
use sha2::Digest;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};

const BASE: &str = "https://www.pwaraq.com/packs/";
const PINNED: &str = include_str!("../packs.json");
const MARK: &str = ".waraq-pack.json";
pub static CANCEL: AtomicBool = AtomicBool::new(false);

#[derive(serde::Deserialize, Clone)]
struct Pin {
    sha256: String,
    size: u64,
    unpacked: u64,
}
fn pin(name: &str) -> Option<Pin> {
    serde_json::from_str::<std::collections::HashMap<String, Pin>>(PINNED).ok()?.remove(name)
}
pub fn dir(app: &tauri::AppHandle, name: &str) -> PathBuf {
    app.path().app_data_dir().unwrap_or_default().join("engines").join(name)
}
/// True when the pack folder holds exactly the version this build was made with.
pub fn installed(app: &tauri::AppHandle, name: &str) -> bool {
    let Some(p) = pin(name) else { return false };
    std::fs::read_to_string(dir(app, name).join(MARK))
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .is_some_and(|v| v["sha256"].as_str() == Some(p.sha256.as_str()))
}

#[derive(serde::Serialize)]
pub struct Status {
    installed: bool,
    size: u64,
    unpacked: u64,
}
#[tauri::command]
pub fn pack_status(app: tauri::AppHandle, name: String) -> Status {
    let p = pin(&name);
    Status { installed: p.is_some() && installed(&app, &name), size: p.as_ref().map_or(0, |p| p.size), unpacked: p.map_or(0, |p| p.unpacked) }
}
#[tauri::command]
pub fn pack_cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

#[derive(serde::Deserialize)]
struct Chunk {
    path: String,
    size: u64,
    sha256: String,
}
#[derive(serde::Deserialize)]
struct Entry {
    name: String,
    sha256: String,
    chunks: Vec<Chunk>,
}
#[derive(serde::Deserialize)]
struct Manifest {
    packs: Vec<Entry>,
}

fn hex(d: impl AsRef<[u8]>) -> String {
    d.as_ref().iter().map(|b| format!("{b:02x}")).collect()
}

/// One piece, checked against its own size and SHA-256, three tries.
async fn piece(client: reqwest::Client, c: Chunk) -> Result<Vec<u8>, String> {
    let mut last = String::new();
    for attempt in 1..=3u64 {
        if CANCEL.load(Ordering::Relaxed) {
            return Err("CANCELLED".into());
        }
        match client.get(format!("{BASE}{}", c.path)).send().await.and_then(|r| r.error_for_status()) {
            Ok(r) => match r.bytes().await {
                Ok(b) if b.len() as u64 == c.size && hex(sha2::Sha256::digest(&b)) == c.sha256 => return Ok(b.to_vec()),
                Ok(_) => last = "PIECE_CORRUPT".into(),
                Err(e) => last = e.to_string(),
            },
            Err(e) => last = e.to_string(),
        }
        tokio::time::sleep(std::time::Duration::from_secs(attempt)).await;
    }
    Err(last)
}

/// Downloads, checks and unpacks `name`; progress as `pack-progress` [done, total] events (done == total while unpacking).
/// Errors the page shows: CANCELLED, PACK_MISMATCH (website offers another version), PACK_CORRUPT, or a network text.
#[tauri::command]
pub async fn pack_install(app: tauri::AppHandle, name: String) -> Result<(), String> {
    CANCEL.store(false, Ordering::Relaxed);
    let p = pin(&name).ok_or("unknown pack")?;
    let dest = dir(&app, &name);
    let staging = dest.with_extension("partial");
    let tmp = dest.with_extension("tar.zst");
    let result = download(&app, &p, &name, &tmp).await;
    let result = match result {
        Ok(()) => {
            let _ = app.emit("pack-progress", [p.size, p.size]);
            let (tmp2, staging2, dest2, mark) = (tmp.clone(), staging.clone(), dest.clone(), serde_json::json!({ "name": name, "sha256": p.sha256 }).to_string());
            tauri::async_runtime::spawn_blocking(move || unpack(&tmp2, &staging2, &dest2, &mark)).await.map_err(|e| e.to_string())?
        }
        Err(e) => Err(e),
    };
    let _ = std::fs::remove_file(&tmp);
    let _ = std::fs::remove_dir_all(&staging);
    result
}

async fn download(app: &tauri::AppHandle, p: &Pin, name: &str, tmp: &std::path::Path) -> Result<(), String> {
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
    let m: Manifest = client.get(format!("{BASE}manifest.json")).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())?;
    // only the exact pack this build was made with is accepted
    let e = m.packs.into_iter().find(|e| e.name == name && e.sha256 == p.sha256 && !e.chunks.is_empty()).ok_or("PACK_MISMATCH")?;
    if let Some(d) = tmp.parent() {
        std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    let mut file = std::fs::File::create(tmp).map_err(|e| e.to_string())?;
    let (mut whole, mut done) = (sha2::Sha256::new(), 0u64);
    let mut pieces = futures_util::stream::iter(e.chunks.into_iter().map(|c| piece(client.clone(), c))).buffered(4);
    while let Some(bytes) = pieces.next().await {
        let bytes = bytes?;
        if CANCEL.load(Ordering::Relaxed) {
            return Err("CANCELLED".into());
        }
        whole.update(&bytes);
        std::io::Write::write_all(&mut file, &bytes).map_err(|e| e.to_string())?;
        done += bytes.len() as u64;
        let _ = app.emit("pack-progress", [done, p.size]);
    }
    if done != p.size || hex(whole.finalize()) != p.sha256 {
        return Err("PACK_CORRUPT".into());
    }
    Ok(())
}

/// zstd + tar into a staging folder, then one rename; the mark file says which version is inside.
fn unpack(tmp: &std::path::Path, staging: &std::path::Path, dest: &std::path::Path, mark: &str) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(staging);
    std::fs::create_dir_all(staging).map_err(|e| e.to_string())?;
    let long = std::fs::canonicalize(staging).map_err(|e| e.to_string())?; // \\?\ form: LibreOffice has paths longer than 260
    let file = std::fs::File::open(tmp).map_err(|e| e.to_string())?;
    let z = zstd::Decoder::new(std::io::BufReader::new(file)).map_err(|e| e.to_string())?;
    tar::Archive::new(z).unpack(&long).map_err(|e| format!("UNPACK: {e}"))?;
    std::fs::write(long.join(MARK), mark).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(dest);
    std::fs::rename(staging, dest).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn pack_remove(app: tauri::AppHandle, name: String) -> Result<(), String> {
    std::fs::remove_dir_all(dir(&app, &name)).map_err(|e| e.to_string())
}
