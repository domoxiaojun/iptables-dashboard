import * as React from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { CountdownRing } from '@/components/react-bits/CountdownRing';
import { api, ApiError } from '@/lib/api';
import type { ApplyStatusResp } from '@/types/api';

// Stripe-warm two-step confirm modal:
// - 顶部品牌幻彩 accent
// - 大圆环倒计时（最后 5s 变红）
// - 底部双按钮：保留 / 立即回滚
// - 在 < 5s 时按钮也加 pulse 提示
//
// 倒计时由两路独立维持：
// 1. 本地 setInterval 每 200ms 平滑递减（视觉流畅）
// 2. 每 5s 调用 /apply/{token}/status 用服务端权威 remaining 校正
//    （防止客户端时钟漂移导致 UI 与真实回滚时间错位）

const LOCAL_TICK_MS = 200;
const SERVER_SYNC_MS = 5000;

export const TwoStepConfirmModal: React.FC<{
  token: string;
  expiresAt: number; // seconds since epoch
  graceSeconds?: number; // server-reported total grace window
  onResolved: (kind: 'confirmed' | 'aborted' | 'expired') => void;
}> = ({ token, expiresAt, graceSeconds, onResolved }) => {
  const totalMs = (graceSeconds ?? Math.ceil((expiresAt * 1000 - Date.now()) / 1000)) * 1000;
  const [remainingMs, setRemainingMs] = React.useState(
    Math.max(0, expiresAt * 1000 - Date.now()),
  );
  const [busy, setBusy] = React.useState(false);

  const onResolvedRef = React.useRef(onResolved);
  onResolvedRef.current = onResolved;

  // Local tick — smooth UI decrement.
  React.useEffect(() => {
    const id = setInterval(() => {
      setRemainingMs((r) => {
        const next = Math.max(0, r - LOCAL_TICK_MS);
        if (next === 0 && r > 0) {
          onResolvedRef.current('expired');
        }
        return next;
      });
    }, LOCAL_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Server sync — corrects for client clock drift.
  React.useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const s = await api.get<ApplyStatusResp>(`/apply/${token}/status`);
        if (cancelled) return;
        setRemainingMs(Math.max(0, s.remaining_seconds * 1000));
        if (s.remaining_seconds <= 0) {
          onResolvedRef.current('expired');
        }
      } catch (e) {
        // 404 means the token already finalized (confirmed or rolled back).
        if (e instanceof ApiError && e.status === 404) {
          onResolvedRef.current('expired');
        }
        // other transient errors: ignore — local tick still drives the UI
      }
    };
    const id = setInterval(sync, SERVER_SYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [token]);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.post(`/apply/${token}/confirm`);
      toast.success('变更已保留', { description: '规则继续生效' });
      onResolved('confirmed');
    } catch (e) {
      toast.error('确认失败', {
        description: e instanceof ApiError ? e.message : '网络错误',
      });
    } finally {
      setBusy(false);
    }
  };
  const abort = async () => {
    setBusy(true);
    try {
      await api.post(`/apply/${token}/abort`);
      toast.info('已回滚到旧规则');
      onResolved('aborted');
    } catch (e) {
      toast.error('回滚失败', {
        description: e instanceof ApiError ? e.message : '网络错误',
      });
    } finally {
      setBusy(false);
    }
  };

  const danger = remainingMs <= 5000;

  return (
    <Dialog
      open
      onOpenChange={() => {
        /* not dismissable except via the buttons */
      }}
      dismissable={false}
      title="变更已应用 — 请确认保留"
      description="如果你被锁在外面，无需操作。倒计时归零后将自动回滚到旧规则。"
      className="max-w-md"
    >
      <div className="flex flex-col items-center gap-5 py-2">
        <CountdownRing remainingMs={remainingMs} totalMs={totalMs} />

        <p className="px-2 text-center text-sm text-ink-muted">
          请在
          <span className="font-semibold text-ink-strong">
            {Math.ceil(remainingMs / 1000)}
          </span>
          秒内决定。期间内规则<strong className="text-ink-strong">已生效</strong>，
          但服务器会跟踪这个 token，超时未确认就自动回滚。
        </p>

        <div className="flex w-full gap-2 pt-1">
          <Button
            variant="destructive"
            className="flex-1"
            onClick={abort}
            disabled={busy}
          >
            立刻回滚
          </Button>
          <Button
            variant="primary"
            className={`flex-1 ${danger ? 'animate-pulse' : ''}`}
            onClick={confirm}
            disabled={busy}
          >
            保留更改
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
