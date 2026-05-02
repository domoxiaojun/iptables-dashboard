import * as React from 'react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/store/ui';

// Stripe-warm pill toggle: 软底 + 当前项白底 + soft shadow
export const FamilySwitcher: React.FC<{ className?: string }> = ({
  className,
}) => {
  const family = useUiStore((s) => s.family);
  const setFamily = useUiStore((s) => s.setFamily);

  const items: { label: string; value: 'v4' | 'v6' | 'both' }[] = [
    { label: 'IPv4', value: 'v4' },
    { label: 'IPv6', value: 'v6' },
    { label: '双栈对比', value: 'both' },
  ];

  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 p-1',
        'rounded-md bg-canvas-soft border border-[var(--c-hairline)]',
        className,
      )}
    >
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => setFamily(it.value)}
          className={cn(
            'h-7 rounded-sm px-3 text-xs font-semibold',
            'transition-all duration-fast ease-out',
            family === it.value
              ? 'bg-canvas-card text-ink-strong shadow-1'
              : 'text-ink-muted hover:text-ink-strong',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
};
