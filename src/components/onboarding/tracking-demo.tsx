import { AnimatePresence, motion } from "motion/react";
import { EyeOff, HardDrive, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import { Stat } from "@/components/bits";
import { appLabel, fmtMinutes } from "@/lib/format";
import { Num, Slab, SlabLabel, Stage, usePhases } from "./kit";

const IGNORED = "Ignored app";

type Event = { at: string; minutes: number; app: string; title: string; ignored?: boolean; idle?: boolean };

/** One stretch of example focus per step, in the order the tracker would see it. */
const EVENTS: Event[] = [
  { at: "09:02", minutes: 42, app: "Ghostty", title: "nvim src/invoice.rs" },
  { at: "09:44", minutes: 18, app: "Arc", title: "Exact hours on the invoice line · Pull Request #128" },
  { at: "10:02", minutes: 25, app: "Figma", title: "Onboarding flow" },
  { at: "10:27", minutes: 2, app: "1Password", title: "", ignored: true },
  { at: "10:29", minutes: 9, app: "Slack", title: "#acme-dev" },
  { at: "10:38", minutes: 12, app: "Slack", title: "#acme-dev", idle: true },
  { at: "10:50", minutes: 31, app: "Ghostty", title: "cargo test" },
];

const APP_COLOR: Record<string, string> = {
  Ghostty: "var(--chart-1)",
  Arc: "var(--chart-2)",
  Figma: "var(--chart-3)",
  Slack: "var(--chart-4)",
  "1Password": "var(--muted-foreground)",
  [IGNORED]: "var(--muted-foreground)",
};

const PHASES = [...EVENTS.map(() => 2100), 3200];

/** The tracker at work: focused window in, Activity Samples out, totals per app. Mirrors the day detail sheet. */
export function TrackingDemo({ enabled, idleMinutes }: { enabled: boolean; idleMinutes: number }) {
  const { t } = useTranslation();
  const { phase } = usePhases(PHASES, !enabled);
  const hold = phase >= EVENTS.length;
  const seen = EVENTS.slice(0, Math.min(phase + 1, EVENTS.length));
  const current = seen[seen.length - 1];

  const captions = [
    t("demos.tracking.captions.poll"),
    t("demos.tracking.captions.sample"),
    t("demos.tracking.captions.titleOnly"),
    t("demos.tracking.captions.ignored"),
    t("demos.tracking.captions.perApp"),
    t("demos.tracking.captions.idle", { minutes: idleMinutes }),
    t("demos.tracking.captions.back"),
    t("demos.tracking.captions.local"),
  ];

  const perApp = new Map<string, number>();
  let active = 0;
  let idle = 0;
  for (const e of seen) {
    if (e.idle) {
      idle += e.minutes;
      continue;
    }
    active += e.minutes;
    const key = e.ignored ? IGNORED : e.app;
    perApp.set(key, (perApp.get(key) ?? 0) + e.minutes);
  }
  const apps = [...perApp.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const appMax = apps[0]?.[1] ?? 1;
  const samples = seen.map((e, i) => ({ ...e, i })).reverse().slice(0, 3);

  return (
    <Stage
      caption={enabled ? captions[phase] : t("demos.tracking.off")}
      progress={enabled ? (phase + 1) / PHASES.length : 0}
    >
      <div className={cn("flex h-full flex-col gap-4 transition-[opacity,filter] duration-500", !enabled && "opacity-35 grayscale")}>
        {/* The focused window, as macOS reports it */}
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/60 shadow-lg">
          <div className="flex h-8 items-center gap-1.5 border-b border-border/60 px-3.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
            <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="relative flex size-2">
                {enabled && !hold && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-primary"
                    animate={{ scale: [1, 2.6], opacity: [0.7, 0] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span className={cn("relative size-2 rounded-full", enabled ? "bg-primary" : "bg-muted-foreground")} />
              </span>
              {t("demos.tracking.checked")}
            </span>
          </div>
          <div className="relative h-[88px]">
            <AnimatePresence initial={false}>
              <motion.div
                key={seen.length + (current.idle ? "-idle" : "")}
                className="absolute inset-0 flex items-center gap-4 px-5"
                initial={{ opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -28 }}
                transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <span
                  className={cn("flex size-12 shrink-0 items-center justify-center rounded-[14px] text-lg font-semibold text-white shadow-md", current.idle && "opacity-40")}
                  style={{ background: APP_COLOR[current.app] }}
                >
                  {current.ignored ? <EyeOff className="size-5" /> : current.app[0]}
                </span>
                <div className={cn("min-w-0 flex-1", current.idle && "opacity-40")}>
                  <p className="text-base leading-tight font-medium">{appLabel(current.app)}</p>
                  <p className="mt-1 truncate text-sm text-muted-foreground">{current.ignored ? "•••••••• ••••••" : current.title}</p>
                </div>
                {current.ignored && <Chip>{t("demos.tracking.ignoredApp")}</Chip>}
                {current.idle && (
                  <Chip>
                    <Moon className="size-3" /> {t("demos.tracking.idle")}
                  </Chip>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* What gets written down */}
        <Slab className="flex flex-col gap-2 px-5 py-4">
          <div className="flex items-center justify-between">
            <SlabLabel>{t("demos.tracking.samples")}</SlabLabel>
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <HardDrive className="size-3" /> {t("demos.tracking.localOnly")}
            </span>
          </div>
          <ul className="flex h-[93px] flex-col overflow-hidden text-sm">
            <AnimatePresence initial={false} mode="popLayout">
              {samples.map((s) => (
                <motion.li
                  key={s.i}
                  layout
                  className="flex h-[31px] shrink-0 items-center gap-3 border-b border-border/40 last:border-0"
                  initial={{ opacity: 0, y: -18 }}
                  animate={{ opacity: s.i === seen.length - 1 ? 1 : 0.6, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <span className="tabular w-11 shrink-0 text-xs text-muted-foreground">{s.at}</span>
                  <span className="size-2 shrink-0 rounded-full" style={{ background: s.idle ? "transparent" : APP_COLOR[s.ignored ? IGNORED : s.app], boxShadow: s.idle ? "inset 0 0 0 1px var(--muted-foreground)" : undefined }} />
                  {s.idle ? (
                    <span className="text-muted-foreground">{t("demos.tracking.idle")}</span>
                  ) : (
                    <>
                      <span className="shrink-0">{appLabel(s.ignored ? IGNORED : s.app)}</span>
                      <span className="truncate text-muted-foreground">{s.ignored ? t("demos.tracking.notRecorded") : s.title}</span>
                    </>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </Slab>

        {/* What they add up to */}
        <div className="grid min-h-0 flex-1 grid-cols-[1fr_auto] gap-8 px-1">
          <div className="flex flex-col gap-2">
            <SlabLabel>{t("demos.tracking.apps")}</SlabLabel>
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false} mode="popLayout">
                {apps.map(([app, minutes]) => (
                  <motion.li key={app} layout className="flex flex-col gap-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <div className="flex justify-between text-sm">
                      <span className="truncate">{appLabel(app)}</span>
                      <span className="tabular shrink-0 text-muted-foreground">{fmtMinutes(minutes)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
                      <div
                        className="h-full rounded-full transition-[width] duration-500 ease-out"
                        style={{ width: `${(minutes / appMax) * 100}%`, background: APP_COLOR[app] }}
                      />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
          <div className="flex w-36 flex-col gap-4">
            <Stat label={t("demos.tracking.active")} value={<Num value={active} format={fmtMinutes} ms={500} />} />
            <Stat label={t("demos.tracking.idleTotal")} value={<Num value={idle} format={fmtMinutes} ms={500} />} />
          </div>
        </div>
      </div>
    </Stage>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.08] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {children}
    </span>
  );
}
