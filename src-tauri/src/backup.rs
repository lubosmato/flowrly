//! Database snapshots. `VACUUM INTO` produces a consistent copy even with WAL active.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use chrono::{DateTime, Local};
use rusqlite::Connection;

use crate::error::AppResult;
use crate::models::BackupFile;

pub const KEEP: usize = 30;
pub const PREFIX: &str = "flowrly-";
pub const RESTORE_PENDING_SUFFIX: &str = ".restore-pending";

pub fn resolve_dir(app_data_dir: &Path, configured: &str) -> PathBuf {
    let trimmed = configured.trim();
    if trimmed.is_empty() {
        app_data_dir.join("backups")
    } else {
        PathBuf::from(shellexpand_home(trimmed))
    }
}

fn shellexpand_home(p: &str) -> String {
    if let Some(rest) = p.strip_prefix("~/") {
        if let Some(home) = std::env::var_os("HOME") {
            return format!("{}/{}", home.to_string_lossy(), rest);
        }
    }
    p.to_string()
}

pub fn create(conn: &Connection, dir: &Path) -> AppResult<BackupFile> {
    std::fs::create_dir_all(dir)?;
    let name = format!("{PREFIX}{}.db", Local::now().format("%Y-%m-%d-%H%M%S"));
    let path = dir.join(&name);
    conn.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()])?;
    prune(dir, KEEP)?;
    describe(&path)
}

pub fn list(dir: &Path) -> AppResult<Vec<BackupFile>> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out: Vec<BackupFile> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.extension().map(|x| x == "db").unwrap_or(false)
                && p.file_name()
                    .map(|n| n.to_string_lossy().starts_with(PREFIX))
                    .unwrap_or(false)
        })
        .filter_map(|p| describe(&p).ok())
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

pub fn prune(dir: &Path, keep: usize) -> AppResult<()> {
    let files = list(dir)?;
    for old in files.iter().skip(keep) {
        let _ = std::fs::remove_file(&old.path);
    }
    Ok(())
}

pub fn newest_age(dir: &Path) -> Option<Duration> {
    let files = list(dir).ok()?;
    let newest = files.first()?;
    let meta = std::fs::metadata(&newest.path).ok()?;
    let modified = meta.modified().ok()?;
    SystemTime::now().duration_since(modified).ok()
}

fn describe(path: &Path) -> AppResult<BackupFile> {
    let meta = std::fs::metadata(path)?;
    let modified: DateTime<Local> = meta.modified().map(DateTime::from).unwrap_or_else(|_| Local::now());
    Ok(BackupFile {
        path: path.to_string_lossy().to_string(),
        name: path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default(),
        size_bytes: meta.len() as i32,
        created_at: modified.format("%Y-%m-%d %H:%M").to_string(),
    })
}

/// Stage a restore: the file is copied next to the live DB and swapped in on next launch
/// (the live connection can't be replaced while the app runs).
pub fn stage_restore(db_path: &Path, from: &Path) -> AppResult<()> {
    // Sanity check: must be a readable SQLite database with our tables.
    let probe = Connection::open_with_flags(from, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    probe.query_row("SELECT count(*) FROM time_entries", [], |r| r.get::<_, i64>(0))?;
    drop(probe);
    let pending = pending_path(db_path);
    std::fs::copy(from, pending)?;
    Ok(())
}

pub fn pending_path(db_path: &Path) -> PathBuf {
    let mut s = db_path.as_os_str().to_owned();
    s.push(RESTORE_PENDING_SUFFIX);
    PathBuf::from(s)
}

/// Called before the DB is opened at startup. If a staged restore exists, swap it in.
pub fn apply_pending_restore(db_path: &Path) -> AppResult<bool> {
    let pending = pending_path(db_path);
    if !pending.exists() {
        return Ok(false);
    }
    for suffix in ["-wal", "-shm"] {
        let mut s = db_path.as_os_str().to_owned();
        s.push(suffix);
        let _ = std::fs::remove_file(PathBuf::from(s));
    }
    std::fs::rename(&pending, db_path)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_roundtrip_and_prune() {
        let tmp = std::env::temp_dir().join(format!("flowrly-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        let db_path = tmp.join("data.db");
        let conn = crate::db::open(&db_path).unwrap();
        conn.execute("INSERT INTO clients (name) VALUES ('x')", []).unwrap();

        let dir = tmp.join("backups");
        let b1 = create(&conn, &dir).unwrap();
        assert!(Path::new(&b1.path).exists());
        assert_eq!(list(&dir).unwrap().len(), 1);

        let copy = Connection::open(&b1.path).unwrap();
        let n: i64 = copy.query_row("SELECT count(*) FROM clients", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1);

        // stage + apply restore
        stage_restore(&db_path, Path::new(&b1.path)).unwrap();
        assert!(pending_path(&db_path).exists());
        drop(conn);
        assert!(apply_pending_restore(&db_path).unwrap());
        assert!(!pending_path(&db_path).exists());

        prune(&dir, 0).unwrap();
        assert_eq!(list(&dir).unwrap().len(), 0);
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
