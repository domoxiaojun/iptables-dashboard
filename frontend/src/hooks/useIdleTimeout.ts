// useIdleTimeout — detects user inactivity and calls onIdle when the
// idle threshold is reached. Optionally calls onWarning before timeout.

import { useEffect, useRef, useCallback } from 'react';

const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

export function useIdleTimeout(
  /** Idle threshold in seconds. */
  timeoutSeconds: number,
  /** Called when the user has been idle for `timeoutSeconds`. */
  onIdle: () => void,
  /** When false, the hook is a no-op. */
  enabled = true,
  /** Called `warningSeconds` before timeout. Pass 0 to disable. */
  warningSeconds: number = 30,
  /** Called when warning fires. Receives remaining seconds. */
  onWarning?: (remainingSeconds: number) => void,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  const onWarningRef = useRef(onWarning);
  onIdleRef.current = onIdle;
  onWarningRef.current = onWarning;

  const resetTimers = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    if (warningSeconds > 0 && onWarningRef.current) {
      const warningDelay = (timeoutSeconds - warningSeconds) * 1000;
      if (warningDelay > 0) {
        warningTimerRef.current = setTimeout(() => {
          onWarningRef.current?.(warningSeconds);
        }, warningDelay);
      }
    }

    timerRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeoutSeconds * 1000);
  }, [timeoutSeconds, warningSeconds]);

  useEffect(() => {
    if (!enabled || timeoutSeconds <= 0) return;

    resetTimers();

    const handler = () => resetTimers();
    for (const event of EVENTS) {
      document.addEventListener(event, handler, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      for (const event of EVENTS) {
        document.removeEventListener(event, handler);
      }
    };
  }, [enabled, timeoutSeconds, resetTimers]);
}
