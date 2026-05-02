import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm input:
//  - 白底 + soft hairline
//  - focus ring 是 brand-tint，不是大荧光
//  - 内置 leading icon 槽位（可选）
//  - 用 mono 字体的请显式加 font-mono className（仅数据字段）

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** 渲染左侧图标槽（一个 React node 或字符 emoji） */
  leading?: React.ReactNode;
  /** 强制使用 mono 字体（rule raw / counter 字段） */
  monospace?: boolean;
  /** Error 状态：红色描边 + ring */
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, leading, monospace, error, ...props }, ref) => {
    const inputEl = (
      <input
        ref={ref}
        className={cn(
          'flex h-9 w-full rounded-md px-3 text-sm',
          'bg-canvas-card text-ink-strong placeholder:text-ink-faint',
          'border transition-[border-color,box-shadow,background] duration-fast ease-out',
          monospace ? 'font-mono text-xs' : 'font-sans',
          error
            ? 'border-danger/40 focus-visible:border-danger focus-visible:ring-2 focus-visible:ring-danger/20'
            : 'border-[var(--c-hairline-input)] hover:border-ink/30 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20',
          'focus-visible:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-canvas-soft',
          leading && 'pl-9',
          className,
        )}
        {...props}
      />
    );
    if (!leading) return inputEl;
    return (
      <div className="relative">
        <span
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-dim"
          aria-hidden
        >
          {leading}
        </span>
        {inputEl}
      </div>
    );
  },
);
Input.displayName = 'Input';
