import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm badge:
//  - 圆角 pill（不是直角）
//  - 有 dot 圆点的状态变体（accept/drop/log/info）
//  - 中性 outline 用于计数 / 标签
//  - 紧凑高度 22px，paddings 10/3

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warn'
  | 'destructive'
  | 'outline'
  | 'brand'
  | 'info'
  | 'neutral';

const base =
  'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-2xs font-semibold rounded-pill leading-[1.4]';

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-canvas-soft text-ink-strong border border-[var(--c-hairline)]',
  success: 'bg-success-tint text-success',
  warn: 'bg-warn-tint text-warn',
  destructive: 'bg-danger-tint text-danger',
  outline: 'bg-transparent text-ink-muted border border-[var(--c-hairline-strong)]',
  brand: 'bg-brand-tint text-brand',
  info: 'bg-info-tint text-info',
  neutral: 'bg-canvas-tint text-ink-muted',
};

export const Badge: React.FC<
  React.HTMLAttributes<HTMLSpanElement> & {
    variant?: BadgeVariant;
    /** 在文字前显示一个圆点（脉冲可选） */
    dot?: boolean;
    pulse?: boolean;
  }
> = ({ className, variant = 'default', dot, pulse, children, ...props }) => (
  <span className={cn(base, variantClasses[variant], className)} {...props}>
    {dot && (
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full bg-current',
          pulse && 'pulse-ring',
        )}
      />
    )}
    {children}
  </span>
);
