//! All secrets live in one keychain item as a JSON object. One item means one
//! "Always Allow" click per build (the app is ad-hoc signed, so every build is a
//! new identity to the keychain) instead of one per secret.

use std::collections::BTreeMap;

use crate::error::{AppError, AppResult};
use crate::models::SecretKey;

const SERVICE: &str = "cz.lubosmatejcik.flowrly";
const ACCOUNT: &str = "secrets";

type Secrets = BTreeMap<String, String>;

fn entry(account: &str) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, account).map_err(|e| AppError::Secret(e.to_string()))
}

fn read(account: &str) -> AppResult<Option<String>> {
    match entry(account)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Secret(e.to_string())),
    }
}

fn load() -> AppResult<Secrets> {
    match read(ACCOUNT)? {
        Some(blob) => serde_json::from_str(&blob).map_err(|e| AppError::Secret(e.to_string())),
        None => migrate_legacy(),
    }
}

fn store(secrets: &Secrets) -> AppResult<()> {
    let blob = serde_json::to_string(secrets).map_err(|e| AppError::Secret(e.to_string()))?;
    entry(ACCOUNT)?
        .set_password(&blob)
        .map_err(|e| AppError::Secret(e.to_string()))
}

/// Older builds stored one keychain item per secret. Fold them into the blob
/// and remove them, so the old items stop prompting.
fn migrate_legacy() -> AppResult<Secrets> {
    let mut secrets = Secrets::new();
    for key in [SecretKey::AiApiKey, SecretKey::FakturoidClientSecret] {
        if let Some(v) = read(key.as_str())?.filter(|v| !v.is_empty()) {
            secrets.insert(key.as_str().to_string(), v);
        }
    }
    if !secrets.is_empty() {
        store(&secrets)?;
        for account in ["ai_api_key", "fakturoid_client_secret"] {
            let _ = entry(account)?.delete_credential();
        }
    }
    Ok(secrets)
}

pub fn get(key: SecretKey) -> AppResult<Option<String>> {
    Ok(load()?.get(key.as_str()).cloned().filter(|v| !v.is_empty()))
}

pub fn set(key: SecretKey, value: &str) -> AppResult<()> {
    let mut secrets = load()?;
    if value.is_empty() {
        secrets.remove(key.as_str());
    } else {
        secrets.insert(key.as_str().to_string(), value.to_string());
    }
    store(&secrets)
}
