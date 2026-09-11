import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Loader2, RefreshCw, Archive, Trash2 } from "lucide-react";
import { cn } from "cn";
import { commands, type Client, type ClientInput } from "@/bindings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CLIENT_COLORS, Empty, Field, PageHeader } from "@/components/bits";
import { useConfirm } from "@/components/confirm";
import { errorMessage, keys, useClients, useCreateClient, useDeleteClient, useUpdateClient } from "@/lib/api";
import { money } from "@/lib/format";

const CURRENCIES = ["CZK", "EUR", "USD", "GBP", "PLN", "CHF"];

const blank = (): ClientInput => ({
  name: "",
  color: CLIENT_COLORS[0],
  hourly_rate: 0,
  currency: "CZK",
  pensum_percent: 100,
  workday_hours: 8,
  vat_rate: 21,
  line_description: "Software development {period}",
  fakturoid_subject_id: null,
  fakturoid_generator_id: null,
  archived: false,
});

export function ClientsPage() {
  const { data: clients = [] } = useClients();
  const [editing, setEditing] = useState<Client | "new" | null>(null);

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Clients" subtitle="Who you work for, what they pay, and where the invoice goes.">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> New client
        </Button>
      </PageHeader>
      <ScrollArea className="min-h-0 flex-1">
        <div className="pl-7 pr-10 pb-8">
          {clients.length === 0 ? (
            <Empty
              title="No clients yet"
              hint="Add the company you bill. You'll need it before logging time."
              action={
                <Button onClick={() => setEditing("new")}>
                  <Plus /> New client
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {clients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setEditing(c)}
                  className={cn(
                    "glass flex flex-col gap-4 rounded-3xl p-6 text-left transition-all hover:shadow-md",
                    c.archived && "opacity-50",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="size-3 rounded-full" style={{ background: c.color }} />
                    <span className="truncate text-lg font-medium">{c.name}</span>
                    {c.archived && <span className="ml-auto text-[11px] tracking-wide text-muted-foreground uppercase">Archived</span>}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="font-display tabular text-3xl">{money(c.hourly_rate, c.currency)}</span>
                    <span className="text-xs text-muted-foreground">/ h · VAT {c.vat_rate}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pensum {c.pensum_percent}% · {c.workday_hours ?? 8}h workday
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.fakturoid_subject_id ? `Subject #${c.fakturoid_subject_id}` : "No Fakturoid subject"}
                    {c.fakturoid_generator_id ? ` · Generator #${c.fakturoid_generator_id}` : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-medium">{editing === "new" ? "New client" : "Edit client"}</DialogTitle>
            <DialogDescription className="sr-only">Client details</DialogDescription>
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
      : blank(),
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
        <Field label="Name">
          <Input autoFocus value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Acme s.r.o." />
        </Field>
        <Field label="Colour">
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
        <Field label="Hourly rate">
          <Input type="number" min={0} step={1} value={form.hourly_rate ?? 0} onChange={(e) => set("hourly_rate", Number(e.target.value))} className="font-display text-lg" />
        </Field>
        <Field label="Currency">
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
        <Field label="VAT %" className="w-20">
          <Input type="number" min={0} max={100} value={form.vat_rate} onChange={(e) => set("vat_rate", Number(e.target.value))} />
        </Field>
      </div>

      <Field label="Invoice line" hint="{period} becomes e.g. 09/2026">
        <Input value={form.line_description} onChange={(e) => set("line_description", e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Pensum %" hint="Share of a full workload you owe this client">
          <Input type="number" min={0} max={100} step={5} value={form.pensum_percent} onChange={(e) => set("pensum_percent", Number(e.target.value))} />
        </Field>
        <Field label="Workday hours" hint="Hours in a full working day, e.g. 8.5">
          <Input type="number" min={0.5} max={24} step={0.5} value={form.workday_hours ?? 8} onChange={(e) => set("workday_hours", Number(e.target.value))} />
        </Field>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-foreground/[0.035] p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Fakturoid</span>
          <Button type="button" variant="ghost" size="xs" onClick={() => (fxEnabled ? void subjects.refetch().then(() => generators.refetch()) : setFxEnabled(true))} disabled={fxLoading}>
            {fxLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {fxEnabled ? "Reload" : "Load from Fakturoid"}
          </Button>
        </div>
        {fxError ? <p className="text-xs text-destructive">{errorMessage(fxError)}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Subject">
            {subjects.data ? (
              <Select value={form.fakturoid_subject_id ? String(form.fakturoid_subject_id) : ""} onValueChange={(v) => set("fakturoid_subject_id", v ? Number(v) : null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick subject" />
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
              <Input type="number" placeholder="Subject ID" value={form.fakturoid_subject_id ?? ""} onChange={(e) => set("fakturoid_subject_id", e.target.value ? Number(e.target.value) : null)} />
            )}
          </Field>
          <Field label="Generator (template)">
            {generators.data ? (
              <Select value={form.fakturoid_generator_id ? String(form.fakturoid_generator_id) : ""} onValueChange={(v) => set("fakturoid_generator_id", v ? Number(v) : null)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick generator" />
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
              <Input type="number" placeholder="Generator ID" value={form.fakturoid_generator_id ?? ""} onChange={(e) => set("fakturoid_generator_id", e.target.value ? Number(e.target.value) : null)} />
            )}
          </Field>
        </div>
      </div>

      {client && (
        <div className="flex items-center justify-between rounded-2xl px-1">
          <label className="flex items-center gap-2 text-sm">
            <Archive className="size-4 text-muted-foreground" /> Archived
            <Switch checked={form.archived} onCheckedChange={(v) => set("archived", v)} />
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={async () => {
              if (await confirm({ title: `Delete ${client.name}?`, description: "Only possible when the client has no time entries. Archive it instead to keep history." }))
                remove.mutate(client.id);
            }}
          >
            <Trash2 /> Delete
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || !form.name.trim()}>
          {client ? "Save" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  );
}
