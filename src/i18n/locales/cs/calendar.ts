import type en from "../en/calendar";
import type { Translation } from "../types";

export default {
  monthLogged: "<n>{{hours}} h</n> zapsáno tento měsíc",
  prevMonth: "Předchozí měsíc",
  nextMonth: "Další měsíc",
  weekdayPattern: "EEEEEE",
  trackedNothingLogged: "Sledováno {{duration}}, zatím nic nezapsáno",
  nothingLogged: "Nic nezapsáno",
  loggedSummary_one: "{{count}} záznam, celkem {{duration}}",
  loggedSummary_few: "{{count}} záznamy, celkem {{duration}}",
  loggedSummary_many: "{{count}} záznamu, celkem {{duration}}",
  loggedSummary_other: "{{count}} záznamů, celkem {{duration}}",
  logTime: "Zapsat čas",
  quietTitle: "Klidný den",
  quietHint: "Zapiš čas ručně, nebo nech sledování aktivity navrhnout záznam.",
  unknownClient: "Neznámý klient",
  noDescription: "Bez popisu",
  deleteTitle: "Smazat tento záznam?",
  someClient: "klienta",
  deleteWhat: "{{duration}} pro {{client}}",
  deleteInvoiced: "{{duration}} pro {{client}}. Tento záznam už je vyfakturovaný.",
  deleteInvoicedIn: "{{duration}} pro {{client}}. Tento záznam už je vyfakturovaný na faktuře {{number}}.",
  tracked: "Sledováno",
  activeIdle: "aktivně · {{idle}} nečinnost",
  regenerate: "Vygenerovat znovu",
  summarizeAi: "Shrnout pomocí AI",
} satisfies Translation<typeof en>;
