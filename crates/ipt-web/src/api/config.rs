//! Runtime config inspection (redacted) and database backup/restore.

use crate::auth::{require_password_changed, AuthSession};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::body::Body;
use axum::extract::State;
use axum::http::{header, StatusCode};
use axum::response::Response;
use serde::Serialize;

/// Redacted view of the effective configuration — safe to expose via API.
#[derive(Debug, Serialize)]
pub struct EffectiveConfig {
    pub server: ServerView,
    pub paths: PathsView,
    pub security: SecurityView,
    pub logging: LoggingView,
    pub cors: CorsView,
}

#[derive(Debug, Serialize)]
pub struct ServerView {
    pub listen: String,
}

#[derive(Debug, Serialize)]
pub struct PathsView {
    pub data_dir: String,
    pub db_path: String,
}

#[derive(Debug, Serialize)]
pub struct SecurityView {
    pub two_step_seconds: u64,
    pub max_login_attempts: u32,
    pub lockout_seconds: u64,
    pub session_idle_seconds: u64,
    pub api_rate_limit: u32,
    pub trusted_proxies: Vec<String>,
    pub allowed_ips: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct LoggingView {
    pub level: String,
    pub format: String,
}

#[derive(Debug, Serialize)]
pub struct CorsView {
    pub allowed_origins: Vec<String>,
}

/// GET /api/v1/config/effective — returns the redacted effective config.
pub async fn effective(
    auth_session: AuthSession,
    State(app): State<AppState>,
) -> AppResult<axum::Json<EffectiveConfig>> {
    let _user = auth_session.user.ok_or(AppError::Unauthorized)?;
    let cfg = &app.config;
    Ok(axum::Json(EffectiveConfig {
        server: ServerView {
            listen: cfg.server.listen.clone(),
        },
        paths: PathsView {
            data_dir: cfg.paths.data_dir.display().to_string(),
            db_path: cfg.paths.db_path().display().to_string(),
        },
        security: SecurityView {
            two_step_seconds: cfg.security.two_step_seconds,
            max_login_attempts: cfg.security.max_login_attempts,
            lockout_seconds: cfg.security.lockout_seconds,
            session_idle_seconds: cfg.security.session_idle_seconds,
            api_rate_limit: cfg.security.api_rate_limit,
            trusted_proxies: cfg.security.trusted_proxies.clone(),
            allowed_ips: cfg.security.allowed_ips.clone(),
        },
        logging: LoggingView {
            level: cfg.logging.level.clone(),
            format: cfg.logging.format.clone(),
        },
        cors: CorsView {
            allowed_origins: cfg.cors.allowed_origins.clone(),
        },
    }))
}

/// GET /api/v1/backup — download the SQLite database file.
pub async fn backup(
    auth_session: AuthSession,
    State(app): State<AppState>,
) -> AppResult<Response> {
    let _user = auth_session.user.ok_or(AppError::Unauthorized)?;
    require_password_changed(&_user)?;

    let db_path = app.config.paths.db_path();
    let data = tokio::fs::read(&db_path)
        .await
        .map_err(|e| AppError::Internal(format!("read db: {e}")))?;

    let body = Body::from(data);
    let resp = Response::builder()
        .status(StatusCode::OK)
        .header(
            header::CONTENT_TYPE,
            "application/octet-stream",
        )
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"iptables-dashboard-backup.sqlite\"",
        )
        .body(body)
        .map_err(|e| AppError::Internal(format!("build response: {e}")))?;
    Ok(resp)
}
