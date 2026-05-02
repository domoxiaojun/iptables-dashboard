import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm aurora background:
//  - 两个柔和 radial flare（紫蓝 / 青绿），blur 40-50px
//  - fixed 模式全屏铺；relative 模式只在 wrapping 容器内可见

export const AuroraBackground: React.FC<
  React.HTMLAttributes<HTMLDivElement> & {
    /** 全屏铺满（fixed 定位） */
    fixed?: boolean;
  }
> = ({ className, fixed, children, ...props }) => (
  <div
    className={cn(
      fixed ? 'fixed inset-0' : 'relative',
      'isolate',
      className,
    )}
    {...props}
  >
    <span
      aria-hidden
      className={cn(
        '-z-10 pointer-events-none',
        fixed ? 'fixed' : 'absolute',
        '-top-48 -left-48 h-[640px] w-[640px] rounded-full',
        'bg-brand opacity-[0.12] blur-3xl',
      )}
    />
    <span
      aria-hidden
      className={cn(
        '-z-10 pointer-events-none',
        fixed ? 'fixed' : 'absolute',
        '-bottom-72 -right-48 h-[720px] w-[720px] rounded-full',
        'opacity-[0.10] blur-3xl',
      )}
      style={{ background: '#2DD4BF' }}
    />
    {children}
  </div>
);
