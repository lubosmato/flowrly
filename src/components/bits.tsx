import type { ReactNode } from "react";
import { cn } from "cn";
import { Label } from "@/components/ui/label";

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-6 pl-7 pr-10 pt-2 pb-6">
      <div>
        <h1 className="font-display text-[34px] leading-none font-medium tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("glass rounded-3xl p-6", className)}>{children}</section>;
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <p className="font-display text-xl">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", className)} style={{ background: color }} />;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{label}</span>
      <span className="font-display tabular text-3xl leading-tight">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
}

export const CLIENT_COLORS = [
  "#2F6BFF", // cobalt
  "#F59E0B", // amber
  "#D9742B", // copper
  "#7C5CFF", // indigo
  "#22B8A8", // teal
  "#E75480", // rose
  "#6B9E3F", // moss
  "#8A8F9C", // slate
];
