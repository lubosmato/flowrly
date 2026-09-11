import { useMemo } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/bits";
import { useDayActivity, useDaySummary, useGenerateDaySummary } from "@/lib/api";
import { fmtMinutes, prettyDay } from "@/lib/format";

const APP_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function DayDetailSheet({ day, onClose }: { day: string | null; onClose: () => void }) {
  return (
    <Sheet open={day !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[520px] max-w-[90vw] gap-0 p-0 sm:max-w-[520px]">
        {day && <DayDetail day={day} />}
      </SheetContent>
    </Sheet>
  );
}

function DayDetail({ day }: { day: string }) {
  const { data: activity } = useDayActivity(day);
  const { data: summary } = useDaySummary(day);
  const generate = useGenerateDaySummary();

  const hourMax = useMemo(() => Math.max(1, ...(activity?.per_hour ?? [0])), [activity]);
  const appMax = activity?.apps[0]?.minutes ?? 1;
  const colorFor = useMemo(() => {
    const m = new Map<string, string>();
    activity?.apps.forEach((a, i) => m.set(a.app, APP_COLORS[i % APP_COLORS.length]));
    return (app: string) => m.get(app) ?? "var(--muted-foreground)";
  }, [activity]);

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="px-7 pt-7 pb-4">
        <SheetTitle className="font-display text-2xl font-medium">{prettyDay(day)}</SheetTitle>
        <SheetDescription>
          {activity
            ? `${activity.first_active ?? "–"} to ${activity.last_active ?? "–"} · ${activity.sample_count} samples`
            : "Loading tracked activity"}
        </SheetDescription>
      </SheetHeader>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-7 px-7 pb-8">
          {!activity ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : (
            <>
              <div className="flex gap-8">
                <Stat label="Active" value={fmtMinutes(activity.active_minutes)} />
                <Stat label="Idle" value={fmtMinutes(activity.idle_minutes)} />
              </div>

              <section className="flex flex-col gap-2">
                <SectionLabel>Through the day</SectionLabel>
                <div className="flex h-16 items-end gap-[3px]">
                  {activity.per_hour.map((m, h) => (
                    <div
                      key={h}
                      title={`${String(h).padStart(2, "0")}:00 · ${fmtMinutes(m)}`}
                      className="flex-1 rounded-sm bg-primary/70"
                      style={{ height: `${Math.max(m > 0 ? 6 : 2, (m / hourMax) * 100)}%`, opacity: m > 0 ? 1 : 0.25 }}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground tabular">
                  <span>00</span>
                  <span>06</span>
                  <span>12</span>
                  <span>18</span>
                  <span>24</span>
                </div>
              </section>

              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <SectionLabel>Summary</SectionLabel>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-muted-foreground"
                    onClick={() => generate.mutate(day)}
                    disabled={generate.isPending}
                  >
                    {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles className="text-primary" />}
                    {summary ? "Regenerate" : "Summarize with AI"}
                  </Button>
                </div>
                {summary ? (
                  <>
                    <p className="text-sm leading-relaxed">{summary.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.tags.map((t) => (
                        <Badge key={t.tag} variant="secondary" className="tabular">
                          {t.tag} · {fmtMinutes(t.minutes)}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">Generated {summary.generated_at}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No summary yet.</p>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <SectionLabel>Apps</SectionLabel>
                <ul className="flex flex-col gap-2">
                  {activity.apps.slice(0, 10).map((a) => (
                    <li key={a.app} className="flex flex-col gap-1">
                      <div className="flex justify-between text-sm">
                        <span className="truncate">{a.app}</span>
                        <span className="tabular shrink-0 text-muted-foreground">{fmtMinutes(a.minutes)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                        <div className="h-full rounded-full" style={{ width: `${(a.minutes / appMax) * 100}%`, background: colorFor(a.app) }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="flex flex-col gap-2">
                <SectionLabel>Windows</SectionLabel>
                <ul className="flex flex-col divide-y divide-border/50 text-sm">
                  {activity.top_blocks.map((b, i) => (
                    <li key={i} className="flex items-baseline gap-3 py-1.5">
                      <span className="mt-1 size-2 shrink-0 self-start rounded-full" style={{ background: colorFor(b.app) }} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{b.title || <span className="text-muted-foreground">(no title)</span>}</div>
                        <div className="truncate text-xs text-muted-foreground">{b.app}</div>
                      </div>
                      <span className="tabular shrink-0 text-muted-foreground">{fmtMinutes(b.minutes)}</span>
                    </li>
                  ))}
                </ul>
                {activity.top_blocks.length === 0 && <p className="text-sm text-muted-foreground">Nothing recorded.</p>}
              </section>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{children}</span>;
}
