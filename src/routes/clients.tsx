import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, RefreshCw, Archive, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { cn } from "cn";
import { commands, type Client, type ClientInput } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CLIENT_COLORS, Empty, Field, PageHeader } from "@/components/bits";
import { ClientCard } from "@/components/client-card";
import { useConfirm } from "@/components/confirm";
import { errorMessage, keys, useClients, useCreateClient, useDeleteClient, useUpdateClient } from "@/lib/api";

export const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "PLN", "CHF"];

export const blankClient = (): ClientInput => ({
  name: "",
  color: CLIENT_COLORS[0],
  hourly_rate: 0,
  currency: "CZK",
  pensum_percent: 100,
  workday_hours: 8,
  vat_rate: 21,
  line_description: i18n.t("clients.defaultLineDescription"),
  fakturoid_subject_id: null,
  fakturoid_generator_id: null,
  archived: false,
});

export function ClientsPage() {
  const { t } = useTranslation();
  const { data: clients = [] } = useClients();
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title={t("clients.title")} subtitle={t("clients.subtitle")}>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> {t("clients.newClient")}
        </Button>
      </PageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="pl-7 pr-10 pb-8">
          {clients.length === 0 ? (
            <Empty
              title={t("clients.emptyTitle")}
              hint={t("clients.emptyHint")}
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus /> {t("clients.newClient")}
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {clients.map((c) => (
                <ClientCard key={c.id} client={c} onClick={() => setEditing(c)} />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-medium">{editing === "new" ? t("clients.newClient") : t("clients.editClient")}</DialogTitle>
            <DialogDescription className="sr-only">{t("clients.details")}</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <ClientForm client={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClientForm({ client, onDone }: { client?: Client; onDone: () => void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState<ClientInput>(() =>
    client
      ? {
          name: client.name,
          color: client.color,
          hourly_rate: client.hourly_rate ?? 0,
          currency: client.currency,
          pensum_percent: client.pensum_percent,
          workday_hours: client.workday_hours ?? 8,
          vat_rate: client.vat_rate,
          line_description: client.line_description,
          fakturoid_subject_id: client.fakturoid_subject_id,
          fakturoid_generator_id: client.fakturoid_generator_id,
          archived: client.archived,
        }
      : blankClient(),
  );
  const set = <K extends keyof ClientInput>(k: K, v: ClientInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const create = useCreateClient({ onSuccess: onDone });
  const update = useUpdateClient({ onSuccess: onDone });
  const remove = useDeleteClient({ onSuccess: onDone });
  const confirm = useConfirm();
  const saving = create.isPending || update.isPending;

  const [fxEnabled, setFxEnabled] = useState(false);
  const subjects = useQuery({ queryKey: keys.fxSubjects, queryFn: commands.fakturoidSubjects, enabled: fxEnabled, retry: false });
  const generators = useQuery({ queryKey: keys.fxGenerators, queryFn: commands.fakturoidGenerators, enabled: fxEnabled, retry: false });
  const fxError = subjects.error ?? generators.error;
  const fxLoading = subjects.isFetching || generators.isFetching;

  const submit = () => {
    if (client) update.mutate({ id: client.id, input: form });
    else create.mutate(form);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label={t("clients.name")}>
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme s.r.o." />
        </Field>
        <Field label={t("clients.colour")}>
          <div className="flex h-8 items-center gap-1.5">
            {CLIENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("color", c)}
                className={cn("size-5 rounded-full transition-transform", form.color === c ? "scale-125 ring-2 ring-foreground/60 ring-offset-2 ring-offset-popover" : "hover:scale-110")}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-3">
        <Field label={t("clients.hourlyRate")}>
          <Input type="number" min={0} step={1} value={form.hourly_rate ?? 0} onChange={(e) => set("hourly_rate", Number(e.target.value))} className="font-display text-lg" />
        </Field>
        <Field label={t("clients.currency")}>
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
        <Field label={t("clients.vat")} className="w-20">
          <Input type="number" min={0} max={100} value={form.vat_rate} onChange={(e) => set("vat_rate", Number(e.target.value))} />
        </Field>
      </div>

      <Field label={t("clients.invoiceLine")} hint={t("clients.invoiceLineHint")}>
        <Input value={form.line_description} onChange={(e) => set("line_description", e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("clients.pensum")} hint={t("clients.pensumHint")}>
          <Input type="number" min={0} max={100} step={5} value={form.pensum_percent} onChange={(e) => set("pensum_percent", Number(e.target.value))} />
        </Field>
        <Field label={t("clients.workdayHours")} hint={t("clients.workdayHoursHint")}>
          <Input type="number" min={0.5} max={24} step={0.5} value={form.workday_hours ?? 8} onChange={(e) => set("workday_hours", Number(e.target.value))} />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.035] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fakturoid</span>
          <Button type="button" variant="ghost" size="xs" onClick={() => (fxEnabled ? void subjects.refetch().then(() => generators.refetch()) : setFxEnabled(true))} disabled={fxLoading}>
            {fxLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {fxEnabled ? t("clients.reload") : t("clients.loadFromFakturoid")}
          </Button>
        </div>
        {fxError ? <p className="text-xs text-destructive">{errorMessage(fxError)}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("clients.subject")}>
            {subjects.data ? (
              <Select value={form.fakturoid_subject_id ? String(form.fakturoid_subject_id) : ""} onValueChange={(v) => set("fakturoid_subject_id", v ? Number(v) : null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("clients.pickSubject")} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.data.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input type="number" placeholder={t("clients.subjectId")} value={form.fakturoid_subject_id ?? ""} onChange={(e) => set("fakturoid_subject_id", e.target.value ? Number(e.target.value) : null)} />
            )}
          </Field>
          <Field label={t("clients.generator")}>
            {generators.data ? (
              <Select value={form.fakturoid_generator_id ? String(form.fakturoid_generator_id) : ""} onValueChange={(v) => set("fakturoid_generator_id", v ? Number(v) : null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("clients.pickGenerator")} />
                </SelectTrigger>
                <SelectContent>
                  {generators.data.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input type="number" placeholder={t("clients.generatorId")} value={form.fakturoid_generator_id ?? ""} onChange={(e) => set("fakturoid_generator_id", e.target.value ? Number(e.target.value) : null)} />
            )}
          </Field>
        </div>
      </div>

      {client && (
        <div className="flex items-center justify-between rounded-2xl px-1">
          <label className="flex items-center gap-2 text-sm">
            <Archive className="size-4 text-muted-foreground" /> {t("clients.archived")}
            <Switch checked={form.archived} onCheckedChange={(v) => set("archived", v)} />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: t("clients.deleteTitle", { name: client.name }), description: t("clients.deleteDescription") }))
                remove.mutate(client.id);
            }}
          >
            <Trash2 /> {t("common.delete")}
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {client ? t("common.save") : t("clients.create")}
        </Button>
      </DialogFooter>
    </form>
  );
}
