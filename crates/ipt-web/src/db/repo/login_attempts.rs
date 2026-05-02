use chrono::Utc;
use sqlx::SqlitePool;

pub async fn record(
    pool: &SqlitePool,
    ip: &str,
    success: bool,
) -> Result<(), sqlx::Error> {
    let now = Utc::now().timestamp();
    sqlx::query("INSERT INTO login_attempts (ip, ts, success) VALUES (?, ?, ?)")
        .bind(ip)
        .bind(now)
        .bind(if success { 1 } else { 0 })
        .execute(pool)
        .await?;
    Ok(())
}

/// Count failed attempts from `ip` since `since_ts` seconds ago.
pub async fn count_failed_since(
    pool: &SqlitePool,
    ip: &str,
    since_ts: i64,
) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ts >= ? AND success = 0",
    )
    .bind(ip)
    .bind(since_ts)
    .fetch_one(pool)
    .await?;
    Ok(row.0)
}

pub async fn purge_older_than(pool: &SqlitePool, before_ts: i64) -> Result<u64, sqlx::Error> {
    let r = sqlx::query("DELETE FROM login_attempts WHERE ts < ?")
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

        sqlx::query("INSERT INTO login_attempts (ip, ts, success) VALUES ('1.1.1.1', ?, 0)")
            .bind(now - 30 * DAY)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO login_attempts (ip, ts, success) VALUES ('1.1.1.1', ?, 0)")
            .bind(now - 1 * DAY)
            .execute(&pool)
            .await
            .unwrap();

        let removed = purge_older_than(&pool, now - 7 * DAY).await.unwrap();
        assert_eq!(removed, 1);

        let left: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM login_attempts")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(left.0, 1);
    }
}
