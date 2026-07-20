//! Entry point — load config, init tracing, build app, serve.

mod api;
mod app;
mod assets;
mod auth;
mod config;
mod db;
mod error;
mod safety;
mod state;
mod stats;
mod templates_builtin;

use crate::config::Config;
use crate::state::{AppState, RulesCache};
use anyhow::Context;
use ipt_executor::{Executor, LocalExec};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config_path = std::env::var("IPTD_CONFIG_PATH")
        .map(PathBuf::from)
        .ok()
        .or_else(|| {
            std::env::var("IPTD_CONFIG_DIR")
                .ok()
                .map(|d| PathBuf::from(d).join("config.toml"))
        });

    let mut config = Config::load(config_path.as_deref())?;
    apply_flat_env_overrides(&mut config);
    init_tracing(&config);
    tracing::info!(version = env!("CARGO_PKG_VERSION"), "iptables-dashboard starting");
    tracing::debug!(?config, "loaded config");

    // ensure data dir exists
    std::fs::create_dir_all(&config.paths.data_dir).context("create data_dir")?;
    // initialize the audit fallback log destination
    db::repo::audit::init_fallback_dir(config.paths.data_dir.clone());

    // db pool
    let pool = db::connect(&config.paths.db_path()).await?;
    db::migrate(&pool).await?;

    // bootstrap initial admin user if there is none
    bootstrap_admin(&pool, &config).await?;

    // seed builtin templates
    db::repo::templates::seed_builtin(&pool).await?;

    // executor
    let mut exec = LocalExec::new();
    if let Ok(b) = std::env::var("IPTD_BACKEND") {
        exec.backend_hint = Some(match b.as_str() {
            "legacy" => ipt_executor::IptablesBackend::Legacy,
            _ => ipt_executor::IptablesBackend::Nft,
        });
    }
    let executor: Arc<dyn Executor> = Arc::new(exec);
    if let Err(e) = executor.check_capabilities().await {
        tracing::warn!(error = %e, "capability self-check failed; iptables operations will likely fail");
    }

    // safety / two-phase
    let two_phase = safety::TwoPhaseManager::new(
        pool.clone(),
        executor.clone(),
        Duration::from_secs(config.security.two_step_seconds),
        config.paths.pending_path(),
    );

    // recovery on startup
    if let Err(e) = two_phase.clone().recover().await {
        tracing::error!(error = %e, "startup recovery failed");
    }

    // stats broadcaster — 10s default; configurable via env
    let stats_period = std::env::var("IPTD_STATS_PERIOD_SECONDS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(10);
    let stats = stats::StatsBroadcaster::start(
        executor.clone(),
        Duration::from_secs(stats_period),
    );

    // Daily retention task: trim brute-force counters and the audit log.
    // Runs forever in the background; failures are logged and retried next
    // tick rather than aborted.
    spawn_retention_task(pool.clone());

    // build state
    let state = AppState {
        db: pool,
        config: Arc::new(config.clone()),
        executor: executor.clone(),
        two_phase,
        stats,
        rules_cache: RulesCache::new(),
        started_at: Instant::now(),
    };

    let app = app::build(state, Arc::new(config.clone())).await?;

    let listen: SocketAddr = config
        .server
        .listen
        .parse()
        .with_context(|| format!("invalid listen address: {}", config.server.listen))?;
    tracing::info!(%listen, "binding HTTP listener");

    let listener = tokio::net::TcpListener::bind(listen).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown_signal())
    .await?;

    tracing::info!("shutdown complete");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = tokio::signal::ctrl_c();
    #[cfg(unix)]
    let sigterm = async {
        if let Ok(mut s) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let sigterm = std::future::pending::<()>();
    tokio::select! {
        _ = ctrl_c => {},
        _ = sigterm => {},
    }
    tracing::info!("shutdown signal received");
}

fn init_tracing(config: &Config) {
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&config.logging.level));
    let registry = tracing_subscriber::registry().with(filter);
    if config.logging.format == "json" {
        registry.with(fmt::layer().json()).init();
    } else {
        registry.with(fmt::layer().compact()).init();
    }
}

async fn bootstrap_admin(pool: &sqlx::SqlitePool, config: &Config) -> anyhow::Result<()> {
    let n = db::repo::users::count(pool).await?;
    if n > 0 {
        return Ok(());
    }
    let username = std::env::var("IPTD_BOOTSTRAP_USERNAME")
        .unwrap_or_else(|_| config.bootstrap.username.clone());
    // Generate a random initial password unless an operator explicitly
    // supplies one via env var (preferred) or via TOML (legacy). "changeme"
    // is treated as "no password supplied" because it was the historical
    // default and would defeat the purpose if accepted.
    let supplied_pw = std::env::var("IPTD_BOOTSTRAP_PASSWORD")
        .ok()
        .filter(|p| !p.is_empty() && p != "changeme")
        .or_else(|| {
            let p = &config.bootstrap.password;
            if p.is_empty() || p == "changeme" {
                None
            } else {
                Some(p.clone())
            }
        });
    let (password, must_change) = match supplied_pw {
        Some(p) => (p, false),
        None => (random_password(32), true),
    };

    let hash = auth::hash_password(&password);
    db::repo::users::create(pool, &username, &hash, must_change).await?;

    if must_change {
        let credentials_path = config.paths.data_dir.join("initial-admin-password.txt");
        let body = format!(
            "iptables-dashboard initial admin credentials\n\
             ============================================\n\
             username: {username}\n\
             password: {password}\n\
             \n\
             This password was randomly generated on first start. You MUST change\n\
             it via /settings before any write operations are allowed.\n\
             Delete this file once you have logged in.\n",
        );
        match write_secret_file(&credentials_path, &body) {
            Ok(()) => {
                tracing::warn!(
                    username = %username,
                    path = %credentials_path.display(),
                    "bootstrapped admin user with random password — credentials written to file (mode 0600)"
                );
                eprintln!(
                    "\n========================================\n\
                     INITIAL ADMIN PASSWORD: {password}\n\
                     (also written to {path})\n\
                     ========================================\n",
                    path = credentials_path.display()
                );
            }
            Err(e) => {
                tracing::error!(
                    error = %e,
                    "failed to write initial-admin-password.txt — printing to stderr only"
                );
                eprintln!(
                    "\n========================================\n\
                     INITIAL ADMIN PASSWORD: {password}\n\
                     (FAILED to write credentials file: {e})\n\
                     ========================================\n"
                );
            }
        }
    } else {
        tracing::warn!(
            username = %username,
            "bootstrapped admin user with operator-supplied IPTD_BOOTSTRAP_PASSWORD"
        );
    }

    Ok(())
}

fn random_password(len: usize) -> String {
    use rand::Rng;
    const CHARSET: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let mut rng = rand::thread_rng();
    (0..len)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Background daily retention. Keeps `login_attempts` to 7 days (just past
/// the brute-force lockout window) and `audit_log` to 90 days. Both
/// numbers are conservative — operators can re-run the queries manually
/// for tighter retention.
fn spawn_retention_task(pool: sqlx::SqlitePool) {
    const TICK: Duration = Duration::from_secs(24 * 60 * 60);
    const LOGIN_KEEP_DAYS: i64 = 7;
    const AUDIT_KEEP_DAYS: i64 = 90;

    tokio::spawn(async move {
        // Run once at startup so a long-stopped instance immediately trims
        // accumulated rows before sleeping a full day.
        loop {
            let now = chrono::Utc::now().timestamp();
            let login_cutoff = now - LOGIN_KEEP_DAYS * 86_400;
            let audit_cutoff = now - AUDIT_KEEP_DAYS * 86_400;

            match db::repo::login_attempts::purge_older_than(&pool, login_cutoff).await {
                Ok(n) if n > 0 => {
                    tracing::info!(rows = n, "purged stale login_attempts");
                }
                Ok(_) => {}
                Err(e) => tracing::warn!(error = %e, "login_attempts purge failed"),
            }
            match db::repo::audit::purge_older_than(&pool, audit_cutoff).await {
                Ok(n) if n > 0 => {
                    tracing::info!(rows = n, "purged stale audit_log");
                }
                Ok(_) => {}
                Err(e) => tracing::warn!(error = %e, "audit_log purge failed"),
            }
            tokio::time::sleep(TICK).await;
        }
    });
}

#[cfg(unix)]
fn write_secret_file(path: &std::path::Path, body: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .mode(0o600)
        .open(path)?;
    f.write_all(body.as_bytes())?;
    Ok(())
}

#[cfg(not(unix))]
fn write_secret_file(path: &std::path::Path, body: &str) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(path, body)
}

/// Map common short-form env vars (`IPTD_LISTEN`, `IPTD_DATA_DIR`,
/// `IPTD_LOG_LEVEL`, `IPTD_LOG_FORMAT`, `IPTD_TWO_STEP_SECONDS`) onto the
/// nested config. The `figment::Env::prefixed("IPTD_")` provider uses
/// `__` as a separator, but operators expect short ergonomic names.
fn apply_flat_env_overrides(config: &mut Config) {
    if let Ok(v) = std::env::var("IPTD_LISTEN") {
        config.server.listen = v;
    }
    if let Ok(v) = std::env::var("IPTD_DATA_DIR") {
        config.paths.data_dir = v.into();
    }
    if let Ok(v) = std::env::var("IPTD_LOG_LEVEL") {
        config.logging.level = v;
    }
    if let Ok(v) = std::env::var("IPTD_LOG_FORMAT") {
        config.logging.format = v;
    }
    if let Ok(v) = std::env::var("IPTD_TWO_STEP_SECONDS") {
        if let Ok(n) = v.parse() {
            config.security.two_step_seconds = n;
        }
    }
}
