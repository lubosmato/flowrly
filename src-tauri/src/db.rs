use std::path::Path;

use rusqlite::Connection;
use rusqlite_migration::{Migrations, M};

use crate::error::AppResult;

const MIGRATIONS: &[&str] = &[
    // 0001: initial schema
    r#"
    CREATE TABLE clients (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#F59E0B',
        hourly_rate REAL NOT NULL DEFAULT 0,
        vat_rate INTEGER NOT NULL DEFAULT 0,
        line_description TEXT NOT NULL DEFAULT 'Software development {period}',
        fakturoid_subject_id INTEGER,
        fakturoid_generator_id INTEGER,
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE time_entries (
        id INTEGER PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id),
        date TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
        start_time TEXT,
        end_time TEXT,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE INDEX idx_entries_date ON time_entries(date);
    CREATE INDEX idx_entries_client_date ON time_entries(client_id, date);

    CREATE TABLE activity_samples (
        id INTEGER PRIMARY KEY,
        at TEXT NOT NULL,
        day TEXT NOT NULL,
        app TEXT NOT NULL,
        title TEXT NOT NULL,
        idle INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_samples_day_at ON activity_samples(day, at);

    CREATE TABLE tags (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );

    CREATE TABLE day_summaries (
        day TEXT PRIMARY KEY,
        active_minutes INTEGER NOT NULL,
        description TEXT NOT NULL,
        sample_count INTEGER NOT NULL,
        generated_at TEXT NOT NULL
    );

    CREATE TABLE day_summary_tags (
        day TEXT NOT NULL REFERENCES day_summaries(day) ON DELETE CASCADE,
        tag_id INTEGER NOT NULL REFERENCES tags(id),
        minutes INTEGER NOT NULL,
        PRIMARY KEY (day, tag_id)
    );

    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
    // 0002: per-client currency
    r#"ALTER TABLE clients ADD COLUMN currency TEXT NOT NULL DEFAULT 'CZK';"#,
    // 0003: workload (pensum) per client
    r#"
    ALTER TABLE clients ADD COLUMN pensum_percent INTEGER NOT NULL DEFAULT 100;
    ALTER TABLE clients ADD COLUMN workday_hours REAL NOT NULL DEFAULT 8;
    "#,
];

pub fn migrations() -> Migrations<'static> {
    Migrations::new(MIGRATIONS.iter().map(|sql| M::up(sql)).collect())
}

/// Open (and migrate) the database at `path`.
pub fn open(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut conn = Connection::open(path)?;
    configure(&conn)?;
    migrations().to_latest(&mut conn)?;
    Ok(conn)
}

/// Open a second connection to an already-migrated database (used by the tracker thread).
pub fn open_existing(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    configure(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection) -> AppResult<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_valid() {
        assert!(migrations().validate().is_ok());
    }
}
