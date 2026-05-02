//! Apply / preview / confirm / abort.

use crate::api::rules::{apply_mutation, ruleset_hash, Mutation};
use crate::auth::{require_password_changed, AuthSession};
use crate::db::repo::audit;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use ipt_core::{parse_save, render_save, validate_v6, Family};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ApplyReq {
    pub mutations: Vec<Mutation>,
    /// User-provided label for the auto pre-snapshot.
    #[serde(default)]
    pub label: Option<String>,
    /// When true, ICMPv6 guard warnings are not blocking.
    #[serde(default)]
    pub force: bool,
    /// Optional precondition: server-issued hash from the most recent
    /// `/rules/preview`. When present and stale, apply fails with 409
    /// (Conflict) so the client can re-preview against the new state.
    #[serde(default)]
    pub if_v4_hash: Option<String>,
    #[serde(default)]
    pub if_v6_hash: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApplyResp {
    pub token: String,
    pub expires_at: i64,
    /// Number of seconds the client has to confirm before auto-rollback.
    /// Authoritative server-side value; clients should use this rather than
    /// `expires_at - now()` to avoid client-clock drift.
    pub grace_seconds: u32,
    pub guard_warnings: Vec<ipt_core::GuardWarning>,
}

pub async fn apply(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Json(req): Json<ApplyReq>,
) -> AppResult<Json<ApplyResp>> {
    let user = auth_session.user.ok_or(AppError::Unauthorized)?;
    require_password_changed(&user)?;
    if app.two_phase.has_pending().await? {
        return Err(AppError::SafetyLock);
    }

    // 1. Read current ruleset and compute hashes for TOCTOU detection.
    let v4_before = app.executor.save(Family::V4).await.unwrap_or_default();
    let v6_before = app.executor.save(Family::V6).await.unwrap_or_default();
    let v4_hash_now = ruleset_hash(&v4_before);
    let v6_hash_now = ruleset_hash(&v6_before);

    if let Some(expected) = &req.if_v4_hash {
        if expected != &v4_hash_now {
            return Err(AppError::Conflict(
                "IPv4 ruleset has changed since preview — please re-preview and try again".into(),
            ));
        }
    }
    if let Some(expected) = &req.if_v6_hash {
        if expected != &v6_hash_now {
            return Err(AppError::Conflict(
                "IPv6 ruleset has changed since preview — please re-preview and try again".into(),
            ));
        }
    }

    // 2. Parse + apply mutations + render. Single parse per family.
    let mut v4 = parse_save(&v4_before, Family::V4)?;
    let mut v6 = parse_save(&v6_before, Family::V6)?;
    for m in req.mutations {
        apply_mutation(&mut v4, &mut v6, m)?;
    }
    let v4_after = render_save(&v4);
    let v6_after = render_save(&v6);

    // 3. ICMPv6 guard
    let warnings = validate_v6(&v6);
    let blocking = warnings
        .iter()
        .any(|w| w.severity == ipt_core::GuardSeverity::Error);
    if blocking && !req.force {
        return Err(AppError::Guard(format!(
            "{} blocking guard warning(s); pass force=true to override",
            warnings.len()
        )));
    }

    // 4. restore --test for syntax sanity (does not touch the kernel)
    app.executor.restore(Family::V4, &v4_after, true).await?;
    app.executor.restore(Family::V6, &v6_after, true).await?;

    // 5. start two-step activation (records pre-snapshot, registers timer)
    let label = req
        .label
        .unwrap_or_else(|| format!("apply by {}", user.username));
    let pending = app
        .two_phase
        .start(&user.username, &v4_before, &v6_before, &label)
        .await?;

    // 6. actual restore against the kernel
    app.executor.restore(Family::V4, &v4_after, false).await?;
    app.executor.restore(Family::V6, &v6_after, false).await?;
    // Invalidate the read cache so the next /rules GET sees the new state.
    app.rules_cache.invalidate_all().await;

    crate::db::repo::audit::must_write(
        &app.db,
        &user.username,
        "apply.start",
        Some(&pending.token),
        None,
        "ok",
    )
    .await;

    let grace_seconds = app.config.security.two_step_seconds as u32;
    Ok(Json(ApplyResp {
        token: pending.token,
        expires_at: pending.expires_at,
        grace_seconds,
        guard_warnings: warnings,
    }))
}

pub async fn confirm(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<axum::http::StatusCode> {
    let _ = auth_session.user.ok_or(AppError::Unauthorized)?;
    app.two_phase.confirm(&token).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn abort(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<axum::http::StatusCode> {
    let _ = auth_session.user.ok_or(AppError::Unauthorized)?;
    app.two_phase.abort(&token).await?;
    Ok(axum::http::StatusCode::NO_CONTENT)
}

/// GET /api/v1/apply/{token}/status — lets the frontend re-sync its
/// countdown clock with the server-side expiry without relying on the
/// client time being accurate.
#[derive(Debug, Serialize)]
pub struct ApplyStatusResp {
    pub token: String,
    pub expires_at: i64,
    pub remaining_seconds: i64,
}

pub async fn status(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Path(token): Path<String>,
) -> AppResult<Json<ApplyStatusResp>> {
    let _ = auth_session.user.ok_or(AppError::Unauthorized)?;
    let pending = crate::db::repo::pending::get(&app.db, &token)
        .await?
        .ok_or_else(|| AppError::NotFound("apply token".into()))?;
    let now = chrono::Utc::now().timestamp();
    Ok(Json(ApplyStatusResp {
        token: pending.token,
        expires_at: pending.expires_at,
        remaining_seconds: (pending.expires_at - now).max(0),
    }))
}
