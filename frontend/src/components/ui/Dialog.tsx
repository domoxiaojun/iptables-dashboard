import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

// shadcn new-york style Dialog, composed via compound primitives:
//
//   <Dialog open={...} onOpenChange={...}>
//     <DialogContent danger dismissable>
//       <DialogHeader>
//         <DialogTitle>...</DialogTitle>
//         <DialogDescription>...</DialogDescription>
//       </DialogHeader>
//       <div>... body ...</div>
//       <DialogFooter>
//         <Button>...</Button>
//       </DialogFooter>
//     </DialogContent>
//   </Dialog>
//
// Powered by @radix-ui/react-dialog so we get focus trap, portal, scroll
// lock, ESC, and proper a11y wiring (role/labelledby/describedby).

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogPortal = DialogPrimitive.Portal;
export const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-canvas-deep/40 backdrop-blur-md',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** When false, ESC + outside-click + close button are disabled. Default true. */
  dismissable?: boolean;
  /** Top accent turns red instead of brand gradient (force-apply / destructive). */
  danger?: boolean;
}

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, dismissable = true, danger, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
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
        'p-6',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-x-0 top-0 h-1 rounded-t-xl',
          danger ? 'bg-danger' : 'bg-grad-brand',
        )}
      />
      {children}
      {dismissable && (
        <DialogPrimitive.Close
          aria-label="关闭"
          className={cn(
            'absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md',
            'text-ink-dim hover:text-ink-strong hover:bg-canvas-tint',
            'transition-colors duration-fast',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
          )}
        >
          ✕
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = 'DialogContent';

export const DialogHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      'flex flex-col gap-1.5 pb-3 pr-10 sm:text-left',
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

export const DialogFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className,
  ...props
}) => (
  <div
    className={cn(
      'mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-xl font-semibold tracking-tight text-ink-strong', className)}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-ink-muted', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';
