import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm card:
//  - 白底 + 1px hairline + 软阴影
//  - 大圆角 (xl = 20px)
//  - 默认 shadow-2，hover 提升至 shadow-3 + -2px translate
//  - accent 变体在右上角加柔和品牌 radial flare
//  - flat 变体取消 hover 提升（用于嵌套或工具卡）

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    accent?: boolean;
    interactive?: boolean;
  }
>(({ className, accent, interactive, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'relative bg-canvas-card text-foreground border border-[var(--c-hairline)] rounded-xl shadow-2',
      'transition-[transform,box-shadow,border-color] duration-med ease-out',
      interactive && 'hover:-translate-y-0.5 hover:shadow-3 hover:border-[var(--c-hairline-strong)]',
      accent && 'overflow-hidden',
      className,
    )}
    {...props}
  >
    {accent && (
      <span
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-grad-brand opacity-10 blur-3xl"
      />
    )}
    {props.children}
  </div>
));
Card.displayName = 'Card';

export const CardHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col gap-1 px-6 pt-5 pb-3', className)}
    {...props}
  />
);

export const CardTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <h3
    className={cn(
      'text-lg font-semibold tracking-tight text-ink-strong',
      className,
    )}
    {...props}
  />
);

export const CardDescription = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('text-sm text-ink-muted', className)} {...props} />
);

export const CardContent = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-6 pb-5', className)} {...props} />
);
