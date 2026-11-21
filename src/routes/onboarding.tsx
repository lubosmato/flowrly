import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  ExternalLink,
  FileText,
  HardDrive,
  KeyRound,
  Languages,
  Loader2,
  Lock,
  Minus,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import {
  commands,
  type AiProvider,
  type Client,
  type ClientInput,
  type FakturoidAccount,
  type FakturoidGenerator,
  type FakturoidSubject,
  type Settings,
} from "@/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLIENT_COLORS, Field } from "@/components/bits";
import { WelcomeDemo } from "@/components/onboarding/welcome-demo";
import { ClientDemo } from "@/components/onboarding/client-demo";
import { InvoiceDemo } from "@/components/onboarding/invoice-demo";
import { TrackingDemo } from "@/components/onboarding/tracking-demo";
import { AiDemo } from "@/components/onboarding/ai-demo";
import { DoneDemo } from "@/components/onboarding/done-demo";
import { PROVIDERS, providerLabel } from "@/lib/ai-providers";
import { errorMessage, keys, useAppPaths, useClients, useSettings } from "@/lib/api";
import { money } from "@/lib/format";
import { LANGUAGES, LANGUAGE_NAMES, applyLanguage, currentLanguage, type Language } from "@/i18n";
import { CURRENCIES, blankClient } from "@/routes/clients";
import mark from "@/assets/mark.png";

const STEPS = ["welcome", "client", "fakturoid", "tracking", "ai", "ready"] as const;
const [WELCOME, CLIENT, FAKTUROID, TRACKING, AI, DONE] = [0, 1, 2, 3, 4, 5];

type Choice = "yes" | "no" | null;

const toInput = ({ id: _id, ...c }: Client): ClientInput => ({ ...c, hourly_rate: c.hourly_rate ?? 0, workday_hours: c.workday_hours ?? 8 });

/**
 * First-run wizard: creates the first Client and asks, one step at a time, whether
 * to use Fakturoid, Activity Tracking and AI. Each answer is saved as the user
 * moves on, so quitting halfway loses nothing; `onboarding_completed` is only set
 * at the end, and nothing is tracked before that. With `replay` it is opened again
 * from Settings over an already configured app.
 */
export function Onboarding({ replay }: { replay: boolean }) {
  const { data: settings } = useSettings();
  const { data: clients } = useClients();
  const fxSecret = useQuery({ queryKey: keys.secret("fakturoid_client_secret"), queryFn: () => commands.hasSecret("fakturoid_client_secret"), retry: false });
  const aiSecret = useQuery({ queryKey: keys.secret("ai_api_key"), queryFn: () => commands.hasSecret("ai_api_key"), retry: false });
  if (!settings || !clients || fxSecret.isPending || aiSecret.isPending) return null;
  return (
    <Wizard
      replay={replay}
      settings={settings}
      existing={clients.find((c) => !c.archived) ?? clients[0]}
      hasFxSecret={fxSecret.data ?? false}
      hasAiKey={aiSecret.data ?? false}
    />
  );
}

type FxForm = {
  choice: Choice;
  clientId: string;
  secret: string;
  email: string;
  slug: string;
  accounts: FakturoidAccount[] | null;
  subjects: FakturoidSubject[] | null;
  generators: FakturoidGenerator[] | null;
  error: string | null;
};

type AiForm = { choice: Choice; provider: AiProvider; model: string; baseUrl: string; key: string };

function Wizard({
  replay,
  settings,
  existing,
  hasFxSecret,
  hasAiKey,
}: {
  replay: boolean;
  settings: Settings;
  existing: Client | undefined;
  hasFxSecret: boolean;
  hasAiKey: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(WELCOME);
  const [dir, setDir] = useState(1);
  const [reached, setReached] = useState(WELCOME);
  const [busy, setBusy] = useState(false);

  const [client, setClient] = useState<ClientInput>(() => (existing ? toInput(existing) : blankClient()));
  const [clientId, setClientId] = useState<number | null>(existing?.id ?? null);
  const savedClient = useRef(existing ? JSON.stringify(toInput(existing)) : "");

  const [fx, setFxState] = useState<FxForm>({
    choice: settings.fakturoid_client_id ? "yes" : null,
    clientId: settings.fakturoid_client_id,
    secret: "",
    email: settings.fakturoid_contact_email,
    slug: settings.fakturoid_account_slug,
    accounts: null,
    subjects: null,
    generators: null,
    error: null,
  });
  const setFx = (patch: Partial<FxForm>) => setFxState((f) => ({ ...f, ...patch }));

  const [tracking, setTracking] = useState({ enabled: settings.tracking_enabled, launch: settings.launch_at_login });

  const startProvider = PROVIDERS.find((p) => p.value === settings.ai_provider) ?? PROVIDERS[0];
  const [ai, setAiState] = useState<AiForm>({
    choice: hasAiKey || (replay && startProvider.local) ? "yes" : null,
    provider: settings.ai_provider,
    model: settings.ai_model,
    baseUrl: settings.ai_base_url,
    key: "",
  });
  const setAi = (patch: Partial<AiForm>) => setAiState((a) => ({ ...a, ...patch }));
  const provider = PROVIDERS.find((p) => p.value === ai.provider) ?? PROVIDERS[0];
  const providerName = provider.label;

  const go = (to: number) => {
    setDir(to > step ? 1 : -1);
    setStep(to);
    setReached((r) => Math.max(r, to));
  };

  /** Runs a save; on failure it reports the error and stays on the step. */
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  /** Reads the stored settings afresh before merging, so steps never overwrite each other. */
  const patchSettings = async (patch: Partial<Settings>) => {
    const current = await commands.getSettings();
    const saved = await commands.saveSettings({ ...current, ...patch });
    qc.setQueryData(keys.settings, saved);
    return saved;
  };

  /** Switches the UI at once and stores the choice; does not touch `onboarding_completed`. */
  const pickLanguage = (lang: Language) => {
    void applyLanguage(lang);
    patchSettings({ language: lang }).catch((e) => toast.error(errorMessage(e)));
  };

  const saveClient = async (input: ClientInput) => {
    const clean = { ...input, name: input.name.trim() };
    if (clientId === null) {
      const created = await commands.createClient(clean);
      setClientId(created.id);
    } else if (JSON.stringify(clean) !== savedClient.current) {
      await commands.updateClient(clientId, clean);
    }
    savedClient.current = JSON.stringify(clean);
    setClient(clean);
    await qc.invalidateQueries({ queryKey: keys.clients });
  };

  /** Subjects and Generators of the chosen account, with the Client's Subject guessed from its name. */
  const loadLinks = async (slug: string) => {
    await patchSettings({ fakturoid_account_slug: slug });
    const [subjects, generators] = await Promise.all([commands.fakturoidSubjects(), commands.fakturoidGenerators()]);
    setFx({ slug, subjects, generators });
    const name = client.name.trim().toLowerCase();
    const guess = name ? subjects.find((s) => s.name.toLowerCase().includes(name) || name.includes(s.name.toLowerCase())) : undefined;
    if (client.fakturoid_subject_id === null && guess) setClient((c) => ({ ...c, fakturoid_subject_id: guess.id }));
  };

  const connectFakturoid = async () => {
    setFx({ error: null });
    setBusy(true);
    try {
      await patchSettings({ fakturoid_client_id: fx.clientId.trim(), fakturoid_contact_email: fx.email.trim() });
      if (fx.secret) {
        await commands.setSecret("fakturoid_client_secret", fx.secret);
        await qc.invalidateQueries({ queryKey: keys.secret("fakturoid_client_secret") });
      }
      const accounts = await commands.fakturoidAccounts();
      if (accounts.length === 0) throw new Error(t("onboarding.fakturoid.noAccount"));
      const slug = accounts.find((a) => a.slug === fx.slug)?.slug ?? (accounts.length === 1 ? accounts[0].slug : "");
      setFx({ accounts, slug, secret: "", subjects: null, generators: null });
      if (slug) await loadLinks(slug);
    } catch (e) {
      const message = errorMessage(e);
      setFx({ error: message.includes("401") ? t("onboarding.fakturoid.rejected", { message }) : message, accounts: null });
    } finally {
      setBusy(false);
    }
  };

  const fxConnected = fx.accounts !== null;
  const fxLinked = fxConnected && fx.subjects !== null;

  type Action = { label: string; run: () => void; disabled?: boolean };
  let primary: Action;
  let secondary: Action | undefined;
  const next = () => go(step + 1);

  switch (step) {
    case WELCOME:
      primary = { label: t("onboarding.getStarted"), run: next };
      break;
    case CLIENT:
      primary = { label: t("common.continue"), disabled: !client.name.trim(), run: () => run(async () => (await saveClient(client), next())) };
      break;
    case FAKTUROID:
      if (fx.choice === "yes" && !fxConnected) {
        primary = { label: t("onboarding.connect"), disabled: !fx.clientId.trim() || (!fx.secret && !hasFxSecret), run: connectFakturoid };
        secondary = { label: t("onboarding.skipForNow"), run: next };
      } else if (fx.choice === "yes") {
        primary = { label: t("common.continue"), disabled: !fxLinked, run: () => run(async () => (await saveClient(client), next())) };
      } else {
        primary = { label: t("common.continue"), disabled: fx.choice === null, run: next };
      }
      break;
    case TRACKING:
      primary = {
        label: t("common.continue"),
        run: () => run(async () => (await patchSettings({ tracking_enabled: tracking.enabled, launch_at_login: tracking.launch }), next())),
      };
      break;
    case AI:
      if (ai.choice === "yes") {
        primary = {
          label: t("common.continue"),
          disabled: !ai.model.trim() || (provider.needsKey && !ai.key && !hasAiKey),
          run: () =>
            run(async () => {
              await patchSettings({ ai_provider: ai.provider, ai_model: ai.model.trim(), ai_base_url: ai.baseUrl.trim() });
              if (ai.key) {
                await commands.setSecret("ai_api_key", ai.key);
                await qc.invalidateQueries({ queryKey: keys.secret("ai_api_key") });
                setAi({ key: "" });
              }
              next();
            }),
        };
        secondary = { label: t("onboarding.skipForNow"), run: next };
      } else {
        primary = { label: t("common.continue"), disabled: ai.choice === null, run: next };
      }
      break;
    default:
      primary = {
        label: replay ? t("onboarding.backToFlowrly") : t("onboarding.openFlowrly"),
        run: () =>
          run(async () => {
            await patchSettings({ onboarding_completed: true });
            await qc.invalidateQueries();
            if (replay) await navigate({ to: "/" });
          }),
      };
  }

  const liveSettings = useSettings().data ?? settings;
  const fxReady = !!liveSettings.fakturoid_client_id && !!liveSettings.fakturoid_account_slug;
  const liveProvider = PROVIDERS.find((p) => p.value === liveSettings.ai_provider) ?? PROVIDERS[0];
  const aiReady = liveProvider.local ? ai.choice === "yes" : hasAiKey;

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-screen w-screen flex-col">
        <header data-tauri-drag-region className="relative flex h-14 shrink-0 items-center justify-end pr-8 pl-24">
          <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-0.5" aria-label={t("onboarding.setupSteps")}>
            {STEPS.map((id, i) => (
              <button
                key={id}
                type="button"
                disabled={i > reached || busy}
                onClick={() => go(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn(
                  "relative flex items-center gap-2 rounded-full py-1.5 pr-3 pl-2 text-xs font-medium transition-colors",
                  i === step ? "text-foreground" : i <= reached ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50",
                )}
              >
                {i === step && (
                  <motion.span layoutId="onboarding-step" className="absolute inset-0 rounded-full bg-foreground/[0.07]" transition={{ type: "spring", stiffness: 400, damping: 32 }} />
                )}
                <span
                  className={cn(
                    "tabular relative flex size-[18px] items-center justify-center rounded-full text-[10px] transition-colors",
                    i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-foreground text-background" : "bg-foreground/10",
                  )}
                >
                  {i < step ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="relative">{t(`onboarding.steps.${id}`)}</span>
              </button>
            ))}
          </nav>
          {replay ? (
            <Button variant="ghost" size="icon-sm" onClick={() => navigate({ to: "/" })} aria-label={t("common.close")} title={t("common.close")}>
              <X />
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground max-[1080px]:hidden">
              <Lock className="size-3" /> {t("onboarding.savedLocally")}
            </span>
          )}
        </header>

        <div className="flex min-h-0 flex-1 gap-8 pr-8 pb-8 pl-12">
          <form
            className="flex w-[38%] max-w-[470px] min-w-[380px] shrink-0 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy && !primary.disabled) primary.run();
            }}
          >
            <div className="-mr-3 -ml-1 flex min-h-0 flex-1 flex-col overflow-y-auto pr-3 pl-1" style={{ maskImage: SCROLL_FADE, WebkitMaskImage: SCROLL_FADE }}>
              <AnimatePresence mode="wait" custom={dir} initial={false}>
                <motion.div
                  key={step}
                  custom={dir}
                  variants={PANE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className="my-auto flex flex-col gap-5 pt-4 pb-7"
                >
                  {step === WELCOME && <WelcomeStep onLanguage={pickLanguage} />}
                  {step === CLIENT && <ClientStep form={client} setForm={setClient} existing={clientId !== null && replay} />}
                  {step === FAKTUROID && (
                    <FakturoidStep
                      fx={fx}
                      setFx={setFx}
                      hasSecret={hasFxSecret}
                      busy={busy}
                      client={client}
                      setClient={setClient}
                      pickAccount={(slug) => run(() => loadLinks(slug))}
                    />
                  )}
                  {step === TRACKING && <TrackingStep value={tracking} onChange={setTracking} idleMinutes={Math.round(settings.idle_threshold_seconds / 60)} ignored={settings.ignored_apps} />}
                  {step === AI && <AiStep ai={ai} setAi={setAi} hasKey={hasAiKey} trackingOn={tracking.enabled} />}
                  {step === DONE && (
                    <DoneStep
                      replay={replay}
                      rows={[
                        { icon: Users, label: t("common.client"), value: t("onboarding.done.rate", { name: client.name, rate: money(client.hourly_rate, client.currency) }), on: true },
                        {
                          icon: FileText,
                          label: t("onboarding.done.fakturoid"),
                          value: fxReady ? t("onboarding.done.connected", { account: liveSettings.fakturoid_account_slug }) : t("onboarding.done.notConnected"),
                          on: fxReady,
                        },
                        {
                          icon: Activity,
                          label: t("onboarding.done.tracking"),
                          value: liveSettings.tracking_enabled ? t("onboarding.done.trackingOn") : t("onboarding.done.off"),
                          on: liveSettings.tracking_enabled,
                        },
                        { icon: Sparkles, label: t("onboarding.done.ai"), value: aiReady ? `${providerLabel(liveProvider)} · ${liveSettings.ai_model}` : t("onboarding.done.off"), on: aiReady },
                      ]}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex shrink-0 items-center gap-2 pt-5">
              {step > WELCOME && (
                <Button type="button" variant="ghost" className="h-10 px-3" onClick={() => go(step - 1)} disabled={busy}>
                  <ArrowLeft /> {t("common.back")}
                </Button>
              )}
              <div className="ml-auto flex items-center gap-2">
                {secondary && (
                  <Button type="button" variant="ghost" className="h-10 px-3 text-muted-foreground" onClick={secondary.run} disabled={busy}>
                    {secondary.label}
                  </Button>
                )}
                <Button type="submit" className="h-10 rounded-xl px-5 text-sm" disabled={busy || primary.disabled}>
                  {primary.label}
                  {busy ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                </Button>
              </div>
            </footer>
          </form>

          <section className="glass relative min-w-0 flex-1 overflow-hidden rounded-[2rem]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.15 } }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                {step === WELCOME && <WelcomeDemo />}
                {step === CLIENT && <ClientDemo input={client} />}
                {step === FAKTUROID && <InvoiceDemo client={client} />}
                {step === TRACKING && <TrackingDemo enabled={tracking.enabled} idleMinutes={Math.round(settings.idle_threshold_seconds / 60)} />}
                {step === AI && <AiDemo provider={providerName} local={!!provider.local} />}
                {step === DONE && <DoneDemo color={client.color} />}
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
      </div>
    </MotionConfig>
  );
}

// ---------- Motion ----------

const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Fades the last few pixels of the step, hinting that a tall step scrolls. */
const SCROLL_FADE = "linear-gradient(to bottom, #000 calc(100% - 22px), transparent)";

const PANE: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: 24 * dir }),
  center: { opacity: 1, x: 0, transition: { duration: 0.3, ease: EASE, staggerChildren: 0.06, delayChildren: 0.04 } },
  exit: (dir: number) => ({ opacity: 0, x: -24 * dir, transition: { duration: 0.15 } }),
};

const RISE: Variants = {
  enter: { opacity: 0, y: 14 },
  center: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

/** One block of a step; blocks rise in one after another. */
function Rise({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div variants={RISE} className={className}>
      {children}
    </motion.div>
  );
}

// ---------- Shared pieces ----------

function Heading({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <>
      <Rise>
        <p className="text-[11px] font-medium tracking-[0.16em] text-primary uppercase">{eyebrow}</p>
        <h1 className="font-display mt-3 text-[40px] leading-[1.05] font-medium tracking-tight">{title}</h1>
      </Rise>
      <Rise>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{children}</p>
      </Rise>
    </>
  );
}

/** Where the data goes. Every step has one. */
function Privacy({ icon: Icon = ShieldCheck, title, children }: { icon?: LucideIcon; title?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-foreground/[0.045] p-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-col gap-1 text-[13px] leading-relaxed text-muted-foreground">
        {title && <p className="font-medium text-foreground">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function ChoiceCards({ value, onChange, yes, no }: { value: Choice; onChange: (v: Choice) => void; yes: string; no: string }) {
  return (
    <div role="radiogroup" className="grid grid-cols-2 gap-2.5">
      {(
        [
          ["yes", yes],
          ["no", no],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-11 items-center gap-2.5 rounded-xl border px-3.5 text-sm font-medium transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === v ? "border-primary bg-primary/10 text-foreground" : "border-input text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
          )}
        >
          <span className={cn("flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors", value === v ? "border-primary bg-primary text-primary-foreground" : "border-input")}>
            {value === v && <Check className="size-2.5" strokeWidth={3.5} />}
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Height-animated reveal for the part of a form that depends on a choice. */
function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          className="-mx-1 overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          onAnimationComplete={(_, el = ref.current) => show && el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
        >
          {/* Padding keeps focus rings from being clipped by overflow-hidden. */}
          <div ref={ref} className="flex scroll-mb-6 flex-col gap-3.5 px-1 pt-1 pb-1.5">
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const num = (v: string) => (v === "" ? 0 : Number(v));

// ---------- Steps ----------

function WelcomeStep({ onLanguage }: { onLanguage: (lang: Language) => void }) {
  const { t } = useTranslation();
  const active = currentLanguage();
  return (
    <>
      <Rise>
        <motion.img
          src={mark}
          alt=""
          draggable={false}
          className="size-14 select-none drop-shadow-md"
          initial={{ rotate: -20, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
        />
      </Rise>
      <Heading eyebrow={t("onboarding.welcome.eyebrow")} title={t("onboarding.welcome.title")}>
        {t("onboarding.welcome.body")}
      </Heading>
      <Rise>
        <Privacy title={t("onboarding.welcome.privacyTitle")}>
          <p>{t("onboarding.welcome.privacyLocal")}</p>
          <p>{t("onboarding.welcome.privacyException")}</p>
        </Privacy>
      </Rise>
      <Rise>
        <div role="group" aria-label={t("common.language")} className="flex items-center gap-0.5 text-xs text-muted-foreground">
          <Languages className="mr-1.5 size-3.5" aria-hidden />
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              lang={lang}
              aria-pressed={lang === active}
              onClick={() => onLanguage(lang)}
              className={cn(
                "rounded-full px-2.5 py-1 font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                lang === active ? "bg-foreground/[0.07] text-foreground" : "hover:text-foreground",
              )}
            >
              {LANGUAGE_NAMES[lang]}
            </button>
          ))}
        </div>
      </Rise>
    </>
  );
}

function ClientStep({ form, setForm, existing }: { form: ClientInput; setForm: (f: ClientInput) => void; existing: boolean }) {
  const { t } = useTranslation();
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setForm({ ...form, [k]: v });
  return (
    <>
      <Heading eyebrow={t("onboarding.client.eyebrow")} title={t("onboarding.client.title")}>
        {existing ? t("onboarding.client.bodyExisting") : t("onboarding.client.bodyNew")}
      </Heading>
      <Rise className="flex flex-col gap-3.5">
        <Field label={t("onboarding.client.name")}>
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme s.r.o." className="h-10 text-base md:text-base" />
        </Field>
        <Field label={t("onboarding.client.colour")} hint={t("onboarding.client.colourHint")}>
          <div className="flex h-8 items-center gap-2.5">
            {CLIENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color", c)}
                className={cn("size-6 rounded-full transition-transform", form.color === c ? "scale-110 ring-2 ring-foreground/60 ring-offset-2 ring-offset-background" : "hover:scale-110")}
                style={{ background: c }}
                aria-label={c}
                aria-pressed={form.color === c}
              />
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-[1fr_auto_auto] gap-3">
          <Field label={t("onboarding.client.hourlyRate")}>
            <Input type="number" min={0} step={1} value={form.hourly_rate || ""} placeholder="0" onChange={(e) => set("hourly_rate", num(e.target.value))} className="font-display text-lg md:text-lg" />
          </Field>
          <Field label={t("onboarding.client.currency")}>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...CURRENCIES, form.currency])].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("onboarding.client.vat")} className="w-20">
            <Input type="number" min={0} max={100} value={form.vat_rate} onChange={(e) => set("vat_rate", num(e.target.value))} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("onboarding.client.pensum")} hint={t("onboarding.client.pensumHint")}>
            <Input type="number" min={0} max={100} step={5} value={form.pensum_percent} onChange={(e) => set("pensum_percent", num(e.target.value))} />
          </Field>
          <Field label={t("onboarding.client.workdayHours")} hint={t("onboarding.client.workdayHoursHint")}>
            <Input type="number" min={0.5} max={24} step={0.5} value={form.workday_hours ?? 8} onChange={(e) => set("workday_hours", num(e.target.value))} />
          </Field>
        </div>
      </Rise>
    </>
  );
}

function FakturoidStep({
  fx,
  setFx,
  hasSecret,
  busy,
  client,
  setClient,
  pickAccount,
}: {
  fx: FxForm;
  setFx: (p: Partial<FxForm>) => void;
  hasSecret: boolean;
  busy: boolean;
  client: ClientInput;
  setClient: (c: ClientInput) => void;
  pickAccount: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const connected = fx.accounts !== null;
  const account = fx.accounts?.find((a) => a.slug === fx.slug);
  /** Editing the credentials drops the connection made with the old ones. */
  const edit = (patch: Partial<FxForm>) => setFx({ ...patch, accounts: null, subjects: null, generators: null, error: null });
  return (
    <>
      <Heading eyebrow={t("onboarding.fakturoid.eyebrow")} title={t("onboarding.fakturoid.title")}>
        {t("onboarding.fakturoid.body")}
      </Heading>
      <Rise>
        <Privacy>
          <p>{t("onboarding.fakturoid.privacy")}</p>
        </Privacy>
      </Rise>
      <Rise className="flex flex-col gap-2">
        <ChoiceCards value={fx.choice} onChange={(choice) => setFx({ choice })} yes={t("onboarding.fakturoid.yes")} no={t("onboarding.notNow")} />
        <Reveal show={fx.choice === "no"}>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">{t("onboarding.fakturoid.declined")}</p>
        </Reveal>
        <Reveal show={fx.choice === "yes"}>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
            {t("onboarding.fakturoid.instructions")}{" "}
            <button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline" onClick={() => commands.openUrl("https://app.fakturoid.cz")}>
              {t("onboarding.fakturoid.open")} <ExternalLink className="size-3" />
            </button>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("onboarding.fakturoid.clientId")}>
              <Input autoFocus value={fx.clientId} onChange={(e) => edit({ clientId: e.target.value })} autoComplete="off" spellCheck={false} />
            </Field>
            <Field label={t("onboarding.fakturoid.clientSecret")}>
              <Input type="password" value={fx.secret} onChange={(e) => edit({ secret: e.target.value })} placeholder={hasSecret ? t("onboarding.fakturoid.stored") : ""} autoComplete="off" />
            </Field>
          </div>
          <Field label={t("onboarding.fakturoid.email")} hint={t("onboarding.fakturoid.emailHint")}>
            <Input type="email" value={fx.email} onChange={(e) => edit({ email: e.target.value })} placeholder="you@example.com" />
          </Field>
          {fx.error && (
            <p
              ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}
              className="flex scroll-mb-6 gap-2 rounded-xl bg-destructive/10 p-3 text-xs leading-relaxed text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 break-words">{fx.error}</span>
            </p>
          )}
          <Reveal show={connected}>
            <p className="flex items-center gap-2 text-sm font-medium">
              <CircleCheck className="size-4 text-primary" />
              {account ? t("onboarding.fakturoid.connectedTo", { name: account.name || account.slug }) : t("onboarding.fakturoid.connected")}
            </p>
            {fx.accounts && fx.accounts.length > 1 && (
              <Field label={t("onboarding.fakturoid.account")}>
                <Select value={fx.slug} onValueChange={pickAccount} disabled={busy}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("onboarding.fakturoid.pickAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {fx.accounts.map((a) => (
                      <SelectItem key={a.slug} value={a.slug}>
                        {a.name} · {a.slug}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {fx.subjects && fx.generators && (
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={client.name ? t("onboarding.fakturoid.subjectFor", { name: client.name }) : t("onboarding.fakturoid.subjectForYourClient")}
                  hint={t("onboarding.fakturoid.subjectHint")}
                >
                  <Select
                    value={client.fakturoid_subject_id ? String(client.fakturoid_subject_id) : ""}
                    onValueChange={(v) => setClient({ ...client, fakturoid_subject_id: v ? Number(v) : null })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={t("onboarding.fakturoid.pickSubject")} />
                    </SelectTrigger>
                    <SelectContent>
                      {fx.subjects.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t("onboarding.fakturoid.generator")} hint={t("onboarding.fakturoid.generatorHint")}>
                  <Select
                    value={client.fakturoid_generator_id ? String(client.fakturoid_generator_id) : ""}
                    onValueChange={(v) => {
                      const g = fx.generators?.find((x) => String(x.id) === v);
                      setClient({ ...client, fakturoid_generator_id: g?.id ?? null, fakturoid_subject_id: client.fakturoid_subject_id ?? g?.subject_id ?? null });
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={fx.generators.length ? t("onboarding.fakturoid.pickGenerator") : t("onboarding.fakturoid.noGenerators")} />
                    </SelectTrigger>
                    <SelectContent>
                      {fx.generators.map((g) => (
                        <SelectItem key={g.id} value={String(g.id)}>
                          {g.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </Reveal>
        </Reveal>
      </Rise>
    </>
  );
}

function TrackingStep({
  value,
  onChange,
  idleMinutes,
  ignored,
}: {
  value: { enabled: boolean; launch: boolean };
  onChange: (v: { enabled: boolean; launch: boolean }) => void;
  idleMinutes: number;
  ignored: string[];
}) {
  const { t } = useTranslation();
  const { data: paths } = useAppPaths();
  const granted = useQuery({ queryKey: ["accessibility"], queryFn: commands.accessibilityGranted, refetchInterval: 2000, enabled: value.enabled });
  const [asked, setAsked] = useState(false);
  return (
    <>
      <Heading eyebrow={t("onboarding.tracking.eyebrow")} title={t("onboarding.tracking.title")}>
        {t("onboarding.tracking.body")}
      </Heading>
      <Rise>
        <div className="rounded-2xl border border-input px-4">
          <label className="flex items-center justify-between gap-4 py-3.5">
            <span className="text-sm font-medium">{t("onboarding.tracking.track")}</span>
            <Switch checked={value.enabled} onCheckedChange={(enabled) => onChange({ ...value, enabled })} />
          </label>
          <Reveal show={value.enabled}>
            <div className="-mx-1 -mt-1 -mb-1.5 flex flex-col divide-y divide-border/60 border-t border-border/60 px-1">
              <label className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>
                  {t("onboarding.tracking.launch")}
                  <span className="block text-xs text-muted-foreground">{t("onboarding.tracking.launchHint")}</span>
                </span>
                <Switch checked={value.launch} onCheckedChange={(launch) => onChange({ ...value, launch })} />
              </label>
              <div className="flex items-center justify-between gap-4 py-3 text-sm">
                <span>
                  {t("onboarding.tracking.permission")}
                  <span className="block text-xs text-muted-foreground">{t("onboarding.tracking.permissionHint")}</span>
                </span>
                {granted.data ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
                    <CircleCheck className="size-4" /> {t("onboarding.tracking.granted")}
                  </span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={async () => {
                      // The system prompt appears once per app; after that only System Settings can grant it.
                      if (asked) await commands.openAccessibilitySettings();
                      else await commands.requestAccessibility();
                      setAsked(true);
                      void granted.refetch();
                    }}
                  >
                    <KeyRound /> {asked ? t("onboarding.tracking.openSystemSettings") : t("onboarding.tracking.grantAccess")}
                  </Button>
                )}
              </div>
            </div>
          </Reveal>
        </div>
      </Rise>
      <Rise className="grid grid-cols-2 gap-5">
        <Facts
          title={t("onboarding.tracking.records")}
          positive
          items={[t("onboarding.tracking.recordsApp"), t("onboarding.tracking.recordsTitle"), t("onboarding.tracking.recordsIdle", { minutes: idleMinutes })]}
        />
        <Facts
          title={t("onboarding.tracking.never")}
          items={[
            t("onboarding.tracking.neverScreen"),
            t("onboarding.tracking.neverInput"),
            t("onboarding.tracking.neverContents"),
            ignored.length ? t("onboarding.tracking.neverIgnoredLike", { app: ignored[0] }) : t("onboarding.tracking.neverIgnored"),
          ]}
        />
      </Rise>
      <Rise>
        <Privacy icon={HardDrive} title={t("onboarding.tracking.privacyTitle")}>
          {paths?.[0] && (
            <p className="truncate font-mono text-[11px] opacity-80" title={paths[0]}>
              {paths[0]}
            </p>
          )}
        </Privacy>
      </Rise>
    </>
  );
}

function Facts({ title, items, positive }: { title: string; items: string[]; positive?: boolean }) {
  const Icon = positive ? Check : X;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <ul className="flex flex-col gap-1.5 text-[13px] leading-snug">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", positive ? "text-primary" : "text-muted-foreground")} strokeWidth={2.5} />
            <span className={positive ? undefined : "text-muted-foreground"}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiStep({ ai, setAi, hasKey, trackingOn }: { ai: AiForm; setAi: (p: Partial<AiForm>) => void; hasKey: boolean; trackingOn: boolean }) {
  const { t } = useTranslation();
  const provider = PROVIDERS.find((p) => p.value === ai.provider) ?? PROVIDERS[0];
  return (
    <>
      <Heading eyebrow={t("onboarding.ai.eyebrow")} title={t("onboarding.ai.title")}>
        {t("onboarding.ai.body")}
      </Heading>
      <Rise>
        <Privacy>
          <p>{t("onboarding.ai.privacy")}</p>
        </Privacy>
      </Rise>
      <Rise className="flex flex-col gap-2">
        <ChoiceCards value={ai.choice} onChange={(choice) => setAi({ choice })} yes={t("onboarding.ai.yes")} no={t("onboarding.notNow")} />
        <Reveal show={ai.choice === "no"}>
          <p className="pt-2 text-xs leading-relaxed text-muted-foreground">{t("onboarding.ai.declined")}</p>
        </Reveal>
        <Reveal show={ai.choice === "yes"}>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label={t("onboarding.ai.provider")}>
              <Select
                value={ai.provider}
                onValueChange={(v) => {
                  const p = PROVIDERS.find((x) => x.value === v)!;
                  setAi({ provider: p.value, model: p.model, baseUrl: "" });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {providerLabel(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("onboarding.ai.model")}>
              <Input value={ai.model} onChange={(e) => setAi({ model: e.target.value })} spellCheck={false} />
            </Field>
          </div>
          {provider.needsKey ? (
            <Field label={t("onboarding.ai.apiKey")} hint={t("onboarding.ai.apiKeyHint")}>
              <Input type="password" value={ai.key} onChange={(e) => setAi({ key: e.target.value })} placeholder={hasKey ? t("onboarding.fakturoid.stored") : ""} autoComplete="off" />
            </Field>
          ) : (
            <Field label={t("onboarding.ai.baseUrl")} hint={t("onboarding.ai.baseUrlHint")}>
              <Input value={ai.baseUrl} onChange={(e) => setAi({ baseUrl: e.target.value })} placeholder={t("onboarding.ai.optional")} spellCheck={false} />
            </Field>
          )}
          {!trackingOn && (
            <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              {t("onboarding.ai.trackingOff")}
            </p>
          )}
        </Reveal>
      </Rise>
    </>
  );
}

function DoneStep({ rows, replay }: { rows: { icon: LucideIcon; label: string; value: string; on: boolean }[]; replay: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <Heading eyebrow={replay ? t("onboarding.done.eyebrowReplay") : t("onboarding.done.eyebrow")} title={t("onboarding.done.title")}>
        {t("onboarding.done.body")}
      </Heading>
      <Rise>
        <ul className="flex flex-col divide-y divide-border/60 rounded-2xl border border-input">
          {rows.map(({ icon: Icon, label, value, on }) => (
            <li key={label} className="flex items-center gap-3.5 px-4 py-3">
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl", on ? "bg-primary/15 text-primary" : "bg-foreground/[0.06] text-muted-foreground")}>
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("truncate text-sm font-medium", !on && "text-muted-foreground")}>{value}</p>
              </div>
              {on ? <Check className="size-4 text-primary" strokeWidth={2.5} /> : <Minus className="size-4 text-muted-foreground/60" />}
            </li>
          ))}
        </ul>
      </Rise>
      <Rise>
        <Privacy icon={Lock}>
          <p>{t("onboarding.done.privacy")}</p>
        </Privacy>
      </Rise>
    </>
  );
}
