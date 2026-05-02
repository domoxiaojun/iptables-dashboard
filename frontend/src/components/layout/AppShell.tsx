import * as React from 'react';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { Button } from '@/components/ui/Button';
import { SyncBadge } from '@/components/rules/SyncBadge';
import { useMe } from '@/api/queries';
import { api } from '@/lib/api';
import { useTheme, type Theme } from '@/lib/theme';
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

  // Mobile drawer state. Auto-closes when the route changes so a nav click
  // doesn't leave the overlay covering the new page.
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  // Lock body scroll while the drawer is open.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

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
      {/* Mobile overlay */}
      {drawerOpen && (
        <button
          type="button"
          aria-label="关闭侧栏"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-canvas-deep/40 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={cn(
          'flex h-screen w-60 shrink-0 flex-col',
          'border-r border-[var(--c-hairline)] bg-canvas/90 backdrop-blur-md',
          // Desktop: sticky in flow.
          'lg:sticky lg:top-0 lg:z-20 lg:bg-canvas/60',
          // Mobile: fixed drawer that slides in.
          'fixed inset-y-0 left-0 z-40 transition-transform duration-med ease-out lg:translate-x-0',
          drawerOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between gap-2.5 px-5 pb-7 pt-7">
          <div className="flex items-center gap-2.5">
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
          <button
            type="button"
            aria-label="关闭侧栏"
            onClick={() => setDrawerOpen(false)}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-dim hover:bg-canvas-tint hover:text-ink-strong transition-colors duration-fast lg:hidden"
          >
            <CloseIcon />
          </button>
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
        <header className="sticky top-0 z-10 flex h-[60px] items-center gap-3 border-b border-[var(--c-hairline)] bg-canvas/70 px-4 sm:px-6 lg:px-8 backdrop-blur-md">
          <button
            type="button"
            aria-label="打开侧栏"
            onClick={() => setDrawerOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md text-ink-muted hover:bg-canvas-tint hover:text-ink-strong transition-colors duration-fast lg:hidden"
          >
            <MenuIcon />
          </button>
          <SyncBadge />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={() => location.reload()}>
              <RefreshIcon /> <span className="hidden sm:inline">刷新</span>
            </Button>
          </div>
        </header>

        <main className="relative flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
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

const ThemeToggle: React.FC = () => {
  const { theme, setTheme, resolved } = useTheme();
  // Cycle: light → dark → system → light. Icon shows currently *active* mode.
  const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
  const label =
    theme === 'system' ? `跟随系统 (${resolved === 'dark' ? '夜' : '日'})` : theme === 'dark' ? '夜间' : '日间';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`主题: ${label} → 点击切到 ${next}`}
      aria-label={`切换主题（当前 ${label}）`}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-md',
        'text-ink-muted hover:text-ink-strong hover:bg-canvas-tint',
        'transition-colors duration-fast',
      )}
    >
      {theme === 'system' ? <SystemIcon /> : resolved === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  );
};

function SunIcon() {
  return svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </>,
  );
}
function MoonIcon() {
  return svg(<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />);
}
function SystemIcon() {
  return svg(
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>,
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
function MenuIcon() {
  return svg(
    <>
      <path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" />
    </>,
  );
}
function CloseIcon() {
  return svg(
    <>
      <path d="M6 6l12 12" /><path d="M18 6L6 18" />
    </>,
  );
}
