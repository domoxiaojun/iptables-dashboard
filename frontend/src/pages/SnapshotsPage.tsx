import * as React from 'react';
import { useSnapshots } from '@/api/queries';
import { useExternalApply, type TokenLike } from '@/api/apply';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { TwoStepConfirmModal } from '@/components/rules/TwoStepConfirmModal';
import { api } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { formatTs } from '@/lib/utils';

const KIND_LABEL: Record<string, { text: string; tone: 'success'|'warn'|'destructive'|'neutral'|'info' }> = {
  manual: { text: '手动', tone: 'info' },
  auto_pre_apply: { text: '应用前', tone: 'neutral' },
  auto_rollback: { text: '回滚', tone: 'warn' },
  bootstrap_import: { text: '导入', tone: 'neutral' },
};

export const SnapshotsPage: React.FC = () => {
  const { data, isLoading } = useSnapshots(200);
  const qc = useQueryClient();
  const [label, setLabel] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const ext = useExternalApply({
    invalidateKeys: [
      ['snapshots'],
      ['rules', 'v4', 'filter'],
      ['rules', 'v6', 'filter'],
      ['sync-badge'],
    ],
  });

  const create = async () => {
    if (!label.trim()) return;
    setBusy(true);
    try {
      await api.post('/snapshots', { label });
      setLabel('');
      qc.invalidateQueries({ queryKey: ['snapshots'] });
    } finally {
      setBusy(false);
    }
  };
  const restore = async (id: number) => {
    if (!confirm(`恢复快照 #${id}？将通过两步激活生效。`)) return;
    try {
      const meta = await api.post<TokenLike>(`/snapshots/${id}/restore`);
      ext.setToken(meta);
    } catch (e) {
      alert(`restore failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      {ext.pending && (
        <TwoStepConfirmModal
          token={ext.pending.token}
          expiresAt={ext.pending.expires_at}
          onResolved={ext.onResolved}
        />
      )}

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-strong">快照</h1>
        <p className="mt-1 text-sm text-ink-muted">
          每次 apply 都会自动留底，可一键回滚到任意时间点。
        </p>
      </header>

      {/* Create */}
      <Card>
        <CardHeader>
          <CardTitle>创建手动快照</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="例如：开放 53 之前 / 升级前 / 演练第 1 次"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="flex-1"
            />
            <Button onClick={create} disabled={busy || !label.trim()}>
              创建快照
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>时间线</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-ink-muted">加载中…</p>
          ) : !data || data.length === 0 ? (
            <p className="py-12 text-center text-sm text-ink-muted">
              还没有任何快照。<br />
              在「规则」页应用一次变更或在上方手动创建一次。
            </p>
          ) : (
            <ul className="relative space-y-0.5">
              {data.map((s, idx) => {
                const meta = KIND_LABEL[s.kind] ?? { text: s.kind, tone: 'neutral' as const };
                return (
                  <li
                    key={s.id}
                    className="relative grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-3 rounded-md py-2.5 pl-2 hover:bg-canvas-tint transition-colors duration-fast"
                  >
                    {/* timeline dot + line */}
                    <div className="relative h-full">
                      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-4 ring-canvas" />
                      {idx < data.length - 1 && (
                        <span
                          aria-hidden
                          className="absolute left-1/2 top-1/2 -translate-x-px h-[44px] w-px bg-[var(--c-hairline-strong)]"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-2xs text-ink-dim">
                          #{s.id}
                        </span>
                        <span className="truncate text-sm font-medium text-ink-strong">
                          {s.label}
                        </span>
                        <Badge variant={meta.tone}>{meta.text}</Badge>
                      </div>
                      <div className="mt-0.5 text-xs text-ink-muted">
                        {formatTs(s.created_at)} · {s.author}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        className="text-xs text-ink-muted hover:text-ink-strong transition-colors duration-fast"
                        href={`/api/v1/snapshots/${s.id}/export?family=v4`}
                      >
                        v4 ↓
                      </a>
                      <a
                        className="text-xs text-ink-muted hover:text-ink-strong transition-colors duration-fast"
                        href={`/api/v1/snapshots/${s.id}/export?family=v6`}
                      >
                        v6 ↓
                      </a>
                      <Button size="sm" variant="secondary" onClick={() => restore(s.id)}>
                        恢复
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
