import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm table:
//  - thead: 暖底 + uppercase 极小字号
//  - tbody: 16px padding, hover bg-canvas-tint
//  - hairline 行分隔，最后一行无下边

export const Table: React.FC<React.HTMLAttributes<HTMLTableElement>> = ({
  className,
  ...props
}) => (
  <div className="w-full overflow-auto">
    <table
      className={cn('w-full caption-bottom text-sm tabular', className)}
      {...props}
    />
  </div>
);

export const THead: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  ...props
}) => (
  <thead
    className={cn(
      'bg-canvas-tint border-b border-[var(--c-hairline)] sticky top-0 z-10',
      className,
    )}
    {...props}
  />
);

export const TBody: React.FC<React.HTMLAttributes<HTMLTableSectionElement>> = ({
  className,
  ...props
}) => (
  <tbody
    className={cn('[&_tr:last-child]:border-b-0', className)}
    {...props}
  />
);

export const TR: React.FC<React.HTMLAttributes<HTMLTableRowElement>> = ({
  className,
  ...props
}) => (
  <tr
    className={cn(
      'group border-b border-[var(--c-hairline)] transition-colors duration-fast ease-out',
      'hover:bg-canvas-tint',
      className,
    )}
    {...props}
  />
);

export const TH: React.FC<React.ThHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  ...props
}) => (
  <th
    className={cn(
      'h-10 px-6 text-left align-middle',
      'font-semibold text-2xs text-ink-dim uppercase tracking-wider',
      className,
    )}
    {...props}
  />
);

export const TD: React.FC<React.TdHTMLAttributes<HTMLTableCellElement>> = ({
  className,
  ...props
}) => (
  <td
    className={cn('px-6 py-4 align-middle text-sm text-ink', className)}
    {...props}
  />
);
