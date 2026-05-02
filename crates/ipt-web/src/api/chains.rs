//! Read-only chain & table listing.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use ipt_core::{ChainSpec, Family, TableKind};
use std::str::FromStr;
use std::time::Duration;

const CACHE_TTL: Duration = Duration::from_secs(2);

#[derive(serde::Serialize)]
pub struct TablesResp {
    pub family: Family,
    pub tables: Vec<String>,
}

pub async fn list_tables(
    State(app): State<AppState>,
    Path(family): Path<String>,
) -> AppResult<Json<TablesResp>> {
    let family = Family::from_str(&family).map_err(AppError::Validation)?;
    let parsed = app
        .rules_cache
        .get_or_fetch(family, &app.executor, CACHE_TTL)
        .await?;
    let tables = parsed.tables.keys().map(|t| t.to_string()).collect();
    Ok(Json(TablesResp { family, tables }))
}

pub async fn list_chains(
    State(app): State<AppState>,
    Path((family, table)): Path<(String, String)>,
) -> AppResult<Json<Vec<ChainSpec>>> {
    let family = Family::from_str(&family).map_err(AppError::Validation)?;
    let table_kind = TableKind::from_str(&table).map_err(AppError::Validation)?;
    let parsed = app
        .rules_cache
        .get_or_fetch(family, &app.executor, CACHE_TTL)
        .await?;
    let chains = parsed
        .tables
        .get(&table_kind)
        .map(|t| t.chains.clone())
        .unwrap_or_default();
    Ok(Json(chains))
}
