//! Manual snapshot helpers.

use crate::db::repo::snapshots as snap_repo;
use crate::error::AppError;
use ipt_core::{Family, SnapshotKind};
use ipt_executor::Executor;
use std::sync::Arc;

pub async fn capture_now(
    db: &sqlx::SqlitePool,
    executor: &Arc<dyn Executor>,
    label: &str,
    author: &str,
    kind: SnapshotKind,
) -> Result<i64, AppError> {
    let v4 = executor.save(Family::V4).await.unwrap_or_default();
    let v6 = executor.save(Family::V6).await.unwrap_or_default();
    let id = snap_repo::create(db, label, author, &v4, &v6, kind).await?;
    Ok(id)
}
