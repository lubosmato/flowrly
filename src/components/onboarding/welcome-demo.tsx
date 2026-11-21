import { useMemo } from "react";
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isWeekend, startOfMonth, startOfWeek } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { FileCheck } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { cn } from "cn";
import { CLIENT_COLORS, Dot } from "@/components/bits";
import { fmtHours, money, monthLabel } from "@/lib/format";
import { Num, Stage, usePhases } from "./kit";

const ACME = { name: "Acme", color: CLIENT_COLORS[0], rate: 1200 };
const NORTHWIND = { name: "Northwind", color: CLIENT_COLORS[1] };
/** Minutes logged for Acme on consecutive workdays, repeating. */
const ACME_MINUTES = [480, 450, 360, 510, 420, 465, 390];

const FILL_STAGGER = 0.11;
const PHASES = [3600, 1500, 3800] as const;
const CAPTIONS = ["demos.welcome.captions.log", "demos.welcome.captions.addUp", "demos.welcome.captions.invoice"] as const;

/** A month filling up with logged hours, then stamped as invoiced. Mirrors the Calendar screen. */
export function WelcomeDemo() {
  const { t } = useTranslation();
  const { phase, cycle } = usePhases(PHASES);
  const month = useMemo(() => startOfMonth(new Date()), []);
  const cells = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfWeek(month, { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    });
    let k = 0;
    return days.map((d) => {
      const work = isSameMonth(d, month) && !isWeekend(d);
      const order = work ? k++ : -1;
      const acme = work ? ACME_MINUTES[order % ACME_MINUTES.length] : 0;
      const northwind = work && order % 4 === 2 ? 90 : 0;
      return { date: d, inMonth: isSameMonth(d, month), order, acme, northwind };
    });
  }, [month]);
  const acmeTotal = cells.reduce((a, c) => a + c.acme, 0);
  const total = acmeTotal + cells.reduce((a, c) => a + c.northwind, 0);
  const workdays = cells.filter((c) => c.order >= 0).length;
  const invoiced = phase === 2;
  const weekdays = cells.slice(0, 7).map((c) => format(c.date, t("demos.welcome.weekdayPattern")));

  return (
    <Stage caption={t(CAPTIONS[phase])} progress={(phase + 1) / PHASES.length}>
      <div className="flex h-full flex-col">
        <header className="flex items-end justify-between pb-4">
          <div>
            <h3 className="font-display text-[30px] leading-none font-medium tracking-tight">{monthLabel(month)}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              <Trans
                key={cycle}
                i18nKey="demos.welcome.logged"
                components={{
                  total: <span className="tabular text-foreground" />,
                  num: <Num value={total} initial={0} ms={workdays * FILL_STAGGER * 1000 + 400} format={(v) => fmtHours(v, 1)} />,
                }}
              />
            </p>
          </div>
          <div className="flex items-center gap-4 pb-0.5 text-xs text-muted-foreground">
            {[ACME, NORTHWIND].map((c) => (
              <span key={c.name} className="flex items-center gap-1.5">
                <Dot color={c.color} /> {c.name}
              </span>
            ))}
          </div>
        </header>

        <div className="mb-1.5 grid grid-cols-7 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          {weekdays.map((d) => (
            <div key={d} className="px-2.5">
              {d}
            </div>
          ))}
        </div>
        <div key={cycle} className="grid min-h-0 flex-1 grid-cols-7 gap-1" style={{ gridAutoRows: "1fr" }}>
          {cells.map((c) => (
            <div
              key={c.date.toISOString()}
              className={cn(
                "flex flex-col justify-between rounded-xl border border-transparent p-2",
                c.inMonth ? "text-foreground" : "text-muted-foreground/40",
                c.order >= 0 && "bg-foreground/[0.03]",
              )}
            >
              <span className="tabular text-[10px] font-medium">{c.date.getDate()}</span>
              {c.order >= 0 && (
                <motion.div
                  className="flex items-end justify-between"
                  initial={{ opacity: 0, y: 6, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ delay: 0.3 + c.order * FILL_STAGGER, type: "spring", stiffness: 420, damping: 24 }}
                >
                  <span className="font-display tabular text-lg leading-none">{fmtHours(c.acme + c.northwind, 1)}</span>
                  <span className="flex gap-1.5 pr-0.5 pb-0.5">
                    <Dot color={ACME.color} invoiced={invoiced ? "all" : undefined} className="transition-[outline]" />
                    {c.northwind > 0 && <Dot color={NORTHWIND.color} />}
                  </span>
                </motion.div>
              )}
            </div>
          ))}
        </div>

        <AnimatePresence>
          {invoiced && (
            <motion.div
              className="absolute inset-x-0 bottom-5 flex justify-center"
              initial={{ opacity: 0, y: 24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, transition: { duration: 0.2 } }}
              transition={{ type: "spring", stiffness: 320, damping: 22 }}
            >
              <div className="flex items-center gap-3 rounded-2xl bg-popover px-4 py-3 shadow-2xl ring-1 ring-foreground/10">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <FileCheck className="size-4.5" />
                </span>
                <div className="leading-tight">
                  <p className="text-xs text-muted-foreground">{t("demos.welcome.invoice", { number: "2026-0011", client: ACME.name })}</p>
                  <p className="font-display tabular text-xl">
                    {fmtHours(acmeTotal)} h · {money((acmeTotal / 60) * ACME.rate)}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Stage>
  );
}
