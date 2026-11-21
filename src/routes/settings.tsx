import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2, RefreshCw, ShieldCheck, DatabaseBackup, FolderOpen, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { commands, type SecretKey, type Settings } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Field, PageHeader } from "@/components/bits";
import { useConfirm } from "@/components/confirm";
import { ONBOARDING_PATH } from "@/components/root";
import { PROVIDERS, providerLabel } from "@/lib/ai-providers";
import { LANGUAGES, LANGUAGE_NAMES, resolveLanguage } from "@/i18n";
import { errorMessage, keys, useAppPaths, useBackupNow, useBackups, useSaveSettings, useSettings } from "@/lib/api";

export function SettingsPage() {
  const { data: settings } = useSettings();
  if (!settings) return null;
  return <SettingsForm key={JSON.stringify(settings)} initial={settings} />;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="glass flex flex-col gap-4 rounded-3xl p-6">
      <div>
        <h2 className="font-display text-xl">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/** Radix Select can't hold "" as an item value; "" (follow the OS / the app) is shown as this. */
const DEFAULT_LANGUAGE = "default";

function SettingsForm({ initial }: { initial: Settings }) {
  const { t } = useTranslation();
  const [s, setS] = useState<Settings>(initial);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const save = useSaveSettings({ onSuccess: () => toast.success(t("settings.saved")) });
  const navigate = useNavigate();
  const provider = PROVIDERS.find((p) => p.value === s.ai_provider)!;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("settings.title")}>
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: ONBOARDING_PATH })} title={t("settings.replayHint")}>
          <Sparkles /> {t("settings.replay")}
        </Button>
        <Button size="sm" onClick={() => save.mutate(s)} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("settings.saveChanges")}
        </Button>
      </PageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-1 gap-5 pl-7 pr-10 pb-10 2xl:grid-cols-2">
          <Section title={t("common.language")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.language.app")}>
                <Select value={s.language || DEFAULT_LANGUAGE} onValueChange={(v) => set("language", v === DEFAULT_LANGUAGE ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_LANGUAGE}>{t("common.systemLanguage", { language: LANGUAGE_NAMES[resolveLanguage("")] })}</SelectItem>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LANGUAGE_NAMES[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("settings.language.ai")}>
                <Select value={s.ai_language || DEFAULT_LANGUAGE} onValueChange={(v) => set("ai_language", v === DEFAULT_LANGUAGE ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_LANGUAGE}>{t("settings.language.aiSameAsApp")}</SelectItem>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {LANGUAGE_NAMES[l]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.language.aiHint")}</p>
          </Section>

          <Section title={t("settings.ai.title")} hint={t("settings.ai.hint")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.ai.provider")}>
                <Select
                  value={s.ai_provider}
                  onValueChange={(v) => {
                    const p = PROVIDERS.find((x) => x.value === v)!;
                    set("ai_provider", p.value);
                    set("ai_model", p.model);
                    set("ai_base_url", "");
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
              <Field label={t("settings.ai.model")}>
                <Input value={s.ai_model} onChange={(e) => set("ai_model", e.target.value)} />
              </Field>
            </div>
            <Field label={t("settings.ai.baseUrl")} hint={s.ai_provider === "ollama" ? t("settings.ai.baseUrlOllamaHint", { url: "http://localhost:11434" }) : t("settings.ai.baseUrlHint")}>
              <Input value={s.ai_base_url} onChange={(e) => set("ai_base_url", e.target.value)} placeholder={t("settings.ai.optional")} />
            </Field>
            {provider.needsKey && <SecretField label={t("settings.ai.apiKey")} secret="ai_api_key" />}
          </Section>

          <Section title="Fakturoid" hint={t("settings.fakturoid.hint")}>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("settings.fakturoid.clientId")}>
                <Input value={s.fakturoid_client_id} onChange={(e) => set("fakturoid_client_id", e.target.value)} />
              </Field>
              <Field label={t("settings.fakturoid.contactEmail")} hint={t("settings.fakturoid.contactEmailHint")}>
                <Input type="email" value={s.fakturoid_contact_email} onChange={(e) => set("fakturoid_contact_email", e.target.value)} />
              </Field>
            </div>
            <SecretField label={t("settings.fakturoid.clientSecret")} secret="fakturoid_client_secret" />
            <AccountPicker value={s.fakturoid_account_slug} onChange={(v) => set("fakturoid_account_slug", v)} canLoad={!!s.fakturoid_client_id} />
          </Section>

          <Section title={t("settings.tracking.title")} hint={t("settings.tracking.hint")}>
            <label className="flex items-center justify-between text-sm">
              {t("settings.tracking.trackActivity")}
              <Switch checked={s.tracking_enabled} onCheckedChange={(v) => set("tracking_enabled", v)} />
            </label>
            <label className="flex items-center justify-between text-sm">
              {t("settings.tracking.launchAtLogin")}
              <Switch checked={s.launch_at_login} onCheckedChange={(v) => set("launch_at_login", v)} />
            </label>
            <Field label={t("settings.tracking.idleAfter")} hint={t("settings.tracking.idleAfterHint")}>
              <Input type="number" min={30} max={3600} value={s.idle_threshold_seconds} onChange={(e) => set("idle_threshold_seconds", Number(e.target.value))} className="w-32" />
            </Field>
            <Field label={t("settings.tracking.ignoredApps")} hint={t("settings.tracking.ignoredAppsHint")}>
              <Textarea rows={3} value={s.ignored_apps.join("\n")} onChange={(e) => set("ignored_apps", e.target.value.split("\n"))} />
            </Field>
            <div className="flex items-center justify-between rounded-2xl bg-foreground/[0.035] p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4" /> {t("settings.tracking.accessibility")}
              </span>
              <Button variant="outline" size="xs" onClick={() => commands.openAccessibilitySettings()}>
                {t("settings.tracking.openSystemSettings")}
              </Button>
            </div>
          </Section>

          <BackupsSection value={s.backup_dir} onChange={(v) => set("backup_dir", v)} />
        </div>
      </ScrollArea>
    </div>
  );
}

function SecretField({ label, secret }: { label: string; secret: SecretKey }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const has = useQuery({ queryKey: keys.secret(secret), queryFn: () => commands.hasSecret(secret) });
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setSaving(true);
    try {
      await commands.setSecret(secret, value);
      setValue("");
      await qc.invalidateQueries({ queryKey: keys.secret(secret) });
      toast.success(value ? t("settings.secret.saved", { label }) : t("settings.secret.removed", { label }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Field label={label} hint={has.data ? t("settings.secret.storedHint") : t("settings.secret.notSet")}>
      <div className="flex gap-2">
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={has.data ? "••••••••••••" : ""} autoComplete="off" />
        <Button variant="outline" onClick={submit} disabled={saving || (!value && !has.data)}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {value ? t("common.save") : t("settings.secret.remove")}
        </Button>
      </div>
    </Field>
  );
}

function AccountPicker({ value, onChange, canLoad }: { value: string; onChange: (v: string) => void; canLoad: boolean }) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const accounts = useQuery({ queryKey: keys.fxAccounts, queryFn: commands.fakturoidAccounts, enabled, retry: false });
  useEffect(() => {
    if (accounts.data && accounts.data.length === 1 && !value) onChange(accounts.data[0].slug);
  }, [accounts.data, value, onChange]);
  return (
    <Field label={t("settings.fakturoid.account")} hint={accounts.error ? errorMessage(accounts.error) : t("settings.fakturoid.accountHint")}>
      <div className="flex gap-2">
        {accounts.data ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("settings.fakturoid.pickAccount")} />
            </SelectTrigger>
            <SelectContent>
              {accounts.data.map((a) => (
                <SelectItem key={a.slug} value={a.slug}>
                  {a.name} · {a.slug}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={t("settings.fakturoid.accountSlug")} />
        )}
        <Button variant="outline" onClick={() => (enabled ? accounts.refetch() : setEnabled(true))} disabled={!canLoad || accounts.isFetching}>
          {accounts.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {t("settings.fakturoid.load")}
        </Button>
      </div>
    </Field>
  );
}

function BackupsSection({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { data: backups = [] } = useBackups();
  const { data: paths } = useAppPaths();
  const backupNow = useBackupNow({ onSuccess: () => toast.success(t("settings.backups.written")) });
  const [restoring, setRestoring] = useState(false);
  const confirm = useConfirm();

  const pickDir = async () => {
    const dir = await open({ directory: true, multiple: false, defaultPath: paths?.[1] });
    if (typeof dir === "string") onChange(dir);
  };

  const restore = async (path?: string) => {
    let file = path;
    if (!file) {
      const picked = await open({ multiple: false, filters: [{ name: "SQLite", extensions: ["db"] }], defaultPath: paths?.[1] });
      if (typeof picked !== "string") return;
      file = picked;
    }
    const ok = await confirm({
      title: t("settings.backups.restoreTitle"),
      description: t("settings.backups.restoreDescription"),
      action: t("settings.backups.restoreAction"),
    });
    if (!ok) return;
    setRestoring(true);
    try {
      await commands.restoreBackup(file);
    } catch (e) {
      toast.error(errorMessage(e));
      setRestoring(false);
    }
  };

  return (
    <Section title={t("settings.backups.title")} hint={t("settings.backups.hint")}>
      <Field label={t("settings.backups.folder")} hint={paths ? t("settings.backups.database", { path: paths[0] }) : undefined}>
        <div className="flex gap-2">
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={paths?.[1] ?? t("settings.backups.default")} />
          <Button variant="outline" size="icon" onClick={pickDir} aria-label={t("settings.backups.chooseFolder")}>
            <FolderOpen />
          </Button>
        </div>
      </Field>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => backupNow.mutate(undefined)} disabled={backupNow.isPending}>
          {backupNow.isPending ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
          {t("settings.backups.backUpNow")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => restore()} disabled={restoring}>
          <RotateCcw /> {t("settings.backups.restoreFromFile")}
        </Button>
      </div>
      {backups.length > 0 && (
        <ul className="flex max-h-48 flex-col gap-1 overflow-auto text-xs">
          {backups.map((b) => (
            <li key={b.path} className="group flex items-center justify-between rounded-lg px-2 py-1 hover:bg-foreground/[0.04]">
              <span className="tabular">
                {b.created_at} <span className="text-muted-foreground">· {(b.size_bytes / 1024).toFixed(0)} KB</span>
              </span>
              <Button variant="ghost" size="xs" className="opacity-0 group-hover:opacity-100" onClick={() => restore(b.path)} disabled={restoring}>
                {t("settings.backups.restore")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
