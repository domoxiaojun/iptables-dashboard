import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

// Drop-in tooltip wrapper. Wrap any focusable element:
//
//   <Tooltip content="重新加载">
//     <button>↻</button>
//   </Tooltip>
//
// Provider is rendered once at module scope so callers don't have to
// remember to mount <TooltipProvider /> at the app root.

interface TooltipProps {
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Delay (ms) before the tooltip appears on hover. Default 250. */
  delayMs?: number;
  children: React.ReactElement;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  side = 'top',
  align = 'center',
  delayMs = 250,
  children,
}) => (
  <TooltipPrimitive.Provider delayDuration={delayMs}>
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          align={align}
          sideOffset={6}
          className={cn(
            'z-50 max-w-[280px] rounded-md px-2.5 py-1.5',
            'bg-canvas-deep text-white text-xs font-medium shadow-2',
            'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
            'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-canvas-deep" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
);
