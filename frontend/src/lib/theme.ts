// Theme manager — light / dark / system, stored in localStorage and applied
// to <html data-theme="...">. Bootstraps before React renders so there's
// no flash of light during hydration. Components read state via useTheme().

import * as React from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'iptd.theme';

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToDom(theme: Theme) {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
}

/** Read stored theme + apply to <html>. Call once from main.tsx before
 *  rendering, to prevent a flash-of-light on dark-mode reload. */
export function bootstrapTheme(): Theme {
  const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  applyToDom(stored);
  return stored;
}

export function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    if (typeof window === 'undefined') return 'system';
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system';
  });

  React.useEffect(() => {
    applyToDom(theme);
    if (theme !== 'system') return;
    // While on system mode, follow OS-level changes live.
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyToDom('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  return { theme, setTheme, resolved: resolveTheme(theme) };
}
