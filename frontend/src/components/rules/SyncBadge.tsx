import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useSyncBadge } from '@/api/queries';
import { cn } from '@/lib/utils';

// Stripe-warm sync badge: soft pill row 显示 v4/v6/drift 数据，
// 整体可点击跳到双栈对比页。
export const SyncBadge: React.FC<{ className?: string }> = ({ className }) => {
  const { data } = useSyncBadge();
  const navigate = useNavigate();
  if (!data) return null;
  const drift = data.mismatched > 0;

  return (
    <button
      onClick={() => navigate({ to: '/diff' as '/' })}
      className={cn(
        'group flex items-center gap-2 rounded-md',
        'border border-[var(--c-hairline)] bg-canvas-card px-3 py-1.5',
        'text-xs transition-all duration-fast ease-out',
        'hover:border-[var(--c-hairline-strong)] hover:shadow-1',
        className,
      )}
      title="查看双栈差异"
    >
      <span className="flex items-center gap-1 text-ink-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-success pulse-ring" />
        <span className="font-medium text-ink-strong">实时</span>
      </span>
      <span className="h-3 w-px bg-[var(--c-hairline-strong)]" />
      <span className="flex items-center gap-1.5">
        <span className="text-ink-dim">v4</span>
        <span className="font-semibold text-ink-strong">{data.v4_count}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-ink-dim">v6</span>
        <span className="font-semibold text-ink-strong">{data.v6_count}</span>
      </span>
      {drift && (
        <>
          <span className="h-3 w-px bg-[var(--c-hairline-strong)]" />
          <span className="flex items-center gap-1 rounded-md bg-danger-tint px-2 py-0.5 font-semibold text-danger">
            <span aria-hidden>⚠</span>
            <span>{data.mismatched} 不同步</span>
          </span>
        </>
      )}
    </button>
  );
};
