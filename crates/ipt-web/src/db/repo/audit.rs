use chrono::Utc;
use once_cell::sync::OnceCell;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditRecord {
    pub id: i64,
    pub ts: i64,
    pub user: String,
    pub action: String,
    pub target: Option<String>,
    pub details: Option<Value>,
    pub result: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
}

fn from_row(row: SqliteRow) -> AuditRecord {
    let details_json: Option<String> = row.get("details_json");
    let details = details_json.and_then(|s| serde_json::from_str(&s).ok());
    AuditRecord {
        id: row.get("id"),
        ts: row.get("ts"),
        user: row.get("user"),
        action: row.get("action"),
        target: row.get("target"),
        details,
        result: row.get("result"),
        ip: row.try_get("ip").ok(),
        user_agent: row.try_get("user_agent").ok(),
    }
}

/// Filesystem destination for audit entries that can't reach the DB.
/// Initialized once at startup via [`init_fallback_dir`]; if unset, the
/// fallback path is silently disabled and we only log via tracing.
static FALLBACK_DIR: OnceCell<PathBuf> = OnceCell::new();

pub fn init_fallback_dir(dir: PathBuf) {
    let _ = FALLBACK_DIR.set(dir);
}

/// Insert an audit row with optional client IP. Returns sqlx::Error on DB
/// failure — callers that must not lose the entry should use [`must_write`].
pub async fn write(
    pool: &SqlitePool,
    user: &str,
    action: &str,
    target: Option<&str>,
    details: Option<&Value>,
    result: &str,
) -> Result<(), sqlx::Error> {
    write_with_ip(pool, user, action, target, details, result, None).await
}

/// Insert an audit row with client IP.
pub async fn write_with_ip(
    pool: &SqlitePool,
    user: &str,
    action: &str,
    target: Option<&str>,
    details: Option<&Value>,
    result: &str,
    ip: Option<&str>,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().timestamp();
    let details_json = details.map(|v| serde_json::to_string(v).unwrap_or_default());
    sqlx::query(
        "INSERT INTO audit_log (ts, user, action, target, details_json, result, ip)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(now)
    .bind(user)
    .bind(action)
    .bind(target)
    .bind(details_json)
    .bind(result)
    .bind(ip)
    .execute(pool)
    .await?;
    Ok(())
}

/// Insert an audit row, falling back to a local file if the DB write
/// fails. Used for operations whose audit trail is regulatory or
/// safety-critical (apply / rollback / login / change-password).
///
/// This MUST be infallible from the caller's perspective — if both the
/// DB and the fallback file fail, we tracing::error and move on.
pub async fn must_write(
    pool: &SqlitePool,
    user: &str,
    action: &str,
    target: Option<&str>,
    details: Option<&Value>,
    result: &str,
) {
    if let Err(err) = write(pool, user, action, target, details, result).await {
        tracing::error!(error = %err, action = action, "audit DB write failed — using fallback");
        let line = format_fallback_line(user, action, target, details, result, &err);
        write_fallback(line).await;
    }
}

fn format_fallback_line(
    user: &str,
    action: &str,
    target: Option<&str>,
    details: Option<&Value>,
    result: &str,
    err: &sqlx::Error,
) -> String {
    let now = Utc::now().to_rfc3339();
    let details_str = details
        .map(|v| serde_json::to_string(v).unwrap_or_else(|_| "{}".into()))
        .unwrap_or_else(|| "null".into());
    format!(
        "{ts}\tuser={user}\taction={action}\ttarget={target}\tresult={result}\tdetails={details}\tdb_error={err}\n",
        ts = now,
        user = user,
        action = action,
        target = target.unwrap_or(""),
        result = result,
        details = details_str,
        err = err,
    )
}

async fn write_fallback(line: String) {
    let Some(dir) = FALLBACK_DIR.get().cloned() else {
        return;
    };
    let path = dir.join("audit-fallback.log");
    let result = tokio::task::spawn_blocking(move || -> std::io::Result<()> {
        use std::io::Write;
        std::fs::create_dir_all(&dir)?;
        let mut f = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)?;
        f.write_all(line.as_bytes())?;
        Ok(())
    })
    .await;
    match result {
        Ok(Ok(())) => {}
        Ok(Err(e)) => tracing::error!(error = %e, "audit fallback file write failed"),
        Err(e) => tracing::error!(error = %e, "audit fallback task panicked"),
    }
}

pub async fn list(pool: &SqlitePool, limit: i64) -> Result<Vec<AuditRecord>, sqlx::Error> {
    let rows = sqlx::query("SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?")
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(from_row).collect())
}

/// Delete rows older than `before_ts` (unix seconds). Used by the daily
/// retention task in main.rs to keep the audit table from growing
/// unboundedly. Returns the number of rows deleted.
pub async fn purge_older_than(pool: &SqlitePool, before_ts: i64) -> Result<u64, sqlx::Error> {
    let r = sqlx::query("DELETE FROM audit_log WHERE ts < ?")
        .bind(before_ts)
        .execute(pool)
        .await?;
    Ok(r.rows_affected())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::pool::test_pool;

    const DAY: i64 = 86_400;

    #[tokio::test]
    async fn purge_drops_old_rows_only() {
        let pool = test_pool().await;
        let now = Utc::now().timestamp();
        let old = now - 120 * DAY;
        let recent = now - 1 * DAY;

        for ts in [old, recent] {
            sqlx::query(
                "INSERT INTO audit_log (ts, user, action, target, details_json, result)
                 VALUES (?, 'tester', 'noop', NULL, NULL, 'ok')",
            )
            .bind(ts)
            .execute(&pool)
            .await
            .unwrap();
        }

        let removed = purge_older_than(&pool, now - 90 * DAY).await.unwrap();
        assert_eq!(removed, 1);

        let left: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM audit_log")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left.0, 1);
    }
}
