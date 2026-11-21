//! UI language for everything Rust shows: the native menu, the tray menu, error
//! messages and the language the AI writes summaries in. Strings live in
//! `locales/app.yml`; the frontend has its own copies in `src/i18n/locales`.

/// Languages the app ships, matching `LANGUAGES` in `src/i18n/index.ts`.
pub const SUPPORTED: [&str; 3] = ["en", "de", "cs"];

/// "de-AT", "cs_CZ" or "de" -> "de"; None when unsupported.
fn supported(tag: &str) -> Option<&'static str> {
    let primary = tag.split(['-', '_']).next()?.to_ascii_lowercase();
    SUPPORTED.into_iter().find(|s| *s == primary)
}

/// First supported language in the OS preference list, or English.
pub fn system() -> &'static str {
    sys_locale::get_locales().find_map(|l| supported(&l)).unwrap_or("en")
}

/// `Settings.language` is "" to follow the OS.
pub fn resolve(setting: &str) -> &'static str {
    supported(setting).unwrap_or_else(system)
}

/// Switches the language for `t!`. Returns true when it changed, so callers
/// know to rebuild the native menus.
pub fn apply(setting: &str) -> bool {
    let lang = resolve(setting);
    if &*rust_i18n::locale() == lang {
        return false;
    }
    rust_i18n::set_locale(lang);
    true
}

/// English name of the language the AI should write in, for LLM prompts.
/// `Settings.ai_language` is "" to follow the current UI language.
pub fn ai_language_name(setting: &str) -> &'static str {
    let ui = rust_i18n::locale();
    match supported(setting).unwrap_or(&ui) {
        "de" => "German",
        "cs" => "Czech",
        _ => "English",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_primary_subtag() {
        assert_eq!(supported("de-AT"), Some("de"));
        assert_eq!(supported("cs_CZ"), Some("cs"));
        assert_eq!(supported("EN"), Some("en"));
        assert_eq!(supported("fr-FR"), None);
        assert_eq!(supported(""), None);
        assert_eq!(resolve("cs"), "cs");
        assert_eq!(ai_language_name("de"), "German");
        assert_eq!(ai_language_name("cs"), "Czech");
    }

    #[test]
    fn translates_with_variables() {
        assert_eq!(rust_i18n::t!("menu.quit", locale = "cs"), "Ukončit Flowrly");
        assert_eq!(rust_i18n::t!("errors.entry_not_found", locale = "de", id = 7), "Eintrag 7 nicht gefunden");
        assert_eq!(rust_i18n::t!("errors.entry_not_found", locale = "fr", id = 7), "Entry 7 not found");
    }

    #[test]
    fn every_key_has_every_language() {
        let raw = include_str!("../locales/app.yml");
        let mut key = "";
        let mut langs: Vec<&str> = vec![];
        let check = |key: &str, langs: &[&str]| {
            if !key.is_empty() {
                assert_eq!(langs, SUPPORTED, "{key} is missing a language");
            }
        };
        for line in raw.lines().filter(|l| !l.trim().is_empty() && !l.trim_start().starts_with('#')) {
            if line.starts_with("_version") {
                continue;
            }
            if !line.starts_with(' ') {
                check(key, &langs);
                key = line.trim_end_matches(':');
                langs.clear();
            } else {
                langs.push(line.trim().split(':').next().unwrap());
            }
        }
        check(key, &langs);
    }
}
