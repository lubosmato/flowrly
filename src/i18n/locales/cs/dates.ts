import type en from "../en/dates";
import type { Translation } from "../types";

export default {
  day: "EEEE d. MMMM",
  dayShort: "EEEEEE d. M.",
  date: "d. M. yyyy",
  dayMonth: "d. M.",
  month: "LLLL yyyy",
  hours: "{{count}} h",
  minutes: "{{count}} min",
} satisfies Translation<typeof en>;
