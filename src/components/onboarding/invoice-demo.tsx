import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, format, isWeekend, startOfMonth } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import type { ClientInput, InvoicePreview } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/bits";
import { InvoiceSummary } from "@/components/invoice-summary";
import { fmtDate, fmtMinutes, invoicedLabel, isoDay, money, shortDay } from "@/lib/format";
import { Press, Slab, Stage, usePhases } from "./kit";

const ROWS = [
  { start: "09:00", end: "12:30", minutes: 210, description: "demos.sample.apiReview" },
  { start: "08:45", end: "16:45", minutes: 480, description: "demos.sample.invoiceExport" },
  { start: "09:15", end: "16:00", minutes: 405, description: "demos.sample.generatorSync" },
  { start: "09:00", end: "16:30", minutes: 450, description: "demos.sample.calendarPerformance" },
  { start: "10:00", end: "15:45", minutes: 345, description: "demos.sample.releaseNotes" },
] as const;
const NUMBER = "2026-0042";

// list, press Create invoice, preview, press Create in Fakturoid, created, entries marked
const PHASES = [2400, 1300, 3200, 1500, 2600, 3400] as const;
const CAPTIONS = [
  "demos.invoice.captions.filter",
  "demos.invoice.captions.press",
  "demos.invoice.captions.line",
  "demos.invoice.captions.fakturoid",
  "demos.invoice.captions.numbered",
  "demos.invoice.captions.remembered",
] as const;

/** Entries for one Client becoming a Fakturoid Invoice. Mirrors the Entries screen and its invoice dialog. */
export function InvoiceDemo({ client }: { client: ClientInput }) {
  const { t } = useTranslation();
  const { phase, cycle } = usePhases(PHASES);
  const name = client.name.trim() || "Acme";
  const rate = client.hourly_rate || 1200;
  const month = useMemo(() => startOfMonth(new Date()), []);
  const rows = useMemo(() => {
    const workdays = eachDayOfInterval({ start: month, end: endOfMonth(month) }).filter((d) => !isWeekend(d));
    return ROWS.map((r, i) => ({ ...r, date: isoDay(workdays[i]) }));
  }, [month]);

  const totalMinutes = rows.reduce((a, r) => a + r.minutes, 0);
  const hours = Math.round((totalMinutes / 60) * 100) / 100;
  const preview: InvoicePreview = {
    client_id: 0,
    period_label: format(month, "MM/yyyy"),
    line_name: (client.line_description || t("clients.defaultLineDescription")).replace("{period}", format(month, "MM/yyyy")),
    total_minutes: totalMinutes,
    hours,
    hourly_rate: rate,
    currency: client.currency,
    vat_rate: client.vat_rate,
    subtotal: hours * rate,
    entry_count: rows.length,
    invoiced_count: 0,
    invoiced_minutes: 0,
    invoiced_numbers: [],
  };
  const dialog = phase >= 2 && phase <= 4;
  const created = phase === 4;
  const marked = phase === 5;

  return (
    <Stage caption={t(CAPTIONS[phase])} progress={(phase + 1) / PHASES.length}>
      <div className="flex h-full flex-col gap-4">
        <header className="flex items-end justify-between">
          <h3 className="font-display text-[30px] leading-none font-medium tracking-tight">{t("shell.entries")}</h3>
          <Press active={phase === 1}>
            <Button size="sm" tabIndex={-1}>
              <FileText /> {t("demos.invoice.createInvoice")}
            </Button>
          </Press>
        </header>
        <div className="flex items-center gap-2 text-sm">
          <span className="flex h-8 w-44 items-center justify-between rounded-lg border border-input px-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <Dot color={client.color} />
              <span className="truncate">{name}</span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </span>
          <span className="tabular flex h-8 items-center rounded-lg border border-input px-2.5">
            {fmtDate(month, "dayMonth")} – {fmtDate(endOfMonth(month), "date")}
          </span>
          <span className="tabular ml-auto text-xs text-muted-foreground">
            {t("demos.invoice.count", { count: rows.length, duration: fmtMinutes(totalMinutes) })}
          </span>
        </div>

        <Slab className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence>
            {marked && (
              <motion.span
                className="absolute top-[28px] left-[112px] z-10 rounded-md bg-foreground px-2.5 py-1 text-xs text-background shadow-lg"
                initial={{ opacity: 0, scale: 0.8, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                transition={{ delay: 0.6 }}
              >
                {invoicedLabel(NUMBER)}
                <span className="absolute -bottom-1 left-[26px] size-2 rotate-45 bg-foreground" />
              </motion.span>
            )}
          </AnimatePresence>
          <table key={cycle} className="w-full text-sm">
            <thead className="text-[11px] tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-5 py-3 text-left font-medium">{t("common.date")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("common.client")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("demos.invoice.time")}</th>
                <th className="px-3 py-3 text-right font-medium">{t("common.duration")}</th>
                <th className="px-3 py-3 text-left font-medium">{t("common.description")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.date}
                  className={cn("border-t border-border/50 [&>td]:transition-opacity [&>td]:duration-500", marked && "[&>td]:opacity-55")}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.12, duration: 0.35, ease: "easeOut" }}
                >
                  <td className="tabular px-5 py-3 whitespace-nowrap">{shortDay(r.date)}</td>
                  <td className="max-w-28 truncate px-3 py-3 whitespace-nowrap">
                    <Dot color={client.color} invoiced={marked ? "all" : undefined} className="mr-2" />
                    {name}
                  </td>
                  <td className="tabular px-3 py-3 whitespace-nowrap text-muted-foreground">
                    {r.start}–{r.end}
                  </td>
                  <td className="font-display tabular px-3 py-3 text-right text-base whitespace-nowrap">{fmtMinutes(r.minutes)}</td>
                  <td className="max-w-40 truncate px-3 py-3 text-muted-foreground">{t(r.description)}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </Slab>

        <AnimatePresence>
          {dialog && (
            <motion.div
              className="absolute -inset-4 z-10 flex items-center justify-center rounded-3xl bg-background/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
            >
              <motion.div
                className="flex w-[360px] flex-col gap-3 rounded-2xl bg-popover p-6 text-popover-foreground shadow-2xl ring-1 ring-foreground/10"
                initial={{ scale: 0.92, y: 16 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: 8 }}
                transition={{ type: "spring", stiffness: 340, damping: 26 }}
              >
                <div>
                  <h4 className="font-display text-2xl font-medium">{t("demos.invoice.title", { name })}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{t("demos.invoice.noDraft")}</p>
                </div>
                <AnimatePresence mode="wait" initial={false}>
                  {created ? (
                    <motion.div key="created" className="flex flex-col gap-3 py-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <motion.p
                        className="font-display text-3xl"
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 14 }}
                      >
                        {NUMBER}
                      </motion.p>
                      <p className="text-sm text-muted-foreground">{t("demos.invoice.total", { amount: money(preview.subtotal! * (1 + client.vat_rate / 100), client.currency) })}</p>
                      <Button className="self-start" tabIndex={-1}>
                        <ExternalLink /> {t("demos.invoice.open")}
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div key="preview" exit={{ opacity: 0, transition: { duration: 0.15 } }}>
                      <InvoiceSummary preview={preview} />
                      <div className="mt-2 flex justify-end gap-2">
                        <Button variant="ghost" tabIndex={-1}>
                          {t("common.cancel")}
                        </Button>
                        <Press active={phase === 3}>
                          <Button tabIndex={-1}>
                            {phase === 3 ? <DelayedSpinner /> : <FileText />}
                            {t("demos.invoice.create")}
                          </Button>
                        </Press>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Stage>
  );
}

/** The document icon until the pointer has clicked, then a spinner. */
function DelayedSpinner() {
  return (
    <span className="relative inline-flex size-4">
      <motion.span className="absolute inset-0" animate={{ opacity: [1, 1, 0] }} transition={{ duration: 0.8, times: [0, 0.85, 1] }}>
        <FileText />
      </motion.span>
      <motion.span className="absolute inset-0" animate={{ opacity: [0, 0, 1] }} transition={{ duration: 0.8, times: [0, 0.85, 1] }}>
        <Loader2 className="animate-spin" />
      </motion.span>
    </span>
  );
}
