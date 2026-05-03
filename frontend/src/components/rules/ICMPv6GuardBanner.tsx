import * as React from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/Dialog';
import type { GuardWarning } from '@/types/api';

export const ICMPv6GuardBanner: React.FC<{ warnings: GuardWarning[] }> = ({
  warnings,
}) => {
  const errors = warnings.filter((w) => w.severity === 'error');
  if (errors.length === 0) return null;
  return (
    <Card className="border-danger/30 bg-danger-tint/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-danger">
          <span aria-hidden className="text-base">⚠</span>
          ICMPv6 守卫拦截
          <Badge variant="destructive">{errors.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-ink">
        {errors.map((w, idx) => (
          <div key={idx} className="space-y-1.5">
            <div className="font-medium text-ink-strong">{w.message}</div>
            {w.suggested_rules.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-ink-muted hover:text-ink-strong">
                  建议补充的规则 ({w.suggested_rules.length} 条)
                </summary>
                <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--c-hairline)] bg-canvas-card p-3 text-xs font-mono text-ink scrollbar-thin">
                  {w.suggested_rules.join('\n')}
                </pre>
              </details>
            )}
          </div>
        ))}
        <p className="text-xs text-ink-muted">
          继续应用需要传 <code className="rounded bg-canvas-soft px-1 py-0.5 font-mono text-ink">force: true</code>，并会写入审计日志。
        </p>
      </CardContent>
    </Card>
  );
};

// Modal 版本：在 useApply 拦下时使用
export const ICMPv6GuardModal: React.FC<{
  warnings: GuardWarning[];
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}> = ({ warnings, onConfirm, onCancel, busy }) => {
  const [acknowledged, setAcknowledged] = React.useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogContent danger className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>ICMPv6 守卫拦截</DialogTitle>
          <DialogDescription>
            应用这些变更可能导致 IPv6 不可用。请仔细确认后再继续。
          </DialogDescription>
        </DialogHeader>

        <ICMPv6GuardBanner warnings={warnings} />

        <label className="mt-5 flex items-start gap-2.5 cursor-pointer rounded-lg border border-[var(--c-hairline)] bg-canvas-soft px-4 py-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 cursor-pointer accent-danger"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span className="text-ink">
            我确认了解阻断 ICMPv6 必备类型可能导致 IPv6 不可用，仍要继续应用并接受审计记录。
          </span>
        </label>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={!acknowledged || busy}
          >
            {busy ? '应用中…' : '强制应用 (force)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
