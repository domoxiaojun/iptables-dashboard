import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { GradientText } from '@/components/react-bits/GradientText';
import { useSyncBadge, useSnapshots, useCounters } from '@/api/queries';
import { formatBytes, formatNumber, formatTs } from '@/lib/utils';
import { cn } from '@/lib/utils';

export const DashboardPage: React.FC = () => {
  const { data: badge } = useSyncBadge();
  const { data: snaps } = useSnapshots(5);
  const { data: counters } = useCounters();
  const navigate = useNavigate();

  const top = React.useMemo(() => {
    if (!counters) return [];
    return [...counters].sort((a, b) => b.bytes - a.bytes).slice(0, 8);
  }, [counters]);

  const drift = (badge?.mismatched ?? 0) > 0;

  return (
    <div className="space-y-7">
      {/* Hero */}
      <div className="rise-in relative overflow-hidden rounded-xl border border-[var(--c-hairline)] bg-canvas-card p-7 shadow-2">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-grad-brand opacity-10 blur-3xl"
        />
        <div className="relative flex items-start justify-between gap-6">
          <div>
            <div
              className={cn(
                'mb-3 inline-flex items-center gap-2 rounded-pill px-3 py-1 text-xs font-semibold',
                drift
                  ? 'bg-danger-tint text-danger'
                  : 'bg-success-tint text-success',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full bg-current', !drift && 'pulse-ring')} />
              {drift ? `双栈不同步 · ${badge?.mismatched} 条` : '一切就绪'}
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-ink-strong">
              当前共 <GradientText>{(badge?.v4_count ?? 0) + (badge?.v6_count ?? 0)} 条规则</GradientText>
              <br />
              在守护这台主机
            </h1>
            <p className="mt-2 max-w-lg text-sm text-ink-muted">
              IPv4 与 IPv6 双栈实时同步。每次 apply 都会自动留底，30 秒内未确认自动回滚。
            </p>
          </div>
          <div className="hidden md:block">
            <Button onClick={() => navigate({ to: '/rules' as '/' })}>
              进入规则编辑 →
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="IPv4 规则" value={badge?.v4_count} delta="+ 同步中" tone="ok" />
        <Stat label="IPv6 规则" value={badge?.v6_count} delta="±0" tone="dim" />
        <Stat
          label="不同步"
          value={badge?.mismatched}
          delta={drift ? '需检查双栈差异' : '无漂移'}
          tone={drift ? 'alert' : 'ok'}
          onClick={() => navigate({ to: '/diff' as '/' })}
        />
        <Stat
          label="累计流量"
          value={top.reduce((s, c) => s + c.bytes, 0)}
          formatter={formatBytes}
          delta="实时累加"
          tone="ok"
        />
      </div>

      {/* Lower row */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Top hits — span 2 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>命中流量 Top 8</CardTitle>
              <Badge variant="outline">按字节</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {top.length === 0 ? (
              <EmptyHint>暂未观察到流量。打开新连接试试。</EmptyHint>
            ) : (
              <ul className="space-y-1">
                {top.map((c, i) => {
                  const max = top[0]?.bytes ?? 1;
                  const pct = Math.max(2, (c.bytes / max) * 100);
                  return (
                    <li
                      key={i}
                      className="grid grid-cols-[28px_minmax(0,1fr)_140px_120px] items-center gap-3 rounded-md px-2 py-2 hover:bg-canvas-tint transition-colors duration-fast"
                    >
                      <span className="font-mono text-2xs text-ink-dim">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span className="truncate font-mono text-xs text-ink">
                        <span className="text-ink-dim mr-1">[{c.family}]</span>
                        {c.table}/{c.chain} #{c.seq + 1}
                      </span>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft">
                        <div
                          className="h-full rounded-full bg-grad-brand transition-all duration-med ease-out"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-right font-mono text-xs tabular text-ink-muted">
                        <span className="font-semibold text-ink-strong">
                          {formatNumber(c.packets)}
                        </span>
                        <span className="ml-1.5 text-ink-dim">
                          {formatBytes(c.bytes)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent snapshots */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>最近快照</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate({ to: '/snapshots' as '/' })}
              >
                查看全部 →
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!snaps || snaps.length === 0 ? (
              <EmptyHint>还没有快照。在「规则」页应用一次变更就会自动留底。</EmptyHint>
            ) : (
              <ul className="space-y-2.5">
                {snaps.map((s) => (
                  <li key={s.id} className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-2xs text-ink-dim">
                        #{s.id}
                      </span>
                      <span className="truncate text-sm font-medium text-ink-strong">
                        {s.label}
                      </span>
                    </div>
                    <div className="text-2xs text-ink-dim">
                      {formatTs(s.created_at)} · {s.author}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const Stat: React.FC<{
  label: string;
  value: number | undefined;
  delta?: string;
  tone?: 'ok' | 'alert' | 'dim';
  formatter?: (n: number) => string;
  onClick?: () => void;
}> = ({ label, value, delta, tone = 'ok', formatter, onClick }) => {
  const toneCls =
    tone === 'alert'
      ? 'text-danger'
      : tone === 'dim'
        ? 'text-ink-strong'
        : 'text-ink-strong';
  const formatted =
    value === undefined ? '—' : formatter ? formatter(value) : formatNumber(value);

  const Wrap: React.ElementType = onClick ? 'button' : 'div';

  return (
    <Wrap
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-lg border border-[var(--c-hairline)] bg-canvas-card p-5 text-left',
        'shadow-1 transition-all duration-med ease-out',
        'hover:-translate-y-0.5 hover:border-[var(--c-hairline-strong)] hover:shadow-3',
        tone === 'alert' && 'bg-danger-tint/30 border-danger/30',
      )}
    >
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div
        className={cn(
          'mt-1.5 text-3xl font-bold tracking-tight tabular',
          toneCls,
        )}
      >
        {formatted}
      </div>
      {delta && (
        <div
          className={cn(
            'mt-1 text-xs',
            tone === 'alert' ? 'text-danger' : 'text-ink-dim',
          )}
        >
          {delta}
        </div>
      )}
    </Wrap>
  );
};

const EmptyHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid place-items-center gap-2 rounded-md border border-dashed border-[var(--c-hairline-strong)] py-8 px-4 text-center">
    <p className="text-sm text-ink-muted">{children}</p>
  </div>
);
