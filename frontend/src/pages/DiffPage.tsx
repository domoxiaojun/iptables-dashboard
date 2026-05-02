import * as React from 'react';
import { useDualStackDiff } from '@/api/queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { GradientText } from '@/components/react-bits/GradientText';
import { cn } from '@/lib/utils';

export const DiffPage: React.FC = () => {
  const { data, isLoading } = useDualStackDiff();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-strong">
          双栈对比
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          并排展示 IPv4 与 IPv6 规则集，标出 <GradientText>仅一边存在</GradientText> 与 字段不一致的规则。
        </p>
      </header>

      {isLoading ? (
        <Card>
          <CardContent>
            <p className="py-8 text-center text-ink-muted">加载中…</p>
          </CardContent>
        </Card>
      ) : !data ? null : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              label="仅 IPv4"
              count={data.v4_only.length}
              tone="warn"
              hint="这些规则只在 IPv4 上生效"
            />
            <SummaryCard
              label="仅 IPv6"
              count={data.v6_only.length}
              tone="warn"
              hint="这些规则只在 IPv6 上生效"
            />
            <SummaryCard
              label="已配对"
              count={data.matched}
              tone="ok"
              hint="两边都有等价规则"
            />
          </div>

          {data.paired_diff.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>字段不一致 · {data.paired_diff.length} 条</CardTitle>
                <CardDescription>
                  位置等价但具体字段在 v4 和 v6 上有差异
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.paired_diff.map(([a, b], i) => (
                  <div
                    key={i}
                    className="grid gap-2 rounded-md border border-[var(--c-hairline)] p-3 md:grid-cols-2"
                  >
                    <div className="rounded-md bg-success-tint/40 px-3 py-2">
                      <Badge variant="success" dot>v4</Badge>
                      <pre className="mt-1.5 overflow-x-auto font-mono text-2xs text-ink scrollbar-thin">
                        {a.raw}
                      </pre>
                    </div>
                    <div className="rounded-md bg-warn-tint/40 px-3 py-2">
                      <Badge variant="warn" dot>v6</Badge>
                      <pre className="mt-1.5 overflow-x-auto font-mono text-2xs text-ink scrollbar-thin">
                        {b.raw}
                      </pre>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <OnlyList
              title="仅 IPv4"
              rules={data.v4_only}
              tone="success"
            />
            <OnlyList
              title="仅 IPv6"
              rules={data.v6_only}
              tone="warn"
            />
          </div>
        </>
      )}
    </div>
  );
};

const SummaryCard: React.FC<{
  label: string;
  count: number;
  tone: 'ok' | 'warn' | 'alert';
  hint: string;
}> = ({ label, count, tone, hint }) => {
  const wrap =
    tone === 'warn'
      ? 'bg-warn-tint/40 border-warn/30'
      : tone === 'alert'
        ? 'bg-danger-tint/40 border-danger/30'
        : '';
  const num =
    tone === 'warn'
      ? 'text-warn'
      : tone === 'alert'
        ? 'text-danger'
        : 'text-ink-strong';
  return (
    <Card className={cn(wrap)}>
      <CardContent className="pt-5">
        <div className="text-sm font-medium text-ink-muted">{label}</div>
        <div className={cn('mt-1.5 text-3xl font-bold tracking-tight tabular', num)}>
          {count}
        </div>
        <div className="mt-1 text-xs text-ink-dim">{hint}</div>
      </CardContent>
    </Card>
  );
};

const OnlyList: React.FC<{
  title: string;
  rules: import('@/types/api').Rule[];
  tone: 'success' | 'warn';
}> = ({ title, rules, tone }) => (
  <Card>
    <CardHeader>
      <div className="flex items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Badge variant={tone === 'success' ? 'success' : 'warn'}>{rules.length}</Badge>
      </div>
    </CardHeader>
    <CardContent>
      {rules.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">无</p>
      ) : (
        <ul className="space-y-1.5">
          {rules.map((r, i) => (
            <li
              key={i}
              className="flex items-baseline gap-2 rounded-md px-2 py-1.5 hover:bg-canvas-tint transition-colors duration-fast"
              title={r.raw}
            >
              <Badge variant="outline">
                {r.table}/{r.chain} #{r.seq + 1}
              </Badge>
              <span className="truncate font-mono text-xs text-ink">
                {r.raw}
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);
