//! SQL access for clients, time entries, settings, tags and day summaries.

use chrono::{NaiveDate, NaiveTime};
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::error::{AppError, AppResult};
use crate::models::{
    Client, ClientInput, DaySummary, DayTotal, EntryFilter, Settings, TagMinutes, TimeEntry,
    TimeEntryInput,
};

// ---------- Settings ----------

const SETTINGS_KEY: &str = "app";

pub fn load_settings(conn: &Connection) -> AppResult<Settings> {
    let raw: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [SETTINGS_KEY], |r| r.get(0))
        .optional()?;
    let Some(raw) = raw else { return Ok(Settings::default()) };
    // Merge stored keys over defaults so newly added fields don't break old settings.
    let mut merged = serde_json::to_value(Settings::default())?;
    if let (Some(base), Ok(serde_json::Value::Object(stored))) =
        (merged.as_object_mut(), serde_json::from_str::<serde_json::Value>(&raw))
    {
        for (k, v) in stored {
            base.insert(k, v);
        }
    }
    Ok(serde_json::from_value(merged).unwrap_or_default())
}

pub fn save_settings(conn: &Connection, s: &Settings) -> AppResult<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![SETTINGS_KEY, serde_json::to_string(s)?],
    )?;
    Ok(())
}

// ---------- Clients ----------

fn client_from_row(r: &Row) -> rusqlite::Result<Client> {
    Ok(Client {
        id: r.get("id")?,
        name: r.get("name")?,
        color: r.get("color")?,
        hourly_rate: r.get("hourly_rate")?,
        currency: r.get("currency")?,
        vat_rate: r.get("vat_rate")?,
        line_description: r.get("line_description")?,
        fakturoid_subject_id: r.get("fakturoid_subject_id")?,
        fakturoid_generator_id: r.get("fakturoid_generator_id")?,
        archived: r.get::<_, i32>("archived")? != 0,
    })
}

const CLIENT_COLS: &str = "id, name, color, hourly_rate, currency, vat_rate, line_description, fakturoid_subject_id, fakturoid_generator_id, archived";

pub fn list_clients(conn: &Connection) -> AppResult<Vec<Client>> {
    let mut stmt = conn.prepare(&format!("SELECT {CLIENT_COLS} FROM clients ORDER BY archived, name"))?;
    let rows = stmt.query_map([], client_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get_client(conn: &Connection, id: i32) -> AppResult<Client> {
    conn.query_row(&format!("SELECT {CLIENT_COLS} FROM clients WHERE id = ?1"), [id], client_from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("Client {id} not found")))
}

fn validate_client(input: &ClientInput) -> AppResult<()> {
    if input.name.trim().is_empty() {
        return Err(AppError::Validation("Client name is required".into()));
    }
    if input.hourly_rate < 0.0 {
        return Err(AppError::Validation("Hourly rate can't be negative".into()));
    }
    if !(0..=100).contains(&input.vat_rate) {
        return Err(AppError::Validation("VAT rate must be between 0 and 100".into()));
    }
    let cur = input.currency.trim();
    if cur.len() != 3 || !cur.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(AppError::Validation("Currency must be a 3-letter code like CZK or EUR".into()));
    }
    Ok(())
}

pub fn create_client(conn: &Connection, input: &ClientInput) -> AppResult<Client> {
    validate_client(input)?;
    conn.execute(
        "INSERT INTO clients (name, color, hourly_rate, vat_rate, line_description, fakturoid_subject_id, fakturoid_generator_id, archived, currency)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            input.name.trim(),
            input.color,
            input.hourly_rate,
            input.vat_rate,
            input.line_description,
            input.fakturoid_subject_id,
            input.fakturoid_generator_id,
            input.archived as i64,
            input.currency.trim().to_uppercase()
        ],
    )?;
    get_client(conn, conn.last_insert_rowid() as i32)
}

pub fn update_client(conn: &Connection, id: i32, input: &ClientInput) -> AppResult<Client> {
    validate_client(input)?;
    let n = conn.execute(
        "UPDATE clients SET name = ?1, color = ?2, hourly_rate = ?3, vat_rate = ?4, line_description = ?5,
         fakturoid_subject_id = ?6, fakturoid_generator_id = ?7, archived = ?8, currency = ?10 WHERE id = ?9",
        params![
            input.name.trim(),
            input.color,
            input.hourly_rate,
            input.vat_rate,
            input.line_description,
            input.fakturoid_subject_id,
            input.fakturoid_generator_id,
            input.archived as i64,
            id,
            input.currency.trim().to_uppercase()
        ],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Client {id} not found")));
    }
    get_client(conn, id)
}

pub fn delete_client(conn: &Connection, id: i32) -> AppResult<()> {
    let used: i32 = conn.query_row("SELECT count(*) FROM time_entries WHERE client_id = ?1", [id], |r| r.get(0))?;
    if used > 0 {
        return Err(AppError::Validation(format!(
            "Client has {used} time entries. Archive it instead, or delete the entries first."
        )));
    }
    conn.execute("DELETE FROM clients WHERE id = ?1", [id])?;
    Ok(())
}

// ---------- Time entries ----------

fn entry_from_row(r: &Row) -> rusqlite::Result<TimeEntry> {
    Ok(TimeEntry {
        id: r.get("id")?,
        client_id: r.get("client_id")?,
        date: r.get("date")?,
        duration_minutes: r.get("duration_minutes")?,
        start_time: r.get("start_time")?,
        end_time: r.get("end_time")?,
        description: r.get("description")?,
    })
}

const ENTRY_COLS: &str = "id, client_id, date, duration_minutes, start_time, end_time, description";

fn parse_date(s: &str) -> AppResult<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|_| AppError::Validation(format!("Invalid date '{s}', expected YYYY-MM-DD")))
}

fn parse_time(s: &str) -> AppResult<NaiveTime> {
    NaiveTime::parse_from_str(s, "%H:%M")
        .map_err(|_| AppError::Validation(format!("Invalid time '{s}', expected HH:MM")))
}

/// Applies the entry invariant: duration required; when start and end are both given,
/// duration is derived from them (wrapping past midnight).
pub fn normalize_entry(input: &TimeEntryInput) -> AppResult<TimeEntryInput> {
    parse_date(&input.date)?;
    let start = input.start_time.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let end = input.end_time.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let mut out = input.clone();
    out.description = input.description.trim().to_string();
    match (start, end) {
        (Some(s), Some(e)) => {
            let (st, en) = (parse_time(s)?, parse_time(e)?);
            let mut mins = (en - st).num_minutes();
            if mins <= 0 {
                mins += 24 * 60;
            }
            out.start_time = Some(st.format("%H:%M").to_string());
            out.end_time = Some(en.format("%H:%M").to_string());
            out.duration_minutes = mins as i32;
        }
        (Some(s), None) => {
            out.start_time = Some(parse_time(s)?.format("%H:%M").to_string());
            out.end_time = None;
        }
        (None, Some(e)) => {
            out.start_time = None;
            out.end_time = Some(parse_time(e)?.format("%H:%M").to_string());
        }
        (None, None) => {
            out.start_time = None;
            out.end_time = None;
        }
    }
    if out.duration_minutes <= 0 {
        return Err(AppError::Validation("Duration must be greater than zero".into()));
    }
    if out.duration_minutes > 24 * 60 {
        return Err(AppError::Validation("Duration can't exceed 24 hours".into()));
    }
    Ok(out)
}

fn filter_sql(filter: &EntryFilter) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut clauses = vec!["1=1".to_string()];
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    if let Some(c) = filter.client_id {
        args.push(Box::new(c));
        clauses.push(format!("client_id = ?{}", args.len()));
    }
    if let Some(f) = filter.from.as_deref().filter(|s| !s.is_empty()) {
        args.push(Box::new(f.to_string()));
        clauses.push(format!("date >= ?{}", args.len()));
    }
    if let Some(t) = filter.to.as_deref().filter(|s| !s.is_empty()) {
        args.push(Box::new(t.to_string()));
        clauses.push(format!("date <= ?{}", args.len()));
    }
    (clauses.join(" AND "), args)
}

pub fn list_entries(conn: &Connection, filter: &EntryFilter) -> AppResult<Vec<TimeEntry>> {
    let (where_sql, args) = filter_sql(filter);
    let mut stmt = conn.prepare(&format!(
        "SELECT {ENTRY_COLS} FROM time_entries WHERE {where_sql} ORDER BY date DESC, start_time DESC, id DESC"
    ))?;
    let params: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let rows = stmt.query_map(params.as_slice(), entry_from_row)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn day_totals(conn: &Connection, from: &str, to: &str) -> AppResult<Vec<DayTotal>> {
    let mut stmt = conn.prepare(
        "SELECT date, client_id, sum(duration_minutes) FROM time_entries
         WHERE date BETWEEN ?1 AND ?2 GROUP BY date, client_id ORDER BY date",
    )?;
    let rows = stmt.query_map(params![from, to], |r| {
        Ok(DayTotal { date: r.get(0)?, client_id: r.get(1)?, minutes: r.get(2)? })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get_entry(conn: &Connection, id: i32) -> AppResult<TimeEntry> {
    conn.query_row(&format!("SELECT {ENTRY_COLS} FROM time_entries WHERE id = ?1"), [id], entry_from_row)
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("Entry {id} not found")))
}

pub fn create_entry(conn: &Connection, input: &TimeEntryInput) -> AppResult<TimeEntry> {
    let e = normalize_entry(input)?;
    get_client(conn, e.client_id)?;
    conn.execute(
        "INSERT INTO time_entries (client_id, date, duration_minutes, start_time, end_time, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![e.client_id, e.date, e.duration_minutes, e.start_time, e.end_time, e.description],
    )?;
    get_entry(conn, conn.last_insert_rowid() as i32)
}

pub fn update_entry(conn: &Connection, id: i32, input: &TimeEntryInput) -> AppResult<TimeEntry> {
    let e = normalize_entry(input)?;
    get_client(conn, e.client_id)?;
    let n = conn.execute(
        "UPDATE time_entries SET client_id = ?1, date = ?2, duration_minutes = ?3, start_time = ?4,
         end_time = ?5, description = ?6, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?7",
        params![e.client_id, e.date, e.duration_minutes, e.start_time, e.end_time, e.description, id],
    )?;
    if n == 0 {
        return Err(AppError::NotFound(format!("Entry {id} not found")));
    }
    get_entry(conn, id)
}

pub fn delete_entry(conn: &Connection, id: i32) -> AppResult<()> {
    conn.execute("DELETE FROM time_entries WHERE id = ?1", [id])?;
    Ok(())
}

// ---------- Tags & day summaries ----------

pub fn list_tags(conn: &Connection) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare("SELECT name FROM tags ORDER BY name")?;
    let rows = stmt.query_map([], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn tag_id(conn: &Connection, name: &str) -> AppResult<i32> {
    let name = name.trim().to_lowercase();
    conn.execute("INSERT OR IGNORE INTO tags (name) VALUES (?1)", [&name])?;
    Ok(conn.query_row("SELECT id FROM tags WHERE name = ?1", [&name], |r| r.get(0))?)
}

pub fn get_day_summary(conn: &Connection, day: &str) -> AppResult<Option<DaySummary>> {
    let base = conn
        .query_row(
            "SELECT active_minutes, description, generated_at FROM day_summaries WHERE day = ?1",
            [day],
            |r| Ok((r.get::<_, i32>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
        )
        .optional()?;
    let Some((active_minutes, description, generated_at)) = base else {
        return Ok(None);
    };
    let mut stmt = conn.prepare(
        "SELECT t.name, dt.minutes FROM day_summary_tags dt JOIN tags t ON t.id = dt.tag_id
         WHERE dt.day = ?1 ORDER BY dt.minutes DESC",
    )?;
    let tags = stmt
        .query_map([day], |r| Ok(TagMinutes { tag: r.get(0)?, minutes: r.get(1)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(DaySummary { day: day.to_string(), active_minutes, description, tags, generated_at }))
}

pub fn save_day_summary(
    conn: &mut Connection,
    day: &str,
    active_minutes: i32,
    description: &str,
    sample_count: i32,
    tags: &[(String, i32)],
) -> AppResult<DaySummary> {
    let tx = conn.transaction()?;
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    tx.execute(
        "INSERT INTO day_summaries (day, active_minutes, description, sample_count, generated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(day) DO UPDATE SET active_minutes = excluded.active_minutes,
           description = excluded.description, sample_count = excluded.sample_count,
           generated_at = excluded.generated_at",
        params![day, active_minutes, description, sample_count, now],
    )?;
    tx.execute("DELETE FROM day_summary_tags WHERE day = ?1", [day])?;
    for (name, minutes) in tags {
        if name.trim().is_empty() || *minutes <= 0 {
            continue;
        }
        let id = tag_id(&tx, name)?;
        tx.execute(
            "INSERT INTO day_summary_tags (day, tag_id, minutes) VALUES (?1, ?2, ?3)
             ON CONFLICT(day, tag_id) DO UPDATE SET minutes = day_summary_tags.minutes + excluded.minutes",
            params![day, id, minutes],
        )?;
    }
    tx.commit()?;
    get_day_summary(conn, day)?.ok_or_else(|| AppError::Internal("summary vanished".into()))
}

pub fn summaries_in_range(conn: &Connection, from: &str, to: &str) -> AppResult<Vec<DaySummary>> {
    let mut stmt = conn.prepare("SELECT day FROM day_summaries WHERE day BETWEEN ?1 AND ?2 ORDER BY day")?;
    let days: Vec<String> = stmt.query_map(params![from, to], |r| r.get(0))?.collect::<Result<_, _>>()?;
    let mut out = Vec::new();
    for d in days {
        if let Some(s) = get_day_summary(conn, &d)? {
            out.push(s);
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(start: Option<&str>, end: Option<&str>, dur: i32) -> TimeEntryInput {
        TimeEntryInput {
            client_id: 1,
            date: "2026-09-11".into(),
            duration_minutes: dur,
            start_time: start.map(Into::into),
            end_time: end.map(Into::into),
            description: " work ".into(),
        }
    }

    #[test]
    fn duration_derived_from_start_end() {
        let e = normalize_entry(&input(Some("9:00"), Some("12:30"), 5)).unwrap();
        assert_eq!(e.duration_minutes, 210);
        assert_eq!(e.start_time.as_deref(), Some("09:00"));
        assert_eq!(e.description, "work");
    }

    #[test]
    fn crossing_midnight_wraps() {
        let e = normalize_entry(&input(Some("22:00"), Some("02:00"), 0)).unwrap();
        assert_eq!(e.duration_minutes, 240);
    }

    #[test]
    fn duration_only_kept_when_no_times() {
        let e = normalize_entry(&input(None, Some(""), 90)).unwrap();
        assert_eq!(e.duration_minutes, 90);
        assert!(e.end_time.is_none());
    }

    #[test]
    fn rejects_zero_duration_and_bad_date() {
        assert!(normalize_entry(&input(None, None, 0)).is_err());
        let mut bad = input(None, None, 10);
        bad.date = "11.9.2026".into();
        assert!(normalize_entry(&bad).is_err());
    }

    #[test]
    fn crud_roundtrip_in_memory() {
        let mut conn = Connection::open_in_memory().unwrap();
        crate::db::migrations().to_latest(&mut conn).unwrap();
        let c = create_client(
            &conn,
            &ClientInput {
                name: "Acme".into(),
                color: "#abc".into(),
                hourly_rate: 1000.0,
                currency: "EUR".into(),
                vat_rate: 21,
                line_description: "Dev {period}".into(),
                fakturoid_subject_id: None,
                fakturoid_generator_id: None,
                archived: false,
            },
        )
        .unwrap();
        let mut i = input(None, None, 60);
        i.client_id = c.id;
        let e = create_entry(&conn, &i).unwrap();
        assert_eq!(list_entries(&conn, &EntryFilter::default()).unwrap().len(), 1);
        assert!(delete_client(&conn, c.id).is_err());
        let totals = day_totals(&conn, "2026-09-01", "2026-09-30").unwrap();
        assert_eq!(totals[0].minutes, 60);
        delete_entry(&conn, e.id).unwrap();
        delete_client(&conn, c.id).unwrap();

        let s = save_day_summary(&mut conn, "2026-09-11", 300, "did things", 10, &[("Coding".into(), 200), ("meetings".into(), 100)]).unwrap();
        assert_eq!(s.tags.len(), 2);
        assert_eq!(list_tags(&conn).unwrap(), vec!["coding", "meetings"]);
    }
}
