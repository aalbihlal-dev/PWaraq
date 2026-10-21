// Files Waraq writes: a safe save (temp file next to the target, checked, then swapped in with one generation of
// backup) and the vault, Waraq's own folder for drafts and the crash log. Pure std, so `cargo test` covers it.
use std::io;
use std::path::{Component, Path, PathBuf};

/// `report.pdf` -> `report.bak.pdf` (one generation: the next save replaces it).
pub fn backup_of(target: &Path) -> PathBuf {
    let stem = target.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = target.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    target.with_file_name(format!("{stem}.bak{ext}"))
}
pub fn temp_of(target: &Path) -> PathBuf {
    let mut name = target.file_name().map(|s| s.to_os_string()).unwrap_or_default();
    name.push(".waraq-tmp");
    target.with_file_name(name)
}

/// Step 1: the whole new file beside the target. Whatever goes wrong, the target is not touched and the temp file is removed.
pub fn write_temp(target: &Path, bytes: &[u8]) -> io::Result<PathBuf> {
    let tmp = temp_of(target);
    (|| {
        let mut f = std::fs::File::create(&tmp)?;
        io::Write::write_all(&mut f, bytes)?;
        f.sync_all() // on the disk before it can replace anything
    })()
    .map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e
    })?;
    Ok(tmp)
}

/// Step 2 (after the page has checked the temp file): the old file is copied to `name.bak.ext`, then the temp file
/// replaces the target in one rename — the target is the old file or the new one, never half of either.
pub fn commit(target: &Path, tmp: &Path) -> io::Result<()> {
    if tmp != temp_of(target) {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "not the temp file of this target"));
    }
    if target.is_file() {
        std::fs::copy(target, backup_of(target))?;
    }
    std::fs::rename(tmp, target)
}

/// A path inside the vault: relative, plain names only (no `..`, drive letters or absolute paths).
pub fn inside(root: &Path, rel: &str) -> io::Result<PathBuf> {
    let mut p = root.to_path_buf();
    for c in Path::new(rel).components() {
        match c {
            Component::Normal(x) => p.push(x),
            _ => return Err(io::Error::new(io::ErrorKind::InvalidInput, "bad path")),
        }
    }
    Ok(p)
}

/// Writes through a temp file too, so a half-written draft or log entry never replaces a good one.
pub fn put(root: &Path, rel: &str, bytes: &[u8]) -> io::Result<()> {
    let path = inside(root, rel)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = write_temp(&path, bytes)?;
    std::fs::rename(&tmp, &path)
}

#[derive(serde::Serialize)]
pub struct Entry {
    pub name: String,
    pub size: u64,
    pub at: u64, // modified, milliseconds since 1970
}
pub fn list(root: &Path, rel: &str) -> io::Result<Vec<Entry>> {
    let dir = inside(root, rel)?;
    let Ok(rd) = std::fs::read_dir(dir) else { return Ok(vec![]) };
    Ok(rd
        .flatten()
        .filter(|e| e.path().is_file() && !e.file_name().to_string_lossy().ends_with(".waraq-tmp"))
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            let at = m.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_millis() as u64;
            Some(Entry { name: e.file_name().to_string_lossy().into_owned(), size: m.len(), at })
        })
        .collect())
}
pub fn remove(root: &Path, rel: &str) -> io::Result<()> {
    let p = inside(root, rel)?;
    if p == root {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "not the vault itself"));
    }
    if p.is_dir() {
        std::fs::remove_dir_all(p)
    } else if p.exists() {
        std::fs::remove_file(p)
    } else {
        Ok(())
    }
}

/// Takes the person's folder names out of a panic message before it is written to the crash log (`C:\\Users\\Sara\\…` -> `<home>`).
pub fn scrub(text: &str, home: Option<&str>) -> String {
    let mut t = text.to_string();
    if let Some(h) = home.filter(|h| h.len() > 3) {
        t = t.replace(h, "<home>").replace(&h.replace('\\', "/"), "<home>");
    }
    t.chars().take(300).collect()
}

/// A crash-log entry for a Rust panic, in the shape the page reads (src/lib/crashlog.ts): no document content, no file names.
pub fn panic_entry(message: &str, location: &str, at: u64, home: Option<&str>) -> String {
    serde_json::json!({
        "id": format!("{at}-panic"), "at": at, "kind": "panic", "version": env!("CARGO_PKG_VERSION"), "system": "Waraq desktop (Windows)",
        "message": scrub(message, home), "stack": scrub(location, home),
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("waraq-test-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn a_save_that_dies_before_the_swap_leaves_the_old_file() {
        let d = dir("die");
        let t = d.join("a.pdf");
        std::fs::write(&t, b"OLD").unwrap();
        // the new file is only half written (the app was killed): nothing replaced the target
        std::fs::write(temp_of(&t), b"NE").unwrap();
        assert_eq!(std::fs::read(&t).unwrap(), b"OLD");
        assert!(!backup_of(&t).exists());
    }

    #[test]
    fn commit_swaps_in_the_new_file_and_keeps_one_backup() {
        let d = dir("commit");
        let t = d.join("report.pdf");
        std::fs::write(&t, b"ONE").unwrap();
        let tmp = write_temp(&t, b"TWO").unwrap();
        assert_eq!(std::fs::read(&t).unwrap(), b"ONE"); // still the old one until the swap
        commit(&t, &tmp).unwrap();
        assert_eq!((std::fs::read(&t).unwrap(), std::fs::read(d.join("report.bak.pdf")).unwrap()), (b"TWO".to_vec(), b"ONE".to_vec()));
        let tmp = write_temp(&t, b"THREE").unwrap();
        commit(&t, &tmp).unwrap();
        assert_eq!((std::fs::read(&t).unwrap(), std::fs::read(d.join("report.bak.pdf")).unwrap()), (b"THREE".to_vec(), b"TWO".to_vec())); // one generation
        assert!(!temp_of(&t).exists());
    }

    #[test]
    fn a_first_save_has_no_backup_and_a_wrong_temp_is_refused() {
        let d = dir("first");
        let t = d.join("new.waraq");
        let tmp = write_temp(&t, b"X").unwrap();
        commit(&t, &tmp).unwrap();
        assert!(t.is_file() && !d.join("new.bak.waraq").exists());
        assert!(commit(&t, &d.join("other.pdf")).is_err());
    }

    #[test]
    fn a_failed_temp_write_leaves_the_target_alone() {
        let d = dir("fail");
        let t = d.join("a.pdf");
        std::fs::write(&t, b"OLD").unwrap();
        std::fs::create_dir(temp_of(&t)).unwrap(); // the temp name is taken by a folder: the write fails
        assert!(write_temp(&t, b"NEW").is_err());
        assert_eq!(std::fs::read(&t).unwrap(), b"OLD");
    }

    #[test]
    fn a_panic_entry_names_no_folders_of_the_person() {
        let e = panic_entry("failed at C:\\Users\\Sara\\Documents\\secret.pdf", "C:\\Users\\Sara\\code\\lib.rs:10", 5, Some("C:\\Users\\Sara"));
        assert!(!e.contains("Sara"), "{e}");
        let v: serde_json::Value = serde_json::from_str(&e).unwrap();
        assert_eq!((v["kind"].as_str(), v["at"].as_u64()), (Some("panic"), Some(5)));
    }

    #[test]
    fn the_vault_stays_inside_its_folder() {
        let d = dir("vault");
        put(&d, "drafts/a.json", b"{}").unwrap();
        assert_eq!(list(&d, "drafts").unwrap().len(), 1);
        for bad in ["../x", "/abs", "a/../../x", "C:\\x"] {
            assert!(put(&d, bad, b"x").is_err(), "{bad}");
        }
        remove(&d, "drafts").unwrap();
        assert!(list(&d, "drafts").unwrap().is_empty());
    }
}
