// RuleImportDialog — paste iptables-save format rules and import them.

import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Badge } from '@/components/ui/Badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Family, Mutation, TableKind } from '@/types/api';

interface ImportResp {
  mutations: Mutation[];
  errors: { line: number; message: string }[];
}

export const RuleImportDialog: React.FC<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: Family;
  table: TableKind;
  chain: string;
  onImport: (mutations: Mutation[]) => void;
}> = ({ open, onOpenChange, family, table, chain, onImport }) => {
  const [text, setText] = React.useState('');
  const [result, setResult] = React.useState<ImportResp | null>(null);
  const [loading, setLoading] = React.useState(false);

  const onParse = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const resp = await api.post<ImportResp>('/rules/import', {
        text,
        family,
        table,
        chain,
      });
      setResult(resp);
    } catch (e) {
      toast.error('解析失败', { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const onConfirm = () => {
    if (!result) return;
    onImport(result.mutations);
    onOpenChange(false);
    setText('');
    setResult(null);
    toast.success(`已导入 ${result.mutations.length} 条规则到暂存区`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>导入规则</DialogTitle>
          <DialogDescription>
            粘贴 iptables-save 格式的规则行（如 <code className="rounded bg-canvas-soft px-1 font-mono text-2xs">-A INPUT -p tcp --dport 22 -j ACCEPT</code>）
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
            placeholder={"-A INPUT -p tcp --dport 22 -j ACCEPT\n-A INPUT -p tcp --dport 80 -j ACCEPT\n-A INPUT -p tcp --dport 443 -j ACCEPT"}
            className={cn(
              'h-40 w-full resize-y rounded-md border border-[var(--c-hairline-input)] bg-canvas-card px-3 py-2 font-mono text-xs text-ink-strong',
              'placeholder:text-ink-faint focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:outline-none',
            )}
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={onParse}
            disabled={loading || !text.trim()}
          >
            {loading ? '解析中…' : '解析规则'}
          </Button>

          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="success">{result.mutations.length} 条有效</Badge>
                {result.errors.length > 0 && (
                  <Badge variant="destructive">{result.errors.length} 条错误</Badge>
                )}
              </div>
              {result.errors.length > 0 && (
                <ul className="space-y-1 rounded-md border border-danger/30 bg-danger-tint/20 px-3 py-2">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-danger">
                      行 {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              {result.mutations.length > 0 && (
                <ul className="space-y-1 rounded-md border border-[var(--c-hairline)] bg-canvas-tint/40 px-3 py-2">
                  {result.mutations.slice(0, 10).map((m, i) => (
                    <li key={i} className="font-mono text-xs text-ink">
                      <span className="text-success">+</span>{' '}
                      {m.kind === 'create' && 'spec' in m ? JSON.stringify(m.spec) : '—'}
                    </li>
                  ))}
                  {result.mutations.length > 10 && (
                    <li className="text-xs text-ink-dim">…还有 {result.mutations.length - 10} 条</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            disabled={!result || result.mutations.length === 0}
          >
            导入 {result?.mutations.length ?? 0} 条到暂存区
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
