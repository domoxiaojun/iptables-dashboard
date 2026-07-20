// useKeyboardShortcuts — binds global keyboard shortcuts for the rules page.
// Shortcuts:
//   N         — new rule
//   Delete    — delete selected rules
//   Ctrl+Enter — apply staged changes
//   Escape    — clear selection / close dialog
//   /         — focus search input

import { useEffect, useRef } from 'react';

interface ShortcutMap {
  onNew?: () => void;
  onDelete?: () => void;
  onApply?: () => void;
  onEscape?: () => void;
  onFocusSearch?: () => void;
}

export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  const ref = useRef(shortcuts);
  ref.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Allow Escape even in inputs
        if (e.key !== 'Escape') return;
      }
      // Don't trigger with modifier keys (except Ctrl+Enter)
      if (e.metaKey || e.altKey) return;

      switch (e.key) {
        case 'n':
        case 'N':
          if (!e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            ref.current.onNew?.();
          }
          break;
        case 'Delete':
        case 'Backspace':
          if (!e.ctrlKey && !e.shiftKey) {
            e.preventDefault();
            ref.current.onDelete?.();
          }
          break;
        case 'Enter':
          if (e.ctrlKey) {
            e.preventDefault();
            ref.current.onApply?.();
          }
          break;
        case 'Escape':
          e.preventDefault();
          ref.current.onEscape?.();
          break;
        case '/':
          if (!e.ctrlKey) {
            e.preventDefault();
            ref.current.onFocusSearch?.();
          }
          break;
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [enabled]);
}
