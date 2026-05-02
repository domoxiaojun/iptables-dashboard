import * as React from 'react';
import { useAudit } from '@/api/queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { QueryBoundary, Shimmer } from '@/components/QueryBoundary';
import { formatTs } from '@/lib/utils';

const RESULT_TONE: Record<string, 'success'|'warn'|'destructive'|'neutral'|'info'> = {
  ok: 'success',
  auto_rollback: 'warn',
  manual_rollback: 'warn',
  partial_rollback: 'destructive',
  manual_intervention_required: 'destructive',
  wrong_old_password: 'warn',
};

const ACTION_LABEL: Record<string, string> = {
  'auth.login': '登录',
  'auth.logout': '登出',
  'auth.change_password': '改密码',
  'apply.start': '启动应用',
  'apply.confirm': '确认应用',
  'apply.rollback': '回滚',
  'snapshot.restore': '快照恢复',
};

export const AuditPage: React.FC = () => {
  const auditQ = useAudit();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-strong">审计</h1>
        <p className="mt-1 text-sm text-ink-muted">
          所有写操作的不可丢失日志
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>操作记录</CardTitle>
          <CardDescription>最近 200 条</CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <QueryBoundary
            query={auditQ}
            skeleton={
              <div className="space-y-2 px-6 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Shimmer key={i} className="h-10 w-full" />
                ))}
              </div>
            }
          >
            {(data) =>
              data.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-ink-muted">
                  暂无审计记录
                </p>
              ) : (
                <div className="overflow-hidden border-t border-[var(--c-hairline)]">
                  <table className="w-full text-sm tabular">
                    <thead className="bg-canvas-tint border-b border-[var(--c-hairline)]">
                      <tr>
                        <th className="h-10 w-44 px-6 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">时间</th>
                        <th className="h-10 w-32 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">用户</th>
                        <th className="h-10 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">动作</th>
                        <th className="h-10 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">对象</th>
                        <th className="h-10 w-44 px-4 text-left text-2xs font-semibold uppercase tracking-wider text-ink-dim">结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((r) => {
                        const tone = RESULT_TONE[r.result] ?? 'neutral';
                        const label = ACTION_LABEL[r.action] ?? r.action;
                        return (
                          <tr
                            key={r.id}
                            className="border-b border-[var(--c-hairline)] last:border-b-0 hover:bg-canvas-tint transition-colors duration-fast"
                          >
                            <td className="px-6 py-3 font-mono text-xs text-ink-dim">
                              {formatTs(r.ts)}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-ink-strong">
                              {r.user}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm text-ink-strong">{label}</div>
                              <div className="font-mono text-2xs text-ink-dim">{r.action}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                              {r.target ?? '—'}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={tone}>{r.result}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            }
          </QueryBoundary>
        </CardContent>
      </Card>
    </div>
  );
};
