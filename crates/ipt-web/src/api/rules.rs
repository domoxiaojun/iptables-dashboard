//! Rule CRUD + reorder.
//!
//! For MVP all CRUD operations stage changes against an in-memory copy of the
//! current rule set, then the user must call `/apply` to commit them through
//! the two-step activation workflow. Direct mutation of the kernel without
//! a snapshot is intentionally forbidden.

use crate::error::{AppError, AppResult};
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::Json;
use ipt_core::{
    compute_diff, dual_stack_diff, parse_save, render_save, validate_v6, DiffOp, DualStackDiff,
    Family, GuardWarning, ParsedSave, ParsedTable, Rule, RuleSpec, TableKind,
};
use serde::{Deserialize, Serialize};
use std::str::FromStr;

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub table: Option<String>,
    pub chain: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RulesResp {
    pub family: Family,
    pub tables: Vec<TableEntry>,
}

#[derive(Debug, Serialize)]
pub struct TableEntry {
    pub kind: TableKind,
    pub chains: Vec<ipt_core::ChainSpec>,
    pub rules: Vec<Rule>,
}

pub async fn list_rules(
    State(app): State<AppState>,
    Path(family): Path<String>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<RulesResp>> {
    let family = Family::from_str(&family).map_err(AppError::Validation)?;
    let parsed = app
        .rules_cache
        .get_or_fetch(family, &app.executor, std::time::Duration::from_secs(2))
        .await?;
    let mut entries = Vec::new();
    for (kind, table) in parsed.tables.into_iter() {
        if let Some(want) = &q.table {
            if want != kind.as_str() {
                continue;
            }
        }
        let rules = if let Some(want_chain) = &q.chain {
            table
                .rules
                .into_iter()
                .filter(|r| &r.chain == want_chain)
                .collect()
        } else {
            table.rules
        };
        entries.push(TableEntry {
            kind,
            chains: table.chains,
            rules,
        });
    }
    Ok(Json(RulesResp { family, tables: entries }))
}

#[derive(Debug, Deserialize, Serialize)]
pub struct CreateRuleReq {
    pub family: Family,
    pub table: TableKind,
    pub chain: String,
    /// 0-based insertion index. None means append.
    pub index: Option<u32>,
    pub spec: RuleSpec,
    /// When true, also write an equivalent rule for the other family.
    #[serde(default)]
    pub also_for_other_family: bool,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct UpdateRuleReq {
    pub family: Family,
    pub table: TableKind,
    pub chain: String,
    /// 0-based seq within the chain — must match an existing rule.
    pub seq: u32,
    pub spec: RuleSpec,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct DeleteRuleReq {
    pub family: Family,
    pub table: TableKind,
    pub chain: String,
    pub seq: u32,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct ReorderReq {
    pub family: Family,
    pub table: TableKind,
    pub chain: String,
    /// New rule order — list of original `seq` values in the desired order.
    pub seq_order: Vec<u32>,
}

#[derive(Debug, Serialize)]
pub struct PreviewResp {
    pub v4_diff: ipt_core::RuleDiff,
    pub v6_diff: ipt_core::RuleDiff,
    pub v4_save_after: String,
    pub v6_save_after: String,
    pub guard_warnings: Vec<GuardWarning>,
    /// Stable hash of the v4 ruleset at preview time. Echo back via
    /// ApplyReq.if_v4_hash to detect concurrent changes.
    pub v4_hash: String,
    pub v6_hash: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Mutation {
    Create(CreateRuleReq),
    Update(UpdateRuleReq),
    Delete(DeleteRuleReq),
    Reorder(ReorderReq),
}

#[derive(Debug, Deserialize)]
pub struct PreviewReq {
    pub mutations: Vec<Mutation>,
}

/// Compute a stable, deterministic 64-bit FNV-1a hash of the dump text.
/// We don't need crypto strength — the goal is to detect concurrent
/// kernel-side mutations between preview and apply (TOCTOU). Echoing the
/// server-issued hash is enough; clients can't pre-compute a colliding
/// state without controlling the kernel ruleset.
pub fn ruleset_hash(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", h)
}

/// Compute the resulting v4 + v6 dumps after applying `mutations`, plus a diff
/// against the current state. No kernel changes happen.
pub async fn preview(
    State(app): State<AppState>,
    Json(req): Json<PreviewReq>,
) -> AppResult<Json<PreviewResp>> {
    let v4_before = app.executor.save(Family::V4).await.unwrap_or_default();
    let v6_before = app.executor.save(Family::V6).await.unwrap_or_default();
    let v4_hash = ruleset_hash(&v4_before);
    let v6_hash = ruleset_hash(&v6_before);
    let mut v4 = parse_save(&v4_before, Family::V4)?;
    let mut v6 = parse_save(&v6_before, Family::V6)?;
    let v4_orig = v4.clone();
    let v6_orig = v6.clone();

    for m in req.mutations {
        apply_mutation(&mut v4, &mut v6, m)?;
    }

    let v4_after = render_save(&v4);
    let v6_after = render_save(&v6);
    let v4_diff = compute_diff(&v4_orig, &v4);
    let v6_diff = compute_diff(&v6_orig, &v6);
    let guard = validate_v6(&v6);

    Ok(Json(PreviewResp {
        v4_diff,
        v6_diff,
        v4_save_after: v4_after,
        v6_save_after: v6_after,
        guard_warnings: guard,
        v4_hash,
        v6_hash,
    }))
}

pub fn apply_mutation(
    v4: &mut ParsedSave,
    v6: &mut ParsedSave,
    m: Mutation,
) -> Result<(), AppError> {
    match m {
        Mutation::Create(c) => {
            insert_rule(target_save_mut(v4, v6, c.family), c.table, &c.chain, c.index, &c.spec)?;
            if c.also_for_other_family {
                let other = match c.family {
                    Family::V4 => Family::V6,
                    Family::V6 => Family::V4,
                };
                let mut spec = c.spec.clone();
                cross_family_adapt(&mut spec, other);
                if !skip_for_family(&spec, other) {
                    insert_rule(target_save_mut(v4, v6, other), c.table, &c.chain, c.index, &spec)?;
                }
            }
        }
        Mutation::Update(u) => {
            update_rule(
                target_save_mut(v4, v6, u.family),
                u.table,
                &u.chain,
                u.seq,
                u.spec,
            )?;
        }
        Mutation::Delete(d) => {
            delete_rule(target_save_mut(v4, v6, d.family), d.table, &d.chain, d.seq)?;
        }
        Mutation::Reorder(r) => {
            reorder_chain(
                target_save_mut(v4, v6, r.family),
                r.table,
                &r.chain,
                &r.seq_order,
            )?;
        }
    }
    Ok(())
}

fn target_save_mut<'a>(v4: &'a mut ParsedSave, v6: &'a mut ParsedSave, f: Family) -> &'a mut ParsedSave {
    match f {
        Family::V4 => v4,
        Family::V6 => v6,
    }
}

fn ensure_table<'a>(save: &'a mut ParsedSave, kind: TableKind) -> &'a mut ParsedTable {
    save.tables.entry(kind).or_insert_with(|| ParsedTable {
        kind,
        chains: Vec::new(),
        rules: Vec::new(),
    })
}

fn insert_rule(
    save: &mut ParsedSave,
    table: TableKind,
    chain: &str,
    index: Option<u32>,
    spec: &RuleSpec,
) -> Result<(), AppError> {
    let family = save.family;
    let t = ensure_table(save, table);
    if !t.chains.iter().any(|c| c.name == chain) {
        return Err(AppError::Validation(format!(
            "chain '{}' does not exist in {}",
            chain, table
        )));
    }
    // gather chain rules in their seq order
    let mut chain_rules: Vec<&Rule> = t.rules.iter().filter(|r| r.chain == chain).collect();
    chain_rules.sort_by_key(|r| r.seq);
    let pos = match index {
        Some(i) => i.min(chain_rules.len() as u32),
        None => chain_rules.len() as u32,
    };
    let raw = ipt_core::render::render_spec(spec);
    let new_rule = Rule {
        id: None,
        family,
        table,
        chain: chain.to_string(),
        seq: pos,
        spec: spec.clone(),
        raw: format!("-A {chain} {raw}"),
        counters: None,
    };
    // bump seq of subsequent rules in this chain
    for r in t.rules.iter_mut() {
        if r.chain == chain && r.seq >= pos {
            r.seq += 1;
        }
    }
    t.rules.push(new_rule);
    t.rules.sort_by(|a, b| {
        a.chain
            .cmp(&b.chain)
            .then_with(|| a.seq.cmp(&b.seq))
    });
    Ok(())
}

fn update_rule(
    save: &mut ParsedSave,
    table: TableKind,
    chain: &str,
    seq: u32,
    spec: RuleSpec,
) -> Result<(), AppError> {
    let t = ensure_table(save, table);
    let r = t
        .rules
        .iter_mut()
        .find(|r| r.chain == chain && r.seq == seq)
        .ok_or_else(|| AppError::NotFound(format!("rule {chain}:{seq}")))?;
    let raw = ipt_core::render::render_spec(&spec);
    r.raw = format!("-A {chain} {raw}");
    r.spec = spec;
    Ok(())
}

fn delete_rule(
    save: &mut ParsedSave,
    table: TableKind,
    chain: &str,
    seq: u32,
) -> Result<(), AppError> {
    let t = ensure_table(save, table);
    let pos = t
        .rules
        .iter()
        .position(|r| r.chain == chain && r.seq == seq)
        .ok_or_else(|| AppError::NotFound(format!("rule {chain}:{seq}")))?;
    t.rules.remove(pos);
    // re-number seq within the chain
    let mut new_seq = 0u32;
    for r in t.rules.iter_mut() {
        if r.chain == chain {
            r.seq = new_seq;
            new_seq += 1;
        }
    }
    Ok(())
}

fn reorder_chain(
    save: &mut ParsedSave,
    table: TableKind,
    chain: &str,
    order: &[u32],
) -> Result<(), AppError> {
    let t = ensure_table(save, table);
    let mut chain_rules: Vec<Rule> = t
        .rules
        .iter()
        .filter(|r| r.chain == chain)
        .cloned()
        .collect();
    if chain_rules.len() != order.len() {
        return Err(AppError::Validation(
            "reorder list length does not match chain rule count".into(),
        ));
    }
    let mut new_rules = Vec::with_capacity(chain_rules.len());
    for (idx, &old_seq) in order.iter().enumerate() {
        let pos = chain_rules
            .iter()
            .position(|r| r.seq == old_seq)
            .ok_or_else(|| AppError::Validation(format!("seq {old_seq} not in chain")))?;
        let mut r = chain_rules.remove(pos);
        r.seq = idx as u32;
        new_rules.push(r);
    }
    // strip old chain rules and append new
    t.rules.retain(|r| r.chain != chain);
    t.rules.extend(new_rules);
    Ok(())
}

/// Adjust a rule for the opposite address family — substitute icmp protocol
/// names and drop family-only addresses.
fn cross_family_adapt(spec: &mut RuleSpec, target: Family) {
    if let Some(p) = &mut spec.protocol {
        match (p.as_str(), target) {
            ("icmp", Family::V6) => *p = "ipv6-icmp".into(),
            ("ipv6-icmp", Family::V4) | ("icmpv6", Family::V4) => *p = "icmp".into(),
            _ => {}
        }
    }
}

fn skip_for_family(spec: &RuleSpec, target: Family) -> bool {
    let is_v6_only = |s: &str| s.contains(':') || s == "::/0";
    let is_v4_only = |s: &str| s.contains('.') && !s.contains(':');
    match target {
        Family::V4 => {
            spec.source.as_deref().map(is_v6_only).unwrap_or(false)
                || spec.destination.as_deref().map(is_v6_only).unwrap_or(false)
                || matches!(
                    spec.protocol.as_deref(),
                    Some("ipv6-icmp") | Some("icmpv6")
                )
        }
        Family::V6 => {
            spec.source.as_deref().map(is_v4_only).unwrap_or(false)
                || spec.destination.as_deref().map(is_v4_only).unwrap_or(false)
                || matches!(spec.protocol.as_deref(), Some("icmp"))
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DualStackResp {
    pub diff: DualStackDiff,
}

pub async fn dual_stack_compare(State(app): State<AppState>) -> AppResult<Json<DualStackResp>> {
    let ttl = std::time::Duration::from_secs(2);
    let v4 = app.rules_cache.get_or_fetch(Family::V4, &app.executor, ttl).await?;
    let v6 = app.rules_cache.get_or_fetch(Family::V6, &app.executor, ttl).await?;
    let diff = dual_stack_diff(&v4, &v6);
    Ok(Json(DualStackResp { diff }))
}

#[derive(Debug, Serialize)]
pub struct SyncBadgeResp {
    pub v4_count: usize,
    pub v6_count: usize,
    pub mismatched: usize,
}

pub async fn sync_badge(State(app): State<AppState>) -> AppResult<Json<SyncBadgeResp>> {
    let ttl = std::time::Duration::from_secs(2);
    let v4 = app.rules_cache.get_or_fetch(Family::V4, &app.executor, ttl).await?;
    let v6 = app.rules_cache.get_or_fetch(Family::V6, &app.executor, ttl).await?;
    let v4_count: usize = v4.tables.values().map(|t| t.rules.len()).sum();
    let v6_count: usize = v6.tables.values().map(|t| t.rules.len()).sum();
    let diff = dual_stack_diff(&v4, &v6);
    let mismatched = diff.v4_only.len() + diff.v6_only.len() + diff.paired_diff.len();
    Ok(Json(SyncBadgeResp {
        v4_count,
        v6_count,
        mismatched,
    }))
}

// helper for diff ops introspection in tests / templates
#[allow(dead_code)]
pub fn count_ops(d: &ipt_core::RuleDiff) -> (usize, usize, usize) {
    let mut a = 0;
    let mut r = 0;
    let mut m = 0;
    for op in &d.ops {
        match op {
            DiffOp::Add { .. } => a += 1,
            DiffOp::Remove { .. } => r += 1,
            DiffOp::Modify { .. } => m += 1,
        }
    }
    (a, r, m)
}
