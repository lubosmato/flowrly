import type en from "../en/activity";
import type { Translation } from "../types";

export default {
  title: "Aktivität",
  subtitle: "Was dein Rechner gesehen hat – vom Modell verdichtet, wenn du darum bittest.",
  prevMonth: "Vorheriger Monat",
  nextMonth: "Nächster Monat",
  summarizing: "Zusammenfassen {{done}}/{{total}}",
  summarizeDays_one: "{{count}} Tag zusammenfassen",
  summarizeDays_other: "{{count}} Tage zusammenfassen",
  emptyTitle: "Noch nichts aufgezeichnet",
  emptyHint: "Der Tracker zeichnet das aktive Fenster auf, solange Flowrly in der Menüleiste läuft.",
  summarize: "Zusammenfassen",
  active: "Aktiv",
  daysTracked_one: "{{count}} Tag aufgezeichnet",
  daysTracked_other: "{{count}} Tage aufgezeichnet",
  perDay: "Pro Tag",
  kindsOfWork: "Tätigkeiten",
} satisfies Translation<typeof en>;
