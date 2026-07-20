//! Two-step activation: every state-changing operation runs through a
//! short-lived "pending" window. If the user does not confirm within
//! `two_step_seconds`, the pre-snapshot is restored automatically.
//!
//! Two layers of protection:
//! 1. In-process: `tokio::sync::oneshot` + `tokio::time::sleep`
//! 2. Crash-safe: a JSON file under data_dir is written before the apply;
//!    on startup `recover()` rolls back any unfinished pending applies.
//!
//! A wedged tokio runtime that still keeps the HTTP listener alive is not
//! handled in-process — instead we rely on `systemd Restart=on-failure`
//! (binary install) or Docker `--restart=unless-stopped` + HEALTHCHECK
//! (container install) to kill and restart the process, which then runs
//! `recover()` on startup.
//!
//! Failure handling: if a rollback partially succeeds (v4 OK, v6 fails or
//! vice versa), the kernel is left in a mixed state. We do NOT silently
//! delete the pending record; instead we write an audit log error and
//! keep the row so a manual abort or the next startup recover() can
//! retry.

use crate::db::repo::{audit, pending as pending_repo, snapshots as snap_repo};
use crate::error::AppError;
use chrono::Utc;
use ipt_core::{Family, SnapshotKind};
use ipt_executor::Executor;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{oneshot, Mutex};
use tokio::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingMeta {
    pub token: String,
    pub user: String,
    pub pre_snapshot_id: i64,
    pub expires_at: i64,
}

pub struct TwoPhaseManager {
    db: SqlitePool,
    executor: Arc<dyn Executor>,
    two_step: Duration,
    /// Map token -> oneshot sender for confirm/abort.
    senders: Mutex<HashMap<String, oneshot::Sender<Decision>>>,
    pending_path: PathBuf,
}

#[derive(Debug)]
enum Decision {
    Confirm,
    Abort,
}

#[derive(Debug, thiserror::Error)]
pub enum SafetyError {
    #[error("token not found")]
    #[allow(dead_code)]
    NotFound,
    #[error("token already finalized")]
    #[allow(dead_code)]
    AlreadyFinalized,
}

impl TwoPhaseManager {
    pub fn new(
        db: SqlitePool,
        executor: Arc<dyn Executor>,
        two_step: Duration,
        pending_path: PathBuf,
    ) -> Arc<Self> {
        Arc::new(Self {
            db,
            executor,
            two_step,
            senders: Mutex::new(HashMap::new()),
            pending_path,
        })
    }

    /// Start a pending apply: persist a pre-snapshot, write pending.json,
    /// schedule auto-rollback, return the token.
    pub async fn start(
        self: &Arc<Self>,
        user: &str,
        v4_save: &str,
        v6_save: &str,
        label: &str,
    ) -> Result<PendingMeta, AppError> {
        let pre_id = snap_repo::create(
            &self.db,
            label,
            user,
            v4_save,
            v6_save,
            SnapshotKind::AutoPreApply,
        )
        .await?;
        let token = uuid::Uuid::new_v4().to_string();
        let expires_at = Utc::now().timestamp() + self.two_step.as_secs() as i64;
        let meta = PendingMeta {
            token: token.clone(),
            user: user.to_string(),
            pre_snapshot_id: pre_id,
            expires_at,
        };
        pending_repo::put(
            &self.db,
            &pending_repo::PendingRecord {
                token: token.clone(),
                user: user.into(),
                pre_snapshot_id: pre_id,
                expires_at,
            },
        )
        .await?;
        self.persist_pending().await?;

        let (tx, rx) = oneshot::channel();
        self.senders.lock().await.insert(token.clone(), tx);

        // schedule background timer
        let this = Arc::clone(self);
        let tok = token.clone();
        tokio::spawn(async move {
            this.run_timer(tok, rx).await;
        });

        Ok(meta)
    }

    async fn run_timer(self: Arc<Self>, token: String, rx: oneshot::Receiver<Decision>) {
        let timer = tokio::time::sleep(self.two_step);
        tokio::pin!(timer);
        let outcome: Result<(), AppError> = tokio::select! {
            _ = &mut timer => {
                tracing::warn!(token = %token, "two-step grace period expired — auto rolling back");
                self.rollback_token(&token, true).await
            }
            decision = rx => {
                match decision {
                    Ok(Decision::Confirm) => {
                        tracing::info!(token = %token, "apply confirmed");
                        self.finalize_token(&token).await
                    }
                    Ok(Decision::Abort) => {
                        tracing::info!(token = %token, "apply aborted by user");
                        self.rollback_token(&token, false).await
                    }
                    Err(_) => {
                        tracing::warn!(token = %token, "two-phase sender dropped — rolling back");
                        self.rollback_token(&token, false).await
                    }
                }
            }
        };
        if let Err(e) = outcome {
            tracing::error!(token = %token, error = %e, "two-phase finalization failed");
        }
        self.senders.lock().await.remove(&token);
    }

    pub async fn confirm(&self, token: &str) -> Result<(), AppError> {
        let mut senders = self.senders.lock().await;
        let tx = senders
            .remove(token)
            .ok_or_else(|| AppError::NotFound("apply token".into()))?;
        let _ = tx.send(Decision::Confirm);
        Ok(())
    }

    pub async fn abort(&self, token: &str) -> Result<(), AppError> {
        let mut senders = self.senders.lock().await;
        let tx = senders
            .remove(token)
            .ok_or_else(|| AppError::NotFound("apply token".into()))?;
        let _ = tx.send(Decision::Abort);
        Ok(())
    }

    pub async fn has_pending(&self) -> Result<bool, AppError> {
        Ok(pending_repo::count_active(&self.db).await? > 0)
    }

    async fn finalize_token(&self, token: &str) -> Result<(), AppError> {
        pending_repo::delete(&self.db, token).await?;
        self.persist_pending().await?;
        audit::write(
            &self.db,
            "system",
            "apply.confirm",
            Some(token),
            None,
            "ok",
        )
        .await?;
        Ok(())
    }

    /// Roll back kernel state to the pre-apply snapshot. Both v4 and v6
    /// restores are attempted independently; if either fails we keep the
    /// pending row so the next manual abort or `recover()` can retry.
    async fn rollback_token(&self, token: &str, automatic: bool) -> Result<(), AppError> {
        let pending = pending_repo::get(&self.db, token)
            .await?
            .ok_or_else(|| AppError::NotFound("apply token".into()))?;
        let snap = snap_repo::get(&self.db, pending.pre_snapshot_id)
            .await?
            .ok_or_else(|| AppError::Internal("snapshot missing".into()))?;

        // Try both family restores independently.
        let v4_result = if !snap.v4_save.trim().is_empty() {
            self.executor.restore(Family::V4, &snap.v4_save, false).await
        } else {
            Ok(())
        };
        let v6_result = if !snap.v6_save.trim().is_empty() {
            self.executor.restore(Family::V6, &snap.v6_save, false).await
        } else {
            Ok(())
        };

        let v4_err: Option<String> = v4_result.as_ref().err().map(|e| e.to_string());
        let v6_err: Option<String> = v6_result.as_ref().err().map(|e| e.to_string());

        if v4_err.is_some() || v6_err.is_some() {
            // Partial rollback. Record the per-family error so an operator
            // can read it from the audit log; keep the pending row so the
            // next manual abort or recover() iteration can retry.
            let combined = format!(
                "v4: {} | v6: {}",
                v4_err.as_deref().unwrap_or("ok"),
                v6_err.as_deref().unwrap_or("ok")
            );
            tracing::error!(token = %token, %combined, "partial rollback — pending row kept for retry");
            let details = serde_json::json!({
                "v4_error": v4_err,
                "v6_error": v6_err,
                "automatic": automatic,
            });
            audit::write(
                &self.db,
                &pending.user,
                "apply.rollback",
                Some(token),
                Some(&details),
                "partial_rollback",
            )
            .await
            .ok();
            self.persist_pending().await.ok();
            return Err(AppError::Internal(format!("partial rollback: {combined}")));
        }

        // Both restores OK — finalize.
        snap_repo::create(
            &self.db,
            &format!(
                "rollback of token {}{}",
                token,
                if automatic { " (auto)" } else { "" }
            ),
            &pending.user,
            &snap.v4_save,
            &snap.v6_save,
            SnapshotKind::AutoRollback,
        )
        .await?;
        pending_repo::delete(&self.db, token).await?;
        self.persist_pending().await?;
        audit::write(
            &self.db,
            &pending.user,
            "apply.rollback",
            Some(token),
            None,
            if automatic { "auto_rollback" } else { "manual_rollback" },
        )
        .await?;
        Ok(())
    }

    /// Persist the current set of pending tokens to disk so a process
    /// restart can detect dangling applies and roll them back.
    async fn persist_pending(&self) -> Result<(), AppError> {
        let list = pending_repo::list(&self.db).await?;
        if let Some(parent) = self.pending_path.parent() {
            tokio::fs::create_dir_all(parent).await.ok();
        }
        let json = serde_json::to_string_pretty(&list)
            .map_err(|e| AppError::Internal(format!("serde: {e}")))?;
        tokio::fs::write(&self.pending_path, json).await?;
        Ok(())
    }

    /// On startup, roll back any unfinished pending applies. A failure on
    /// any single token is logged but does not abort the loop; the row
    /// stays in `pending_apply` and gets retried on the next start.
    pub async fn recover(self: Arc<Self>) -> Result<usize, AppError> {
        let list = pending_repo::list(&self.db).await?;
        let n = list.len();
        for p in list {
            tracing::warn!(token = %p.token, "recovering unfinished pending apply");
            if let Err(e) = self.rollback_token(&p.token, true).await {
                tracing::error!(token = %p.token, error = %e, "recovery rollback failed — row kept for next start");
            }
        }
        Ok(n)
    }
}
