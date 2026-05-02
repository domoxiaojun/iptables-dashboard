import * as React from 'react';
import { cn } from '@/lib/utils';

// Stripe-warm countdown ring:
//  - SVG 圆环 + linearGradient stroke (品牌幻彩)
//  - track 是 canvas-soft 暖色
//  - 数字 spring overshoot，1Hz update
//  - 危险时（< 5s）变红

export const CountdownRing: React.FC<{
  /** 剩余毫秒数 */
  remainingMs: number;
  /** 总时长毫秒数 */
  totalMs: number;
  /** 危险阈值（默认 5s） */
  dangerThresholdMs?: number;
  className?: string;
}> = ({ remainingMs, totalMs, dangerThresholdMs = 5000, className }) => {
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  const danger = remainingMs <= dangerThresholdMs;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const lastSecondRef = React.useRef<number>(seconds);
  const [pulseKey, setPulseKey] = React.useState(0);
  React.useEffect(() => {
    if (lastSecondRef.current !== seconds) {
      lastSecondRef.current = seconds;
      setPulseKey((k) => k + 1);
    }
  }, [seconds]);

  return (
    <div className={cn('relative inline-grid place-items-center', className)}>
      <svg width="112" height="112" viewBox="0 0 100 100" aria-hidden>
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#635BFF" />
            <stop offset="50%" stopColor="#4F89FF" />
            <stop offset="100%" stopColor="#2DD4BF" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--c-bg-soft)"
          strokeWidth="6"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={danger ? '#DC2626' : 'url(#ring-grad)'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 250ms cubic-bezier(.16,1,.3,1), stroke 250ms ease-out' }}
        />
      </svg>
      <div
        key={pulseKey}
        className={cn(
          'absolute inset-0 grid place-items-center digit-pop',
          'text-3xl font-bold tracking-tight',
          danger ? 'text-danger' : 'text-ink-strong',
        )}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {seconds}
      </div>
    </div>
  );
};
