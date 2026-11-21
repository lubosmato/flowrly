import { useTranslation } from "react-i18next";
import type { InvoicePreview } from "@/bindings";
import { fmtMinutes, money } from "@/lib/format";

/** The single invoice line as it will be sent: exact hours at the Client's Hourly Rate. */
export function InvoiceSummary({ preview }: { preview: InvoicePreview }) {
  const { t } = useTranslation();
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 py-2 text-sm">
      <dt className="text-muted-foreground">{t("entry.invoice.line")}</dt>
      <dd>{preview.line_name}</dd>
      <dt className="text-muted-foreground">{t("entry.invoice.entries")}</dt>
      <dd className="tabular">
        {preview.entry_count} · {fmtMinutes(preview.total_minutes)}
      </dd>
      <dt className="text-muted-foreground">{t("entry.invoice.quantity")}</dt>
      <dd className="font-display tabular text-2xl">{preview.hours} h</dd>
      <dt className="text-muted-foreground">{t("entry.invoice.rate")}</dt>
      <dd className="tabular">
        {t("entry.invoice.rateValue", { rate: money(preview.hourly_rate, preview.currency), vat: preview.vat_rate })}
      </dd>
      <dt className="text-muted-foreground">{t("entry.invoice.subtotal")}</dt>
      <dd className="font-display tabular text-xl">{money(preview.subtotal, preview.currency)}</dd>
    </dl>
  );
}
