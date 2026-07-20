// useIdleTimeout — detects user inactivity and calls onIdle when the
// idle threshold is reached. Used to auto-logout inactive sessions.

import { useEffect, useRef, useCallback } from 'react';

const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];

export function useIdleTimeout(
  /** Idle threshold in seconds. */
  timeoutSeconds: number,
  /** Called when the user has been idle for `timeoutSeconds`. */
  onIdle: () => void,
  /** When false, the hook is a no-op. */
  enabled = true,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onIdleRef.current();
    }, timeoutSeconds * 1000);
  }, [timeoutSeconds]);

  useEffect(() => {
    if (!enabled || timeoutSeconds <= 0) return;

    // Start the timer
    resetTimer();

    // Reset on any user activity
    const handler = () => resetTimer();
    for (const event of EVENTS) {
      document.addEventListener(event, handler, { passive: true });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      for (const event of EVENTS) {
        document.removeEventListener(event, handler);
      }
    };
  }, [enabled, timeoutSeconds, resetTimer]);
}
