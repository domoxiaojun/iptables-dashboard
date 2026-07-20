import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useMe } from '@/api/queries';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';

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

      {/* Runtime Config */}
      <RuntimeConfigCard />

      {/* Backup */}
      <BackupCard />

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
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PwForm>({ resolver: zodResolver(pwSchema) });

  const onSubmit = async (v: PwForm) => {
    setBusy(true);
    try {
      await api.post('/auth/change-password', {
        old_password: v.old_password,
        new_password: v.new_password,
      });
      toast.success('密码已更新', { description: '下次登录使用新密码' });
      reset();
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.status === 401
            ? '旧密码不正确'
            : e.message
          : (e as Error).message;
      toast.error('更新失败', { description: msg });
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

// --- Runtime Config Card ---

interface EffectiveConfig {
  server: { listen: string };
  paths: { data_dir: string; db_path: string };
  security: {
    two_step_seconds: number;
    max_login_attempts: number;
    lockout_seconds: number;
    session_idle_seconds: number;
    api_rate_limit: number;
    trusted_proxies: string[];
    allowed_ips: string[];
  };
  logging: { level: string; format: string };
  cors: { allowed_origins: string[] };
}

const RuntimeConfigCard: React.FC = () => {
  const { data: cfg } = useQuery({
    queryKey: ['config-effective'],
    queryFn: () => api.get<EffectiveConfig>('/config/effective'),
  });

  if (!cfg) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>运行时配置</CardTitle>
        <CardDescription>当前生效的安全与运行参数</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          <ConfigItem label="监听地址" value={cfg.server.listen} />
          <ConfigItem label="数据目录" value={cfg.paths.data_dir} />
          <ConfigItem label="确认窗口" value={`${cfg.security.two_step_seconds}s`} />
          <ConfigItem label="登录限制" value={`${cfg.security.max_login_attempts} 次 / ${cfg.security.lockout_seconds}s`} />
          <ConfigItem label="会话超时" value={`${Math.round(cfg.security.session_idle_seconds / 3600)}h`} />
          <ConfigItem label="API 限流" value={`${cfg.security.api_rate_limit} req/min`} />
          <ConfigItem label="日志级别" value={cfg.logging.level} />
          <ConfigItem label="日志格式" value={cfg.logging.format} />
          <ConfigItem label="允许 IP" value={cfg.security.allowed_ips.length > 0 ? cfg.security.allowed_ips.join(', ') : '全部'} />
        </dl>
      </CardContent>
    </Card>
  );
};

const ConfigItem: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <dt className="text-2xs uppercase tracking-wider text-ink-dim">{label}</dt>
    <dd className="mt-0.5 font-mono text-xs text-ink-strong truncate" title={value}>{value}</dd>
  </div>
);

// --- Backup Card ---

const BackupCard: React.FC = () => {
  const onDownload = async () => {
    try {
      const resp = await fetch('/api/v1/backup', { credentials: 'include' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'iptables-dashboard-backup.sqlite';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('备份已下载');
    } catch (e) {
      toast.error('备份失败', { description: (e as Error).message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>数据备份</CardTitle>
        <CardDescription>下载 SQLite 数据库完整备份</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-ink-muted">
          备份包含所有用户、快照、模板和审计记录。建议定期备份。
        </p>
        <Button variant="secondary" onClick={onDownload}>
          下载备份
        </Button>
      </CardContent>
    </Card>
  );
};
