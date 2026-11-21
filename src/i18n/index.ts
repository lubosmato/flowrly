import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { setDefaultOptions, type Locale } from "date-fns";
import { cs as csDate, de as deDate, enGB as enDate } from "date-fns/locale";
import { commands, type Settings } from "@/bindings";
import { cs, de, en } from "./locales";

export const LANGUAGES = ["en", "de", "cs"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Endonyms for the language picker; never translated. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: "English", de: "Deutsch", cs: "Čeština" };

const DATE_LOCALES: Record<Language, Locale> = { en: enDate, de: deDate, cs: csDate };
/** BCP 47 tags for `Intl` (numbers, currency). English uses British conventions like the date formats. */
const INTL_LOCALES: Record<Language, string> = { en: "en-GB", de: "de-DE", cs: "cs-CZ" };

const isLanguage = (l: string): l is Language => (LANGUAGES as readonly string[]).includes(l);

export const currentLanguage = (): Language => (isLanguage(i18n.language) ? i18n.language : "en");
export const dateLocale = () => DATE_LOCALES[currentLanguage()];
export const intlLocale = () => INTL_LOCALES[currentLanguage()];

/** OS language as resolved by Rust (WKWebView's `navigator.language` is unreliable). */
let systemLanguage: Language = "en";

/** `Settings.language` is "" to follow the OS, otherwise one of `LANGUAGES`. */
export const resolveLanguage = (setting: string): Language => (isLanguage(setting) ? setting : systemLanguage);

export async function applyLanguage(lang: Language) {
  setDefaultOptions({ locale: DATE_LOCALES[lang], weekStartsOn: 1 });
  document.documentElement.lang = lang;
  if (i18n.language !== lang) await i18n.changeLanguage(lang);
}

/** Loads the language before the first render so the UI never flashes in English. */
export async function initI18n() {
  let setting = "";
  try {
    const [sys, settings]: [string, Settings] = await Promise.all([commands.systemLanguage(), commands.getSettings()]);
    if (isLanguage(sys)) systemLanguage = sys;
    setting = settings.language;
  } catch {
    /* running outside Tauri (plain browser) */
    const nav = navigator.language.slice(0, 2);
    if (isLanguage(nav)) systemLanguage = nav;
  }
  const lng = resolveLanguage(setting);
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, de: { translation: de }, cs: { translation: cs } },
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  await applyLanguage(lng);
}

export default i18n;
