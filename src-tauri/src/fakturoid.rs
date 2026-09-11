//! Minimal Fakturoid API v3 client (client-credentials flow, single account).

use std::time::{Duration, Instant};

use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use serde::Deserialize;
use serde_json::Value;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::models::{CreatedInvoice, FakturoidAccount, FakturoidGenerator, FakturoidSubject};

pub const BASE_URL: &str = "https://app.fakturoid.cz/api/v3";

#[derive(Default)]
pub struct TokenCache(Mutex<Option<(String, Instant)>>);

pub struct Credentials {
    pub client_id: String,
    pub client_secret: String,
    pub contact_email: String,
}

pub struct Fakturoid<'a> {
    pub http: &'a reqwest::Client,
    pub creds: Credentials,
    pub cache: &'a TokenCache,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default = "default_expiry")]
    expires_in: u64,
}

fn default_expiry() -> u64 {
    7200
}

impl<'a> Fakturoid<'a> {
    fn user_agent(&self) -> String {
        let email = if self.creds.contact_email.trim().is_empty() {
            "no-reply@flowrly.local"
        } else {
            self.creds.contact_email.trim()
        };
        format!("Flowrly ({email})")
    }

    async fn token(&self) -> AppResult<String> {
        let mut guard = self.cache.0.lock().await;
        if let Some((tok, exp)) = guard.as_ref() {
            if Instant::now() < *exp {
                return Ok(tok.clone());
            }
        }
        if self.creds.client_id.trim().is_empty() || self.creds.client_secret.trim().is_empty() {
            return Err(AppError::Fakturoid(
                "Fakturoid client ID / secret are not set. Add them in Settings.".into(),
            ));
        }
        let res = self
            .http
            .post(format!("{BASE_URL}/oauth/token"))
            .basic_auth(&self.creds.client_id, Some(&self.creds.client_secret))
            .header(USER_AGENT, self.user_agent())
            .header(ACCEPT, "application/json")
            .header(CONTENT_TYPE, "application/json")
            .json(&serde_json::json!({ "grant_type": "client_credentials" }))
            .send()
            .await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(AppError::Fakturoid(format!("Token request failed ({status}): {body}")));
        }
        let tok: TokenResponse = serde_json::from_str(&body)
            .map_err(|e| AppError::Fakturoid(format!("Bad token response: {e}")))?;
        let expiry = Instant::now() + Duration::from_secs(tok.expires_in.saturating_sub(60));
        *guard = Some((tok.access_token.clone(), expiry));
        Ok(tok.access_token)
    }

    async fn request(&self, method: reqwest::Method, path: &str, body: Option<&Value>) -> AppResult<Value> {
        let token = self.token().await?;
        let mut req = self
            .http
            .request(method, format!("{BASE_URL}{path}"))
            .bearer_auth(token)
            .header(USER_AGENT, self.user_agent())
            .header(ACCEPT, "application/json");
        if let Some(b) = body {
            req = req.header(CONTENT_TYPE, "application/json").json(b);
        }
        let res = req.send().await?;
        let status = res.status();
        let text = res.text().await?;
        if !status.is_success() {
            return Err(AppError::Fakturoid(format!("Fakturoid {status} on {path}: {text}")));
        }
        if text.trim().is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_str(&text).map_err(|e| AppError::Fakturoid(format!("Bad JSON from {path}: {e}")))
    }

    async fn get(&self, path: &str) -> AppResult<Value> {
        self.request(reqwest::Method::GET, path, None).await
    }

    pub async fn accounts(&self) -> AppResult<Vec<FakturoidAccount>> {
        let v = self.get("/user.json").await?;
        let list = v["accounts"].as_array().cloned().unwrap_or_default();
        Ok(list
            .iter()
            .filter_map(|a| {
                Some(FakturoidAccount {
                    slug: a["slug"].as_str()?.to_string(),
                    name: a["name"].as_str().unwrap_or("").to_string(),
                })
            })
            .collect())
    }

    pub async fn subjects(&self, slug: &str) -> AppResult<Vec<FakturoidSubject>> {
        let mut out = Vec::new();
        for page in 1..=10 {
            let v = self.get(&format!("/accounts/{slug}/subjects.json?page={page}")).await?;
            let Some(arr) = v.as_array() else { break };
            if arr.is_empty() {
                break;
            }
            for s in arr {
                if let Some(id) = s["id"].as_i64() {
                    out.push(FakturoidSubject {
                        id: id as i32,
                        name: s["name"].as_str().unwrap_or("").to_string(),
                        registration_no: s["registration_no"].as_str().map(|x| x.to_string()),
                    });
                }
            }
            if arr.len() < 40 {
                break;
            }
        }
        Ok(out)
    }

    pub async fn generators(&self, slug: &str) -> AppResult<Vec<FakturoidGenerator>> {
        let v = self.get(&format!("/accounts/{slug}/generators.json")).await?;
        Ok(v.as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|g| {
                        Some(FakturoidGenerator {
                            id: g["id"].as_i64()? as i32,
                            name: g["name"].as_str().unwrap_or("").to_string(),
                            subject_id: g["subject_id"].as_i64().map(|v| v as i32),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default())
    }

    pub async fn generator(&self, slug: &str, id: i64) -> AppResult<Value> {
        self.get(&format!("/accounts/{slug}/generators/{id}.json")).await
    }

    pub async fn create_invoice(&self, slug: &str, body: &Value) -> AppResult<CreatedInvoice> {
        let v = self
            .request(reqwest::Method::POST, &format!("/accounts/{slug}/invoices.json"), Some(body))
            .await?;
        Ok(CreatedInvoice {
            id: v["id"].as_i64().unwrap_or_default() as i32,
            number: v["number"].as_str().unwrap_or("").to_string(),
            html_url: v["html_url"].as_str().unwrap_or("").to_string(),
            total: v["total"].as_str().unwrap_or("").to_string(),
        })
    }
}
