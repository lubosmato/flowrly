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

mod ax {
    //! Focused-window title via the Accessibility API. `active-win-pos-rs` reads
    //! `kCGWindowName` of the *first* CG window owned by the frontmost pid, which for
    //! apps with native tabs (Ghostty, Terminal, Safari) is often the tab bar or a
    //! background tab, so the title comes back empty or stale. AXFocusedWindow is
    //! always the right window. Needs the Accessibility permission (not Screen
    //! Recording).
    use accessibility_sys::*;
    use core_foundation::base::{CFType, CFTypeRef, TCFType};
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;

    /// Ask macOS for Accessibility access, showing the system prompt if not yet granted.
    pub fn request_permission() -> bool {
        let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
        let opts = CFDictionary::from_CFType_pairs(&[(key, CFBoolean::true_value())]);
        unsafe { AXIsProcessTrustedWithOptions(opts.as_concrete_TypeRef()) }
    }

    pub fn focused_window_title(pid: i32) -> Option<String> {
        unsafe {
            let app = AXUIElementCreateApplication(pid);
            if app.is_null() {
                return None;
            }
            let app = CFType::wrap_under_create_rule(app as CFTypeRef);
            let win = attr(app.as_CFTypeRef() as AXUIElementRef, kAXFocusedWindowAttribute)?;
            let title = attr(win.as_CFTypeRef() as AXUIElementRef, kAXTitleAttribute)?;
            title.downcast::<CFString>().map(|s| s.to_string())
        }
    }

    unsafe fn attr(el: AXUIElementRef, name: &str) -> Option<CFType> {
        let name = CFString::new(name);
        let mut out: CFTypeRef = std::ptr::null();
        let err = AXUIElementCopyAttributeValue(el, name.as_concrete_TypeRef(), &mut out);
        if err != kAXErrorSuccess || out.is_null() {
            return None;
        }
        Some(CFType::wrap_under_create_rule(out))
    }
}

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
        let title = ax::focused_window_title(win.process_id as i32)
            .filter(|t| !t.is_empty())
            .unwrap_or(win.title);
        (win.app_name, title)
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
            if !ax::request_permission() {
                log::warn!("tracker: Accessibility permission not granted; window titles may be empty");
            }
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
                let Some(obs) = observe(&snapshot) else {
                    continue;
                };
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
