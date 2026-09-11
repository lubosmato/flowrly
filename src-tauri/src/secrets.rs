use crate::error::{AppError, AppResult};
use crate::models::SecretKey;

const SERVICE: &str = "cz.lubosmatejcik.flowrly";

fn entry(key: SecretKey) -> AppResult<keyring::Entry> {
    keyring::Entry::new(SERVICE, key.as_str()).map_err(|e| AppError::Secret(e.to_string()))
}

pub fn get(key: SecretKey) -> AppResult<Option<String>> {
    match entry(key)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::Secret(e.to_string())),
    }
}

pub fn set(key: SecretKey, value: &str) -> AppResult<()> {
    if value.is_empty() {
        return delete(key);
    }
    entry(key)?
        .set_password(value)
        .map_err(|e| AppError::Secret(e.to_string()))
}

pub fn delete(key: SecretKey) -> AppResult<()> {
    match entry(key)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::Secret(e.to_string())),
    }
}
