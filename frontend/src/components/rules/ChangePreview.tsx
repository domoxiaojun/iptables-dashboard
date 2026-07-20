// ChangePreview — shows a diff preview of staged mutations before applying.

import * as React from 'react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import type { Mutation, PreviewResp, DiffOp } from '@/types/api';

interface ChangePreviewProps {
  mutations: Mutation[];
}

export const ChangePreview: React.FC<ChangePreviewProps> = ({ mutations }) => {
  const [preview, setPreview] = React.useState<PreviewResp | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    if (mutations.length === 0) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .post<PreviewResp>('/rules/preview', { mutations })
      .then((resp) => {
        if (!cancelled) setPreview(resp);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mutations]);

  if (loading) {
    return (
      <div className="border-t border-[var(--c-hairline)] px-6 py-3 text-xs text-ink-muted">
        预览变更中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-[var(--c-hairline)] px-6 py-3 text-xs text-danger">
        ⚠ 预览失败: {error}
      </div>
    );
  }

  if (!preview) return null;

  const v4Ops = countOps(preview.v4_diff.ops);
  const v6Ops = countOps(preview.v6_diff.ops);
  const totalOps = v4Ops.add + v4Ops.remove + v4Ops.modify + v6Ops.add + v6Ops.remove + v6Ops.modify;

  return (
    <div className="border-t border-[var(--c-hairline)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-3 text-left hover:bg-canvas-tint transition-colors duration-fast"
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-ink-strong">预览变更</span>
          <div className="flex items-center gap-2 font-mono text-2xs">
            <Badge variant="outline">v4</Badge>
            <DiffCounts {...v4Ops} />
            <span className="h-3 w-px bg-[var(--c-hairline-strong)]" />
            <Badge variant="outline">v6</Badge>
            <DiffCounts {...v6Ops} />
          </div>
          {preview.guard_warnings.length > 0 && (
            <Badge variant="warn">⚠ {preview.guard_warnings.length} 条警告</Badge>
          )}
        </div>
        <span className={cn('text-ink-dim transition-transform', expanded && 'rotate-180')}>
          ▾
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-[var(--c-hairline)] px-6 py-4">
          {preview.guard_warnings.length > 0 && (
            <div className="space-y-1.5">
              {preview.guard_warnings.map((w, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-md px-3 py-2 text-xs',
                    w.severity === 'error'
                      ? 'bg-danger-tint/40 text-danger'
                      : w.severity === 'warn'
                        ? 'bg-warn-tint/40 text-warn'
                        : 'bg-info-tint/40 text-info',
                  )}
                >
                  {w.message}
                  {w.chain && <span className="ml-2 text-ink-dim">({w.chain})</span>}
                </div>
              ))}
            </div>
          )}

          {totalOps === 0 ? (
            <p className="text-xs text-ink-muted">无实际变更（规则集不变）</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {preview.v4_diff.ops.length > 0 && (
                <DiffList family="IPv4" ops={preview.v4_diff.ops} />
              )}
              {preview.v6_diff.ops.length > 0 && (
                <DiffList family="IPv6" ops={preview.v6_diff.ops} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const DiffList: React.FC<{ family: string; ops: DiffOp[] }> = ({ family, ops }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <Badge variant="outline">{family}</Badge>
      <span className="text-2xs text-ink-dim">{ops.length} 项变更</span>
    </div>
    <ul className="space-y-1">
      {ops.slice(0, 10).map((op, i) => (
        <li
          key={i}
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1 font-mono text-2xs',
            op.op === 'add' && 'bg-success-tint/40',
            op.op === 'remove' && 'bg-danger-tint/40',
            op.op === 'modify' && 'bg-warn-tint/40',
          )}
        >
          <span
            className={cn(
              'grid h-4 w-4 place-items-center rounded text-2xs font-bold',
              op.op === 'add' && 'text-success',
              op.op === 'remove' && 'text-danger',
              op.op === 'modify' && 'text-warn',
            )}
          >
            {op.op === 'add' ? '+' : op.op === 'remove' ? '−' : '~'}
          </span>
          <span className="truncate text-ink">
            {op.rule?.raw ?? op.from?.raw ?? op.to?.raw ?? '—'}
          </span>
        </li>
      ))}
      {ops.length > 10 && (
        <li className="px-2 text-2xs text-ink-dim">…还有 {ops.length - 10} 项</li>
      )}
    </ul>
  </div>
);

const DiffCounts: React.FC<{ add: number; remove: number; modify: number }> = ({
  add,
  remove,
  modify,
}) => (
  <div className="flex items-center gap-1.5 font-mono text-2xs">
    <span className={cn('text-success', add === 0 && 'text-ink-dim')}>+{add}</span>
    <span className={cn('text-warn', modify === 0 && 'text-ink-dim')}>~{modify}</span>
    <span className={cn('text-danger', remove === 0 && 'text-ink-dim')}>−{remove}</span>
  </div>
);

function countOps(ops: DiffOp[]) {
  let add = 0,
    remove = 0,
    modify = 0;
  for (const o of ops) {
    if (o.op === 'add') add++;
    else if (o.op === 'remove') remove++;
    else if (o.op === 'modify') modify++;
  }
  return { add, remove, modify };
}
