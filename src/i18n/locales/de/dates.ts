import type en from "../en/dates";
import type { Translation } from "../types";

export default {
  day: "EEEE, d. MMMM",
  dayShort: "EEE, d. MMM",
  date: "d. MMM yyyy",
  dayMonth: "d. MMM",
  month: "LLLL yyyy",
  hours: "{{count}} h",
  minutes: "{{count}} min",
} satisfies Translation<typeof en>;
