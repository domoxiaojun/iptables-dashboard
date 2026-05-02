//! Snapshot list / get / restore / import / export.

use crate::auth::{require_password_changed, AuthSession};
use crate::db::repo::{audit, snapshots as snap_repo};
use crate::error::{AppError, AppResult};
use crate::safety::PendingMeta;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::header;
use axum::response::IntoResponse;
use axum::Json;
use ipt_core::{Family, SnapshotKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    #[serde(default = "default_limit")]
    pub limit: i64,
}
fn default_limit() -> i64 {
    100
}

pub async fn list(
    State(app): State<AppState>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<snap_repo::SnapshotRecord>>> {
    Ok(Json(snap_repo::list(&app.db, q.limit).await?))
}

#[derive(Debug, Deserialize)]
pub struct CreateReq {
    pub label: String,
}

pub async fn create(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Json(req): Json<CreateReq>,
) -> AppResult<Json<i64>> {
    let user = auth_session.user.ok_or(AppError::Unauthorized)?;
    require_password_changed(&user)?;
    let id = crate::safety::snapshot::capture_now(
        &app.db,
        &app.executor,
        &req.label,
        &user.username,
        SnapshotKind::Manual,
    )
    .await?;
    Ok(Json(id))
}

pub async fn restore(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<Json<PendingMeta>> {
    let user = auth_session.user.ok_or(AppError::Unauthorized)?;
    require_password_changed(&user)?;
    let snap = snap_repo::get(&app.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("snapshot {id}")))?;
    if app.two_phase.has_pending().await? {
        return Err(AppError::SafetyLock);
    }
    let v4_before = app.executor.save(Family::V4).await.unwrap_or_default();
    let v6_before = app.executor.save(Family::V6).await.unwrap_or_default();
    let pending = app
        .two_phase
        .start(
            &user.username,
            &v4_before,
            &v6_before,
            &format!("restore snapshot {id}"),
        )
        .await?;
    app.executor.restore(Family::V4, &snap.v4_save, false).await?;
    app.executor.restore(Family::V6, &snap.v6_save, false).await?;
    app.rules_cache.invalidate_all().await;
    audit::must_write(
        &app.db,
        &user.username,
        "snapshot.restore",
        Some(&id.to_string()),
        None,
        "ok",
    )
    .await;
    Ok(Json(pending))
}

#[derive(Debug, Deserialize)]
pub struct ExportQuery {
    #[serde(default = "default_family")]
    pub family: String,
}
fn default_family() -> String {
    "v4".into()
}

pub async fn export(
    State(app): State<AppState>,
    Path(id): Path<i64>,
    Query(q): Query<ExportQuery>,
) -> AppResult<axum::response::Response> {
    let snap = snap_repo::get(&app.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("snapshot {id}")))?;
    let (body, name) = match q.family.as_str() {
        "v6" => (snap.v6_save, format!("snapshot-{id}.rules.v6")),
        _ => (snap.v4_save, format!("snapshot-{id}.rules.v4")),
    };
    let mut resp = body.into_response();
    resp.headers_mut().insert(
        header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("text/plain; charset=utf-8"),
    );
    resp.headers_mut().insert(
        header::CONTENT_DISPOSITION,
        axum::http::HeaderValue::from_str(&format!("attachment; filename=\"{name}\""))
            .unwrap(),
    );
    Ok(resp)
}

#[derive(Debug, Deserialize)]
pub struct ImportReq {
    pub label: String,
    pub v4_save: String,
    pub v6_save: String,
}

pub async fn import(
    auth_session: AuthSession,
    State(app): State<AppState>,
    Json(req): Json<ImportReq>,
) -> AppResult<Json<i64>> {
    let user = auth_session.user.ok_or(AppError::Unauthorized)?;
    require_password_changed(&user)?;
    let id = snap_repo::create(
        &app.db,
        &req.label,
        &user.username,
        &req.v4_save,
        &req.v6_save,
        SnapshotKind::BootstrapImport,
    )
    .await?;
    Ok(Json(id))
}

#[derive(Debug, Serialize)]
pub struct GetResp {
    pub record: snap_repo::SnapshotRecord,
}

pub async fn get(
    State(app): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<Json<GetResp>> {
    let record = snap_repo::get(&app.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("snapshot {id}")))?;
    Ok(Json(GetResp { record }))
}
