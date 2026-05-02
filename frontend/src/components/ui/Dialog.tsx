import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm dialog:
//  - 白底 + xl 圆角 + soft pop shadow
//  - backdrop: 深色半透 + blur
//  - rise-in 动效
//  - danger 变体加红色顶部 accent

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** 危险确认（如强制 force apply）：顶部红色 accent */
  danger?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  danger,
  children,
  className,
}) => {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-canvas-deep/40 backdrop-blur-md"
        onClick={() => onOpenChange(false)}
      />
      <div
        className={cn(
          'relative w-full max-w-2xl max-h-[90vh] overflow-auto scrollbar-thin',
          'bg-canvas-card rounded-xl shadow-pop border border-[var(--c-hairline)]',
          'rise-in',
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-1 rounded-t-xl',
            danger ? 'bg-danger' : 'bg-grad-brand',
          )}
        />

        {title && (
          <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-2">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-ink-strong">
                {title}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-ink-muted">{description}</p>
              )}
            </div>
            <button
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md',
                'text-ink-dim hover:text-ink-strong hover:bg-canvas-tint',
                'transition-colors duration-fast',
              )}
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </header>
        )}
        <div className="px-6 pb-6 pt-3">{children}</div>
      </div>
    </div>
  );
};
