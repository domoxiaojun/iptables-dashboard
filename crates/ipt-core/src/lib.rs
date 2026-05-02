//! ipt-core — domain model and IO-free parsing/rendering for iptables/ip6tables.
//!
//! This crate intentionally has no IO dependencies so it can be unit-tested
//! against fixture files without a Linux kernel.

pub mod diff;
pub mod guard;
pub mod model;
pub mod parser;
pub mod render;

pub use diff::{compute_diff, dual_stack_diff, DiffOp, DualStackDiff, RuleDiff};
pub use guard::{validate_v6, GuardSeverity, GuardWarning};
pub use model::{
    ChainPolicy, ChainSpec, Counters, Family, MatchExt, ParsedSave, ParsedTable, Rule, RuleSpec,
    Snapshot, SnapshotKind, TableKind,
};
pub use parser::{parse_save, ParseError};
pub use render::render_save;
