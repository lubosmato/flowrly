//! Provider-agnostic structured extraction via rig. One function, `extract`, takes a
//! preamble + text and returns a typed struct. Provider selection is a plain enum match.

use rig::client::Nothing;
use rig::providers::{anthropic, gemini, ollama, openai, openrouter};
use rig_agent::prelude::*;
use schemars::JsonSchema;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::models::AiProvider;

#[derive(Debug, Clone)]
pub struct AiConfig {
    pub provider: AiProvider,
    pub model: String,
    pub base_url: Option<String>,
    pub api_key: Option<String>,
}

// ---------- Output shapes ----------

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct DaySummaryOut {
    /// 2-4 concrete sentences in past tense describing what was worked on.
    pub description: String,
    /// Breakdown of active minutes by kind of work.
    pub tags: Vec<TagOut>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TagOut {
    /// Short lowercase tag, 1-2 words (e.g. "coding", "meetings", "code review").
    pub name: String,
    pub minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SuggestionOut {
    /// HH:MM when focused work started.
    pub start_time: String,
    /// HH:MM when focused work ended.
    pub end_time: String,
    /// Focused work minutes, excluding idle time and clearly non-work activity.
    pub duration_minutes: u32,
    /// One line, max 120 characters, past tense, suitable for an invoice worksheet.
    pub description: String,
}

// ---------- Prompts ----------

pub fn day_summary_preamble(existing_tags: &[String]) -> String {
    let tags = if existing_tags.is_empty() {
        "(none yet)".to_string()
    } else {
        existing_tags.join(", ")
    };
    format!(
        "You summarize one day of a freelance software developer's computer activity, given a log \
of focused windows (app name + window title) with minutes spent in each.\n\
Return two things.\n\
1. description: 2 to 4 sentences, past tense, concrete and specific (project names, repositories, \
PR numbers, topics, people). No filler, no judgement, no mention of the log itself.\n\
2. tags: split the day's active minutes into kinds of work. Existing tags: {tags}. Reuse an existing \
tag whenever it fits; create a new tag only when nothing fits. Tag names are lowercase, 1 to 2 words. \
Minutes across tags should add up to roughly the total active minutes. Use at most 6 tags."
    )
}

pub fn suggestion_preamble() -> String {
    "You help a freelance software developer fill in a time entry for one day, given a log of \
focused windows (app name + window title) with minutes spent in each.\n\
Propose one time entry:\n\
- start_time: HH:MM when focused work began (ignore brief early checks of mail or chat).\n\
- end_time: HH:MM when focused work ended.\n\
- duration_minutes: minutes of actual work. Exclude idle time and clearly personal activity \
(music, personal browsing, news, social media). Meetings, code review, chat about work and \
documentation count as work.\n\
- description: one line, max 120 characters, past tense, concrete (what was built, fixed or \
discussed). It will be pasted into an invoice worksheet."
        .to_string()
}

// ---------- Extraction ----------

macro_rules! keyed_client {
    ($client:ty, $cfg:expr) => {{
        let key = $cfg
            .api_key
            .clone()
            .filter(|k| !k.trim().is_empty())
            .ok_or_else(|| AppError::Ai("AI API key is not set. Add it in Settings.".into()))?;
        let built = match $cfg.base_url.as_deref().map(str::trim).filter(|u| !u.is_empty()) {
            Some(url) => <$client>::builder().api_key(key).base_url(url).build(),
            None => <$client>::new(key),
        };
        built.map_err(|e| AppError::Ai(e.to_string()))?
    }};
}

pub async fn extract<T>(cfg: &AiConfig, preamble: &str, text: &str) -> AppResult<T>
where
    T: JsonSchema + DeserializeOwned + Serialize + Send + Sync + 'static,
{
    if cfg.model.trim().is_empty() {
        return Err(AppError::Ai("AI model is not set. Add it in Settings.".into()));
    }
    match cfg.provider {
        AiProvider::Anthropic => {
            let client = keyed_client!(anthropic::Client, cfg);
            run::<_, T>(client, cfg, preamble, text).await
        }
        AiProvider::Openai => {
            let client = keyed_client!(openai::Client, cfg);
            run::<_, T>(client, cfg, preamble, text).await
        }
        AiProvider::Gemini => {
            let client = keyed_client!(gemini::Client, cfg);
            run::<_, T>(client, cfg, preamble, text).await
        }
        AiProvider::Openrouter => {
            let client = keyed_client!(openrouter::Client, cfg);
            run::<_, T>(client, cfg, preamble, text).await
        }
        AiProvider::Ollama => {
            let url = cfg
                .base_url
                .as_deref()
                .map(str::trim)
                .filter(|u| !u.is_empty())
                .unwrap_or("http://localhost:11434")
                .to_string();
            let client = ollama::Client::builder()
                .api_key(Nothing)
                .base_url(url)
                .build()
                .map_err(|e| AppError::Ai(e.to_string()))?;
            run::<_, T>(client, cfg, preamble, text).await
        }
    }
}

async fn run<C, T>(client: C, cfg: &AiConfig, preamble: &str, text: &str) -> AppResult<T>
where
    C: AgentClientExt,
    C::CompletionModel: 'static,
    T: JsonSchema + DeserializeOwned + Serialize + Send + Sync + 'static,
{
    let extractor = client
        .extractor::<T>(cfg.model.as_str())
        .preamble(preamble)
        .max_tokens(4096)
        .retries(2)
        .build();
    extractor
        .extract(text)
        .await
        .map_err(|e| AppError::Ai(e.to_string()))
}
