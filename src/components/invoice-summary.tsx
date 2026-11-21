import type { InvoicePreview } from "@/bindings";
import { fmtMinutes, money } from "@/lib/format";

/** The single invoice line as it will be sent: exact hours at the Client's Hourly Rate. */
export function InvoiceSummary({ preview }: { preview: InvoicePreview }) {
  return (
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
  );
}
