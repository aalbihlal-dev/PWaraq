// Updates. The Tauri updater plugin reads the signed manifest and downloads the installer (minisign signature
// checked before anything runs); on top of that: the manifest's SHA-256 must match, the page triggers every step
// (nothing installs without a click), and a rollback: the installer of every version is kept in
// <app data>/updates (installer hook). A start writes `boot`; the page's `app_started` removes it and writes
// `last-good`. If `boot` is still there at the next start and this version never became `last-good`, the new
// version failed to start: the last good version's installer runs silently and this process exits.
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

pub fn dir_from(identifier: &str) -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join(identifier).join("updates"))
}
fn dir(app: &tauri::AppHandle) -> PathBuf {
    app.path().app_data_dir().map(|d| d.join("updates")).unwrap_or_default()
}
fn me(app: &tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}
pub fn installer_of(dir: &Path, version: &str) -> PathBuf {
    dir.join(format!("waraq-{version}.exe"))
}

/// The version to go back to, if this start must roll back (pure, so `cargo test` covers it).
pub fn roll_back_to(boot_left: bool, last_good: Option<&str>, me: &str, have_installer: impl Fn(&str) -> bool) -> Option<String> {
    let good = last_good?.trim();
    (boot_left && !good.is_empty() && good != me && have_installer(good)).then(|| good.to_string())
}

/// Before the window exists: rolls back (and exits) or marks this start as in progress.
pub fn start_or_roll_back(dir: &Path, me: &str) {
    let last_good = std::fs::read_to_string(dir.join("last-good")).ok();
    if let Some(back) = roll_back_to(dir.join("boot").exists(), last_good.as_deref(), me, |v| installer_of(dir, v).is_file()) {
        let _ = std::fs::remove_file(dir.join("boot"));
        let _ = std::fs::write(dir.join("rolled-back"), format!("{me}\n{back}"));
        let _ = std::fs::write(dir.join("skip"), me); // not offered again until a newer version comes
        if std::process::Command::new(installer_of(dir, &back)).args(["/S", "/R"]).spawn().is_ok() {
            std::process::exit(0);
        }
    }
    let _ = std::fs::create_dir_all(dir);
    let _ = std::fs::write(dir.join("boot"), me);
}

/// The page is up: this version is good. Returns "<failed version>\n<restored version>" once after a rollback.
#[tauri::command]
pub fn app_started(app: tauri::AppHandle) -> Option<String> {
    let dir = dir(&app);
    let me = me(&app);
    let _ = std::fs::remove_file(dir.join("boot"));
    let _ = std::fs::write(dir.join("last-good"), &me);
    // keep this version's installer and the newest other one (the one to go back to)
    if let Ok(rd) = std::fs::read_dir(&dir) {
        let mut others: Vec<_> = rd.flatten().map(|e| e.path()).filter(|p| p != &installer_of(&dir, &me) && p.extension().is_some_and(|x| x == "exe")).collect();
        others.sort_by_key(|p| std::cmp::Reverse(p.metadata().and_then(|m| m.modified()).ok()));
        for old in others.into_iter().skip(1) {
            let _ = std::fs::remove_file(old);
        }
    }
    let note = std::fs::read_to_string(dir.join("rolled-back")).ok();
    let _ = std::fs::remove_file(dir.join("rolled-back"));
    note
}

#[derive(Default)]
pub struct Pending(pub std::sync::Mutex<Option<(tauri_plugin_updater::Update, Vec<u8>)>>);

#[derive(serde::Serialize)]
pub struct Available {
    version: String,
    notes: String,
}

#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<Option<Available>, String> {
    // a Store build (packaging/msix) is updated by the Store: never by us
    if std::env::current_exe().ok().and_then(|e| e.parent().map(|d| d.join("store-build").exists())).unwrap_or(false) {
        return Ok(None);
    }
    let found = app.updater_builder().build().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    let Some(u) = found else { return Ok(None) };
    if std::fs::read_to_string(dir(&app).join("skip")).is_ok_and(|s| s.trim() == u.version) {
        return Ok(None); // the version that failed to start here
    }
    let a = Available { version: u.version.clone(), notes: u.body.clone().unwrap_or_default() };
    *app.state::<Pending>().0.lock().unwrap() = Some((u, Vec::new()));
    Ok(Some(a))
}

/// Downloads the installer found by `check_update`; progress as `update-progress` [done, total] events.
#[tauri::command]
pub async fn download_update(app: tauri::AppHandle) -> Result<(), String> {
    let u = app.state::<Pending>().0.lock().unwrap().as_ref().map(|(u, _)| u.clone()).ok_or("no update")?;
    let want = u.raw_json.pointer("/platforms/windows-x86_64/sha256").and_then(|v| v.as_str()).map(str::to_lowercase).ok_or("manifest without sha256")?;
    let (emitter, mut done) = (app.clone(), 0u64);
    let bytes = u
        .download(
            |n, total| {
                done += n as u64;
                let _ = emitter.emit("update-progress", [done, total.unwrap_or(0)]);
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    use sha2::Digest;
    let got = sha2::Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect::<String>();
    if got != want {
        return Err("SHA256_MISMATCH".into());
    }
    if let Some(p) = app.state::<Pending>().0.lock().unwrap().as_mut() {
        p.1 = bytes;
    }
    Ok(())
}

/// After the click: the signature is checked once more, the installer runs (passive, `/UPDATE /R`) and this process exits.
#[tauri::command]
pub fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let (u, bytes) = app.state::<Pending>().0.lock().unwrap().take().ok_or("no update")?;
    if bytes.is_empty() {
        return Err("not downloaded".into());
    }
    u.install(bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::roll_back_to;
    #[test]
    fn rollback_decision() {
        let have = |v: &str| v == "1.0.0";
        assert_eq!(roll_back_to(true, Some("1.0.0\n"), "1.0.1", have), Some("1.0.0".into())); // new version never started
        assert_eq!(roll_back_to(false, Some("1.0.0"), "1.0.1", have), None); // clean previous exit
        assert_eq!(roll_back_to(true, Some("1.0.1"), "1.0.1", have), None); // same version crashed: no rollback
        assert_eq!(roll_back_to(true, None, "1.0.1", have), None); // first install
        assert_eq!(roll_back_to(true, Some("0.9.0"), "1.0.1", have), None); // no installer to go back to
    }
}
