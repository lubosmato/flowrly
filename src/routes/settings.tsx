import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { Check, Loader2, RefreshCw, ShieldCheck, DatabaseBackup, FolderOpen, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { commands, type AiProvider, type SecretKey, type Settings } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Field, PageHeader } from "@/components/bits";
import { useConfirm } from "@/components/confirm";
import { errorMessage, keys, useAppPaths, useBackupNow, useBackups, useSaveSettings, useSettings } from "@/lib/api";

const PROVIDERS: { value: AiProvider; label: string; model: string; needsKey: boolean }[] = [
  { value: "anthropic", label: "Anthropic", model: "claude-haiku-4-5-20251001", needsKey: true },
  { value: "openai", label: "OpenAI", model: "gpt-5-mini", needsKey: true },
  { value: "gemini", label: "Google Gemini", model: "gemini-2.5-flash", needsKey: true },
  { value: "openrouter", label: "OpenRouter", model: "anthropic/claude-haiku-4.5", needsKey: true },
  { value: "ollama", label: "Ollama (local)", model: "qwen3:8b", needsKey: false },
];

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

function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState<Settings>(initial);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(initial);
  const save = useSaveSettings({ onSuccess: () => toast.success("Settings saved") });
  const provider = PROVIDERS.find((p) => p.value === s.ai_provider)!;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Settings">
        <Button size="sm" onClick={() => save.mutate(s)} disabled={!dirty || save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          Save changes
        </Button>
      </PageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="grid grid-cols-1 gap-5 pl-7 pr-10 pb-10 2xl:grid-cols-2">
          <Section title="AI" hint="Used for day summaries and entry suggestions. Window titles are sent to this provider.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Provider">
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
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Model">
                <Input value={s.ai_model} onChange={(e) => set("ai_model", e.target.value)} />
              </Field>
            </div>
            <Field label="Base URL" hint={s.ai_provider === "ollama" ? "Defaults to http://localhost:11434" : "Leave empty for the provider default"}>
              <Input value={s.ai_base_url} onChange={(e) => set("ai_base_url", e.target.value)} placeholder="optional" />
            </Field>
            {provider.needsKey && <SecretField label="API key" secret="ai_api_key" />}
          </Section>

          <Section title="Fakturoid" hint="Client credentials from Fakturoid → Settings → User account. Stored in the macOS Keychain.">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Client ID">
                <Input value={s.fakturoid_client_id} onChange={(e) => set("fakturoid_client_id", e.target.value)} />
              </Field>
              <Field label="Contact e-mail" hint="Sent in the User-Agent header, as Fakturoid requires">
                <Input type="email" value={s.fakturoid_contact_email} onChange={(e) => set("fakturoid_contact_email", e.target.value)} />
              </Field>
            </div>
            <SecretField label="Client secret" secret="fakturoid_client_secret" />
            <AccountPicker value={s.fakturoid_account_slug} onChange={(v) => set("fakturoid_account_slug", v)} canLoad={!!s.fakturoid_client_id} />
          </Section>

          <Section title="Tracking" hint="Records the focused app and window title every couple of seconds while Flowrly runs.">
            <label className="flex items-center justify-between text-sm">
              Track activity
              <Switch checked={s.tracking_enabled} onCheckedChange={(v) => set("tracking_enabled", v)} />
            </label>
            <label className="flex items-center justify-between text-sm">
              Launch at login
              <Switch checked={s.launch_at_login} onCheckedChange={(v) => set("launch_at_login", v)} />
            </label>
            <Field label="Idle after (seconds)" hint="No keyboard or mouse for this long counts as idle">
              <Input type="number" min={30} max={3600} value={s.idle_threshold_seconds} onChange={(e) => set("idle_threshold_seconds", Number(e.target.value))} className="w-32" />
            </Field>
            <Field label="Ignored apps" hint="One per line. Time is counted, but app and window are not recorded.">
              <Textarea rows={3} value={s.ignored_apps.join("\n")} onChange={(e) => set("ignored_apps", e.target.value.split("\n"))} />
            </Field>
            <div className="flex items-center justify-between rounded-2xl bg-foreground/[0.035] p-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <ShieldCheck className="size-4" /> Window titles need Screen Recording permission on macOS.
              </span>
              <Button variant="outline" size="xs" onClick={() => commands.openScreenRecordingSettings()}>
                Open System Settings
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
      toast.success(value ? `${label} saved to Keychain` : `${label} removed`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Field label={label} hint={has.data ? "A key is stored. Enter a new one to replace it, or save empty to remove." : "Not set"}>
      <div className="flex gap-2">
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={has.data ? "••••••••••••" : ""} autoComplete="off" />
        <Button variant="outline" onClick={submit} disabled={saving || (!value && !has.data)}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          {value ? "Save" : "Remove"}
        </Button>
      </div>
    </Field>
  );
}

function AccountPicker({ value, onChange, canLoad }: { value: string; onChange: (v: string) => void; canLoad: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const accounts = useQuery({ queryKey: keys.fxAccounts, queryFn: commands.fakturoidAccounts, enabled, retry: false });
  useEffect(() => {
    if (accounts.data && accounts.data.length === 1 && !value) onChange(accounts.data[0].slug);
  }, [accounts.data, value, onChange]);
  return (
    <Field label="Account" hint={accounts.error ? errorMessage(accounts.error) : "Save your client ID and secret first, then load accounts."}>
      <div className="flex gap-2">
        {accounts.data ? (
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Pick account" />
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
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="account slug" />
        )}
        <Button variant="outline" onClick={() => (enabled ? accounts.refetch() : setEnabled(true))} disabled={!canLoad || accounts.isFetching}>
          {accounts.isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Load
        </Button>
      </div>
    </Field>
  );
}

function BackupsSection({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: backups = [] } = useBackups();
  const { data: paths } = useAppPaths();
  const backupNow = useBackupNow({ onSuccess: () => toast.success("Backup written") });
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
      title: "Restore this backup?",
      description: "The current database is replaced and Flowrly restarts. A snapshot of the current state is not taken automatically.",
      action: "Restore and restart",
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
    <Section title="Backups" hint="A snapshot is taken on launch and daily, keeping the last 30. Save the folder, then restart.">
      <Field label="Backup folder" hint={paths ? `Database: ${paths[0]}` : undefined}>
        <div className="flex gap-2">
          <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={paths?.[1] ?? "default"} />
          <Button variant="outline" size="icon" onClick={pickDir} aria-label="Choose folder">
            <FolderOpen />
          </Button>
        </div>
      </Field>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => backupNow.mutate(undefined)} disabled={backupNow.isPending}>
          {backupNow.isPending ? <Loader2 className="animate-spin" /> : <DatabaseBackup />}
          Back up now
        </Button>
        <Button variant="ghost" size="sm" onClick={() => restore()} disabled={restoring}>
          <RotateCcw /> Restore from file…
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
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
