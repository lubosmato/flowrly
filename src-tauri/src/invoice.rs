//! Pure invoice math and payload building. No I/O, fully unit-tested.

use chrono::NaiveDate;
use serde_json::{json, Value};

use crate::models::Client;

/// Total minutes -> hours, always rounded UP to the nearest half hour.
pub fn hours_rounded_up(minutes: i64) -> f64 {
    if minutes <= 0 {
        return 0.0;
    }
    let half_hours = (minutes as f64 / 30.0).ceil();
    half_hours * 0.5
}

/// "09/2026" when the range sits inside one month, otherwise "01.09.2026 – 15.10.2026".
pub fn period_label(from: &str, to: &str) -> String {
    let f = NaiveDate::parse_from_str(from, "%Y-%m-%d").ok();
    let t = NaiveDate::parse_from_str(to, "%Y-%m-%d").ok();
    match (f, t) {
        (Some(f), Some(t)) if f.format("%Y-%m").to_string() == t.format("%Y-%m").to_string() => f.format("%m/%Y").to_string(),
        (Some(f), Some(t)) => format!("{} – {}", f.format("%d.%m.%Y"), t.format("%d.%m.%Y")),
        (Some(f), None) => format!("from {}", f.format("%d.%m.%Y")),
        (None, Some(t)) => format!("until {}", t.format("%d.%m.%Y")),
        (None, None) => String::new(),
    }
}

pub fn line_name(client: &Client, period: &str) -> String {
    client.line_description.replace("{period}", period).trim().to_string()
}

const GENERATOR_FIELDS: &[&str] = &[
    "currency",
    "payment_method",
    "language",
    "vat_price_mode",
    "bank_account_id",
    "due",
    "note",
    "footer_note",
    "tags",
    "transferred_tax_liability",
    "supply_code",
    "round_total",
];

/// Build the POST /invoices.json body: invoice-level fields copied from the generator
/// (when present), one line with quantity = hours.
pub fn build_invoice_body(client: &Client, generator: Option<&Value>, hours: f64, period: &str) -> Value {
    let mut body = serde_json::Map::new();
    if let Some(g) = generator.and_then(|g| g.as_object()) {
        for key in GENERATOR_FIELDS {
            if let Some(v) = g.get(*key) {
                if !v.is_null() {
                    body.insert((*key).to_string(), v.clone());
                }
            }
        }
    }
    let subject_id = client
        .fakturoid_subject_id
        .or_else(|| generator.and_then(|g| g["subject_id"].as_i64()).map(|v| v as i32));
    if let Some(sid) = subject_id {
        body.insert("subject_id".into(), json!(sid));
    }
    body.insert("currency".into(), json!(client.currency));
    body.insert(
        "lines".into(),
        json!([{
            "name": line_name(client, period),
            "quantity": hours,
            "unit_name": "h",
            "unit_price": client.hourly_rate,
            "vat_rate": client.vat_rate,
        }]),
    );
    Value::Object(body)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> Client {
        Client {
            id: 1,
            name: "Acme".into(),
            color: "#fff".into(),
            hourly_rate: 1200.0,
            currency: "EUR".into(),
            vat_rate: 21,
            line_description: "Vývoj software {period}".into(),
            fakturoid_subject_id: Some(16),
            fakturoid_generator_id: Some(3),
            archived: false,
        }
    }

    #[test]
    fn rounds_up_to_half_hour() {
        assert_eq!(hours_rounded_up(0), 0.0);
        assert_eq!(hours_rounded_up(1), 0.5);
        assert_eq!(hours_rounded_up(30), 0.5);
        assert_eq!(hours_rounded_up(31), 1.0);
        assert_eq!(hours_rounded_up(600), 10.0);
        assert_eq!(hours_rounded_up(614), 10.5);
        assert_eq!(hours_rounded_up(615), 10.5);
        assert_eq!(hours_rounded_up(631), 11.0);
    }

    #[test]
    fn period_labels() {
        assert_eq!(period_label("2026-09-01", "2026-09-30"), "09/2026");
        assert_eq!(period_label("2026-09-01", "2026-10-15"), "01.09.2026 – 15.10.2026");
        assert_eq!(period_label("", ""), "");
    }

    #[test]
    fn body_copies_generator_and_builds_line() {
        let gen = json!({
            "id": 3, "subject_id": 99, "currency": "CZK", "payment_method": "bank",
            "language": "cz", "vat_price_mode": "without_vat", "bank_account_id": 7,
            "due": 14, "note": null, "name": "template name", "lines": [{"name": "x"}]
        });
        let body = build_invoice_body(&client(), Some(&gen), 10.5, "09/2026");
        assert_eq!(body["subject_id"], 16); // client wins over generator
        assert_eq!(body["currency"], "EUR"); // client currency wins over generator's CZK
        assert_eq!(body["due"], 14);
        assert!(body.get("note").is_none());
        assert!(body.get("name").is_none());
        let line = &body["lines"][0];
        assert_eq!(line["name"], "Vývoj software 09/2026");
        assert_eq!(line["quantity"], 10.5);
        assert_eq!(line["unit_price"], 1200.0);
        assert_eq!(line["vat_rate"], 21);
        assert_eq!(line["unit_name"], "h");
    }

    #[test]
    fn body_without_generator_falls_back_to_client_subject() {
        let body = build_invoice_body(&client(), None, 1.0, "09/2026");
        assert_eq!(body["subject_id"], 16);
        assert_eq!(body["currency"], "EUR");
    }
}
