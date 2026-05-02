import * as React from 'react';
import { useUiStore } from '@/store/ui';
import { useRules } from '@/api/queries';
import { useApply } from '@/api/apply';
import { useEventSource } from '@/lib/useEventSource';
import { FamilySwitcher } from '@/components/rules/FamilySwitcher';
import { RuleTable } from '@/components/rules/RuleTable';
import { RuleEditDialog } from '@/components/rules/RuleEditDialog';
import { TwoStepConfirmModal } from '@/components/rules/TwoStepConfirmModal';
import { ICMPv6GuardModal } from '@/components/rules/ICMPv6GuardBanner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { CounterSample, Family, Mutation, Rule, TableKind } from '@/types/api';

const TABLES: TableKind[] = ['filter', 'nat', 'mangle', 'raw'];

export const RulesPage: React.FC = () => {
  const family = useUiStore((s) => s.family);
  const setTable = useUiStore((s) => s.setTable);
  const tableSel = useUiStore((s) => s.table) as TableKind;
  const [chain, setChain] = React.useState<string>('INPUT');
  const [filter, setFilter] = React.useState<string>('');
  const [staged, setStaged] = React.useState<Mutation[]>([]);
  const [editor, setEditor] = React.useState<{ open: boolean; rule?: Rule }>({
    open: false,
  });

  const familyForList: Family = family === 'both' ? 'v4' : family;
  const { data, isLoading, error, refetch } = useRules(familyForList, tableSel);
  const tableEntry = data?.tables.find((t) => t.kind === tableSel);
  const rulesAll = tableEntry?.rules ?? [];
  const rules = filter
    ? rulesAll.filter((r) => r.raw.includes(filter) || r.chain.includes(filter))
    : rulesAll;

  const chainsAvailable = Array.from(
    new Set([
      ...(tableEntry?.chains.map((c) => c.name) ?? []),
      ...rulesAll.map((r) => r.chain),
    ]),
  );
  React.useEffect(() => {
    if (!chainsAvailable.includes(chain) && chainsAvailable[0]) {
      setChain(chainsAvailable[0]);
    }
  }, [chainsAvailable, chain]);
  const visibleRules = rules.filter((r) => r.chain === chain);
  const policy = tableEntry?.chains.find((c) => c.name === chain)?.policy;

  const apply = useApply({
    invalidateKeys: [['rules', familyForList, tableSel], ['sync-badge']],
    onSuccess: () => {
      setStaged([]);
      refetch();
    },
    label: `apply via RulesPage (${familyForList}/${tableSel}/${chain})`,
  });

  // SSE live counters
  const liveCountersRef = React.useRef(new Map<string, CounterSample>());
  const [liveTick, setLiveTick] = React.useState(0);
  const [liveOn, setLiveOn] = React.useState(true);
  React.useEffect(() => {
    liveCountersRef.current.clear();
  }, [familyForList, tableSel, chain]);
  const sseHandlers = React.useMemo(
    () => ({
      counter: (data: string) => {
        try {
          const sample = JSON.parse(data) as CounterSample;
          liveCountersRef.current.set(
            `${sample.family}:${sample.table}:${sample.chain}:${sample.seq}`,
            sample,
          );
        } catch {
          /* ignore */
        }
      },
    }),
    [],
  );
  const sse = useEventSource({
    url: '/api/v1/stats/stream',
    handlers: sseHandlers,
    paused: !liveOn,
  });
  React.useEffect(() => {
    if (!liveOn) return;
    const id = window.setInterval(() => setLiveTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [liveOn]);

  const stageMutation = (m: Mutation) => setStaged((s) => [...s, m]);
  const onEdit = (r: Rule) => setEditor({ open: true, rule: r });
  const onDelete = (r: Rule) => {
    if (!confirm(`将「${r.raw}」加入暂存删除列表？`)) return;
    stageMutation({
      kind: 'delete',
      family: familyForList,
      table: tableSel,
      chain: r.chain,
      seq: r.seq,
    });
  };
  const onReorder = (newSeqOrder: number[]) => {
    setStaged((s) => {
      const filtered = s.filter(
        (m) =>
          !(
            m.kind === 'reorder' &&
            m.family === familyForList &&
            m.table === tableSel &&
            m.chain === chain
          ),
      );
      return [
        ...filtered,
        {
          kind: 'reorder',
          family: familyForList,
          table: tableSel,
          chain,
          seq_order: newSeqOrder,
        },
      ];
    });
  };
  const onApply = () => {
    if (staged.length === 0) return;
    apply.run(staged);
  };

  return (
    <div className="space-y-6">
      {apply.pending && (
        <TwoStepConfirmModal
          token={apply.pending.token}
          expiresAt={apply.pending.expires_at}
          graceSeconds={apply.pending.grace_seconds}
          onResolved={apply.onResolved}
        />
      )}
      {apply.guardBlock && (
        <ICMPv6GuardModal
          warnings={apply.guardBlock.warnings}
          onConfirm={apply.proceedWithForce}
          onCancel={apply.cancelGuard}
          busy={apply.busy}
        />
      )}

      <RuleEditDialog
        open={editor.open}
        onOpenChange={(o) => setEditor({ open: o })}
        family={familyForList}
        table={tableSel}
        chain={chain}
        initial={editor.rule}
        onSubmit={stageMutation}
      />

      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink-strong">
            规则
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            通过两步激活管理规则。所有变更必须经过 preview · apply · confirm 三步。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FamilySwitcher />
          <Button onClick={() => setEditor({ open: true })}>
            <PlusIcon /> 新建规则
          </Button>
        </div>
      </header>

      {/* Toolbar — table tabs + search */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--c-hairline)] bg-canvas-card px-4 py-3 shadow-1">
        <nav className="flex gap-0.5 rounded-md bg-canvas-soft p-1">
          {TABLES.map((t) => (
            <button
              key={t}
              onClick={() => setTable(t)}
              className={cn(
                'h-7 rounded-sm px-3 text-xs font-semibold capitalize',
                'transition-all duration-fast ease-out',
                tableSel === t
                  ? 'bg-canvas-card text-ink-strong shadow-1'
                  : 'text-ink-muted hover:text-ink-strong',
              )}
            >
              {t}
            </button>
          ))}
        </nav>

        <div className="h-5 w-px bg-[var(--c-hairline)]" />

        <select
          className={cn(
            'h-8 appearance-none rounded-md border border-[var(--c-hairline-input)] bg-canvas-card pl-3 pr-8 text-xs font-medium',
            'hover:border-ink/30 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:outline-none',
          )}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238B95A3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")",
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
          value={chain}
          onChange={(e) => setChain(e.target.value)}
        >
          {chainsAvailable.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {policy && (
          <Badge variant="outline">
            默认 <span className="ml-1 font-mono text-[10px]">{policy}</span>
          </Badge>
        )}
        <Badge variant="neutral">
          {visibleRules.length} 条
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="搜索规则…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            leading={<SearchIcon />}
            className="w-64"
          />

          <label className="flex select-none items-center gap-1.5 rounded-md border border-[var(--c-hairline)] bg-canvas-card px-2.5 py-1.5 text-xs">
            <input
              type="checkbox"
              checked={liveOn}
              onChange={(e) => setLiveOn(e.target.checked)}
              className="h-3 w-3 cursor-pointer accent-brand"
            />
            <span className="text-ink-muted">实时</span>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                sse.state === 'open'
                  ? 'bg-success pulse-ring'
                  : sse.state === 'reconnecting'
                    ? 'bg-warn'
                    : 'bg-ink-faint',
              )}
            />
          </label>
        </div>
      </div>

      {/* Staged drawer (only when there are mutations) */}
      {staged.length > 0 && (
        <StagedDrawer
          staged={staged}
          busy={apply.busy}
          onRemove={(idx) => setStaged((s) => s.filter((_, i) => i !== idx))}
          onClear={() => setStaged([])}
          onApply={onApply}
        />
      )}

      {apply.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-tint/40 px-4 py-3 text-sm text-danger">
          ⚠ {apply.error}
        </div>
      )}

      {/* Rules */}
      {isLoading ? (
        <SkeletonRows />
      ) : error ? (
        <div className="rounded-lg border border-danger/30 bg-danger-tint/40 px-4 py-3 text-sm text-danger">
          加载失败：{(error as Error).message}
        </div>
      ) : (
        <RuleTable
          key={liveTick}
          rules={visibleRules}
          onEdit={onEdit}
          onDelete={onDelete}
          onReorder={onReorder}
          liveCounters={liveOn ? liveCountersRef.current : undefined}
        />
      )}
    </div>
  );
};

const StagedDrawer: React.FC<{
  staged: Mutation[];
  busy: boolean;
  onRemove: (i: number) => void;
  onClear: () => void;
  onApply: () => void;
}> = ({ staged, busy, onRemove, onClear, onApply }) => (
  <div className="relative overflow-hidden rounded-xl border border-[var(--c-hairline)] bg-canvas-card shadow-3">
    <span aria-hidden className="absolute inset-x-0 top-0 h-1 bg-grad-brand" />
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-3">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-ink-strong">
          暂存变更
        </h3>
        <span className="grid h-5 min-w-[20px] place-items-center rounded-pill bg-brand-tint px-1.5 text-2xs font-bold text-brand">
          {staged.length}
        </span>
        <p className="text-sm text-ink-muted">
          尚未应用到内核
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClear} disabled={busy}>
          全部丢弃
        </Button>
        <Button variant="gradient" onClick={onApply} disabled={busy}>
          {busy ? '应用中…' : `应用 ${staged.length} 项`}
        </Button>
      </div>
    </header>
    <ul className="border-t border-[var(--c-hairline)]">
      {staged.map((m, idx) => (
        <li
          key={idx}
          className={cn(
            'grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 px-6 py-3.5',
            'border-b border-[var(--c-hairline)] last:border-b-0',
            'hover:bg-canvas-tint transition-colors duration-fast',
          )}
        >
          <OpChip kind={m.kind} />
          <div className="min-w-0">
            <div className="truncate font-mono text-xs text-ink">
              {describeMutation(m)}
            </div>
            <div className="text-2xs text-ink-dim">
              {captionForMutation(m)}
            </div>
          </div>
          <button
            onClick={() => onRemove(idx)}
            className="grid h-7 w-7 place-items-center rounded-md border border-[var(--c-hairline)] bg-canvas-card text-ink-dim hover:border-danger hover:bg-danger-tint hover:text-danger transition-colors duration-fast"
            title="移除"
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  </div>
);

const OpChip: React.FC<{ kind: Mutation['kind'] }> = ({ kind }) => {
  const map = {
    create: { label: '+', cls: 'bg-success-tint text-success' },
    update: { label: '~', cls: 'bg-warn-tint text-warn' },
    delete: { label: '−', cls: 'bg-danger-tint text-danger' },
    reorder: { label: '↕', cls: 'bg-info-tint text-info' },
  } as const;
  const m = map[kind];
  return (
    <span
      className={cn(
        'grid h-8 w-8 place-items-center rounded-md font-mono text-sm font-bold',
        m.cls,
      )}
    >
      {m.label}
    </span>
  );
};

function describeMutation(m: Mutation): string {
  switch (m.kind) {
    case 'create':
      return `${m.family}/${m.table}/${m.chain}: ${specSummary(m.spec)}`;
    case 'update':
      return `${m.family}/${m.table}/${m.chain}#${m.seq + 1}: ${specSummary(m.spec)}`;
    case 'delete':
      return `${m.family}/${m.table}/${m.chain}#${m.seq + 1}`;
    case 'reorder':
      return `${m.family}/${m.table}/${m.chain}: ${m.seq_order.length} 条重排`;
  }
}

function captionForMutation(m: Mutation): string {
  switch (m.kind) {
    case 'create':
      return `新建规则${m.also_for_other_family ? ' · 同时写入双栈' : ''}`;
    case 'update':
      return '修改现有规则';
    case 'delete':
      return '删除现有规则';
    case 'reorder':
      return '调整链内顺序';
  }
}

function specSummary(spec: import('@/types/api').RuleSpec): string {
  const parts: string[] = [];
  if (spec.protocol) parts.push(`-p ${spec.protocol}`);
  if (spec.source) parts.push(`-s ${spec.source}`);
  if (spec.destination) parts.push(`-d ${spec.destination}`);
  if (spec.in_interface) parts.push(`-i ${spec.in_interface}`);
  if (spec.out_interface) parts.push(`-o ${spec.out_interface}`);
  if (spec.dport) parts.push(`--dport ${spec.dport}`);
  if (spec.sport) parts.push(`--sport ${spec.sport}`);
  if (spec.jump) parts.push(`-j ${spec.jump}`);
  return parts.join(' ');
}

const SkeletonRows: React.FC = () => (
  <div className="overflow-hidden rounded-lg border border-[var(--c-hairline)]">
    {[0, 1, 2, 3, 4].map((i) => (
      <div
        key={i}
        className="flex items-center gap-4 border-b border-[var(--c-hairline)] px-6 py-4 last:border-b-0"
      >
        <div className="h-6 w-8 animate-pulse rounded-md bg-canvas-soft" />
        <div className="h-4 flex-1 animate-pulse rounded-md bg-canvas-soft" />
        <div className="h-5 w-16 animate-pulse rounded-pill bg-canvas-soft" />
        <div className="h-4 w-24 animate-pulse rounded-md bg-canvas-soft" />
      </div>
    ))}
  </div>
);

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
