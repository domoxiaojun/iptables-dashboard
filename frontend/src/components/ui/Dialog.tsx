import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

// Backwards-compatible Dialog: same `<Dialog open onOpenChange title ...>`
// API the rest of the app already uses, but powered by Radix so we get
// real Portal mount, focus trap, scroll lock, ESC handling, and a proper
// accessible role/labelledby/describedby tree.
//
// New props (optional):
//   - dismissable: when false, ESC + outside-click are disabled (keeps the
//     existing TwoStepConfirmModal behavior of "buttons only").

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  /** Danger confirmation — top accent turns red instead of brand gradient. */
  danger?: boolean;
  /** When false, ESC + outside-click are blocked. Default true. */
  dismissable?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  danger,
  dismissable = true,
  children,
  className,
}) => {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-50 bg-canvas-deep/40 backdrop-blur-md',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
          )}
        />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => {
            if (!dismissable) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (!dismissable) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!dismissable) e.preventDefault();
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-full max-w-2xl max-h-[90vh] overflow-auto scrollbar-thin',
            'bg-canvas-card rounded-xl shadow-pop border border-[var(--c-hairline)]',
            'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
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
                <DialogPrimitive.Title className="text-xl font-semibold tracking-tight text-ink-strong">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="mt-1 text-sm text-ink-muted">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              {dismissable && (
                <DialogPrimitive.Close
                  aria-label="关闭"
                  className={cn(
                    'inline-flex h-8 w-8 items-center justify-center rounded-md',
                    'text-ink-dim hover:text-ink-strong hover:bg-canvas-tint',
                    'transition-colors duration-fast',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                  )}
                >
                  ✕
                </DialogPrimitive.Close>
              )}
            </header>
          )}
          <div className="px-6 pb-6 pt-3">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
