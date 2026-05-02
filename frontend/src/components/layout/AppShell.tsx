import * as React from 'react';
import { Link, Outlet, useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/Button';
import { SyncBadge } from '@/components/rules/SyncBadge';
import { useMe } from '@/api/queries';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const navTop = [
  { to: '/', label: '仪表盘', icon: HomeIcon },
  { to: '/rules', label: '规则', icon: ListIcon },
  { to: '/diff', label: '双栈对比', icon: SwapIcon },
  { to: '/snapshots', label: '快照', icon: ClockIcon },
] as const;

const navOps = [
  { to: '/templates', label: '模板库', icon: TemplateIcon },
  { to: '/logs', label: '日志', icon: LogIcon },
  { to: '/audit', label: '审计', icon: ShieldIcon },
  { to: '/settings', label: '设置', icon: GearIcon },
] as const;

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const initial = (me?.username ?? '?').slice(0, 1).toUpperCase();

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* noop */
    }
    navigate({ to: '/login' });
  };

  return (
    <div className="bg-aurora-warm relative flex min-h-screen">
      <aside
        className={cn(
          'sticky top-0 z-20 flex h-screen w-60 shrink-0 flex-col',
          'border-r border-[var(--c-hairline)] bg-canvas/60 backdrop-blur-md',
        )}
      >
        <div className="flex items-center gap-2.5 px-5 pb-7 pt-7">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-grad-brand text-sm font-bold text-white shadow-2">
            ▸
          </div>
          <div className="leading-tight">
            <div className="text-[15px] font-bold tracking-tight text-ink-strong">
              iptables
            </div>
            <div className="text-[11px] text-ink-dim">
              v0.1.0 · {me?.username ?? '...'}
            </div>
          </div>
        </div>

        <NavSection title="面板" items={navTop} />
        <NavSection title="运维" items={navOps} className="mt-2" />

        <div className="mt-auto flex items-center gap-2.5 border-t border-[var(--c-hairline)] px-5 py-4">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-grad-brand text-xs font-bold text-white">
            {initial}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[13px] font-medium text-ink-strong">
              {me?.username ?? '—'}
            </div>
            <div className="text-[11px] text-ink-dim">运维 · UTC</div>
          </div>
          <button
            onClick={logout}
            title="登出"
            className="grid h-7 w-7 place-items-center rounded-md text-ink-dim hover:bg-canvas-tint hover:text-ink-strong transition-colors duration-fast"
          >
            <LogoutIcon />
          </button>
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-[var(--c-hairline)] bg-canvas/70 px-8 backdrop-blur-md">
          <SyncBadge />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => location.reload()}>
              <RefreshIcon /> 刷新
            </Button>
          </div>
        </header>

        <main className="relative flex-1 overflow-x-hidden p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

const NavSection: React.FC<{
  title: string;
  items: ReadonlyArray<{ to: string; label: string; icon: React.FC }>;
  className?: string;
}> = ({ title, items, className }) => (
  <div className={cn('px-3', className)}>
    <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
      {title}
    </div>
    <nav className="flex flex-col gap-px">
      {items.map((it) => (
        <Link
          key={it.to}
          to={it.to as '/'}
          className={cn(
            'group flex items-center gap-2.5 rounded-md px-2.5 py-2',
            'text-sm font-medium text-ink-muted',
            'transition-colors duration-fast ease-out',
            'hover:bg-canvas-tint hover:text-ink-strong',
          )}
          activeProps={{
            className: 'bg-brand-tint !text-brand font-semibold',
          }}
        >
          <span className="grid h-4 w-4 place-items-center text-current opacity-80 group-hover:opacity-100">
            <it.icon />
          </span>
          <span className="truncate">{it.label}</span>
        </Link>
      ))}
    </nav>
  </div>
);

/* ---------- inline SVG icons (consistent stroke width 1.6) ---------- */

function svg(path: React.ReactNode) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

function HomeIcon() {
  return svg(
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9" />
    </>,
  );
}
function ListIcon() {
  return svg(
    <>
      <path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" />
      <circle cx="3.5" cy="6" r="1" /><circle cx="3.5" cy="12" r="1" /><circle cx="3.5" cy="18" r="1" />
    </>,
  );
}
function SwapIcon() {
  return svg(
    <>
      <path d="m3 7 4-4 4 4" /><path d="M7 3v18" />
      <path d="m21 17-4 4-4-4" /><path d="M17 21V3" />
    </>,
  );
}
function ClockIcon() {
  return svg(
    <>
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </>,
  );
}
function TemplateIcon() {
  return svg(
    <>
      <rect x="3" y="3" width="18" height="6" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>,
  );
}
function LogIcon() {
  return svg(
    <>
      <path d="M4 4h12l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M14 4v5h5" /><path d="M8 13h8M8 17h6" />
    </>,
  );
}
function ShieldIcon() {
  return svg(
    <>
      <path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </>,
  );
}
function GearIcon() {
  return svg(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>,
  );
}
function LogoutIcon() {
  return svg(
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
    </>,
  );
}
function RefreshIcon() {
  return svg(
    <>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
    </>,
  );
}
