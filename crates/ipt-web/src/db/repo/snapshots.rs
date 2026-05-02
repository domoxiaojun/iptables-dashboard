use chrono::Utc;
use ipt_core::SnapshotKind;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotRecord {
    pub id: i64,
    pub created_at: i64,
    pub label: String,
    pub author: String,
    pub v4_save: String,
    pub v6_save: String,
    pub kind: String,
}

impl SnapshotRecord {
    pub fn kind_enum(&self) -> SnapshotKind {
        SnapshotKind::from_str(&self.kind).unwrap_or(SnapshotKind::Manual)
    }
}

fn from_row(row: SqliteRow) -> SnapshotRecord {
    SnapshotRecord {
        id: row.get("id"),
        created_at: row.get("created_at"),
        label: row.get("label"),
        author: row.get("author"),
        v4_save: row.get("v4_save"),
        v6_save: row.get("v6_save"),
        kind: row.get("kind"),
    }
}

pub async fn create(
    pool: &SqlitePool,
    label: &str,
    author: &str,
    v4_save: &str,
    v6_save: &str,
    kind: SnapshotKind,
) -> Result<i64, sqlx::Error> {
    let now = Utc::now().timestamp();
    let r = sqlx::query(
        "INSERT INTO snapshots (created_at, label, author, v4_save, v6_save, kind)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(now)
    .bind(label)
    .bind(author)
    .bind(v4_save)
    .bind(v6_save)
    .bind(kind.as_str())
    .execute(pool)
    .await?;
    Ok(r.last_insert_rowid())
}

pub async fn list(pool: &SqlitePool, limit: i64) -> Result<Vec<SnapshotRecord>, sqlx::Error> {
    let rows = sqlx::query("SELECT * FROM snapshots ORDER BY created_at DESC LIMIT ?")
        .bind(limit)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(from_row).collect())
}

pub async fn get(pool: &SqlitePool, id: i64) -> Result<Option<SnapshotRecord>, sqlx::Error> {
    let row = sqlx::query("SELECT * FROM snapshots WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(from_row))
}
