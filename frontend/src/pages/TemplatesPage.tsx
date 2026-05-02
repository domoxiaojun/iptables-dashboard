import * as React from 'react';
import { useTemplates } from '@/api/queries';
import { useApply } from '@/api/apply';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TwoStepConfirmModal } from '@/components/rules/TwoStepConfirmModal';
import { ICMPv6GuardModal } from '@/components/rules/ICMPv6GuardBanner';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Mutation, PreviewResp } from '@/types/api';

const CATEGORY_TONE: Record<string, 'brand'|'success'|'info'|'warn'|'neutral'> = {
  ssh: 'brand',
  web: 'info',
  core: 'success',
  icmp6: 'info',
  docker: 'neutral',
  logging: 'warn',
  nat: 'warn',
};

export const TemplatesPage: React.FC = () => {
  const { data, isLoading } = useTemplates();
  const [previewing, setPreviewing] = React.useState<{ id: number; preview: PreviewResp | null; error?: string } | null>(null);
  const apply = useApply({
    invalidateKeys: [['rules', 'v4', 'filter'], ['rules', 'v6', 'filter'], ['sync-badge']],
    label: 'apply via TemplatesPage',
  });

  const stage = async (id: number): Promise<Mutation[]> => {
    const r = await api.post<{ mutations: Mutation[] }>(`/templates/${id}/stage`);
    return r.mutations;
  };
  const onPreview = async (id: number) => {
    setPreviewing({ id, preview: null });
    try {
      const muts = await stage(id);
      const preview = await api.post<PreviewResp>('/rules/preview', { mutations: muts });
      setPreviewing({ id, preview });
    } catch (e) {
      setPreviewing({ id, preview: null, error: (e as Error).message });
    }
  };
  const onApply = async (id: number) => {
    try {
      const muts = await stage(id);
      apply.run(muts);
    } catch (e) {
      console.error('template apply failed', e);
    }
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

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-strong">模板库</h1>
        <p className="mt-1 text-sm text-ink-muted">
          常用规则组合 · 一键预览或应用，自动走两步激活
        </p>
      </header>

      {apply.error && (
        <div className="rounded-lg border border-danger/30 bg-danger-tint/40 px-4 py-3 text-sm text-danger">
          ⚠ {apply.error}
        </div>
      )}

      {isLoading ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-muted">
            加载中…
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data?.map((t) => {
            const tone =
              t.category && CATEGORY_TONE[t.category]
                ? CATEGORY_TONE[t.category]!
                : 'neutral';
            const showPreview = previewing?.id === t.id;
            return (
              <Card key={t.id} interactive>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {t.name}
                      </CardTitle>
                      <CardDescription>{t.description}</CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {t.built_in && <Badge variant="brand">内置</Badge>}
                      {t.category && <Badge variant={tone}>{t.category}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => onPreview(t.id)}>
                      预览
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onApply(t.id)}
                      disabled={apply.busy}
                    >
                      应用
                    </Button>
                  </div>
                  {showPreview && (
                    <PreviewBlock
                      preview={previewing?.preview ?? null}
                      error={previewing?.error}
                    />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

const PreviewBlock: React.FC<{
  preview: PreviewResp | null;
  error?: string;
}> = ({ preview, error }) => {
  if (error) {
    return (
      <div className="mt-3 rounded-md border border-danger/30 bg-danger-tint/40 px-3 py-2 text-xs text-danger">
        ⚠ {error}
      </div>
    );
  }
  if (!preview) {
    return (
      <p className="mt-3 text-xs text-ink-muted">预览中…</p>
    );
  }
  const v4 = countOps(preview.v4_diff.ops);
  const v6 = countOps(preview.v6_diff.ops);
  return (
    <div className="mt-3 space-y-1.5 rounded-md border border-[var(--c-hairline)] bg-canvas-tint/60 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">v4</Badge>
        <DiffCounts {...v4} />
        <span className="h-3 w-px bg-[var(--c-hairline-strong)]" />
        <Badge variant="outline">v6</Badge>
        <DiffCounts {...v6} />
      </div>
      {preview.guard_warnings.length > 0 && (
        <div className="text-xs text-warn">
          ⚠ {preview.guard_warnings.length} 条 guard 警告（应用时需确认）
        </div>
      )}
    </div>
  );
};

const DiffCounts: React.FC<{ add: number; remove: number; modify: number }> = ({
  add, remove, modify,
}) => (
  <div className="flex items-center gap-1.5 font-mono text-2xs">
    <span className={cn('text-success', add === 0 && 'text-ink-dim')}>+{add}</span>
    <span className={cn('text-warn', modify === 0 && 'text-ink-dim')}>~{modify}</span>
    <span className={cn('text-danger', remove === 0 && 'text-ink-dim')}>−{remove}</span>
  </div>
);

function countOps(ops: PreviewResp['v4_diff']['ops']) {
  let add = 0, remove = 0, modify = 0;
  for (const o of ops) {
    if (o.op === 'add') add++;
    else if (o.op === 'remove') remove++;
    else if (o.op === 'modify') modify++;
  }
  return { add, remove, modify };
}
