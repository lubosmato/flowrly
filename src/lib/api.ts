import { useMutation, useQuery, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { toast } from "sonner";
import { commands, type AppError, type ClientInput, type EntryFilter, type Settings, type TimeEntryInput } from "@/bindings";
import { isoDay } from "@/lib/format";

/** Today's activity keeps growing while the tracker runs; past days never change. */
const LIVE_REFETCH_MS = 30_000;
const liveRefetch = (day: string) => (day === isoDay(new Date()) ? LIVE_REFETCH_MS : false);

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "kind" in e && "message" in e) {
    return String((e as AppError).message);
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export const keys = {
  clients: ["clients"] as const,
  entries: (f: EntryFilter) => ["entries", f] as const,
  dayTotals: (from: string, to: string) => ["dayTotals", from, to] as const,
  settings: ["settings"] as const,
  secret: (k: string) => ["secret", k] as const,
  dayActivity: (d: string) => ["dayActivity", d] as const,
  trackedDays: (from: string, to: string) => ["trackedDays", from, to] as const,
  daySummary: (d: string) => ["daySummary", d] as const,
  daySummaries: (from: string, to: string) => ["daySummaries", from, to] as const,
  tags: ["tags"] as const,
  backups: ["backups"] as const,
  paths: ["paths"] as const,
  fxAccounts: ["fx", "accounts"] as const,
  fxSubjects: ["fx", "subjects"] as const,
  fxGenerators: ["fx", "generators"] as const,
};

export const useClients = () => useQuery({ queryKey: keys.clients, queryFn: commands.listClients });
export const useEntries = (filter: EntryFilter) =>
  useQuery({ queryKey: keys.entries(filter), queryFn: () => commands.listEntries(filter) });
export const useDayTotals = (from: string, to: string) =>
  useQuery({ queryKey: keys.dayTotals(from, to), queryFn: () => commands.dayTotals(from, to) });
export const useSettings = () => useQuery({ queryKey: keys.settings, queryFn: commands.getSettings });
export const useDayActivity = (day: string) =>
  useQuery({
    queryKey: keys.dayActivity(day),
    queryFn: () => commands.getDayActivity(day),
    staleTime: 30_000,
    refetchInterval: liveRefetch(day),
  });
export const useTrackedDays = (from: string, to: string) =>
  useQuery({ queryKey: keys.trackedDays(from, to), queryFn: () => commands.trackedDays(from, to), staleTime: 60_000 });
export const useDaySummary = (day: string) =>
  useQuery({ queryKey: keys.daySummary(day), queryFn: () => commands.getDaySummary(day) });
export const useDaySummaries = (from: string, to: string) =>
  useQuery({ queryKey: keys.daySummaries(from, to), queryFn: () => commands.listDaySummaries(from, to) });
export const useTags = () => useQuery({ queryKey: keys.tags, queryFn: commands.listTags });
export const useBackups = () => useQuery({ queryKey: keys.backups, queryFn: commands.listBackups });
export const useAppPaths = () => useQuery({ queryKey: keys.paths, queryFn: commands.appPaths });

function useInvalidating<TData, TVars>(
  fn: (v: TVars) => Promise<TData>,
  invalidate: readonly (readonly unknown[])[],
  opts?: Omit<UseMutationOptions<TData, unknown, TVars>, "mutationFn">,
) {
  const qc = useQueryClient();
  return useMutation<TData, unknown, TVars>({
    mutationFn: fn,
    ...opts,
    onSuccess: async (data, vars, ctx, mut) => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      await opts?.onSuccess?.(data, vars, ctx, mut);
    },
    onError: (e, vars, ctx, mut) => {
      toast.error(errorMessage(e));
      opts?.onError?.(e, vars, ctx, mut);
    },
  });
}

const ENTRY_KEYS = [["entries"], ["dayTotals"]] as const;

export const useCreateEntry = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating((input: TimeEntryInput) => commands.createEntry(input), ENTRY_KEYS, opts);
export const useUpdateEntry = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating(({ id, input }: { id: number; input: TimeEntryInput }) => commands.updateEntry(id, input), ENTRY_KEYS, opts);
export const useDeleteEntry = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating((id: number) => commands.deleteEntry(id), ENTRY_KEYS, opts);

export const useCreateClient = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating((input: ClientInput) => commands.createClient(input), [keys.clients], opts);
export const useUpdateClient = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating(({ id, input }: { id: number; input: ClientInput }) => commands.updateClient(id, input), [keys.clients], opts);
export const useDeleteClient = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating((id: number) => commands.deleteClient(id), [keys.clients], opts);

export const useSaveSettings = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating((s: Settings) => commands.saveSettings(s), [keys.settings], opts);

export const useGenerateDaySummary = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating((day: string) => commands.generateDaySummary(day), [["daySummary"], ["daySummaries"], ["trackedDays"], keys.tags], opts);

export const useBackupNow = (opts?: Parameters<typeof useInvalidating>[2]) =>
  useInvalidating(() => commands.backupNow(), [keys.backups], opts);
