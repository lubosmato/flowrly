import { eachDayOfInterval, format, isWeekend, min as minDate, parseISO, startOfDay } from "date-fns";
import type { Client } from "@/bindings";

/** Mon–Fri days in [from, to] inclusive. Public holidays are not considered yet. */
export function workdaysBetween(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const from = parseISO(fromIso);
  const to = parseISO(toIso);
  if (to < from) return 0;
  return eachDayOfInterval({ start: from, end: to }).filter((d) => !isWeekend(d)).length;
}

/** Expected minutes for a client over a number of workdays. */
export function expectedMinutes(client: Pick<Client, "pensum_percent" | "workday_hours">, workdays: number): number {
  const hours = (client.workday_hours ?? 8) * (client.pensum_percent / 100) * workdays;
  return Math.round(hours * 60);
}

export type Workload = {
  workdaysTotal: number;
  workdaysSoFar: number;
  expectedTotal: number;
  expectedSoFar: number;
  /** logged / expectedSoFar, as 0..n (1 = on target) or null when nothing expected yet */
  ratioSoFar: number | null;
  ratioTotal: number | null;
};

export function workload(client: Pick<Client, "pensum_percent" | "workday_hours">, fromIso: string, toIso: string, loggedMinutes: number, today = new Date()): Workload {
  const workdaysTotal = workdaysBetween(fromIso, toIso);
  const end = toIso ? minDate([parseISO(toIso), startOfDay(today)]) : startOfDay(today);
  const workdaysSoFar = fromIso ? workdaysBetween(fromIso, format(end, "yyyy-MM-dd")) : 0;
  const expectedTotal = expectedMinutes(client, workdaysTotal);
  const expectedSoFar = expectedMinutes(client, workdaysSoFar);
  return {
    workdaysTotal,
    workdaysSoFar,
    expectedTotal,
    expectedSoFar,
    ratioSoFar: expectedSoFar > 0 ? loggedMinutes / expectedSoFar : null,
    ratioTotal: expectedTotal > 0 ? loggedMinutes / expectedTotal : null,
  };
}
