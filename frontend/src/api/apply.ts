// useApply — shared apply-flow state machine for RulesPage / TemplatesPage / SnapshotsPage.
//
// Flow:
//   idle → run(mutations)
//     → POST /rules/preview         (gets diff + guard_warnings)
//     → if guard error & !force     → set `guardBlock`, page renders ICMPv6GuardModal
//     → POST /apply (force?)        → set `pending` (token+expires_at), page renders TwoStepConfirmModal
//     → modal resolves               → onResolved clears pending, invalidates queries

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type {
  ApplyResp,
  GuardWarning,
  Mutation,
  PreviewResp,
} from '@/types/api';

export interface UseApplyOptions {
  /** Query keys to invalidate after a successful apply confirmation. */
  invalidateKeys?: readonly (readonly string[])[];
  /** Optional callback fired after the two-step modal resolves successfully. */
  onSuccess?: (kind: 'confirmed' | 'aborted' | 'expired') => void;
  /** Optional label (auto pre-snapshot label). */
  label?: string;
}

export interface UseApplyReturn {
  /** True while a network request is in flight. */
  busy: boolean;
  /** Last error message, if any. Cleared on the next run(). */
  error: string | null;
  /** Last preview response — useful for showing diff before two-step kicks in. */
  preview: PreviewResp | null;
  /** When set, page should render <TwoStepConfirmModal />. */
  pending: ApplyResp | null;
  /** When set, page should render <ICMPv6GuardModal />. */
  guardBlock: { warnings: GuardWarning[]; mutations: Mutation[] } | null;

  /** Kick off the flow (preview → optional guard → apply). */
  run: (mutations: Mutation[]) => Promise<void>;
  /** User clicked "force": re-run with force=true to bypass ICMPv6 guard. */
  proceedWithForce: () => Promise<void>;
  /** User clicked "cancel" on guard modal. */
  cancelGuard: () => void;
  /** Called by TwoStepConfirmModal's onResolved. */
  onResolved: (kind: 'confirmed' | 'aborted' | 'expired') => void;
  /** Reset all state to idle. */
  reset: () => void;
}

export function useApply(opts: UseApplyOptions = {}): UseApplyReturn {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResp | null>(null);
  const [pending, setPending] = useState<ApplyResp | null>(null);
  const [guardBlock, setGuardBlock] = useState<
    { warnings: GuardWarning[]; mutations: Mutation[] } | null
  >(null);

  const run = useCallback(
    async (mutations: Mutation[], force = false) => {
      setBusy(true);
      setError(null);
      try {
        const previewResp = await api.post<PreviewResp>('/rules/preview', {
          mutations,
        });
        setPreview(previewResp);

        const errorWarnings = previewResp.guard_warnings.filter(
          (w) => w.severity === 'error',
        );
        if (errorWarnings.length > 0 && !force) {
          setGuardBlock({ warnings: errorWarnings, mutations });
          return;
        }

        const result = await api.post<ApplyResp>('/apply', {
          mutations,
          label: opts.label,
          force,
          // TOCTOU guard: server rejects with 409 if the kernel ruleset has
          // changed between preview and apply. The frontend just re-runs
          // the flow on conflict (callers handle ApiError(409) themselves).
          if_v4_hash: previewResp.v4_hash,
          if_v6_hash: previewResp.v6_hash,
        });
        setGuardBlock(null);
        setPending(result);
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : (e as Error).message ?? 'apply failed';
        setError(msg);
        setGuardBlock(null);
      } finally {
        setBusy(false);
      }
    },
    [opts.label],
  );

  const proceedWithForce = useCallback(async () => {
    if (!guardBlock) return;
    await run(guardBlock.mutations, true);
  }, [guardBlock, run]);

  const cancelGuard = useCallback(() => {
    setGuardBlock(null);
  }, []);

  const onResolved = useCallback(
    (kind: 'confirmed' | 'aborted' | 'expired') => {
      setPending(null);
      if (opts.invalidateKeys) {
        for (const key of opts.invalidateKeys) {
          qc.invalidateQueries({ queryKey: key as string[] });
        }
      }
      opts.onSuccess?.(kind);
    },
    [qc, opts],
  );

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
    setPreview(null);
    setPending(null);
    setGuardBlock(null);
  }, []);

  return {
    busy,
    error,
    preview,
    pending,
    guardBlock,
    run: (mutations) => run(mutations, false),
    proceedWithForce,
    cancelGuard,
    onResolved,
    reset,
  };
}

/// Convenience helper: run apply for an externally-staged token (e.g. from
/// snapshot restore which already returns a token without going through preview).
export interface TokenLike {
  token: string;
  expires_at: number;
}

export function useExternalApply(opts: UseApplyOptions = {}) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<TokenLike | null>(null);

  const setToken = useCallback((token: TokenLike) => setPending(token), []);
  const onResolved = useCallback(
    (kind: 'confirmed' | 'aborted' | 'expired') => {
      setPending(null);
      if (opts.invalidateKeys) {
        for (const key of opts.invalidateKeys) {
          qc.invalidateQueries({ queryKey: key as string[] });
        }
      }
      opts.onSuccess?.(kind);
    },
    [qc, opts],
  );

  return { pending, setToken, onResolved };
}
