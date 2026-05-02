import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMe } from '@/api/queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';

const pwSchema = z
  .object({
    old_password: z.string().min(1, '必填'),
    new_password: z.string().min(8, '至少 8 位'),
    confirm: z.string(),
  })
  .refine((d) => d.new_password === d.confirm, {
    path: ['confirm'],
    message: '两次输入不一致',
  })
  .refine((d) => d.new_password !== d.old_password, {
    path: ['new_password'],
    message: '新密码不能与旧密码相同',
  });

type PwForm = z.infer<typeof pwSchema>;

export const SettingsPage: React.FC = () => {
  const { data: me } = useMe();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink-strong">设置</h1>
        <p className="mt-1 text-sm text-ink-muted">账户、安全与关于</p>
      </header>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>账户</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-2xs uppercase tracking-wider text-ink-dim">用户名</dt>
              <dd className="mt-1 text-sm font-medium text-ink-strong">
                {me?.username ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wider text-ink-dim">用户 ID</dt>
              <dd className="mt-1 font-mono text-sm text-ink-strong">
                {me?.id ?? '—'}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wider text-ink-dim">必须改密</dt>
              <dd className="mt-1">
                {me?.must_change_password ? (
                  <Badge variant="destructive">是</Badge>
                ) : (
                  <Badge variant="success">已修改</Badge>
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <ChangePasswordCard />

      {/* About */}
      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
          <CardDescription>iptables-dashboard · v0.1.0</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-ink-muted">
          <p>
            IPv4 / IPv6 双栈防火墙的可视化管理面板。
          </p>
          <p>
            后端 Rust + axum + sqlx，前端 React 18 + Vite + Tailwind + TanStack Router。
            部署模式：Docker（host network + CAP_NET_ADMIN）。
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

const ChangePasswordCard: React.FC = () => {
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<
    | { kind: 'ok' }
    | { kind: 'err'; message: string }
    | null
  >(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PwForm>({ resolver: zodResolver(pwSchema) });

  const onSubmit = async (v: PwForm) => {
    setBusy(true);
    setStatus(null);
    try {
      await api.post('/auth/change-password', {
        old_password: v.old_password,
        new_password: v.new_password,
      });
      setStatus({ kind: 'ok' });
      reset();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 401
            ? '旧密码不正确'
            : e.message
          : (e as Error).message;
      setStatus({ kind: 'err', message: msg });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>
          至少 8 位字符；不能与旧密码相同
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid max-w-md gap-4" onSubmit={handleSubmit(onSubmit)}>
          <Field
            label="当前密码"
            error={errors.old_password?.message}
          >
            <Input
              type="password"
              autoComplete="current-password"
              error={!!errors.old_password}
              {...register('old_password')}
            />
          </Field>
          <Field
            label="新密码"
            error={errors.new_password?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              error={!!errors.new_password}
              {...register('new_password')}
            />
          </Field>
          <Field
            label="确认新密码"
            error={errors.confirm?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              error={!!errors.confirm}
              {...register('confirm')}
            />
          </Field>

          {status?.kind === 'ok' && (
            <div className="rounded-md border border-success/30 bg-success-tint px-3 py-2 text-sm text-success">
              ✓ 密码已更新。下次登录使用新密码。
            </div>
          )}
          {status?.kind === 'err' && (
            <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
              ⚠ {status.message}
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? '保存中…' : '更新密码'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

const Field: React.FC<{
  label: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, error, children }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-medium text-ink-strong">{label}</label>
    {children}
    {error && <p className="text-2xs text-danger">{error}</p>}
  </div>
);
