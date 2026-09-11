use std::collections::HashMap;

use crate::error::{AppError, AppResult};
use crate::models::{Client, TimeEntry};

pub fn entries_to_csv(entries: &[TimeEntry], clients: &[Client]) -> AppResult<String> {
    let names: HashMap<i32, &str> = clients.iter().map(|c| (c.id, c.name.as_str())).collect();
    let mut w = csv::Writer::from_writer(Vec::new());
    w.write_record(["date", "client", "start", "end", "duration_minutes", "hours", "description"])
        .map_err(|e| AppError::Io(e.to_string()))?;
    for e in entries {
        w.write_record([
            e.date.as_str(),
            names.get(&e.client_id).copied().unwrap_or(""),
            e.start_time.as_deref().unwrap_or(""),
            e.end_time.as_deref().unwrap_or(""),
            &e.duration_minutes.to_string(),
            &format!("{:.2}", e.duration_minutes as f64 / 60.0),
            e.description.as_str(),
        ])
        .map_err(|e| AppError::Io(e.to_string()))?;
    }
    let bytes = w.into_inner().map_err(|e| AppError::Io(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| AppError::Io(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_header_and_rows_with_quoting() {
        let clients = vec![Client {
            id: 1,
            name: "Acme, Inc.".into(),
            color: "#000".into(),
            hourly_rate: 1.0,
            currency: "CZK".into(),
            vat_rate: 0,
            line_description: String::new(),
            fakturoid_subject_id: None,
            fakturoid_generator_id: None,
            archived: false,
        }];
        let entries = vec![TimeEntry {
            id: 1,
            client_id: 1,
            date: "2026-09-11".into(),
            duration_minutes: 90,
            start_time: Some("09:00".into()),
            end_time: Some("10:30".into()),
            description: "Fixed \"auth\" bug".into(),
        }];
        let csv = entries_to_csv(&entries, &clients).unwrap();
        let mut lines = csv.lines();
        assert_eq!(lines.next().unwrap(), "date,client,start,end,duration_minutes,hours,description");
        assert_eq!(
            lines.next().unwrap(),
            "2026-09-11,\"Acme, Inc.\",09:00,10:30,90,1.50,\"Fixed \"\"auth\"\" bug\""
        );
    }
}
