//! Router assembly + CORS / tracing layers.

use crate::api;
use crate::assets;
use crate::auth::{AuthBackend, AuthSession};
use crate::config::Config;
use crate::error::AppError;
use crate::state::AppState;
use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::{self, Next};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Json;
use axum_login::AuthManagerLayerBuilder;
use serde::Serialize;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::compression::CompressionLayer;
use tower_http::cors::CorsLayer;
use tower_http::set_header::SetResponseHeaderLayer;
use tower_http::trace::TraceLayer;
use tower_sessions::cookie::time::Duration as CookieDuration;
use tower_sessions::cookie::SameSite;
use tower_sessions::{Expiry, SessionManagerLayer};
use tower_sessions_sqlx_store::SqliteStore;

pub async fn build(state: AppState, config: Arc<Config>) -> anyhow::Result<axum::Router> {
    // Rate limiter state
    let rate_limiter = Arc::new(Mutex::new(HashMap::<String, Vec<i64>>::new()));
    // Session store on the same SQLite db.
    let session_store = SqliteStore::new(state.db.clone());
    session_store.migrate().await?;
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_same_site(SameSite::Strict)
        .with_http_only(true)
        .with_expiry(Expiry::OnInactivity(CookieDuration::days(7)))
        .with_name("iptd_session");

    let auth_backend = AuthBackend::new(state.db.clone());
    let auth_layer = AuthManagerLayerBuilder::new(auth_backend, session_layer).build();

    // Routes that REQUIRE auth.
    let protected: axum::Router<AppState> = axum::Router::new()
        .route("/api/v1/me", get(api::auth::me))
        .route("/api/v1/auth/logout", post(api::auth::logout))
        .route("/api/v1/auth/change-password", post(api::auth::change_password))
        .route("/api/v1/families/{family}/tables", get(api::chains::list_tables))
        .route(
            "/api/v1/families/{family}/tables/{table}/chains",
            get(api::chains::list_chains),
        )
        .route("/api/v1/families/{family}/rules", get(api::rules::list_rules))
        .route("/api/v1/rules/preview", post(api::rules::preview))
        .route("/api/v1/rules/import", post(api::rules::import_rules))
        .route("/api/v1/diff/dual-stack", get(api::rules::dual_stack_compare))
        .route("/api/v1/diff/sync-badge", get(api::rules::sync_badge))
        .route("/api/v1/apply", post(api::apply::apply))
        .route("/api/v1/apply/{token}/confirm", post(api::apply::confirm))
        .route("/api/v1/apply/{token}/abort", post(api::apply::abort))
        .route("/api/v1/apply/{token}/status", get(api::apply::status))
        .route(
            "/api/v1/snapshots",
            get(api::snapshots::list).post(api::snapshots::create),
        )
        .route("/api/v1/snapshots/{id}", get(api::snapshots::get))
        .route("/api/v1/snapshots/{id}/restore", post(api::snapshots::restore))
        .route("/api/v1/snapshots/{id}/export", get(api::snapshots::export))
        .route("/api/v1/snapshots/import", post(api::snapshots::import))
        .route("/api/v1/templates", get(api::templates::list))
        .route("/api/v1/templates/{id}", get(api::templates::get))
        .route("/api/v1/templates/{id}/stage", post(api::templates::stage))
        .route("/api/v1/stats/counters", get(api::stats::counters_now))
        .route("/api/v1/stats/stream", get(api::stats::stream))
        .route("/api/v1/logs/stream", get(api::logs::stream))
        .route("/api/v1/audit", get(audit_list))
        .route("/api/v1/config/effective", get(api::config::effective))
        .route("/api/v1/backup", get(api::config::backup))
        .route_layer(middleware::from_fn(require_auth));

    // Public routes.
    let public: axum::Router<AppState> = axum::Router::new()
        .route("/api/v1/auth/login", post(api::auth::login))
        .route("/api/v1/health", get(health));

    let app = axum::Router::<AppState>::new()
        .merge(protected)
        .merge(public)
        .fallback(assets::serve)
        .layer(middleware::from_fn_with_state(state.clone(), ip_whitelist))
        .layer(middleware::from_fn_with_state(
            (state.clone(), rate_limiter.clone()),
            rate_limit_middleware,
        ))
        .layer(CompressionLayer::new())
        .layer(build_cors_layer(&config))
        .layer(TraceLayer::new_for_http())
        .layer(auth_layer);

    // Apply security headers before with_state so the type stays Router<AppState>
    let app = apply_security_headers(app);

    // Bind state to the router
    let app = app.with_state(state);

    Ok(app)
}

/// Build a strict CORS layer. Default is no allowed origins (same-origin
/// only). Operators may opt-in extra origins via `[cors] allowed_origins`
/// in the config file or `IPTD_CORS_ALLOWED_ORIGINS` (comma-separated).
fn build_cors_layer(config: &Config) -> CorsLayer {
    let mut layer = CorsLayer::new()
        .allow_methods([
            axum::http::Method::GET,
            axum::http::Method::POST,
            axum::http::Method::PUT,
            axum::http::Method::DELETE,
            axum::http::Method::OPTIONS,
        ])
        .allow_credentials(true)
        .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION]);
    let env_origins: Vec<String> = std::env::var("IPTD_CORS_ALLOWED_ORIGINS")
        .ok()
        .map(|s| s.split(',').map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect())
        .unwrap_or_default();
    let allowed: Vec<String> = config
        .cors
        .allowed_origins
        .iter()
        .cloned()
        .chain(env_origins)
        .collect();
    if !allowed.is_empty() {
        let origins: Vec<axum::http::HeaderValue> = allowed
            .into_iter()
            .filter_map(|s| axum::http::HeaderValue::from_str(&s).ok())
            .collect();
        layer = layer.allow_origin(origins);
    }
    layer
}

async fn require_auth(session: AuthSession, req: Request, next: Next) -> Result<Response, StatusCode> {
    if session.user.is_some() {
        Ok(next.run(req).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

/// IP allow-list middleware. Runs before any session / auth handling so
/// non-whitelisted sources never reach the login form (or anything else).
///
/// Rules:
/// - When `security.allowed_ips` is empty, the layer is a pass-through
///   (preserves the previous "open by default behind reverse proxy"
///   behavior so existing deployments don't break on upgrade).
/// - `/api/v1/health` requested from a loopback address always passes,
///   so Docker / K8s health probes keep working regardless of config.
/// - Otherwise, the real client IP is resolved via the same
///   `trusted_proxies` + `X-Forwarded-For` rules used by login auditing,
///   then matched against `allowed_ips` (exact IP or CIDR).
/// - Mismatches return `403 Forbidden` and are NOT counted toward
///   brute-force lockout — denying noise from random scanners shouldn't
///   reduce the legitimate user's available attempts.
async fn ip_whitelist(
    State(app): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if req.uri().path() == "/api/v1/health" && addr.ip().is_loopback() {
        return Ok(next.run(req).await);
    }
    let allowed = &app.config.security.allowed_ips;
    if allowed.is_empty() {
        return Ok(next.run(req).await);
    }
    let real_ip_str =
        api::auth::client_ip(req.headers(), addr, &app.config.security.trusted_proxies);
    let real_ip = match IpAddr::from_str(&real_ip_str) {
        Ok(ip) => ip,
        Err(_) => {
            tracing::warn!(real_ip = %real_ip_str, "ip_whitelist: unparseable client IP, rejecting");
            return Err(StatusCode::FORBIDDEN);
        }
    };
    if !allowed.iter().any(|e| api::auth::trusted_match(e, real_ip)) {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(next.run(req).await)
}

/// Simple sliding-window rate limiter for write operations (POST/PUT/DELETE).
/// Tracks request timestamps per IP and rejects if the count exceeds the
/// configured limit within the last 60 seconds.
async fn rate_limit_middleware(
    State((app, rate_limiter)): State<(AppState, Arc<Mutex<HashMap<String, Vec<i64>>>>)>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let limit = app.config.security.api_rate_limit;
    if limit == 0 {
        return Ok(next.run(req).await);
    }
    // Only rate-limit write methods
    let method = req.method().clone();
    if method == axum::http::Method::GET || method == axum::http::Method::HEAD || method == axum::http::Method::OPTIONS {
        return Ok(next.run(req).await);
    }

    let real_ip = api::auth::client_ip(
        req.headers(),
        addr,
        &app.config.security.trusted_proxies,
    );
    let now = chrono::Utc::now().timestamp();
    let window_start = now - 60;

    let mut map = rate_limiter.lock().await;
    let timestamps = map.entry(real_ip.clone()).or_insert_with(Vec::new);
    // Prune old entries
    timestamps.retain(|&t| t > window_start);

    if timestamps.len() as u32 >= limit {
        tracing::warn!(ip = %real_ip, count = timestamps.len(), "rate limit exceeded");
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }
    timestamps.push(now);
    drop(map);

    Ok(next.run(req).await)
}

/// Apply all security headers to the router.
fn apply_security_headers(router: axum::Router<AppState>) -> axum::Router<AppState> {
    router
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_CONTENT_TYPE_OPTIONS,
            axum::http::HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::X_FRAME_OPTIONS,
            axum::http::HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::REFERRER_POLICY,
            axum::http::HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::HeaderName::from_static("permissions-policy"),
            axum::http::HeaderValue::from_static("camera=(), microphone=(), geolocation=()"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::CONTENT_SECURITY_POLICY,
            axum::http::HeaderValue::from_static(
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
            ),
        ))
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    pending_applies: i64,
    backend: String,
}

async fn health(State(app): State<AppState>) -> Json<Health> {
    let pending = crate::db::repo::pending::count_active(&app.db)
        .await
        .unwrap_or(0);
    let backend = match app.executor.detect_backend().await {
        Ok(b) => b.as_str().to_string(),
        Err(_) => "unknown".into(),
    };
    Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        pending_applies: pending,
        backend,
    })
}

async fn audit_list(
    State(app): State<AppState>,
) -> Result<Json<Vec<crate::db::repo::audit::AuditRecord>>, AppError> {
    Ok(Json(crate::db::repo::audit::list(&app.db, 200).await?))
}
