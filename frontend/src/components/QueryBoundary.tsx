import * as React from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

// Render-children helper that maps the three states of a TanStack Query
// to consistent UI: skeleton while loading, error card with retry while
// failed, otherwise children(data). Pages stop hand-writing the
// `if (isPending) return <Loading />; if (isError) return <Err />;`
// boilerplate and the visual treatment stays uniform.

interface Props<T> {
  query: UseQueryResult<T>;
  /** Custom skeleton; defaults to a simple shimmer card. */
  skeleton?: React.ReactNode;
  /** Hide the skeleton on background refetches (when data already exists). */
  showSkeletonOnRefetch?: boolean;
  /** Render-prop receives the resolved data. */
  children: (data: T) => React.ReactNode;
}

export function QueryBoundary<T>({
  query,
  skeleton,
  showSkeletonOnRefetch = false,
  children,
}: Props<T>) {
  // Loading: only the very first load (no data yet) shows the skeleton by
  // default; later background refetches keep the previous data visible to
  // avoid flicker. Pass showSkeletonOnRefetch to opt back in.
  if (query.isPending || (showSkeletonOnRefetch && query.isFetching && !query.data)) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  if (query.isError) {
    return <ErrorCard error={query.error} onRetry={() => query.refetch()} />;
  }
  if (query.data === undefined) {
    return <>{skeleton ?? <DefaultSkeleton />}</>;
  }
  return <>{children(query.data)}</>;
}

const DefaultSkeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      'rounded-xl border border-[var(--c-hairline)] bg-canvas-card p-6 shadow-1',
      className,
    )}
  >
    <div className="space-y-3">
      <Shimmer className="h-4 w-1/3" />
      <Shimmer className="h-3 w-2/3" />
      <Shimmer className="h-3 w-1/2" />
    </div>
  </div>
);

export const Shimmer: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      'animate-pulse rounded-md bg-canvas-tint',
      className,
    )}
  />
);

const ErrorCard: React.FC<{ error: unknown; onRetry: () => void }> = ({
  error,
  onRetry,
}) => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-xl border border-danger/30 bg-canvas-card p-6 shadow-1">
      <div className="flex items-center gap-2 text-danger">
        <span aria-hidden className="text-base">⚠</span>
        <h3 className="text-sm font-semibold">加载失败</h3>
      </div>
      <p className="mt-2 max-h-32 overflow-auto rounded-md bg-canvas-soft p-2 text-xs font-mono text-ink-muted scrollbar-thin">
        {message}
      </p>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--c-hairline-strong)] bg-canvas-card px-3 text-xs font-medium text-ink-strong shadow-1 transition-colors duration-fast hover:bg-canvas-tint"
        >
          重试
        </button>
      </div>
    </div>
  );
};
