import { useEffect, useMemo, useState } from "react";
import { addMonths, endOfMonth, startOfMonth } from "date-fns";
import { save } from "@tauri-apps/plugin-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, FileCheck, FileText, FileX, Loader2, ExternalLink, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { commands, type Client, type CreatedInvoice, type EntryFilter, type InvoicePreview, type TimeEntry } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dot, Empty, PageHeader, Stat } from "@/components/bits";
import { EntryForm } from "@/components/entry-form";
import { InvoiceSummary } from "@/components/invoice-summary";
import { DateRangePicker } from "@/components/date-picker";
import { useConfirm } from "@/components/confirm";
import { ENTRY_KEYS, errorMessage, useClients, useDeleteEntry, useEntries, useSetEntryInvoice } from "@/lib/api";
import { fmtHours, fmtMinutes, invoicedLabel, isoDay, money, shortDay } from "@/lib/format";
import { workload } from "@/lib/workload";

const ENTRIES_CLIENT_KEY = "flowrly.entriesClient";

export function EntriesPage() {
  const { t } = useTranslation();
  // Saved filter ("all" or a client id) wins; else the only client; else all clients.
  const [savedClient, setSavedClient] = useState(() => localStorage.getItem(ENTRIES_CLIENT_KEY));
  const { data: clients = [], isSuccess: clientsLoaded } = useClients();
  const clientId =
    savedClient === "all" || (savedClient && (!clientsLoaded || clients.some((c) => String(c.id) === savedClient)))
      ? savedClient
      : clients.length === 1
        ? String(clients[0].id)
        : "all";
  const setClientId = (v: string) => {
    localStorage.setItem(ENTRIES_CLIENT_KEY, v);
    setSavedClient(v);
  };
  const [from, setFrom] = useState(() => isoDay(startOfMonth(new Date())));
  const [to, setTo] = useState(() => isoDay(endOfMonth(new Date())));
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const filter: EntryFilter = useMemo(
    () => ({ client_id: clientId === "all" ? null : Number(clientId), from, to }),
    [clientId, from, to],
  );
  const { data: entries = [], isLoading } = useEntries(filter);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const del = useDeleteEntry();
  const confirm = useConfirm();

  const total = entries.reduce((a, e) => a + e.duration_minutes, 0);
  const invoicedTotal = entries.reduce((a, e) => a + (e.invoice_number != null ? e.duration_minutes : 0), 0);
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
      toast.success(t("entries.exported", { count: n }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("entries.title")} subtitle={t("entries.subtitle")}>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={entries.length === 0}>
          <Download /> CSV
        </Button>
        {(() => {
          const reason = !client ? t("entries.pickSingleClient") : entries.length === 0 ? t("entries.noEntriesInRange") : null;
          const button = (
            <Button size="sm" onClick={() => setInvoiceOpen(true)} disabled={reason !== null}>
              <FileText /> {t("entries.createInvoice")}
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
            <SelectValue placeholder={t("entries.allClients")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("entries.allClients")}</SelectItem>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                <Dot color={c.color} className="mr-1.5" />
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(-1)} aria-label={t("entries.previousMonth")}>
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
          <Button variant="ghost" size="icon-sm" onClick={() => shiftMonth(1)} aria-label={t("entries.nextMonth")}>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-6 pl-7 pr-10 pb-8">
        <div className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <ScrollArea className="min-h-0 flex-1">
            {isLoading ? null : entries.length === 0 ? (
              <Empty title={t("entries.noEntriesInRange")} hint={t("entries.emptyHint")} />
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-popover/70 text-[11px] tracking-wide text-muted-foreground uppercase backdrop-blur">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">{t("common.date")}</th>
                    <th className="px-3 py-3 text-left font-medium">{t("common.client")}</th>
                    <th className="px-3 py-3 text-left font-medium">{t("entries.columns.time")}</th>
                    <th className="px-3 py-3 text-right font-medium">{t("common.duration")}</th>
                    <th className="px-3 py-3 text-left font-medium">{t("common.description")}</th>
                    <th className="w-24 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => {
                    const c = clientById.get(e.client_id);
                    const invoiced = e.invoice_number != null;
                    return (
                      <tr
                        key={e.id}
                        className={cn(
                          "group border-t border-border/50 transition-colors hover:bg-foreground/[0.03]",
                          invoiced && "[&>td:not(:last-child)]:opacity-55",
                        )}
                      >
                        <td className="tabular px-6 py-2.5 whitespace-nowrap">{shortDay(e.date)}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {invoiced ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="mr-2 inline-flex">
                                  <Dot color={c?.color ?? "#999"} invoiced="all" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{invoicedLabel(e.invoice_number!)}</TooltipContent>
                            </Tooltip>
                          ) : (
                            <Dot color={c?.color ?? "#999"} className="mr-2" />
                          )}
                          {c?.name}
                        </td>
                        <td className="tabular px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                          {e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : ""}
                        </td>
                        <td className="font-display tabular px-3 py-2.5 text-right text-base whitespace-nowrap">{fmtMinutes(e.duration_minutes)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          <div className="max-w-md truncate" title={e.description}>
                            {e.description}
                          </div>
                        </td>
                        {/* Pinned to the right edge so the actions stay reachable when the table scrolls sideways. */}
                        <td className="sticky right-0 px-3 py-1.5">
                          <div className="flex justify-end gap-0.5 rounded-xl bg-popover/80 p-1 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 has-[[data-state=open]]:opacity-100">
                            <InvoiceMarkButton entry={e} />
                            <Button variant="ghost" size="icon-xs" onClick={() => setEditing(e)} aria-label={t("common.edit")}>
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={async () => {
                                const what = t("entries.deleteWhat", { day: shortDay(e.date), duration: fmtMinutes(e.duration_minutes), client: c?.name ?? t("entries.clientFallback") });
                                if (
                                  await confirm({
                                    title: t("entries.deleteTitle"),
                                    description: invoiced
                                      ? e.invoice_number
                                        ? t("entries.deleteInvoicedIn", { what, number: e.invoice_number })
                                        : t("entries.deleteInvoiced", { what })
                                      : what,
                                  })
                                )
                                  del.mutate(e.id);
                              }}
                              aria-label={t("common.delete")}
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
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>

        <aside className="glass flex w-64 shrink-0 flex-col gap-6 rounded-3xl p-6">
          <Stat label={t("entries.stats.entries")} value={entries.length} />
          <Stat label={t("entries.stats.logged")} value={t("entries.hours", { hours: fmtHours(total) })} sub={fmtMinutes(total)} />
          <Stat
            label={t("entries.stats.billable")}
            value={t("entries.hours", { hours: fmtHours(total) })}
            sub={invoicedTotal > 0 ? t("entries.hoursAlreadyInvoiced", { hours: fmtHours(invoicedTotal) }) : t("entries.exactNoRounding")}
          />
          {client && (
            <Stat
              label={t("entries.stats.estimate")}
              value={money((total / 60) * (client.hourly_rate ?? 0), client.currency)}
              sub={t("entries.ratePerHour", { rate: money(client.hourly_rate, client.currency) })}
            />
          )}
          {client && <WorkloadStat client={client} from={from} to={to} logged={total} />}
        </aside>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("entries.editEntry")}</DialogTitle>
            <DialogDescription className="sr-only">{t("entries.editTimeEntry")}</DialogDescription>
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
  const { t } = useTranslation();
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedInvoice | null>(null);
  const [skipInvoiced, setSkipInvoiced] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    setPreview(null);
    setCreated(null);
    setSkipInvoiced(true);
  }, [open]);

  // Keeps the previous preview on screen while the Skip/Include switch refetches.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    commands
      .previewInvoice(filter, skipInvoiced)
      .then((p) => !cancelled && setPreview(p))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [open, filter, skipInvoiced]);

  const create = async () => {
    setCreating(true);
    try {
      const inv = await commands.createInvoice(filter, skipInvoiced);
      setCreated(inv);
      toast.success(t("entries.invoice.created", { number: inv.number }));
      await Promise.all(ENTRY_KEYS.map((k) => qc.invalidateQueries({ queryKey: k })));
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
          <DialogTitle className="font-display text-2xl font-medium">{t("entries.invoice.title", { client: clientName })}</DialogTitle>
          <DialogDescription>{t("entries.invoice.description")}</DialogDescription>
        </DialogHeader>

        {error && <p className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        {created ? (
          <div className="flex flex-col gap-3 py-2">
            <p className="font-display text-3xl">{created.number}</p>
            <p className="text-sm text-muted-foreground">{t("entries.invoice.total", { total: created.total })}</p>
            <Button className="self-start" onClick={() => commands.openUrl(created.html_url)}>
              <ExternalLink /> {t("entries.invoice.openInFakturoid")}
            </Button>
          </div>
        ) : preview ? (
          <>
          {preview.invoiced_count > 0 && (
            <div className="flex flex-col gap-3 rounded-xl bg-primary/10 p-3 text-sm">
              <p className="flex gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {preview.invoiced_numbers.length > 0
                    ? t("entries.invoice.alreadyInvoicedIn", {
                        count: preview.invoiced_count,
                        hours: fmtHours(preview.invoiced_minutes),
                        numbers: preview.invoiced_numbers.join(", "),
                      })
                    : t("entries.invoice.alreadyInvoiced", { count: preview.invoiced_count, hours: fmtHours(preview.invoiced_minutes) })}
                </span>
              </p>
              <Tabs value={skipInvoiced ? "skip" : "include"} onValueChange={(v) => setSkipInvoiced(v === "skip")}>
                <TabsList className="w-full">
                  <TabsTrigger value="skip" className="flex-1">
                    {t("entries.invoice.skipInvoiced")}
                  </TabsTrigger>
                  <TabsTrigger value="include" className="flex-1">
                    {t("entries.invoice.includeAll")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
          <InvoiceSummary preview={preview} />
          </>
        ) : (
          !error && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("entries.invoice.preparingPreview")}
            </div>
          )
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {created ? t("common.done") : t("common.cancel")}
          </Button>
          {!created && (
            <Button onClick={create} disabled={!preview || preview.entry_count === 0 || creating}>
              {creating ? <Loader2 className="animate-spin" /> : <FileText />}
              {t("entries.invoice.createInFakturoid")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Row action: clears the invoice mark at once, or asks for an optional number before setting it. */
function InvoiceMarkButton({ entry }: { entry: TimeEntry }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const mark = useSetEntryInvoice({ onSuccess: () => setOpen(false) });

  if (entry.invoice_number != null) {
    return (
      <Button variant="ghost" size="icon-xs" onClick={() => mark.mutate({ id: entry.id, number: null })} aria-label={t("entries.markNotInvoiced")} title={t("entries.markNotInvoiced")}>
        <FileX />
      </Button>
    );
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNumber("");
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label={t("entries.markInvoiced")} title={t("entries.markInvoiced")}>
          <FileCheck />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(ev) => {
            ev.preventDefault();
            mark.mutate({ id: entry.id, number: number.trim() });
          }}
        >
          <Input autoFocus value={number} onChange={(ev) => setNumber(ev.target.value)} placeholder={t("entries.invoiceNumberPlaceholder")} />
          <Button type="submit" size="sm" className="self-end" disabled={mark.isPending}>
            {t("entries.markInvoiced")}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

function WorkloadStat({ client, from, to, logged }: { client: Client; from: string; to: string; logged: number }) {
  const { t } = useTranslation();
  const w = workload(client, from, to, logged);
  if (w.ratioSoFar === null && w.ratioTotal === null) return null;
  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const soFar = Math.min(1, w.ratioSoFar ?? 0);
  const onTrack = (w.ratioSoFar ?? 0) >= 0.95;
  return (
    <div className="flex flex-col gap-2">
      <Stat
        label={t("entries.stats.workload")}
        value={pct(w.ratioSoFar)}
        sub={t("entries.workloadSub", { hours: fmtHours(w.expectedSoFar), percent: client.pensum_percent })}
      />
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${soFar * 100}%`, background: onTrack ? "var(--chart-1)" : "var(--primary)" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        <Trans
          i18nKey="entries.wholePeriod"
          count={w.workdaysTotal}
          values={{ pct: pct(w.ratioTotal), hours: fmtHours(w.expectedTotal) }}
          components={{ n: <span className="tabular" /> }}
        />
      </p>
    </div>
  );
}
