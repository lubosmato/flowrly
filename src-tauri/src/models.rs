use serde::{Deserialize, Serialize};
use specta::Type;

// ---------- Clients ----------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Client {
    pub id: i32,
    pub name: String,
    pub color: String,
    pub hourly_rate: f64,
    /// ISO 4217 code, e.g. "CZK".
    pub currency: String,
    /// Contractual workload share for this client, 0-100.
    pub pensum_percent: i32,
    /// Hours in a full working day, e.g. 8.5.
    pub workday_hours: f64,
    pub vat_rate: i32,
    pub line_description: String,
    pub fakturoid_subject_id: Option<i32>,
    pub fakturoid_generator_id: Option<i32>,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ClientInput {
    pub name: String,
    pub color: String,
    pub hourly_rate: f64,
    pub currency: String,
    pub pensum_percent: i32,
    pub workday_hours: f64,
    pub vat_rate: i32,
    pub line_description: String,
    pub fakturoid_subject_id: Option<i32>,
    pub fakturoid_generator_id: Option<i32>,
    pub archived: bool,
}

// ---------- Time entries ----------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimeEntry {
    pub id: i32,
    pub client_id: i32,
    /// YYYY-MM-DD
    pub date: String,
    pub duration_minutes: i32,
    /// HH:MM
    pub start_time: Option<String>,
    /// HH:MM
    pub end_time: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TimeEntryInput {
    pub client_id: i32,
    pub date: String,
    /// Ignored (recomputed) when both start_time and end_time are present.
    pub duration_minutes: i32,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub description: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, Type)]
pub struct EntryFilter {
    pub client_id: Option<i32>,
    /// Inclusive, YYYY-MM-DD
    pub from: Option<String>,
    /// Inclusive, YYYY-MM-DD
    pub to: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DayTotal {
    pub date: String,
    pub client_id: i32,
    pub minutes: i32,
}

// ---------- Activity ----------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TagMinutes {
    pub tag: String,
    pub minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DaySummary {
    pub day: String,
    pub active_minutes: i32,
    pub description: String,
    pub tags: Vec<TagMinutes>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Suggestion {
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub duration_minutes: i32,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ActivityBlock {
    pub app: String,
    pub title: String,
    pub minutes: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct AppMinutes {
    pub app: String,
    pub minutes: i32,
}

/// Raw, un-summarised overview of a day: what the tracker saw.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DayActivity {
    pub day: String,
    pub active_minutes: i32,
    pub idle_minutes: i32,
    pub first_active: Option<String>,
    pub last_active: Option<String>,
    pub sample_count: i32,
    /// Focused windows, most time first (capped).
    pub top_blocks: Vec<ActivityBlock>,
    /// Active minutes per app, most time first (complete).
    pub apps: Vec<AppMinutes>,
    /// Active minutes for each hour of the day, index 0..24.
    pub per_hour: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct TrackedDay {
    pub day: String,
    pub active_minutes: i32,
    pub has_summary: bool,
}

// ---------- Settings ----------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum AiProvider {
    Anthropic,
    Openai,
    Gemini,
    Openrouter,
    Ollama,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct Settings {
    pub ai_provider: AiProvider,
    pub ai_model: String,
    pub ai_base_url: String,
    pub fakturoid_client_id: String,
    pub fakturoid_account_slug: String,
    pub fakturoid_contact_email: String,
    pub tracking_enabled: bool,
    pub idle_threshold_seconds: i32,
    pub ignored_apps: Vec<String>,
    pub backup_dir: String,
    pub launch_at_login: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            ai_provider: AiProvider::Anthropic,
            ai_model: "claude-haiku-4-5-20251001".into(),
            ai_base_url: String::new(),
            fakturoid_client_id: String::new(),
            fakturoid_account_slug: String::new(),
            fakturoid_contact_email: String::new(),
            tracking_enabled: true,
            idle_threshold_seconds: 300,
            ignored_apps: vec!["1Password".into(), "Keychain Access".into(), "Messages".into()],
            backup_dir: String::new(),
            launch_at_login: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum SecretKey {
    FakturoidClientSecret,
    AiApiKey,
}

impl SecretKey {
    pub fn as_str(self) -> &'static str {
        match self {
            SecretKey::FakturoidClientSecret => "fakturoid_client_secret",
            SecretKey::AiApiKey => "ai_api_key",
        }
    }
}

// ---------- Fakturoid ----------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FakturoidSubject {
    pub id: i32,
    pub name: String,
    pub registration_no: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FakturoidGenerator {
    pub id: i32,
    pub name: String,
    pub subject_id: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FakturoidAccount {
    pub slug: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct InvoicePreview {
    pub client_id: i32,
    pub period_label: String,
    pub line_name: String,
    pub total_minutes: i32,
    pub hours: f64,
    pub hourly_rate: f64,
    pub currency: String,
    pub vat_rate: i32,
    pub subtotal: f64,
    pub entry_count: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreatedInvoice {
    pub id: i32,
    pub number: String,
    pub html_url: String,
    pub total: String,
}

// ---------- Backups ----------

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct BackupFile {
    pub path: String,
    pub name: String,
    pub size_bytes: i32,
    pub created_at: String,
}
