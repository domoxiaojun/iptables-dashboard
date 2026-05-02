//! Domain types for iptables/ip6tables rule modelling.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

/// Address family — selects between iptables (IPv4) and ip6tables (IPv6).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Family {
    V4,
    V6,
}

impl Family {
    pub fn as_str(&self) -> &'static str {
        match self {
            Family::V4 => "v4",
            Family::V6 => "v6",
        }
    }

    /// Name of the underlying CLI binary.
    pub fn cli(&self) -> &'static str {
        match self {
            Family::V4 => "iptables",
            Family::V6 => "ip6tables",
        }
    }

    pub fn save_cli(&self) -> &'static str {
        match self {
            Family::V4 => "iptables-save",
            Family::V6 => "ip6tables-save",
        }
    }

    pub fn restore_cli(&self) -> &'static str {
        match self {
            Family::V4 => "iptables-restore",
            Family::V6 => "ip6tables-restore",
        }
    }
}

impl fmt::Display for Family {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for Family {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "v4" | "ipv4" | "4" => Ok(Family::V4),
            "v6" | "ipv6" | "6" => Ok(Family::V6),
            _ => Err(format!("unknown family: {s}")),
        }
    }
}

/// Standard table kinds. `Security` is rare but supported for completeness.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, Ord, PartialOrd)]
#[serde(rename_all = "lowercase")]
pub enum TableKind {
    Filter,
    Nat,
    Mangle,
    Raw,
    Security,
}

impl TableKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            TableKind::Filter => "filter",
            TableKind::Nat => "nat",
            TableKind::Mangle => "mangle",
            TableKind::Raw => "raw",
            TableKind::Security => "security",
        }
    }

    pub fn all() -> [TableKind; 5] {
        [
            TableKind::Filter,
            TableKind::Nat,
            TableKind::Mangle,
            TableKind::Raw,
            TableKind::Security,
        ]
    }
}

impl fmt::Display for TableKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for TableKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "filter" => Ok(TableKind::Filter),
            "nat" => Ok(TableKind::Nat),
            "mangle" => Ok(TableKind::Mangle),
            "raw" => Ok(TableKind::Raw),
            "security" => Ok(TableKind::Security),
            _ => Err(format!("unknown table: {s}")),
        }
    }
}

/// Default policy for a built-in chain. User-defined chains have `None`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum ChainPolicy {
    Accept,
    Drop,
    Return,
    Queue,
}

impl ChainPolicy {
    pub fn as_str(&self) -> &'static str {
        match self {
            ChainPolicy::Accept => "ACCEPT",
            ChainPolicy::Drop => "DROP",
            ChainPolicy::Return => "RETURN",
            ChainPolicy::Queue => "QUEUE",
        }
    }
}

impl fmt::Display for ChainPolicy {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for ChainPolicy {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "ACCEPT" => Ok(ChainPolicy::Accept),
            "DROP" => Ok(ChainPolicy::Drop),
            "RETURN" => Ok(ChainPolicy::Return),
            "QUEUE" => Ok(ChainPolicy::Queue),
            _ => Err(format!("unknown policy: {s}")),
        }
    }
}

/// (packets, bytes) counter pair.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct Counters {
    pub packets: u64,
    pub bytes: u64,
}

/// A `-m <name> <args...>` match extension.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct MatchExt {
    pub name: String,
    pub args: Vec<String>,
}

/// Structured rule specification. Fields not surfaced here are preserved in
/// `extra` so we never lose information on round-trip.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct RuleSpec {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub destination: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub in_interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub out_interface: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub sport: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub dport: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub fragment: Option<bool>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub matches: Vec<MatchExt>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub jump: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub goto: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub target_args: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub extra: Vec<String>,
}

/// A parsed rule attached to a (family, table, chain) location.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rule {
    /// Database id. `None` for in-memory unsaved rules.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub id: Option<i64>,
    pub family: Family,
    pub table: TableKind,
    pub chain: String,
    /// 0-based position in the chain.
    pub seq: u32,
    pub spec: RuleSpec,
    /// Original `-A` line text. Used as a round-trip safety net and for
    /// fall-back rendering when `spec` lacks something.
    pub raw: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub counters: Option<Counters>,
}

impl Rule {
    pub fn enabled(&self) -> bool {
        // We model "disabled" rules by prefixing the comment with [disabled];
        // for MVP we treat all parsed rules as enabled.
        !self
            .spec
            .comment
            .as_deref()
            .map(|c| c.starts_with("[disabled]"))
            .unwrap_or(false)
    }
}

/// Built-in or user-defined chain inside one table.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChainSpec {
    pub family: Family,
    pub table: TableKind,
    pub name: String,
    /// Default policy for built-in chains; `None` for user-defined ones.
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub policy: Option<ChainPolicy>,
    /// True for kernel-created chains (INPUT, OUTPUT, FORWARD, PREROUTING, POSTROUTING).
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub counters: Option<Counters>,
}

/// One iptables-save table block.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedTable {
    pub kind: TableKind,
    pub chains: Vec<ChainSpec>,
    pub rules: Vec<Rule>,
}

/// Whole iptables-save dump for one address family.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedSave {
    pub family: Family,
    pub tables: BTreeMap<TableKind, ParsedTable>,
}

impl ParsedSave {
    pub fn empty(family: Family) -> Self {
        Self {
            family,
            tables: BTreeMap::new(),
        }
    }

    pub fn rules_in(&self, table: TableKind, chain: &str) -> Vec<&Rule> {
        self.tables
            .get(&table)
            .map(|t| t.rules.iter().filter(|r| r.chain == chain).collect())
            .unwrap_or_default()
    }
}

/// Snapshot of both v4 and v6 rule sets at a point in time.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub id: i64,
    pub created_at: DateTime<Utc>,
    pub label: String,
    pub author: String,
    pub v4_save: String,
    pub v6_save: String,
    pub kind: SnapshotKind,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SnapshotKind {
    Manual,
    AutoPreApply,
    AutoRollback,
    BootstrapImport,
}

impl SnapshotKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            SnapshotKind::Manual => "manual",
            SnapshotKind::AutoPreApply => "auto_pre_apply",
            SnapshotKind::AutoRollback => "auto_rollback",
            SnapshotKind::BootstrapImport => "bootstrap_import",
        }
    }
}

impl std::str::FromStr for SnapshotKind {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "manual" => Ok(SnapshotKind::Manual),
            "auto_pre_apply" => Ok(SnapshotKind::AutoPreApply),
            "auto_rollback" => Ok(SnapshotKind::AutoRollback),
            "bootstrap_import" => Ok(SnapshotKind::BootstrapImport),
            _ => Err(format!("unknown snapshot kind: {s}")),
        }
    }
}

/// Whether a chain name is one of the kernel-built-in ones.
pub fn is_builtin_chain(name: &str) -> bool {
    matches!(
        name,
        "INPUT" | "OUTPUT" | "FORWARD" | "PREROUTING" | "POSTROUTING"
    )
}
