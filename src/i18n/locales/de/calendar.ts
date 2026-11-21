import type en from "../en/calendar";
import type { Translation } from "../types";

export default {
  monthLogged: "<n>{{hours}} h</n> in diesem Monat erfasst",
  prevMonth: "Vorheriger Monat",
  nextMonth: "Nächster Monat",
  weekdayPattern: "EEEEEE",
  trackedNothingLogged: "{{duration}} aufgezeichnet, noch nichts erfasst",
  nothingLogged: "Nichts erfasst",
  loggedSummary_one: "{{duration}} in {{count}} Eintrag",
  loggedSummary_other: "{{duration}} in {{count}} Einträgen",
  logTime: "Zeit erfassen",
  quietTitle: "Ein ruhiger Tag",
  quietHint: "Erfasse Zeit von Hand oder lass dir vom Tracker einen Eintrag vorschlagen.",
  unknownClient: "Unbekannter Kunde",
  noDescription: "Keine Beschreibung",
  deleteTitle: "Diesen Eintrag löschen?",
  someClient: "Kunden",
  deleteWhat: "{{duration}} für {{client}}",
  deleteInvoiced: "{{duration}} für {{client}}. Dieser Eintrag ist bereits abgerechnet.",
  deleteInvoicedIn: "{{duration}} für {{client}}. Dieser Eintrag ist bereits in {{number}} abgerechnet.",
  tracked: "Aufgezeichnet",
  activeIdle: "aktiv · {{idle}} inaktiv",
  regenerate: "Neu erstellen",
  summarizeAi: "Mit KI zusammenfassen",
} satisfies Translation<typeof en>;
