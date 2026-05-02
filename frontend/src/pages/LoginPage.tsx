import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { AuroraBackground } from '@/components/react-bits/AuroraBackground';
import { GradientText } from '@/components/react-bits/GradientText';
import { api, ApiError } from '@/lib/api';

const schema = z.object({
  username: z.string().min(1, '用户名必填'),
  password: z.string().min(1, '密码必填'),
});

type FormValues = z.infer<typeof schema>;

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setBusy(true);
    try {
      await api.post('/auth/login', values);
      navigate({ to: '/' });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 401) setError('用户名或密码错误');
        else if (e.status === 403) setError('登录尝试过多，请稍后再试');
        else setError(e.message);
      } else {
        setError('登录失败，请检查网络');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuroraBackground fixed>
      <div className="relative z-10 flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md rise-in">
          {/* Brand mark */}
          <div className="mb-7 flex flex-col items-center gap-4 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-xl bg-grad-brand text-2xl font-bold text-white shadow-accent">
              ▸
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-ink-strong">
                登录到 <GradientText>iptables</GradientText>
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                IPv4 / IPv6 双栈防火墙的可视化管理
              </p>
            </div>
          </div>

          {/* Card */}
          <div className="rounded-xl border border-[var(--c-hairline)] bg-canvas-card/95 p-7 shadow-pop backdrop-blur-md">
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
              <Field
                label="用户名"
                error={errors.username?.message}
              >
                <Input
                  autoComplete="username"
                  autoFocus
                  placeholder="admin"
                  error={!!errors.username}
                  {...register('username')}
                />
              </Field>

              <Field label="密码" error={errors.password?.message}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  placeholder="•••••••••"
                  error={!!errors.password}
                  {...register('password')}
                />
              </Field>

              {error && (
                <div className="rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="gradient"
                size="lg"
                className="w-full"
                disabled={busy}
              >
                {busy ? '登录中…' : '登录'}
              </Button>
            </form>

            <div className="mt-5 text-center text-xs text-ink-dim">
              首次启动时密码写在
              <code className="mx-1 rounded bg-canvas-soft px-1.5 py-0.5 font-mono text-ink-muted">
                $IPTD_DATA_DIR/initial-admin-password.txt
              </code>
            </div>
          </div>

          <div className="mt-7 text-center text-xs text-ink-dim">
            <span>iptables-dashboard · v0.1.0 · MIT</span>
          </div>
        </div>
      </div>
    </AuroraBackground>
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
