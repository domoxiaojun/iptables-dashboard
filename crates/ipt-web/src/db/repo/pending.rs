use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingRecord {
    pub token: String,
    pub user: String,
    pub pre_snapshot_id: i64,
    pub expires_at: i64,
}

fn from_row(row: SqliteRow) -> PendingRecord {
    PendingRecord {
        token: row.get("token"),
        user: row.get("user"),
        pre_snapshot_id: row.get("pre_snapshot_id"),
        expires_at: row.get("expires_at"),
    }
}

pub async fn put(pool: &SqlitePool, p: &PendingRecord) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO pending_apply (token, user, pre_snapshot_id, expires_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET expires_at = excluded.expires_at",
    )
    .bind(&p.token)
    .bind(&p.user)
    .bind(p.pre_snapshot_id)
    .bind(p.expires_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete(pool: &SqlitePool, token: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM pending_apply WHERE token = ?")
        .bind(token)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get(pool: &SqlitePool, token: &str) -> Result<Option<PendingRecord>, sqlx::Error> {
    let row = sqlx::query("SELECT * FROM pending_apply WHERE token = ?")
        .bind(token)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(from_row))
}

pub async fn list(pool: &SqlitePool) -> Result<Vec<PendingRecord>, sqlx::Error> {
    let rows = sqlx::query("SELECT * FROM pending_apply ORDER BY expires_at ASC")
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(from_row).collect())
}

/// Count active pending applies — used by the safety lock to ensure only
/// one apply is in-flight at a time.
pub async fn count_active(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM pending_apply")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}
