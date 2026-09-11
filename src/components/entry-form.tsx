import { useEffect, useMemo, useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { commands, type TimeEntry, type TimeEntryInput } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, Dot } from "@/components/bits";
import { DatePicker } from "@/components/date-picker";
import { errorMessage, useClients, useCreateEntry, useUpdateEntry } from "@/lib/api";
import { fmtMinutes, parseDuration, parseTime } from "@/lib/format";

const LAST_CLIENT_KEY = "flowrly.lastClient";

type Mode = "duration" | "range";

function diffMinutes(start: string, end: string): number | null {
  const a = parseTime(start);
  const b = parseTime(end);
  if (!a || !b) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
  let d = toMin(b) - toMin(a);
  if (d <= 0) d += 24 * 60;
  return d;
}

export function EntryForm({
  day,
  entry,
  onDone,
  onCancel,
}: {
  day: string;
  entry?: TimeEntry;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { data: clients = [] } = useClients();
  const activeClients = useMemo(() => clients.filter((c) => !c.archived || c.id === entry?.client_id), [clients, entry]);

  const [clientId, setClientId] = useState<string>(
    entry ? String(entry.client_id) : (localStorage.getItem(LAST_CLIENT_KEY) ?? ""),
  );
  const [date, setDate] = useState(entry?.date ?? day);
  const [mode, setMode] = useState<Mode>(entry?.start_time && entry?.end_time ? "range" : "duration");
  const [durationText, setDurationText] = useState(entry ? fmtMinutes(entry.duration_minutes) : "");
  const [start, setStart] = useState(entry?.start_time ?? "");
  const [end, setEnd] = useState(entry?.end_time ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [suggesting, setSuggesting] = useState(false);

  useEffect(() => {
    if (!clientId && activeClients.length > 0) setClientId(String(activeClients[0].id));
  }, [activeClients, clientId]);

  const selectedClient = activeClients.find((c) => String(c.id) === clientId);
  const workdayMinutes = Math.round((selectedClient?.workday_hours ?? 8) * 60);
  const parsedDuration = mode === "range" ? diffMinutes(start, end) : parseDuration(durationText, workdayMinutes);

  const create = useCreateEntry({ onSuccess: () => onDone() });
  const update = useUpdateEntry({ onSuccess: () => onDone() });
  const saving = create.isPending || update.isPending;

  const submit = () => {
    if (!clientId) return toast.error("Pick a client first");
    if (!parsedDuration || parsedDuration <= 0) return toast.error(mode === "range" ? "Fill in start and end" : "Enter a duration like 3h 30m");
    localStorage.setItem(LAST_CLIENT_KEY, clientId);
    const input: TimeEntryInput = {
      client_id: Number(clientId),
      date,
      duration_minutes: parsedDuration,
      start_time: mode === "range" ? parseTime(start) : null,
      end_time: mode === "range" ? parseTime(end) : null,
      description,
    };
    if (entry) update.mutate({ id: entry.id, input });
    else create.mutate(input);
  };

  const suggest = async () => {
    setSuggesting(true);
    try {
      const s = await commands.suggestEntry(date);
      if (s.start_time && s.end_time) {
        setMode("range");
        setStart(s.start_time);
        setEnd(s.end_time);
      } else {
        setMode("duration");
      }
      setDurationText(fmtMinutes(s.duration_minutes));
      if (s.description) setDescription(s.description);
      toast.success(`Tracker saw about ${fmtMinutes(s.duration_minutes)} of work`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        // Escape cancels (unless a dropdown already consumed it), ⌘/Ctrl+Enter saves.
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client">
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              {activeClients.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  <Dot color={c.color} className="mr-1.5" />
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Date">
          <DatePicker value={date} onChange={setDate} />
        </Field>
      </div>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="duration" className="flex-1">
            Duration
          </TabsTrigger>
          <TabsTrigger value="range" className="flex-1">
            Start / end
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "duration" ? (
        <Field label="Duration" hint={`3h 30m · 3:30 · 3.5 · 90m · 1d (= ${fmtMinutes(workdayMinutes)} for this client)`}>
          <Input
            autoFocus
            placeholder="3h 30m"
            value={durationText}
            onChange={(e) => setDurationText(e.target.value)}
            className="font-display text-lg"
          />
        </Field>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <Input
                autoFocus
                placeholder="9:00"
                inputMode="numeric"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                onBlur={() => setStart((v) => parseTime(v) ?? v)}
                aria-invalid={start !== "" && !parseTime(start)}
                className="font-display tabular text-lg"
              />
            </Field>
            <Field label="End">
              <Input
                placeholder="17:30"
                inputMode="numeric"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                onBlur={() => setEnd((v) => parseTime(v) ?? v)}
                aria-invalid={end !== "" && !parseTime(end)}
                className="font-display tabular text-lg"
              />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground/80">
            {parsedDuration ? (
              <span className="font-display tabular text-base text-foreground">{fmtMinutes(parsedDuration)}</span>
            ) : (
              "24h clock · 9, 930 and 5pm all work"
            )}
          </p>
        </div>
      )}

      <Field label="Description">
        <Textarea
          rows={3}
          placeholder="What did you work on?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={suggest}
          disabled={suggesting}
          title="Fill start, end, duration and description from tracked activity"
        >
          {suggesting ? <Loader2 className="animate-spin" /> : <Sparkles className="text-primary" />}
          Suggest
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {entry ? "Save" : "Add entry"}
          </Button>
        </div>
      </div>
    </form>
  );
}
