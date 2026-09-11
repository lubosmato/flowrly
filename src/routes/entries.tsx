import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { save } from "@tauri-apps/plugin-dialog";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { commands, type Client, type CreatedInvoice, type EntryFilter, type InvoicePreview, type TimeEntry } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dot, Empty, PageHeader, Stat } from "@/components/bits";
import { EntryForm } from "@/components/entry-form";
import { DateRangePicker } from "@/components/date-picker";
import { useConfirm } from "@/components/confirm";
import { errorMessage, useClients, useDeleteEntry, useEntries } from "@/lib/api";
import { fmtHours, fmtMinutes, isoDay, money, shortDay } from "@/lib/format";
import { workload } from "@/lib/workload";

export function EntriesPage() {
  const [clientId, setClientId] = useState<string>("all");
  const [from, setFrom] = useState(() => isoDay(startOfMonth(new Date())));
  const [to, setTo] = useState(() => isoDay(endOfMonth(new Date())));
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const filter: EntryFilter = useMemo(
    () => ({ client_id: clientId === "all" ? null : Number(clientId), from, to }),
    [clientId, from, to],
  );
  const { data: entries = [], isLoading } = useEntries(filter);
  const { data: clients = [] } = useClients();
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const del = useDeleteEntry();
  const confirm = useConfirm();

  const total = entries.reduce((a, e) => a + e.duration_minutes, 0);
  const client = clientId === "all" ? null : clientById.get(Number(clientId));

  const shiftMonth = (n: number) => {
    const base = addMonths(new Date(from), n);
    setFrom(isoDay(startOfMonth(base)));
    setTo(isoDay(endOfMonth(base)));
  };

  const exportCsv = async () => {
    const path = await save({
      defaultPath: `flowrly-${client ? client.name.toLowerCase().replace(/\s+/g, "-") + "-" : ""}${from}_${to}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return;
    try {
      const n = await commands.exportCsv(filter, path);
      toast.success(`Exported ${n} entries`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Entries" subtitle="Filter, then export or invoice exactly what you see.">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
          <Download /> CSV
        </Button>
        {(() => {
          const reason = !client ? "Pick a single client in the filter first" : entries.length === 0 ? "No entries in this range" : null;
          const button = (
            <Button size="sm" onClick={() => setInvoiceOpen(true)} disabled={reason !== null}>
              <FileText /> Create invoice
            </Button>
          );
          return reason ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="inline-flex">
                  {button}
                </span>
              </TooltipTrigger>
              <TooltipContent>{reason}</TooltipContent>
            </Tooltip>
          ) : (
            button
          );
        })()}
      </PageHeader>

      <div className="flex items-center gap-3 pl-7 pr-10 pb-5">
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <Dot color={c.color} className="mr-1.5" />
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <DateRangePicker
            from={from}
            to={to}
            onChange={(f, t) => {
              setFrom(f);
              setTo(t);
            }}
            className="min-w-44"
          />
          <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-6 pl-7 pr-10 pb-8">
        <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? null : entries.length === 0 ? (
              <Empty title="No entries in this range" hint="Change the filter or log time from the calendar." />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-popover/70 text-[11px] tracking-wide text-muted-foreground uppercase backdrop-blur">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">Date</th>
                    <th className="px-3 py-3 text-left font-medium">Client</th>
                    <th className="px-3 py-3 text-left font-medium">Time</th>
                    <th className="px-3 py-3 text-right font-medium">Duration</th>
                    <th className="px-3 py-3 text-left font-medium">Description</th>
                    <th className="w-20 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const c = clientById.get(e.client_id);
                    return (
                      <tr key={e.id} className="group border-t border-border/50 transition-colors hover:bg-foreground/[0.03]">
                        <td className="tabular px-6 py-2.5 whitespace-nowrap">{shortDay(e.date)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <Dot color={c?.color ?? "#999"} className="mr-2" />
                          {c?.name}
                        </td>
                        <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : ""}
                        </td>
                        <td className="font-display tabular px-3 py-2.5 text-right text-base whitespace-nowrap">{fmtMinutes(e.duration_minutes)}</td>
                        <td className="max-w-md truncate px-3 py-2.5 text-muted-foreground">{e.description}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button variant="ghost" size="icon-xs" onClick={() => setEditing(e)} aria-label="Edit">
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={async () => {
                                if (await confirm({ title: "Delete this entry?", description: `${shortDay(e.date)} · ${fmtMinutes(e.duration_minutes)} for ${c?.name ?? "client"}` }))
                                  del.mutate(e.id);
                              }}
                              aria-label="Delete"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ScrollArea>
        </div>

        <aside className="glass flex w-64 shrink-0 flex-col gap-6 rounded-3xl p-6">
          <Stat label="Entries" value={entries.length} />
          <Stat label="Logged" value={`${fmtHours(total)} h`} sub={fmtMinutes(total)} />
          <Stat label="Billable" value={`${fmtHours(total)} h`} sub="exact, no rounding" />
          {client && (
            <Stat
              label="Estimate"
              value={money((total / 60) * (client.hourly_rate ?? 0), client.currency)}
              sub={`${money(client.hourly_rate, client.currency)} / h, excl. VAT`}
            />
          )}
          {client && <WorkloadStat client={client} from={from} to={to} logged={total} />}
        </aside>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit entry</DialogTitle>
            <DialogDescription className="sr-only">Edit time entry</DialogDescription>
          </DialogHeader>
          {editing && <EntryForm day={editing.date} entry={editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>

      <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} filter={filter} clientName={client?.name ?? ""} />
    </div>
  );
}

function InvoiceDialog({
  open,
  onOpenChange,
  filter,
  clientName,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filter: EntryFilter;
  clientName: string;
}) {
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setError(null);
    setCreated(null);
    commands
      .previewInvoice(filter)
      .then((p) => !cancelled && setPreview(p))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [open, filter]);

  const create = async () => {
    setCreating(true);
    try {
      const inv = await commands.createInvoice(filter);
      setCreated(inv);
      toast.success(`Invoice ${inv.number} created`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-medium">Invoice {clientName}</DialogTitle>
          <DialogDescription>Created straight in Fakturoid. There is no draft step, so check the numbers.</DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {created ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="font-display text-3xl">{created.number}</p>
            <p className="text-sm text-muted-foreground">Total {created.total}</p>
            <Button className="self-start" onClick={() => commands.openUrl(created.html_url)}>
              <ExternalLink /> Open in Fakturoid
            </Button>
          </div>
        ) : preview ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-2 text-sm">
            <dt className="text-muted-foreground">Line</dt>
            <dd>{preview.line_name}</dd>
            <dt className="text-muted-foreground">Entries</dt>
            <dd className="tabular">
              {preview.entry_count} · {fmtMinutes(preview.total_minutes)}
            </dd>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="font-display tabular text-2xl">{preview.hours} h</dd>
            <dt className="text-muted-foreground">Rate</dt>
            <dd className="tabular">
              {money(preview.hourly_rate, preview.currency)} / h · VAT {preview.vat_rate}%
            </dd>
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="font-display tabular text-xl">{money(preview.subtotal, preview.currency)}</dd>
          </dl>
        ) : (
          !error && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Preparing preview…
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {created ? "Done" : "Cancel"}
          </Button>
          {!created && (
            <Button onClick={create} disabled={!preview || creating}>
              {creating ? <Loader2 className="animate-spin" /> : <FileText />}
              Create in Fakturoid
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkloadStat({ client, from, to, logged }: { client: Client; from: string; to: string; logged: number }) {
  const w = workload(client, from, to, logged);
  if (w.ratioSoFar === null && w.ratioTotal === null) return null;
  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const soFar = Math.min(1, w.ratioSoFar ?? 0);
  const onTrack = (w.ratioSoFar ?? 0) >= 0.95;
  return (
    <div className="flex flex-col gap-2">
      <Stat
        label="Workload"
        value={pct(w.ratioSoFar)}
        sub={`of ${fmtHours(w.expectedSoFar)} h expected so far · pensum ${client.pensum_percent}%`}
      />
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${soFar * 100}%`, background: onTrack ? "var(--chart-1)" : "var(--primary)" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Whole period: <span className="tabular">{pct(w.ratioTotal)}</span> of {fmtHours(w.expectedTotal)} h ({w.workdaysTotal} workdays)
      </p>
    </div>
  );
}
