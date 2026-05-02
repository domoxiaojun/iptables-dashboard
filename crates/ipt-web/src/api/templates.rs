//! Template library — list and "stage" a template into preview mutations.

use crate::api::rules::Mutation;
use crate::db::repo::templates as tpl_repo;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, State};
use axum::Json;
use ipt_core::{Family, RuleSpec, TableKind};
use serde::{Deserialize, Serialize};

pub async fn list(State(app): State<AppState>) -> AppResult<Json<Vec<tpl_repo::TemplateRecord>>> {
    Ok(Json(tpl_repo::list(&app.db).await?))
}

pub async fn get(
    State(app): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<Json<tpl_repo::TemplateRecord>> {
    let r = tpl_repo::get(&app.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("template {id}")))?;
    Ok(Json(r))
}

#[derive(Debug, Deserialize)]
pub struct TemplateRule {
    pub family: Family,
    pub table: TableKind,
    pub chain: String,
    pub spec: RuleSpec,
}

#[derive(Debug, Serialize)]
pub struct StageResp {
    pub mutations: Vec<Mutation>,
}

/// Convert a template's `rules_json` into a list of `Create` mutations that
/// the frontend can feed to /preview or /apply.
pub async fn stage(
    State(app): State<AppState>,
    Path(id): Path<i64>,
) -> AppResult<Json<StageResp>> {
    let r = tpl_repo::get(&app.db, id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("template {id}")))?;
    let rules: Vec<TemplateRule> = serde_json::from_str(&r.rules_json).map_err(|e| {
        AppError::Internal(format!("template rules_json invalid: {e}"))
    })?;
    let mutations = rules
        .into_iter()
        .map(|tr| {
            Mutation::Create(crate::api::rules::CreateRuleReq {
                family: tr.family,
                table: tr.table,
                chain: tr.chain,
                index: None,
                spec: tr.spec,
                also_for_other_family: false,
            })
        })
        .collect();
    Ok(Json(StageResp { mutations }))
}
