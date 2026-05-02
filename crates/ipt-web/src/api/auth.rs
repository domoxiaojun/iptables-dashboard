//! Authentication endpoints — login, logout, current user, change password.

use crate::auth::{hash_password, AuthSession, Credentials};
use crate::db::repo::{audit, login_attempts, users};
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{ConnectInfo, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use chrono::Utc;
use ipnet::IpNet;
use password_auth::{verify_password, VerifyError};
use serde::{Deserialize, Serialize};
use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;

/// Resolve the originating client IP. When the connection peer matches a
/// configured trusted proxy entry — either an exact IP or a CIDR range
/// (e.g. `172.17.0.0/16` for the default Docker bridge) — we trust the
/// right-most entry in `X-Forwarded-For`. Otherwise we fall back to the
/// peer IP.
pub(crate) fn client_ip(
    headers: &HeaderMap,
    connect: SocketAddr,
    trusted_proxies: &[String],
) -> String {
    let peer_ip = connect.ip();
    let is_trusted = trusted_proxies.iter().any(|s| trusted_match(s, peer_ip));
    if is_trusted {
        if let Some(xff) = headers.get("x-forwarded-for").and_then(|h| h.to_str().ok()) {
            // Take the right-most entry (closest to the trusted proxy) — XFF
            // is comma-separated, leftmost is the original client.
            if let Some(last) = xff.split(',').map(|s| s.trim()).filter(|s| !s.is_empty()).next_back() {
                return last.to_string();
            }
        }
    }
    peer_ip.to_string()
}

/// Match a single entry against an IP. Supports both exact IP literals
/// (`10.0.0.5`, `::1`) and CIDR ranges (`172.17.0.0/16`, `2001:db8::/32`).
/// Invalid entries are silently skipped.
pub(crate) fn trusted_match(entry: &str, peer: IpAddr) -> bool {
    if let Ok(net) = IpNet::from_str(entry) {
        return net.contains(&peer);
    }
    if let Ok(ip) = IpAddr::from_str(entry) {
        return ip == peer;
    }
    false
}

pub async fn login(
    mut auth_session: AuthSession,
    State(app): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    Json(creds): Json<Credentials>,
) -> AppResult<StatusCode> {
    let ip = client_ip(&headers, addr, &app.config.security.trusted_proxies);
    // brute-force protection
    let window_start = Utc::now().timestamp() - app.config.security.lockout_seconds as i64;
    let failures = login_attempts::count_failed_since(&app.db, &ip, window_start)
        .await
        .unwrap_or(0);
    if failures as u32 >= app.config.security.max_login_attempts {
        return Err(AppError::Forbidden);
    }

    let user = match auth_session.authenticate(creds.clone()).await {
        Ok(Some(u)) => u,
        Ok(None) => {
            login_attempts::record(&app.db, &ip, false).await.ok();
            return Err(AppError::Unauthorized);
        }
        Err(e) => {
            tracing::error!(error = ?e, "auth backend error");
            login_attempts::record(&app.db, &ip, false).await.ok();
            return Err(AppError::Internal("auth failure".into()));
        }
    };

    if let Err(e) = auth_session.login(&user).await {
        tracing::error!(error = ?e, "login session create failed");
        return Err(AppError::Internal("session create failed".into()));
    }

    login_attempts::record(&app.db, &ip, true).await.ok();
    users::touch_login(&app.db, user.id).await.ok();
    audit::must_write(
        &app.db,
        &user.username,
        "auth.login",
        Some(&ip),
        None,
        "ok",
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}

pub async fn logout(mut auth_session: AuthSession) -> AppResult<StatusCode> {
    auth_session
        .logout()
        .await
        .map_err(|e| AppError::Internal(format!("logout failed: {e:?}")))?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Serialize)]
pub struct MeResp {
    pub id: i64,
    pub username: String,
    pub must_change_password: bool,
}

pub async fn me(auth_session: AuthSession) -> AppResult<Json<MeResp>> {
    let user = auth_session.user.ok_or(AppError::Unauthorized)?;
    Ok(Json(MeResp {
        id: user.id,
        username: user.username,
        must_change_password: user.must_change_password,
    }))
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordReq {
    pub old_password: String,
    pub new_password: String,
}

pub async fn change_password(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Json(req): Json<ChangePasswordReq>,
) -> AppResult<StatusCode> {
    let user = auth_session.user.ok_or(AppError::Unauthorized)?;
    if req.new_password.len() < 8 {
        return Err(AppError::Validation(
            "new password must be at least 8 characters".into(),
        ));
    }
    if req.old_password == req.new_password {
        return Err(AppError::Validation(
            "new password must differ from the old one".into(),
        ));
    }

    // Verify the old password against the stored hash.
    match verify_password(&req.old_password, &user.password_hash) {
        Ok(()) => {}
        Err(VerifyError::PasswordInvalid) => {
            audit::must_write(
                &app.db,
                &user.username,
                "auth.change_password",
                None,
                None,
                "wrong_old_password",
            )
            .await;
            return Err(AppError::Unauthorized);
        }
        Err(e) => return Err(AppError::Internal(format!("verify failure: {e}"))),
    }

    let new_hash = hash_password(&req.new_password);
    users::update_password(&app.db, user.id, &new_hash).await?;

    audit::must_write(
        &app.db,
        &user.username,
        "auth.change_password",
        None,
        None,
        "ok",
    )
    .await;

    Ok(StatusCode::NO_CONTENT)
}
