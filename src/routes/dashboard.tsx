import { useMemo, useState } from "react";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { commands } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Empty, PageHeader, Stat } from "@/components/bits";
import { DayDetailSheet } from "@/components/day-detail";
import { errorMessage, useDaySummaries, useGenerateDaySummary, useTrackedDays } from "@/lib/api";
import { fmtHours, fmtMinutes, isoDay, monthLabel, prettyDay } from "@/lib/format";

const TAG_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function DashboardPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const from = isoDay(startOfMonth(month));
  const to = isoDay(endOfMonth(month));
  const { data: days = [] } = useTrackedDays(from, to);
  const { data: summaries = [] } = useDaySummaries(from, to);
  const generate = useGenerateDaySummary();
  const qc = useQueryClient();
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const summaryByDay = useMemo(() => new Map(summaries.map((s) => [s.day, s])), [summaries]);
  const totalActive = days.reduce((a, d) => a + d.active_minutes, 0);
  const tagTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of summaries) for (const t of s.tags) m.set(t.tag, (m.get(t.tag) ?? 0) + t.minutes);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [summaries]);
  const tagMax = tagTotals[0]?.[1] ?? 1;
  const missing = days.filter((d) => !d.has_summary && d.active_minutes >= 5);

  const summarizeAll = async () => {
    setBulk({ done: 0, total: missing.length });
    let done = 0;
    for (const d of missing) {
      try {
        await commands.generateDaySummary(d.day);
      } catch (e) {
        toast.error(`${d.day}: ${errorMessage(e)}`);
      }
      done += 1;
      setBulk({ done, total: missing.length });
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["daySummaries"] }),
      qc.invalidateQueries({ queryKey: ["trackedDays"] }),
      qc.invalidateQueries({ queryKey: ["tags"] }),
    ]);
    setBulk(null);
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Activity" subtitle="What your machine saw, distilled by the model when you ask for it.">
        <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
          <ChevronLeft />
        </Button>
        <span className="font-display min-w-36 text-center text-lg">{monthLabel(month)}</span>
        <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
          <ChevronRight />
        </Button>
        <Button size="sm" variant="outline" onClick={summarizeAll} disabled={missing.length === 0 || bulk !== null} className="ml-3">
          {bulk ? <Loader2 className="animate-spin" /> : <Sparkles className="text-primary" />}
          {bulk ? `Summarizing ${bulk.done}/${bulk.total}` : `Summarize ${missing.length} ${missing.length === 1 ? "day" : "days"}`}
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1 gap-6 pl-7 pr-10 pb-8">
        <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <ScrollArea className="min-h-0 flex-1">
            {days.length === 0 ? (
              <Empty title="Nothing tracked yet" hint="The tracker records focused windows while Flowrly runs in the menu bar." />
            ) : (
              <ul className="flex flex-col divide-y divide-border/50">
                {[...days].reverse().map((d) => {
                  const s = summaryByDay.get(d.day);
                  return (
                    <li
                      key={d.day}
                      className="flex cursor-pointer flex-col gap-2 px-6 py-5 transition-colors hover:bg-foreground/[0.03]"
                      onClick={() => setDetail(d.day)}
                    >
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="font-medium">{prettyDay(d.day)}</span>
                        <span className="font-display tabular text-xl">{fmtMinutes(d.active_minutes)}</span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (d.active_minutes / (10 * 60)) * 100)}%` }} />
                      </div>
                      {s ? (
                        <>
                          <p className="text-sm leading-relaxed text-foreground/90">{s.description}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {s.tags.map((t) => (
                              <Badge key={t.tag} variant="secondary" className="tabular">
                                {t.tag} · {fmtMinutes(t.minutes)}
                              </Badge>
                            ))}
                          </div>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          className="self-start text-muted-foreground"
                          disabled={generate.isPending || bulk !== null}
                          onClick={(e) => {
                            e.stopPropagation();
                            generate.mutate(d.day);
                          }}
                        >
                          {generate.isPending && generate.variables === d.day ? <Loader2 className="animate-spin" /> : <Sparkles />}
                          Summarize
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        <aside className="glass flex w-72 shrink-0 flex-col gap-6 rounded-3xl p-6">
          <Stat label="Active" value={`${fmtHours(totalActive, 1)} h`} sub={`${days.length} ${days.length === 1 ? "day" : "days"} tracked`} />
          <Stat label="Per day" value={days.length ? fmtMinutes(Math.round(totalActive / days.length)) : "—"} />
          {tagTotals.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] tracking-wide text-muted-foreground uppercase">Kinds of work</span>
              <ul className="flex flex-col gap-2">
                {tagTotals.slice(0, 8).map(([tag, minutes], i) => (
                  <li key={tag} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span>{tag}</span>
                      <span className="tabular text-muted-foreground">{fmtMinutes(minutes)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${(minutes / tagMax) * 100}%`, background: TAG_COLORS[i % TAG_COLORS.length] }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <DayDetailSheet day={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
