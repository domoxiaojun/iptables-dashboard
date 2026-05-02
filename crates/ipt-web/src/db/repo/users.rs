use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRecord {
    pub id: i64,
    pub username: String,
    #[serde(skip)]
    pub password_hash: String,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
    #[serde(default)]
    pub must_change_password: bool,
}

fn from_row(row: SqliteRow) -> UserRecord {
    let must_change: i64 = row.try_get("must_change_password").unwrap_or(0);
    UserRecord {
        id: row.get("id"),
        username: row.get("username"),
        password_hash: row.get("password_hash"),
        created_at: row.get("created_at"),
        last_login_at: row.get("last_login_at"),
        must_change_password: must_change != 0,
    }
}

pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}

pub async fn create(
    pool: &SqlitePool,
    username: &str,
    password_hash: &str,
    must_change_password: bool,
) -> Result<i64, sqlx::Error> {
    let now = Utc::now().timestamp();
    let result = sqlx::query(
        "INSERT INTO users (username, password_hash, created_at, must_change_password)
         VALUES (?, ?, ?, ?)",
    )
    .bind(username)
    .bind(password_hash)
    .bind(now)
    .bind(if must_change_password { 1 } else { 0 })
    .execute(pool)
    .await?;
    Ok(result.last_insert_rowid())
}

pub async fn find_by_username(
    pool: &SqlitePool,
    username: &str,
) -> Result<Option<UserRecord>, sqlx::Error> {
    let row = sqlx::query("SELECT * FROM users WHERE username = ?")
        .bind(username)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(from_row))
}

pub async fn find_by_id(pool: &SqlitePool, id: i64) -> Result<Option<UserRecord>, sqlx::Error> {
    let row = sqlx::query("SELECT * FROM users WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(from_row))
}

pub async fn touch_login(pool: &SqlitePool, id: i64) -> Result<(), sqlx::Error> {
    let now = Utc::now().timestamp();
    sqlx::query("UPDATE users SET last_login_at = ? WHERE id = ?")
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

/// Update password hash and clear `must_change_password` in one shot.
pub async fn update_password(
    pool: &SqlitePool,
    id: i64,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?",
    )
    .bind(password_hash)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}
