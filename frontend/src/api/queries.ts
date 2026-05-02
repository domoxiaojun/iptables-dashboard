import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  ChainSpec,
  Family,
  Me,
  RulesResp,
  SnapshotRecord,
  SyncBadge,
  TemplateRecord,
  AuditRecord,
  CounterSample,
  DualStackDiff,
} from '@/types/api';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<Me>('/me'),
    retry: false,
  });
}

export function useRules(family: Family, table?: string) {
  const qs = table ? `?table=${table}` : '';
  return useQuery({
    queryKey: ['rules', family, table],
    queryFn: () => api.get<RulesResp>(`/families/${family}/rules${qs}`),
    refetchInterval: 5000,
  });
}

export function useChains(family: Family, table: string) {
  return useQuery({
    queryKey: ['chains', family, table],
    queryFn: () => api.get<ChainSpec[]>(`/families/${family}/tables/${table}/chains`),
  });
}

export function useSyncBadge() {
  return useQuery({
    queryKey: ['sync-badge'],
    queryFn: () => api.get<SyncBadge>('/diff/sync-badge'),
    refetchInterval: 5000,
  });
}

export function useDualStackDiff() {
  return useQuery({
    queryKey: ['dual-stack-diff'],
    queryFn: () =>
      api.get<{ diff: DualStackDiff }>('/diff/dual-stack').then((r) => r.diff),
    refetchInterval: 10000,
  });
}

export function useSnapshots(limit = 100) {
  return useQuery({
    queryKey: ['snapshots', limit],
    queryFn: () => api.get<SnapshotRecord[]>(`/snapshots?limit=${limit}`),
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<TemplateRecord[]>('/templates'),
  });
}

export function useAudit() {
  return useQuery({
    queryKey: ['audit'],
    queryFn: () => api.get<AuditRecord[]>('/audit'),
  });
}

export function useCounters() {
  return useQuery({
    queryKey: ['counters'],
    queryFn: () => api.get<CounterSample[]>('/stats/counters'),
    refetchInterval: 10000,
  });
}
