import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { useEventSource, type ConnectionState } from '@/lib/useEventSource';
import { cn } from '@/lib/utils';

export const LogsPage: React.FC = () => {
  const [lines, setLines] = React.useState<string[]>([]);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = React.useState(true);

  const { state, retryCount } = useEventSource({
    url: '/api/v1/logs/stream',
    handlers: React.useMemo(
      () => ({
        log: (data: string) => {
          setLines((l) => {
            const next = [...l, data];
            return next.length > 500 ? next.slice(next.length - 500) : next;
          });
        },
      }),
      [],
    ),
  });

  React.useEffect(() => {
    if (!autoScroll) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [lines, autoScroll]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-strong">日志</h1>
        <p className="mt-1 text-sm text-ink-muted">
          实时 journalctl -kf（不可用时回退 dmesg），仅显示 iptables 关键字
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                防火墙日志流
                <ConnectionBadge state={state} retry={retryCount} />
              </CardTitle>
              <CardDescription>循环缓冲 500 行</CardDescription>
            </div>
            <label className="flex select-none items-center gap-1.5 text-xs text-ink-muted">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="h-3 w-3 cursor-pointer accent-brand"
              />
              自动滚动到底部
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={scrollRef}
            className="max-h-[70vh] min-h-[280px] overflow-auto rounded-md border border-[var(--c-hairline)] bg-canvas-tint p-4 scrollbar-thin"
          >
            {lines.length === 0 ? (
              <div className="grid place-items-center py-10 text-center text-sm text-ink-muted">
                <div>
                  <div className="mb-2 text-2xl">⏳</div>
                  等待第一条日志…<br />
                  <span className="text-2xs text-ink-dim">
                    在 INPUT 链触发一次匹配（例如 ssh 失败登录）就能看到
                  </span>
                </div>
              </div>
            ) : (
              <ol className="space-y-0.5">
                {lines.map((l, i) => (
                  <li
                    key={i}
                    className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-sm px-2 py-1 font-mono text-xs hover:bg-canvas-card transition-colors duration-fast"
                  >
                    <span className="text-2xs text-ink-dim">
                      {String(i + 1).padStart(3, '0')}
                    </span>
                    <span className="break-all text-ink">{l}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const ConnectionBadge: React.FC<{ state: ConnectionState; retry: number }> = ({
  state, retry,
}) => {
  const color =
    state === 'open'
      ? 'bg-success-tint text-success'
      : state === 'reconnecting'
        ? 'bg-warn-tint text-warn'
        : state === 'connecting'
          ? 'bg-info-tint text-info'
          : 'bg-canvas-soft text-ink-muted';
  const label =
    state === 'open'
      ? '实时'
      : state === 'reconnecting'
        ? `重连中 #${retry}`
        : state === 'connecting'
          ? '连接中…'
          : '已断开';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-2xs font-semibold',
        color,
      )}
    >
      {state === 'open' && (
        <span className="h-1.5 w-1.5 rounded-full bg-current pulse-ring" />
      )}
      {label}
    </span>
  );
};
