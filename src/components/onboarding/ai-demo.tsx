import { useMemo } from "react";
import { isWeekend, subDays } from "date-fns";
import { AnimatePresence, motion } from "motion/react";
import { CloudOff, Cpu, Send, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/bits";
import { fmtMinutes, isoDay, prettyDay } from "@/lib/format";
import { Caret, Press, Slab, Stage, usePhases, useTyped } from "./kit";

const WINDOWS = [
  { app: "Ghostty", title: "nvim src/invoice.rs", minutes: 168 },
  { app: "Figma", title: "Onboarding flow", minutes: 85 },
  { app: "Ghostty", title: "cargo test", minutes: 82 },
  { app: "Arc", title: "Exact hours on the invoice line · Pull Request #128", minutes: 80 },
];
const ACTIVE = 462;
const TAGS = [
  { tag: "demos.ai.tags.coding", minutes: 250 },
  { tag: "demos.ai.tags.design", minutes: 85 },
  { tag: "demos.ai.tags.review", minutes: 80 },
  { tag: "demos.ai.tags.communication", minutes: 47 },
] as const;
const SUGGESTION = { start: "09:05", end: "17:20" };

// windows, press Summarize, summary arrives, press Suggest, entry filled
const PHASES = [2400, 1600, 4600, 1600, 4200] as const;
const TYPE_SPEED = 70;

/** A tracked day turned into a Day Summary, then into a Suggestion. Mirrors the Activity screen and the entry form. */
export function AiDemo({ provider, local }: { provider: string; local: boolean }) {
  const { t } = useTranslation();
  const { phase } = usePhases(PHASES);
  const day = useMemo(() => {
    let d = subDays(new Date(), 1);
    while (isWeekend(d)) d = subDays(d, 1);
    return isoDay(d);
  }, []);
  const sending = phase === 1 || phase === 3;
  const summarized = phase >= 2;
  const suggested = phase === 4;
  const summaryText = t("demos.ai.summary");
  const summary = useTyped(summaryText, summarized, TYPE_SPEED);
  const description = useTyped(t("demos.ai.suggestion"), suggested, TYPE_SPEED);
  const summaryDone = summary.length === summaryText.length;

  const captions = [
    t("demos.ai.captions.windows"),
    local ? t("demos.ai.captions.pressLocal", { provider }) : t("demos.ai.captions.pressRemote", { provider }),
    t("demos.ai.captions.summary"),
    t("demos.ai.captions.suggest"),
    t("demos.ai.captions.review"),
  ];

  return (
    <Stage caption={captions[phase]} progress={(phase + 1) / PHASES.length}>
      <div className="flex h-full flex-col gap-3">
        <div className="flex h-7 justify-center">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={sending ? "sending" : "quiet"}
              className={cn(
                "flex items-center gap-2 rounded-full px-3 text-xs font-medium",
                sending ? "bg-primary/15 text-foreground" : "bg-foreground/[0.06] text-muted-foreground",
              )}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.2 }}
            >
              {sending ? (
                <>
                  {local ? <Cpu className="size-3.5 text-primary" /> : <Send className="size-3.5 text-primary" />}
                  {local ? t("demos.ai.askingLocal", { provider }) : t("demos.ai.sending", { provider })}
                </>
              ) : (
                <>
                  <CloudOff className="size-3.5" /> {t("demos.ai.nothingSent")}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Day Summary: a row of the Activity screen */}
        <Slab className="flex flex-col gap-2.5 px-5 py-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-medium">{prettyDay(day)}</span>
            <span className="font-display tabular text-xl">{fmtMinutes(ACTIVE)}</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${(ACTIVE / 600) * 100}%` }} />
          </div>
          <div className="relative h-[116px]">
            <AnimatePresence initial={false}>
              {summarized ? (
                <motion.div key="summary" className="absolute inset-0 flex flex-col gap-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {summary}
                    <Caret show={!summaryDone} />
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {summaryDone &&
                      TAGS.map((tag, i) => (
                        <motion.span
                          key={tag.tag}
                          initial={{ opacity: 0, scale: 0.6, y: 6 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          transition={{ delay: i * 0.1, type: "spring", stiffness: 420, damping: 20 }}
                        >
                          <Badge variant="secondary" className="tabular">
                            {t(tag.tag)} · {fmtMinutes(tag.minutes)}
                          </Badge>
                        </motion.span>
                      ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="windows" className="absolute inset-0 flex flex-col gap-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                    {WINDOWS.map((b) => (
                      <li key={b.title} className="flex justify-between gap-3">
                        <span className="truncate">
                          <span className="text-foreground/80">{b.app}</span>
                          <span className="opacity-70"> · {b.title}</span>
                        </span>
                        <span className="tabular shrink-0">{fmtMinutes(b.minutes)}</span>
                      </li>
                    ))}
                  </ul>
                  <Press active={phase === 1} className="self-start">
                    <Button variant="outline" size="sm" tabIndex={-1}>
                      <Sparkles className="text-primary" />
                      {t("demos.ai.summarize")}
                    </Button>
                  </Press>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Slab>

        {/* Suggestion: the log-time form */}
        <Slab className="flex min-h-0 flex-1 flex-col gap-3 px-5 py-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label={t("common.start")}>
              <Input readOnly tabIndex={-1} placeholder="9:00" value={suggested ? SUGGESTION.start : ""} className="font-display tabular text-lg md:text-lg" />
            </Field>
            <Field label={t("common.end")}>
              <Input readOnly tabIndex={-1} placeholder="17:30" value={suggested ? SUGGESTION.end : ""} className="font-display tabular text-lg md:text-lg" />
            </Field>
            <Field label={t("common.duration")}>
              <span className="flex h-8 items-center">
                <AnimatePresence>
                  {suggested && (
                    <motion.span
                      className="font-display tabular text-xl"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: 0.15 }}
                    >
                      {fmtMinutes(ACTIVE)}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </Field>
          </div>
          <Field label={t("common.description")}>
            <Textarea readOnly tabIndex={-1} rows={2} placeholder={t("demos.ai.descriptionPlaceholder")} value={description} className="min-h-12 resize-none" />
          </Field>
          <div className="mt-auto flex items-center justify-between">
            <Press active={phase === 3}>
              <Button variant="ghost" size="sm" tabIndex={-1}>
                <Sparkles className="text-primary" />
                {t("demos.ai.suggest")}
              </Button>
            </Press>
            <Button size="sm" tabIndex={-1}>
              {t("demos.ai.addEntry")}
            </Button>
          </div>
        </Slab>
      </div>
    </Stage>
  );
}
