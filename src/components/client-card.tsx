import { useTranslation } from "react-i18next";
import { cn } from "cn";
import type { Client } from "@/bindings";
import { money } from "@/lib/format";

/** A Client at a glance: colour, name, Hourly Rate, workload and Fakturoid links. A button when `onClick` is given. */
export function ClientCard({ client: c, onClick, className }: { client: Client; onClick?: () => void; className?: string }) {
  const { t } = useTranslation();
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "glass flex flex-col gap-4 rounded-3xl p-6 text-left transition-all",
        onClick && "hover:shadow-md",
        c.archived && "opacity-50",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="size-3 shrink-0 rounded-full transition-colors" style={{ background: c.color }} />
        <span className="truncate text-lg font-medium">{c.name}</span>
        {c.archived && <span className="ml-auto text-[11px] tracking-wide text-muted-foreground uppercase">{t("entry.client.archived")}</span>}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-display tabular text-3xl">{money(c.hourly_rate, c.currency)}</span>
        <span className="text-xs text-muted-foreground">{t("entry.client.perHourVat", { vat: c.vat_rate })}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("entry.client.pensum", { pensum: c.pensum_percent, hours: c.workday_hours ?? 8 })}
      </p>
      <p className="truncate text-xs text-muted-foreground">
        {c.fakturoid_subject_id ? t("entry.client.subject", { id: c.fakturoid_subject_id }) : t("entry.client.noSubject")}
        {c.fakturoid_generator_id ? t("entry.client.generator", { id: c.fakturoid_generator_id }) : ""}
      </p>
    </Tag>
  );
}
