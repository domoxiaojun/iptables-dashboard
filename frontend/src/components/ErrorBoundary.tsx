import * as React from 'react';

// Top-level safety net for uncaught render exceptions. Lives outside
// QueryClientProvider so even a Provider blow-up still shows something.
//
// Strategy: when an error reaches us we render a calm "something went
// wrong" card with the message + a reload button. We do NOT swallow the
// error — `console.error` keeps it in devtools and any external error
// reporter (sentry, etc.) wired into window.onerror still sees it.

interface Props {
  children: React.ReactNode;
  /** Override the default fallback (e.g. an inline boundary inside one route). */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] unhandled render error:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
    return <DefaultFallback error={this.state.error} onReset={this.reset} />;
  }
}

const DefaultFallback: React.FC<{ error: Error; onReset: () => void }> = ({
  error,
  onReset,
}) => (
  <div className="min-h-screen w-full grid place-items-center p-6 bg-canvas">
    <div className="w-full max-w-lg rounded-xl border border-danger/30 bg-canvas-card p-7 shadow-pop">
      <span aria-hidden className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-danger" />
      <div className="mb-4 text-2xl font-semibold text-ink-strong">出错了</div>
      <p className="mb-3 text-sm text-ink-muted">
        前端遇到了未处理的异常。可以尝试恢复，或者刷新页面。
      </p>
      <pre className="mb-5 max-h-48 overflow-auto rounded-md border border-[var(--c-hairline)] bg-canvas-soft p-3 text-xs font-mono text-danger scrollbar-thin">
        {error.message}
        {error.stack ? `\n\n${error.stack}` : ''}
      </pre>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--c-hairline-strong)] bg-canvas-card px-4 text-sm font-medium text-ink-strong shadow-1 transition-colors duration-fast hover:bg-canvas-tint"
        >
          尝试恢复
        </button>
        <button
          type="button"
          onClick={() => location.reload()}
          className="inline-flex h-9 items-center justify-center rounded-md bg-canvas-deep px-4 text-sm font-medium text-white shadow-1 transition-colors duration-fast hover:bg-black"
        >
          刷新页面
        </button>
      </div>
    </div>
  </div>
);
