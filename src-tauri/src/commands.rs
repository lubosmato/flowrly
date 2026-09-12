//! Tauri commands: thin wrappers over repo/activity/ai/fakturoid/backup.

use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use chrono::Local;
use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_autostart::ManagerExt;

use crate::error::{AppError, AppResult};
use crate::fakturoid::{Credentials, Fakturoid, TokenCache};
use crate::models::*;
use crate::tracker::SharedTrackerConfig;
use crate::{activity, ai, backup, export, invoice, repo, secrets};

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub app_data_dir: PathBuf,
    pub tracker_cfg: SharedTrackerConfig,
    pub http: reqwest::Client,
    pub fakturoid_tokens: TokenCache,
}

impl AppState {
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|_| AppError::Internal("database lock poisoned".into()))
    }
}

// ---------- Clients ----------

#[tauri::command]
#[specta::specta]
pub fn list_clients(state: State<'_, AppState>) -> AppResult<Vec<Client>> {
    repo::list_clients(&*state.conn()?)
}

#[tauri::command]
#[specta::specta]
pub fn create_client(state: State<'_, AppState>, input: ClientInput) -> AppResult<Client> {
    repo::create_client(&*state.conn()?, &input)
}

#[tauri::command]
#[specta::specta]
pub fn update_client(state: State<'_, AppState>, id: i32, input: ClientInput) -> AppResult<Client> {
    repo::update_client(&*state.conn()?, id, &input)
}

#[tauri::command]
#[specta::specta]
pub fn delete_client(state: State<'_, AppState>, id: i32) -> AppResult<()> {
    repo::delete_client(&*state.conn()?, id)
}

// ---------- Time entries ----------

#[tauri::command]
#[specta::specta]
pub fn list_entries(state: State<'_, AppState>, filter: EntryFilter) -> AppResult<Vec<TimeEntry>> {
    repo::list_entries(&*state.conn()?, &filter)
}

#[tauri::command]
#[specta::specta]
pub fn day_totals(state: State<'_, AppState>, from: String, to: String) -> AppResult<Vec<DayTotal>> {
    repo::day_totals(&*state.conn()?, &from, &to)
}

#[tauri::command]
#[specta::specta]
pub fn create_entry(state: State<'_, AppState>, input: TimeEntryInput) -> AppResult<TimeEntry> {
    repo::create_entry(&*state.conn()?, &input)
}

#[tauri::command]
#[specta::specta]
pub fn update_entry(state: State<'_, AppState>, id: i32, input: TimeEntryInput) -> AppResult<TimeEntry> {
    repo::update_entry(&*state.conn()?, id, &input)
}

#[tauri::command]
#[specta::specta]
pub fn delete_entry(state: State<'_, AppState>, id: i32) -> AppResult<()> {
    repo::delete_entry(&*state.conn()?, id)
}

// ---------- Settings & secrets ----------

#[tauri::command]
#[specta::specta]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<Settings> {
    repo::load_settings(&*state.conn()?)
}

pub fn apply_settings(app: &AppHandle, state: &AppState, s: &Settings) {
    if let Ok(mut cfg) = state.tracker_cfg.write() {
        cfg.enabled = s.tracking_enabled;
        cfg.idle_threshold_secs = s.idle_threshold_seconds.max(30) as u64;
        cfg.ignored_apps = s.ignored_apps.clone();
    }
    let autostart = app.autolaunch();
    let result = if s.launch_at_login { autostart.enable() } else { autostart.disable() };
    if let Err(e) = result {
        log::warn!("autostart: {e}");
    }
}

#[tauri::command]
#[specta::specta]
pub fn save_settings(app: AppHandle, state: State<'_, AppState>, settings: Settings) -> AppResult<Settings> {
    let mut s = settings;
    s.ignored_apps = s
        .ignored_apps
        .into_iter()
        .map(|a| a.trim().to_string())
        .filter(|a| !a.is_empty())
        .collect();
    s.idle_threshold_seconds = s.idle_threshold_seconds.clamp(30, 3600);
    repo::save_settings(&*state.conn()?, &s)?;
    apply_settings(&app, &state, &s);
    Ok(s)
}

#[tauri::command]
#[specta::specta]
pub fn set_secret(key: SecretKey, value: String) -> AppResult<()> {
    secrets::set(key, value.trim())
}

#[tauri::command]
#[specta::specta]
pub fn has_secret(key: SecretKey) -> AppResult<bool> {
    Ok(secrets::get(key)?.map(|v| !v.is_empty()).unwrap_or(false))
}

#[tauri::command]
#[specta::specta]
pub fn open_accessibility_settings() -> AppResult<()> {
    tauri_plugin_opener::open_url(
        "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
        None::<&str>,
    )
    .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn open_url(url: String) -> AppResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(AppError::Validation("Only http(s) URLs can be opened".into()));
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| AppError::Internal(e.to_string()))
}

// ---------- Activity / AI ----------

#[tauri::command]
#[specta::specta]
pub fn get_day_activity(state: State<'_, AppState>, day: String) -> AppResult<DayActivity> {
    activity::day_activity(&*state.conn()?, &day)
}

#[tauri::command]
#[specta::specta]
pub fn tracked_days(state: State<'_, AppState>, from: String, to: String) -> AppResult<Vec<TrackedDay>> {
    activity::tracked_days(&*state.conn()?, &from, &to)
}

#[tauri::command]
#[specta::specta]
pub fn get_day_summary(state: State<'_, AppState>, day: String) -> AppResult<Option<DaySummary>> {
    repo::get_day_summary(&*state.conn()?, &day)
}

#[tauri::command]
#[specta::specta]
pub fn list_day_summaries(state: State<'_, AppState>, from: String, to: String) -> AppResult<Vec<DaySummary>> {
    repo::summaries_in_range(&*state.conn()?, &from, &to)
}

#[tauri::command]
#[specta::specta]
pub fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    repo::list_tags(&*state.conn()?)
}

fn ai_config(conn: &Connection) -> AppResult<ai::AiConfig> {
    let s = repo::load_settings(conn)?;
    Ok(ai::AiConfig {
        provider: s.ai_provider,
        model: s.ai_model,
        base_url: Some(s.ai_base_url),
        api_key: secrets::get(SecretKey::AiApiKey)?,
    })
}

struct DayDigest {
    text: String,
    active_minutes: i64,
    sample_count: i64,
    first_active: Option<String>,
    last_active: Option<String>,
}

fn digest(conn: &Connection, day: &str) -> AppResult<DayDigest> {
    let samples = activity::load_samples(conn, day)?;
    if samples.is_empty() {
        return Err(AppError::NotFound(format!("No tracked activity for {day}")));
    }
    let agg = activity::aggregate(&samples, Some(Local::now().naive_local()));
    if agg.active_secs < 60 {
        return Err(AppError::NotFound(format!("Less than a minute of activity tracked on {day}")));
    }
    Ok(DayDigest {
        text: activity::describe_for_llm(day, &agg),
        active_minutes: agg.active_secs / 60,
        sample_count: samples.len() as i64,
        first_active: agg.first_active.map(|t| t.format("%H:%M").to_string()),
        last_active: agg.last_active.map(|t| t.format("%H:%M").to_string()),
    })
}

#[tauri::command]
#[specta::specta]
pub async fn generate_day_summary(state: State<'_, AppState>, day: String) -> AppResult<DaySummary> {
    let (cfg, digest, tags) = {
        let conn = state.conn()?;
        (ai_config(&conn)?, digest(&conn, &day)?, repo::list_tags(&conn)?)
    };
    let out: ai::DaySummaryOut = ai::extract(&cfg, &ai::day_summary_preamble(&tags), &digest.text).await?;
    let tag_pairs: Vec<(String, i32)> = out.tags.iter().map(|t| (t.name.clone(), t.minutes as i32)).collect();
    let mut conn = state.conn()?;
    repo::save_day_summary(
        &mut conn,
        &day,
        digest.active_minutes as i32,
        out.description.trim(),
        digest.sample_count as i32,
        &tag_pairs,
    )
}

#[tauri::command]
#[specta::specta]
pub async fn suggest_entry(state: State<'_, AppState>, day: String) -> AppResult<Suggestion> {
    let (cfg, digest) = {
        let conn = state.conn()?;
        (ai_config(&conn)?, digest(&conn, &day)?)
    };
    let out: ai::SuggestionOut = ai::extract(&cfg, &ai::suggestion_preamble(), &digest.text).await?;
    let valid_time = |s: &str| chrono::NaiveTime::parse_from_str(s, "%H:%M").is_ok();
    let start = Some(out.start_time.clone()).filter(|s| valid_time(s)).or(digest.first_active);
    let end = Some(out.end_time.clone()).filter(|s| valid_time(s)).or(digest.last_active);
    let duration = if out.duration_minutes == 0 { digest.active_minutes } else { out.duration_minutes as i64 };
    Ok(Suggestion {
        start_time: start,
        end_time: end,
        duration_minutes: duration.clamp(1, 24 * 60) as i32,
        description: out.description.trim().chars().take(200).collect(),
    })
}

// ---------- Fakturoid / invoicing ----------

fn fakturoid<'a>(state: &'a AppState, conn: &Connection) -> AppResult<(Fakturoid<'a>, Settings)> {
    let s = repo::load_settings(conn)?;
    let client = Fakturoid {
        http: &state.http,
        creds: Credentials {
            client_id: s.fakturoid_client_id.clone(),
            client_secret: secrets::get(SecretKey::FakturoidClientSecret)?.unwrap_or_default(),
            contact_email: s.fakturoid_contact_email.clone(),
        },
        cache: &state.fakturoid_tokens,
    };
    Ok((client, s))
}

fn require_slug(s: &Settings) -> AppResult<String> {
    let slug = s.fakturoid_account_slug.trim();
    if slug.is_empty() {
        return Err(AppError::Fakturoid("Fakturoid account is not selected. Pick one in Settings.".into()));
    }
    Ok(slug.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn fakturoid_accounts(state: State<'_, AppState>) -> AppResult<Vec<FakturoidAccount>> {
    let (fx, _) = fakturoid(&state, &*state.conn()?)?;
    fx.accounts().await
}

#[tauri::command]
#[specta::specta]
pub async fn fakturoid_subjects(state: State<'_, AppState>) -> AppResult<Vec<FakturoidSubject>> {
    let (fx, s) = fakturoid(&state, &*state.conn()?)?;
    fx.subjects(&require_slug(&s)?).await
}

#[tauri::command]
#[specta::specta]
pub async fn fakturoid_generators(state: State<'_, AppState>) -> AppResult<Vec<FakturoidGenerator>> {
    let (fx, s) = fakturoid(&state, &*state.conn()?)?;
    fx.generators(&require_slug(&s)?).await
}

fn preview(conn: &Connection, filter: &EntryFilter) -> AppResult<(InvoicePreview, Client, Vec<TimeEntry>)> {
    let client_id = filter
        .client_id
        .ok_or_else(|| AppError::Validation("Pick a client to invoice".into()))?;
    let client = repo::get_client(conn, client_id)?;
    let entries = repo::list_entries(conn, filter)?;
    if entries.is_empty() {
        return Err(AppError::Validation("No time entries match the current filter".into()));
    }
    let total_minutes: i32 = entries.iter().map(|e| e.duration_minutes).sum();
    let from = filter
        .from
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| entries.iter().map(|e| e.date.clone()).min().unwrap_or_default());
    let to = filter
        .to
        .clone()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| entries.iter().map(|e| e.date.clone()).max().unwrap_or_default());
    let period_label = invoice::period_label(&from, &to);
    let hours = invoice::hours_exact(total_minutes as i64);
    let preview = InvoicePreview {
        client_id,
        line_name: invoice::line_name(&client, &period_label),
        period_label,
        total_minutes,
        hours,
        hourly_rate: client.hourly_rate,
        currency: client.currency.clone(),
        vat_rate: client.vat_rate,
        subtotal: hours * client.hourly_rate,
        entry_count: entries.len() as i32,
    };
    Ok((preview, client, entries))
}

#[tauri::command]
#[specta::specta]
pub fn preview_invoice(state: State<'_, AppState>, filter: EntryFilter) -> AppResult<InvoicePreview> {
    Ok(preview(&*state.conn()?, &filter)?.0)
}

#[tauri::command]
#[specta::specta]
pub async fn create_invoice(state: State<'_, AppState>, filter: EntryFilter) -> AppResult<CreatedInvoice> {
    let (prev, client, fx, settings) = {
        let conn = state.conn()?;
        let (prev, client, _) = preview(&conn, &filter)?;
        let (fx, settings) = fakturoid(&state, &conn)?;
        (prev, client, fx, settings)
    };
    let slug = require_slug(&settings)?;
    if client.fakturoid_subject_id.is_none() && client.fakturoid_generator_id.is_none() {
        return Err(AppError::Validation(
            "Client has no Fakturoid subject or generator set. Configure it in Clients.".into(),
        ));
    }
    let generator = match client.fakturoid_generator_id {
        Some(id) => Some(fx.generator(&slug, id as i64).await?),
        None => None,
    };
    let body = invoice::build_invoice_body(&client, generator.as_ref(), prev.hours, &prev.period_label);
    fx.create_invoice(&slug, &body).await
}

// ---------- CSV ----------

#[tauri::command]
#[specta::specta]
pub fn export_csv(state: State<'_, AppState>, filter: EntryFilter, path: String) -> AppResult<i32> {
    let conn = state.conn()?;
    let entries = repo::list_entries(&conn, &filter)?;
    let clients = repo::list_clients(&conn)?;
    let csv = export::entries_to_csv(&entries, &clients)?;
    std::fs::write(&path, csv)?;
    Ok(entries.len() as i32)
}

// ---------- Backups ----------

fn backup_dir(state: &AppState, conn: &Connection) -> AppResult<PathBuf> {
    let s = repo::load_settings(conn)?;
    Ok(backup::resolve_dir(&state.app_data_dir, &s.backup_dir))
}

#[tauri::command]
#[specta::specta]
pub fn list_backups(state: State<'_, AppState>) -> AppResult<Vec<BackupFile>> {
    let conn = state.conn()?;
    backup::list(&backup_dir(&state, &conn)?)
}

#[tauri::command]
#[specta::specta]
pub fn backup_now(state: State<'_, AppState>) -> AppResult<BackupFile> {
    let conn = state.conn()?;
    let dir = backup_dir(&state, &conn)?;
    backup::create(&conn, &dir)
}

#[tauri::command]
#[specta::specta]
pub fn restore_backup(app: AppHandle, state: State<'_, AppState>, path: String) -> AppResult<()> {
    backup::stage_restore(&state.db_path, std::path::Path::new(&path))?;
    app.restart();
}

#[tauri::command]
#[specta::specta]
pub fn app_paths(state: State<'_, AppState>) -> AppResult<Vec<String>> {
    let conn = state.conn()?;
    Ok(vec![
        state.db_path.to_string_lossy().to_string(),
        backup_dir(&state, &conn)?.to_string_lossy().to_string(),
    ])
}

#[tauri::command]
#[specta::specta]
pub fn show_main_window(app: AppHandle) -> AppResult<()> {
    if let Some(w) = app.get_webview_window("main") {
        w.show()?;
        w.set_focus()?;
    }
    Ok(())
}
