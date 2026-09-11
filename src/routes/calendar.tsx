import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Sparkles, Loader2, Activity } from "lucide-react";
import { cn } from "cn";
import type { TimeEntry } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dot, Empty, PageHeader } from "@/components/bits";
import { EntryForm } from "@/components/entry-form";
import { useConfirm } from "@/components/confirm";
import {
  useClients,
  useDayActivity,
  useDaySummary,
  useDayTotals,
  useDeleteEntry,
  useEntries,
  useGenerateDaySummary,
  useTrackedDays,
} from "@/lib/api";
import { fmtHours, fmtMinutes, isoDay, monthLabel, prettyDay } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarPage() {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = useState(() => isoDay(new Date()));

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);
  const from = isoDay(gridStart);
  const to = isoDay(gridEnd);

  const { data: clients = [] } = useClients();
  const { data: totals = [] } = useDayTotals(from, to);
  const { data: tracked = [] } = useTrackedDays(from, to);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const byDay = useMemo(() => {
    const m = new Map<string, { total: number; clients: Set<number> }>();
    for (const t of totals) {
      const d = m.get(t.date) ?? { total: 0, clients: new Set<number>() };
      d.total += t.minutes;
      d.clients.add(t.client_id);
      m.set(t.date, d);
    }
    return m;
  }, [totals]);
  const trackedSet = useMemo(() => new Map(tracked.map((t) => [t.day, t])), [tracked]);

  const monthTotal = useMemo(
    () => totals.filter((t) => isSameMonth(new Date(t.date), month)).reduce((a, t) => a + t.minutes, 0),
    [totals, month],
  );

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col pb-8">
        <PageHeader
          title={monthLabel(month)}
          subtitle={
            <>
              <span className="tabular">{fmtHours(monthTotal)} h</span> logged this month
            </>
          }
        >
            <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, -1))} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelected(isoDay(new Date()));
              }}
            >
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMonth((m) => addMonths(m, 1))} aria-label="Next month">
              <ChevronRight />
            </Button>
        </PageHeader>

        <div className="ml-7 mr-6 mb-2 grid grid-cols-7 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-3">
              {d}
            </div>
          ))}
        </div>
        <div className="ml-7 mr-6 grid min-h-0 flex-1 grid-cols-7 gap-1.5" style={{ gridAutoRows: "1fr" }}>
          {days.map((d) => {
            const iso = isoDay(d);
            const info = byDay.get(iso);
            const trk = trackedSet.get(iso);
            const inMonth = isSameMonth(d, month);
            const active = iso === selected;
            return (
              <button
                key={iso}
                onClick={() => setSelected(iso)}
                className={cn(
                  "group relative flex flex-col justify-between rounded-2xl border border-transparent p-3 text-left transition-all",
                  inMonth ? "text-foreground" : "text-muted-foreground/50",
                  active ? "glass shadow-sm" : "hover:bg-foreground/[0.04]",
                  isToday(d) && !active && "border-primary/40",
                )}
              >
                <div className="flex items-start justify-between">
                  <span className={cn("tabular text-xs font-medium", isToday(d) && "text-primary")}>{d.getDate()}</span>
                  {trk && !info && (
                    <span
                      title={`Tracked ${fmtMinutes(trk.active_minutes)}, nothing logged yet`}
                      className="size-1.5 rounded-full bg-primary/70"
                    />
                  )}
                </div>
                {info ? (
                  <div className="flex items-end justify-between">
                    <span className="font-display tabular text-2xl leading-none">{fmtHours(info.total, 1)}</span>
                    <span className="flex gap-1 pb-0.5">
                      {[...info.clients].slice(0, 4).map((id) => (
                        <Dot key={id} color={clientById.get(id)?.color ?? "#999"} />
                      ))}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-transparent">·</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <DayPanel day={selected} />
    </div>
  );
}

function DayPanel({ day }: { day: string }) {
  const [editing, setEditing] = useState<TimeEntry | "new" | null>(null);
  const filter = useMemo(() => ({ client_id: null, from: day, to: day }), [day]);
  const { data: entries = [] } = useEntries(filter);
  const { data: clients = [] } = useClients();
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const del = useDeleteEntry();
  const confirm = useConfirm();
  const total = entries.reduce((a, e) => a + e.duration_minutes, 0);

  // reset edit state when the day changes
  const [lastDay, setLastDay] = useState(day);
  if (lastDay !== day) {
    setLastDay(day);
    setEditing(null);
  }

  return (
    <aside className="flex w-[400px] shrink-0 flex-col pr-10 pb-8">
      <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between p-6 pb-3">
          <div>
            <h2 className="font-display text-2xl leading-tight">{prettyDay(day)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {entries.length === 0 ? "Nothing logged" : `${fmtMinutes(total)} across ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
            </p>
          </div>
          {editing === null && (
            <Button size="sm" onClick={() => setEditing("new")}>
              <Plus /> Log time
            </Button>
          )}
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 px-6 pb-6">
            {editing !== null && (
              <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <EntryForm
                  day={day}
                  entry={editing === "new" ? undefined : editing}
                  onDone={() => setEditing(null)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            )}

            {entries.length === 0 && editing === null ? (
              <Empty title="A quiet day" hint="Log time by hand, or let the tracker suggest an entry." />
            ) : (
              <ul className="flex flex-col gap-2">
                {entries.map((e) => {
                  const c = clientById.get(e.client_id);
                  return (
                    <li
                      key={e.id}
                      className="group flex gap-3 rounded-2xl border border-transparent px-3 py-2.5 transition-colors hover:border-border/60 hover:bg-background/40"
                    >
                      <span className="mt-1 w-1 shrink-0 self-stretch rounded-full" style={{ background: c?.color ?? "#999" }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{c?.name ?? "Unknown client"}</span>
                          <span className="font-display tabular shrink-0 text-lg">{fmtMinutes(e.duration_minutes)}</span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{e.description || "No description"}</span>
                          {e.start_time && e.end_time && (
                            <span className="tabular shrink-0">
                              {e.start_time}–{e.end_time}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon-xs" onClick={() => setEditing(e)} aria-label="Edit">
                          <Pencil />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={async () => {
                            if (await confirm({ title: "Delete this entry?", description: `${fmtMinutes(e.duration_minutes)} for ${c?.name ?? "client"}` }))
                              del.mutate(e.id);
                          }}
                          aria-label="Delete"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <TrackerCard day={day} />
          </div>
        </ScrollArea>
      </div>
    </aside>
  );
}

function TrackerCard({ day }: { day: string }) {
  const { data: activity } = useDayActivity(day);
  const { data: summary } = useDaySummary(day);
  const generate = useGenerateDaySummary();

  if (!activity || activity.sample_count === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-foreground/[0.035] p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Activity className="size-3.5" />
          Tracked
        </div>
        <span className="tabular text-xs text-muted-foreground">
          {activity.first_active}–{activity.last_active}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display tabular text-2xl">{fmtMinutes(activity.active_minutes)}</span>
        <span className="text-xs text-muted-foreground">active · {fmtMinutes(activity.idle_minutes)} idle</span>
      </div>

      {summary ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm leading-relaxed">{summary.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {summary.tags.map((t) => (
              <Badge key={t.tag} variant="secondary" className="tabular">
                {t.tag} · {fmtMinutes(t.minutes)}
              </Badge>
            ))}
          </div>
          <Button
            variant="ghost"
            size="xs"
            className="self-start text-muted-foreground"
            onClick={() => generate.mutate(day)}
            disabled={generate.isPending}
          >
            {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Regenerate
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {activity.top_blocks.slice(0, 4).map((b, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="text-foreground/80">{b.app}</span>
                  {b.title && <span className="opacity-70"> · {b.title}</span>}
                </span>
                <span className="tabular shrink-0">{fmtMinutes(b.minutes)}</span>
              </li>
            ))}
          </ul>
          <Button variant="outline" size="sm" className="self-start" onClick={() => generate.mutate(day)} disabled={generate.isPending}>
            {generate.isPending ? <Loader2 className="animate-spin" /> : <Sparkles className="text-primary" />}
            Summarize with AI
          </Button>
        </div>
      )}
    </div>
  );
}
