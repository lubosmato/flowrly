//! Focused-window tracker. Polls the active window every couple of seconds and
//! writes an Activity Sample whenever the (app, title, idle) triple changes, plus a
//! heartbeat sample every minute so gaps (sleep, app not running) are detectable.

use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use chrono::Local;
use rusqlite::{params, Connection};

use crate::db;

pub const POLL_INTERVAL: Duration = Duration::from_secs(2);
pub const HEARTBEAT: Duration = Duration::from_secs(60);
/// Gap between consecutive samples above which we assume the machine was off/asleep.
pub const MAX_GAP_SECS: i64 = 150;
pub const IGNORED_APP_LABEL: &str = "Ignored app";

#[derive(Debug, Clone)]
pub struct TrackerConfig {
    pub enabled: bool,
    pub idle_threshold_secs: u64,
    pub ignored_apps: Vec<String>,
}

pub type SharedTrackerConfig = Arc<RwLock<TrackerConfig>>;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Observation {
    app: String,
    title: String,
    idle: bool,
}

fn observe(cfg: &TrackerConfig) -> Option<Observation> {
    let idle = user_idle::UserIdle::get_time()
        .map(|t| t.as_seconds() >= cfg.idle_threshold_secs)
        .unwrap_or(false);
    let win = active_win_pos_rs::get_active_window().ok()?;
    let ignored = cfg
        .ignored_apps
        .iter()
        .any(|a| a.trim().eq_ignore_ascii_case(win.app_name.trim()));
    let (app, title) = if ignored {
        (IGNORED_APP_LABEL.to_string(), String::new())
    } else {
        (win.app_name, win.title)
    };
    Some(Observation { app, title, idle })
}

fn insert(conn: &Connection, obs: &Observation) -> rusqlite::Result<()> {
    let now = Local::now();
    conn.execute(
        "INSERT INTO activity_samples (at, day, app, title, idle) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            now.format("%Y-%m-%dT%H:%M:%S").to_string(),
            now.format("%Y-%m-%d").to_string(),
            obs.app,
            obs.title,
            obs.idle as i64,
        ],
    )?;
    Ok(())
}

pub fn spawn(db_path: PathBuf, cfg: SharedTrackerConfig) {
    thread::Builder::new()
        .name("flowrly-tracker".into())
        .spawn(move || {
            let conn = match db::open_existing(&db_path) {
                Ok(c) => c,
                Err(e) => {
                    log::error!("tracker: cannot open db: {e}");
                    return;
                }
            };
            let mut last: Option<Observation> = None;
            let mut last_write = Instant::now();
            loop {
                thread::sleep(POLL_INTERVAL);
                let snapshot = match cfg.read() {
                    Ok(c) => c.clone(),
                    Err(_) => continue,
                };
                if !snapshot.enabled {
                    last = None;
                    continue;
                }
                let Some(obs) = observe(&snapshot) else { continue };
                let changed = last.as_ref() != Some(&obs);
                if changed || last_write.elapsed() >= HEARTBEAT {
                    if let Err(e) = insert(&conn, &obs) {
                        log::warn!("tracker: insert failed: {e}");
                    }
                    last = Some(obs);
                    last_write = Instant::now();
                }
            }
        })
        .expect("spawn tracker thread");
}
