// useEventSource — Server-Sent Events with automatic reconnection.
//
// The native EventSource has built-in reconnection but it's silent and
// undelivered events on disconnect are lost. This hook adds:
//  - explicit connection-state reporting (so UIs can show 🟢/🟠 indicators)
//  - exponential back-off retry (capped) on close/error
//  - manual close + restart on URL change
//  - a per-event-name dispatcher

import { useEffect, useRef, useState } from 'react';

export type ConnectionState =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed';

export interface UseEventSourceOptions {
  /** Fully-qualified URL or path (will be sent with credentials). */
  url: string;
  /** Map of event name → handler. SSE `event:` field selects the handler. */
  handlers: Record<string, (data: string) => void>;
  /** When true, the EventSource is closed and not reconnected. Default false. */
  paused?: boolean;
  /** Backoff start in ms. Default 1000. */
  initialBackoffMs?: number;
  /** Backoff cap in ms. Default 30000. */
  maxBackoffMs?: number;
}

export function useEventSource(opts: UseEventSourceOptions): {
  state: ConnectionState;
  retryCount: number;
} {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [retryCount, setRetryCount] = useState(0);
  const timerRef = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Stable refs for handlers map so re-render doesn't restart the connection.
  const handlersRef = useRef(opts.handlers);
  handlersRef.current = opts.handlers;

  const initialBackoff = opts.initialBackoffMs ?? 1000;
  const maxBackoff = opts.maxBackoffMs ?? 30_000;

  useEffect(() => {
    if (opts.paused) {
      setState('closed');
      return;
    }

    let cancelled = false;
    let backoff = initialBackoff;
    let attempt = 0;

    const connect = () => {
      if (cancelled) return;
      setState(attempt === 0 ? 'connecting' : 'reconnecting');

      const es = new EventSource(opts.url, { withCredentials: true });
      sourceRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        setState('open');
        attempt = 0;
        backoff = initialBackoff;
        setRetryCount(0);
      };

      // Wire up named events. The browser delivers events both via the named
      // listener AND via onmessage if the event field is missing.
      for (const [name, fn] of Object.entries(handlersRef.current)) {
        es.addEventListener(name, ((ev: MessageEvent) => fn(ev.data)) as EventListener);
      }

      es.onerror = () => {
        if (cancelled) return;
        es.close();
        sourceRef.current = null;
        setState('reconnecting');
        attempt += 1;
        setRetryCount(attempt);
        const delay = Math.min(backoff, maxBackoff);
        backoff = Math.min(backoff * 2, maxBackoff);
        timerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      setState('closed');
    };
  }, [opts.url, opts.paused, initialBackoff, maxBackoff]);

  return { state, retryCount };
}
