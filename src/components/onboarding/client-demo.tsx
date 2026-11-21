import { useMemo } from "react";
import { endOfMonth, startOfMonth } from "date-fns";
import { motion } from "motion/react";
import type { Client, ClientInput } from "@/bindings";
import { Stat } from "@/components/bits";
import { ClientCard } from "@/components/client-card";
import { fmtHours, fmtMinutes, isoDay, money, prettyDay } from "@/lib/format";
import { workload } from "@/lib/workload";
import { Num, Slab, Stage } from "./kit";

const EXAMPLE_ENTRIES = [
  { description: "API design review", start: "09:00", end: "12:30", minutes: 210 },
  { description: "Invoice export, edge cases", start: "13:15", end: "17:00", minutes: 225 },
];

/** The Client being typed into the form, shown the way the app will show it. */
export function ClientDemo({ input }: { input: ClientInput }) {
  const named = input.name.trim() !== "";
  const client: Client = { id: 0, ...input, name: named ? input.name.trim() : "Your client" };
  const today = useMemo(() => new Date(), []);
  const expected = workload(client, isoDay(startOfMonth(today)), isoDay(endOfMonth(today)), 0, today);
  const rate = client.hourly_rate ?? 0;
  const dayTotal = EXAMPLE_ENTRIES.reduce((a, e) => a + e.minutes, 0);

  return (
    <Stage label="Live preview" caption={named ? `This is how ${client.name} shows up in Flowrly` : "Type a name to see your Client take shape"}>
      <div className="flex h-full flex-col justify-center gap-5">
        <div className="grid grid-cols-[1fr_auto] items-center gap-8">
          <motion.div key={client.color} initial={{ scale: 0.96 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 18 }}>
            <ClientCard client={client} className={named ? undefined : "[&_span.truncate]:text-muted-foreground"} />
          </motion.div>
          <div className="flex w-52 flex-col gap-5">
            <Stat
              label="Expected this month"
              value={
                <>
                  <Num value={expected.expectedTotal} format={(v) => fmtHours(v, 1)} /> h
                </>
              }
              sub={`${expected.workdaysTotal} workdays at ${client.pensum_percent}% pensum`}
            />
            <Stat
              label="Worth"
              value={<Num value={(expected.expectedTotal / 60) * rate} format={(v) => money(v, client.currency)} />}
              sub={`${money(rate, client.currency)} / h, excl. VAT`}
            />
          </div>
        </div>

        <Slab className="flex flex-col gap-3 p-5">
          <div>
            <h3 className="font-display text-xl leading-tight">{prettyDay(isoDay(today))}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {fmtMinutes(dayTotal)} across {EXAMPLE_ENTRIES.length} entries
            </p>
          </div>
          <ul className="flex flex-col gap-1">
            {EXAMPLE_ENTRIES.map((e, i) => (
              <motion.li
                key={e.description}
                className="flex gap-3 rounded-2xl px-3 py-2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.35 + i * 0.14, duration: 0.4, ease: "easeOut" }}
              >
                <span className="mt-1 w-1 shrink-0 self-stretch rounded-full transition-colors" style={{ background: client.color }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{client.name}</span>
                    <span className="font-display tabular shrink-0 text-lg">{fmtMinutes(e.minutes)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{e.description}</span>
                    <span className="tabular shrink-0">
                      {e.start}–{e.end}
                    </span>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </Slab>
      </div>
    </Stage>
  );
}
