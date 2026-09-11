import { format, parseISO } from "date-fns";

/** 210 -> "3h 30m", 45 -> "45m", 0 -> "0m" */
export function fmtMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  if (r === 0) return `${h}h`;
  return `${h}h ${r}m`;
}

/** 210 -> "3.5", 45 -> "0.75" */
export function fmtHours(minutes: number | null | undefined, digits = 2): string {
  const h = (minutes ?? 0) / 60;
  return h.toFixed(digits).replace(/\.?0+$/, "") || "0";
}

/** Always-up half-hour rounding, mirrors the Rust invoice math. */
export function roundUpHalfHours(minutes: number): number {
  if (minutes <= 0) return 0;
  return Math.ceil(minutes / 30) * 0.5;
}

/**
 * Parse a duration typed by a human. Accepts "3h 30m", "3:30", "3.5", "3,5", "90m", "1h", "2".
 * Bare numbers <= 24 are hours, larger are minutes. Returns minutes or null.
 */
export function parseDuration(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(",", ".");
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?(?:\s*(\d+)\s*m(?:in)?)?$/)))
    return Math.round(Number(m[1]) * 60 + Number(m[2] ?? 0));
  if ((m = s.match(/^(\d+)\s*m(?:in(?:utes?)?)?$/))) return Number(m[1]);
  if ((m = s.match(/^(\d+(?:\.\d+)?)$/))) {
    const n = Number(m[1]);
    return n <= 24 ? Math.round(n * 60) : Math.round(n);
  }
  return null;
}

export function money(n: number | null | undefined, currency = "CZK"): string {
  return new Intl.NumberFormat("cs-CZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(n ?? 0);
}

export const isoDay = (d: Date) => format(d, "yyyy-MM-dd");
export const fromIso = (s: string) => parseISO(s);
export const prettyDay = (s: string) => format(parseISO(s), "EEEE d MMMM");
export const shortDay = (s: string) => format(parseISO(s), "EEE d MMM");
export const monthLabel = (d: Date) => format(d, "LLLL yyyy");

/**
 * Parse a clock time typed by a human into "HH:MM" (24h). Accepts "9", "09:05",
 * "9.30", "930", "0930", "9:30pm", "12 am". Returns null when unreadable.
 */
export function parseTime(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  const m = s.match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm)?$/) ?? s.match(/^(\d{1,2})(\d{2})(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ampm = m[3];
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
