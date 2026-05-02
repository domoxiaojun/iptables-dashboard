import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from '@/components/layout/AppShell';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { RulesPage } from '@/pages/RulesPage';
import { DiffPage } from '@/pages/DiffPage';
import { SnapshotsPage } from '@/pages/SnapshotsPage';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { LogsPage } from '@/pages/LogsPage';
import { AuditPage } from '@/pages/AuditPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { api, ApiError } from '@/lib/api';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
});

const authedLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authed',
  component: AppShell,
  beforeLoad: async () => {
    try {
      await api.get('/me');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        throw redirect({ to: '/login' });
      }
      // network errors etc — let the layout still render and surface them
    }
  },
});

const dashboardRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/',
  component: DashboardPage,
});
const rulesRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/rules',
  component: RulesPage,
});
const diffRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/diff',
  component: DiffPage,
});
const snapshotsRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/snapshots',
  component: SnapshotsPage,
});
const templatesRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/templates',
  component: TemplatesPage,
});
const logsRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/logs',
  component: LogsPage,
});
const auditRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/audit',
  component: AuditPage,
});
const settingsRoute = createRoute({
  getParentRoute: () => authedLayout,
  path: '/settings',
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  authedLayout.addChildren([
    dashboardRoute,
    rulesRoute,
    diffRoute,
    snapshotsRoute,
    templatesRoute,
    logsRoute,
    auditRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
