/** date-fns patterns. Languages differ in order and punctuation ("9 September" vs "9. September"). */
export default {
  /** Monday 9 September */
  day: "EEEE d MMMM",
  /** Mon 9 Sep */
  dayShort: "EEE d MMM",
  /** 9 Sep 2026 */
  date: "d MMM yyyy",
  /** 9 Sep */
  dayMonth: "d MMM",
  /** September 2026 (standalone month) */
  month: "LLLL yyyy",
  /** Duration units for "3h 30m" */
  hours: "{{count}}h",
  minutes: "{{count}}m",
} as const;
