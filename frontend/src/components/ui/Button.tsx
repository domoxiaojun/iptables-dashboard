import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm button system:
//  - primary:    深色 ink-strong + soft hover lift（默认）
//  - gradient:   品牌幻彩，营销 / 主 CTA
//  - secondary:  白底 + hairline，二级动作
//  - outline:    无填充 + brand 描边
//  - ghost:      纯文字，工具栏
//  - destructive:沉稳红
//
// Hover: translateY(-1px) + 阴影深一档 (150ms ease-out)
// Active: translateY(0) + scale(.98)

export type ButtonVariant =
  | 'primary'
  | 'gradient'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const base =
  'inline-flex items-center justify-center gap-2 font-medium ' +
  'transition-[transform,box-shadow,background,border-color,color] duration-fast ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none ' +
  'active:translate-y-0 active:scale-[.98]';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-canvas-deep text-white border border-canvas-deep ' +
    'shadow-1 hover:bg-black hover:-translate-y-px hover:shadow-2',
  gradient:
    'bg-grad-brand text-white border border-transparent ' +
    'shadow-accent hover:-translate-y-px hover:shadow-accent-pop',
  secondary:
    'bg-canvas-card text-ink-strong border border-[var(--c-hairline-strong)] ' +
    'shadow-1 hover:-translate-y-px hover:shadow-2 hover:border-ink',
  outline:
    'bg-transparent text-brand border border-brand/40 ' +
    'hover:bg-brand-tint hover:border-brand',
  ghost:
    'bg-transparent text-ink-muted hover:text-ink-strong hover:bg-canvas-tint',
  destructive:
    'bg-danger text-white border border-danger ' +
    'shadow-1 hover:-translate-y-px hover:shadow-2',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-md',
  md: 'h-9 px-4 text-sm rounded-md',
  lg: 'h-11 px-5 text-md rounded-md',
  icon: 'h-9 w-9 text-sm rounded-md',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(base, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
