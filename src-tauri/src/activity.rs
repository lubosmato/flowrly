//! Turns raw Activity Samples into per-day aggregates (durations per app/window,
//! first/last active time) that both the dashboard and the LLM prompts consume.

use std::collections::HashMap;

use chrono::{Local, NaiveDateTime};
use rusqlite::{params, Connection};

use crate::error::AppResult;
use crate::models::{ActivityBlock, AppMinutes, DayActivity, TrackedDay};
use crate::tracker::MAX_GAP_SECS;

#[derive(Debug, Clone)]
pub struct Sample {
    pub at: NaiveDateTime,
    pub app: String,
    pub title: String,
    pub idle: bool,
}

pub fn load_samples(conn: &Connection, day: &str) -> AppResult<Vec<Sample>> {
    let mut stmt = conn.prepare(
        "SELECT at, app, title, idle FROM activity_samples WHERE day = ?1 ORDER BY at, id",
    )?;
    let rows = stmt.query_map(params![day], |r| {
        let at: String = r.get(0)?;
        Ok((at, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?))
    })?;
    let mut out = Vec::new();
    for row in rows {
        let (at, app, title, idle) = row?;
        if let Ok(at) = NaiveDateTime::parse_from_str(&at, "%Y-%m-%dT%H:%M:%S") {
            out.push(Sample { at, app, title, idle: idle != 0 });
        }
    }
    Ok(out)
}

/// Duration in seconds attributed to each sample: time until the next sample,
/// capped so that sleep/shutdown gaps don't count. The last sample of today runs
/// until "now"; the last sample of a past day gets one poll interval.
pub fn sample_durations(samples: &[Sample], now: Option<NaiveDateTime>) -> Vec<i64> {
    let mut out = Vec::with_capacity(samples.len());
    for (i, s) in samples.iter().enumerate() {
        let secs = match samples.get(i + 1) {
            Some(next) => (next.at - s.at).num_seconds(),
            None => match now {
                Some(n) if n.date() == s.at.date() => (n - s.at).num_seconds(),
                _ => 2,
            },
        };
        out.push(secs.clamp(0, MAX_GAP_SECS));
    }
    out
}

pub struct Aggregate {
    pub active_secs: i64,
    pub idle_secs: i64,
    pub first_active: Option<NaiveDateTime>,
    pub last_active: Option<NaiveDateTime>,
    /// (app, title) -> active seconds, sorted descending
    pub blocks: Vec<(String, String, i64)>,
    /// Active seconds per hour of day (0..24)
    pub per_hour: [i64; 24],
}

pub fn aggregate(samples: &[Sample], now: Option<NaiveDateTime>) -> Aggregate {
    let durations = sample_durations(samples, now);
    let mut map: HashMap<(String, String), i64> = HashMap::new();
    let mut agg = Aggregate {
        active_secs: 0,
        idle_secs: 0,
        first_active: None,
        last_active: None,
        blocks: vec![],
        per_hour: [0; 24],
    };
    for (s, secs) in samples.iter().zip(durations) {
        if s.idle {
            agg.idle_secs += secs;
            continue;
        }
        agg.active_secs += secs;
        agg.per_hour[s.at.format("%H").to_string().parse::<usize>().unwrap_or(0) % 24] += secs;
        agg.first_active.get_or_insert(s.at);
        agg.last_active = Some(s.at + chrono::Duration::seconds(secs));
        *map.entry((s.app.clone(), s.title.clone())).or_default() += secs;
    }
    let mut blocks: Vec<_> = map.into_iter().map(|((a, t), s)| (a, t, s)).collect();
    blocks.sort_by(|a, b| b.2.cmp(&a.2));
    agg.blocks = blocks;
    agg
}

pub fn day_activity(conn: &Connection, day: &str) -> AppResult<DayActivity> {
    let samples = load_samples(conn, day)?;
    let agg = aggregate(&samples, Some(Local::now().naive_local()));
    Ok(DayActivity {
        day: day.to_string(),
        active_minutes: (agg.active_secs / 60) as i32,
        idle_minutes: (agg.idle_secs / 60) as i32,
        first_active: agg.first_active.map(|t| t.format("%H:%M").to_string()),
        last_active: agg.last_active.map(|t| t.format("%H:%M").to_string()),
        sample_count: samples.len() as i32,
        top_blocks: agg
            .blocks
            .iter()
            .take(80)
            .map(|(app, title, secs)| ActivityBlock {
                app: app.clone(),
                title: title.clone(),
                minutes: (secs / 60) as i32,
            })
            .collect(),
        apps: {
            let mut by_app: HashMap<&str, i64> = HashMap::new();
            for (app, _, secs) in &agg.blocks {
                *by_app.entry(app.as_str()).or_default() += secs;
            }
            let mut apps: Vec<AppMinutes> = by_app
                .into_iter()
                .map(|(app, secs)| AppMinutes { app: app.to_string(), minutes: (secs / 60) as i32 })
                .filter(|a| a.minutes > 0)
                .collect();
            apps.sort_by(|a, b| b.minutes.cmp(&a.minutes));
            apps
        },
        per_hour: agg.per_hour.iter().map(|s| (s / 60) as i32).collect(),
    })
}

/// Days in [from, to] that have any samples, with a cheap active-minute estimate.
pub fn tracked_days(conn: &Connection, from: &str, to: &str) -> AppResult<Vec<TrackedDay>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT day FROM activity_samples WHERE day BETWEEN ?1 AND ?2 ORDER BY day",
    )?;
    let days: Vec<String> = stmt
        .query_map(params![from, to], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut has_summary = conn.prepare("SELECT 1 FROM day_summaries WHERE day = ?1")?;
    let now = Local::now().naive_local();
    let mut out = Vec::with_capacity(days.len());
    for day in days {
        let samples = load_samples(conn, &day)?;
        let agg = aggregate(&samples, Some(now));
        out.push(TrackedDay {
            has_summary: has_summary.exists(params![day])?,
            day,
            active_minutes: (agg.active_secs / 60) as i32,
        });
    }
    Ok(out)
}

/// Plain-text digest of a day for the LLM.
pub fn describe_for_llm(day: &str, agg: &Aggregate) -> String {
    let mut s = String::new();
    s.push_str(&format!("Date: {day}\n"));
    s.push_str(&format!(
        "Total active time: {} minutes (idle: {} minutes)\n",
        agg.active_secs / 60,
        agg.idle_secs / 60
    ));
    if let (Some(f), Some(l)) = (agg.first_active, agg.last_active) {
        s.push_str(&format!(
            "First activity: {}  Last activity: {}\n",
            f.format("%H:%M"),
            l.format("%H:%M")
        ));
    }
    s.push_str("Active minutes per hour: ");
    for (h, secs) in agg.per_hour.iter().enumerate() {
        if *secs > 0 {
            s.push_str(&format!("{h:02}h={} ", secs / 60));
        }
    }
    s.push_str("\n\nFocused windows (minutes, app, window title), most time first:\n");
    for (app, title, secs) in agg.blocks.iter().take(120) {
        if *secs < 30 {
            break;
        }
        let title: String = title.chars().take(140).collect();
        s.push_str(&format!("{:>4}m  {}  —  {}\n", secs / 60, app, title));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn at(h: u32, m: u32, s: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(2026, 9, 11)
            .unwrap()
            .and_hms_opt(h, m, s)
            .unwrap()
    }

    fn sample(t: NaiveDateTime, app: &str, idle: bool) -> Sample {
        Sample { at: t, app: app.into(), title: "t".into(), idle }
    }

    #[test]
    fn caps_large_gaps() {
        let samples = vec![sample(at(9, 0, 0), "A", false), sample(at(12, 0, 0), "B", false)];
        let d = sample_durations(&samples, None);
        assert_eq!(d, vec![MAX_GAP_SECS, 2]);
    }

    #[test]
    fn idle_not_counted_as_active() {
        let samples = vec![
            sample(at(9, 0, 0), "A", false),
            sample(at(9, 1, 0), "A", true),
            sample(at(9, 3, 0), "A", false),
            sample(at(9, 4, 0), "A", false),
        ];
        let agg = aggregate(&samples, None);
        assert_eq!(agg.active_secs, 60 + 60 + 2);
        assert_eq!(agg.idle_secs, 120);
        assert_eq!(agg.first_active, Some(at(9, 0, 0)));
    }

    #[test]
    fn last_sample_today_runs_until_now() {
        let samples = vec![sample(at(9, 0, 0), "A", false)];
        let d = sample_durations(&samples, Some(at(9, 1, 30)));
        assert_eq!(d, vec![90]);
    }
}
