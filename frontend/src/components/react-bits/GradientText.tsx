import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm gradient text:
//  - 紫蓝幻彩品牌色，配合 italic Fraunces 衬线时格外有质感
//  - 默认不带 cursor blink（之前的 terminal 风已废）
//  - 用作页面标题里的重音词（"42 条规则"中的 "42"）

export const GradientText: React.FC<
  React.HTMLAttributes<HTMLSpanElement> & {
    /** 用 Fraunces 斜体衬线（更贵气） */
    serif?: boolean;
  }
> = ({ className, serif = true, children, ...props }) => (
  <span
    className={cn(
      'bg-grad-brand bg-clip-text text-transparent',
      serif && 'font-serif italic font-semibold',
      className,
    )}
    {...props}
  >
    {children}
  </span>
);
