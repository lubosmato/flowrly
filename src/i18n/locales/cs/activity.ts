import type en from "../en/activity";
import type { Translation } from "../types";

export default {
  title: "Aktivita",
  subtitle: "Co tvůj počítač viděl, na požádání shrnuté modelem.",
  prevMonth: "Předchozí měsíc",
  nextMonth: "Další měsíc",
  summarizing: "Shrnuji {{done}}/{{total}}",
  summarizeDays_one: "Shrnout {{count}} den",
  summarizeDays_few: "Shrnout {{count}} dny",
  summarizeDays_many: "Shrnout {{count}} dne",
  summarizeDays_other: "Shrnout {{count}} dní",
  emptyTitle: "Zatím nic nezaznamenáno",
  emptyHint: "Sledování aktivity zaznamenává okna v popředí, dokud Flowrly běží v řádku nabídek.",
  summarize: "Shrnout",
  active: "Aktivně",
  daysTracked_one: "{{count}} sledovaný den",
  daysTracked_few: "{{count}} sledované dny",
  daysTracked_many: "{{count}} sledovaného dne",
  daysTracked_other: "{{count}} sledovaných dní",
  perDay: "Za den",
  kindsOfWork: "Druhy práce",
} satisfies Translation<typeof en>;
