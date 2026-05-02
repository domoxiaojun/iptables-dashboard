//! Compute differences between rule sets.

use crate::model::{Family, ParsedSave, Rule, TableKind};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

/// One operation needed to transform a `from` rule set into a `to` rule set.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "op", rename_all = "snake_case")]
pub enum DiffOp {
    Add { rule: Rule },
    Remove { rule: Rule },
    Modify { from: Rule, to: Rule },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleDiff {
    pub family: Family,
    pub ops: Vec<DiffOp>,
}

/// Compute a diff that transforms `from` into `to` for one address family.
///
/// The matching is identity-by-key: we identify rules by `(table, chain, seq)`
/// when seq is stable, otherwise fall back to structural equality of the spec.
pub fn compute_diff(from: &ParsedSave, to: &ParsedSave) -> RuleDiff {
    assert_eq!(from.family, to.family, "compute_diff: family mismatch");
    let family = from.family;
    let mut ops = Vec::new();

    let tables: BTreeSet<TableKind> = from
        .tables
        .keys()
        .chain(to.tables.keys())
        .copied()
        .collect();

    for tk in tables {
        let from_rules: Vec<&Rule> = from
            .tables
            .get(&tk)
            .map(|t| t.rules.iter().collect())
            .unwrap_or_default();
        let to_rules: Vec<&Rule> = to
            .tables
            .get(&tk)
            .map(|t| t.rules.iter().collect())
            .unwrap_or_default();

        // Group rules by chain so seq is meaningful within a chain
        let mut from_by_chain: BTreeMap<&str, Vec<&Rule>> = BTreeMap::new();
        for r in &from_rules {
            from_by_chain.entry(r.chain.as_str()).or_default().push(r);
        }
        let mut to_by_chain: BTreeMap<&str, Vec<&Rule>> = BTreeMap::new();
        for r in &to_rules {
            to_by_chain.entry(r.chain.as_str()).or_default().push(r);
        }

        let chains: BTreeSet<&str> = from_by_chain
            .keys()
            .chain(to_by_chain.keys())
            .copied()
            .collect();
        for chain in chains {
            let f = from_by_chain.get(chain).cloned().unwrap_or_default();
            let t = to_by_chain.get(chain).cloned().unwrap_or_default();
            diff_chain(&f, &t, &mut ops);
        }
    }

    RuleDiff { family, ops }
}

fn diff_chain(from: &[&Rule], to: &[&Rule], ops: &mut Vec<DiffOp>) {
    // straightforward index-aligned compare; mismatches become Modify, excess on
    // one side becomes Add/Remove. Good enough for MVP — proper LCS later.
    let max_len = from.len().max(to.len());
    for i in 0..max_len {
        match (from.get(i), to.get(i)) {
            (Some(a), Some(b)) => {
                if a.spec != b.spec || a.chain != b.chain || a.table != b.table {
                    ops.push(DiffOp::Modify {
                        from: (*a).clone(),
                        to: (*b).clone(),
                    });
                }
            }
            (Some(a), None) => ops.push(DiffOp::Remove { rule: (*a).clone() }),
            (None, Some(b)) => ops.push(DiffOp::Add { rule: (*b).clone() }),
            (None, None) => {}
        }
    }
}

/// Cross-family comparison: which rules are in v4 only, v6 only, or in both
/// but with field differences. Used by the dual-stack diff page.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DualStackDiff {
    pub v4_only: Vec<Rule>,
    pub v6_only: Vec<Rule>,
    /// Pairs of rules with the same logical position but different fields.
    pub paired_diff: Vec<(Rule, Rule)>,
    /// Rules present in both with identical structure (excluding family-specific fields).
    pub matched: usize,
}

pub fn dual_stack_diff(v4: &ParsedSave, v6: &ParsedSave) -> DualStackDiff {
    assert_eq!(v4.family, Family::V4);
    assert_eq!(v6.family, Family::V6);

    let mut out = DualStackDiff::default();

    // Build a map (table, chain, normalized_signature) → Vec of rules in
    // declaration order. Using Vec instead of a single ref preserves rules
    // with identical signatures (e.g. two `-p tcp --dport 22 -j ACCEPT`
    // entries that differ only in source).
    let mut v4_index: BTreeMap<(TableKind, String, String), Vec<&Rule>> = BTreeMap::new();
    for r in v4.tables.values().flat_map(|t| t.rules.iter()) {
        v4_index
            .entry((r.table, r.chain.clone(), normalized_sig(r)))
            .or_default()
            .push(r);
    }
    let mut v6_index: BTreeMap<(TableKind, String, String), Vec<&Rule>> = BTreeMap::new();
    for r in v6.tables.values().flat_map(|t| t.rules.iter()) {
        v6_index
            .entry((r.table, r.chain.clone(), normalized_sig(r)))
            .or_default()
            .push(r);
    }

    let v4_keys: BTreeSet<_> = v4_index.keys().cloned().collect();
    let v6_keys: BTreeSet<_> = v6_index.keys().cloned().collect();

    for k in v4_keys.intersection(&v6_keys) {
        let v4_list = v4_index.get(k).cloned().unwrap_or_default();
        let v6_list = v6_index.get(k).cloned().unwrap_or_default();
        let pair_count = v4_list.len().min(v6_list.len());
        for i in 0..pair_count {
            let a = v4_list[i];
            let b = v6_list[i];
            if a.spec == b.spec.clone().with_family_swap() {
                out.matched += 1;
            } else {
                out.paired_diff.push(((*a).clone(), (*b).clone()));
            }
        }
        // Excess on either side: rules without a counterpart in the other family
        for r in v4_list.iter().skip(pair_count) {
            out.v4_only.push((**r).clone());
        }
        for r in v6_list.iter().skip(pair_count) {
            out.v6_only.push((**r).clone());
        }
    }
    for k in v4_keys.difference(&v6_keys) {
        if let Some(rules) = v4_index.get(k) {
            for r in rules {
                out.v4_only.push((**r).clone());
            }
        }
    }
    for k in v6_keys.difference(&v4_keys) {
        if let Some(rules) = v6_index.get(k) {
            for r in rules {
                out.v6_only.push((**r).clone());
            }
        }
    }

    out
}

/// Build a coarse signature for cross-family pairing — drop fields that
/// are inherently different between v4 and v6 (e.g. icmp vs ipv6-icmp).
/// Includes source/destination so that two rules within the same chain that
/// share protocol/port but target different subnets are not collapsed.
fn normalized_sig(r: &Rule) -> String {
    use std::fmt::Write;
    let mut sig = String::with_capacity(64);
    if let Some(p) = &r.spec.protocol {
        let p = match p.as_str() {
            "icmp" | "ipv6-icmp" | "icmpv6" => "icmp_any",
            other => other,
        };
        let _ = write!(sig, "p={p};");
    }
    if let Some(v) = &r.spec.dport {
        let _ = write!(sig, "dport={v};");
    }
    if let Some(v) = &r.spec.sport {
        let _ = write!(sig, "sport={v};");
    }
    if let Some(v) = &r.spec.in_interface {
        let _ = write!(sig, "i={v};");
    }
    if let Some(v) = &r.spec.out_interface {
        let _ = write!(sig, "o={v};");
    }
    if let Some(v) = &r.spec.source {
        let _ = write!(sig, "s={v};");
    }
    if let Some(v) = &r.spec.destination {
        let _ = write!(sig, "d={v};");
    }
    if let Some(j) = &r.spec.jump {
        let _ = write!(sig, "j={j};");
    }
    sig
}

trait FamilySwapExt {
    fn with_family_swap(self) -> Self;
}

impl FamilySwapExt for crate::model::RuleSpec {
    /// Normalize family-specific differences so equivalent rules compare equal.
    fn with_family_swap(mut self) -> Self {
        if let Some(p) = &mut self.protocol {
            if matches!(p.as_str(), "icmp" | "ipv6-icmp" | "icmpv6") {
                *p = "icmp".into();
            }
        }
        // strip family-only addresses for comparison
        if let Some(s) = &self.source {
            if s.contains(':') || s == "::/0" {
                self.source = None;
            }
        }
        if let Some(s) = &self.destination {
            if s.contains(':') || s == "::/0" {
                self.destination = None;
            }
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_save;

    #[test]
    fn empty_diff() {
        let p = parse_save("*filter\n:INPUT ACCEPT [0:0]\nCOMMIT\n", Family::V4).unwrap();
        let d = compute_diff(&p, &p);
        assert!(d.ops.is_empty());
    }

    #[test]
    fn single_add() {
        let a = parse_save("*filter\n:INPUT ACCEPT [0:0]\nCOMMIT\n", Family::V4).unwrap();
        let b = parse_save(
            "*filter\n:INPUT ACCEPT [0:0]\n-A INPUT -p tcp --dport 80 -j ACCEPT\nCOMMIT\n",
            Family::V4,
        )
        .unwrap();
        let d = compute_diff(&a, &b);
        assert_eq!(d.ops.len(), 1);
        assert!(matches!(d.ops[0], DiffOp::Add { .. }));
    }

    #[test]
    fn dual_stack_dedup_keeps_duplicates() {
        // Two v4 rules with the same protocol/dport but different source.
        // The old implementation collapsed them; the new one should keep
        // both visible in the diff.
        let v4 = parse_save(
            "*filter\n:INPUT ACCEPT [0:0]\n\
             -A INPUT -p tcp -s 10.0.0.0/8 --dport 22 -j ACCEPT\n\
             -A INPUT -p tcp -s 192.168.0.0/16 --dport 22 -j ACCEPT\n\
             COMMIT\n",
            Family::V4,
        )
        .unwrap();
        let v6 = parse_save("*filter\n:INPUT ACCEPT [0:0]\nCOMMIT\n", Family::V6).unwrap();
        let d = dual_stack_diff(&v4, &v6);
        // Both v4 rules should appear in v4_only (different sources → different sigs).
        assert_eq!(d.v4_only.len(), 2);
    }

    #[test]
    fn dual_stack_pair_count_matches_minimum() {
        // Same signature on both families; pairing count should be the min.
        let v4 = parse_save(
            "*filter\n:INPUT ACCEPT [0:0]\n\
             -A INPUT -p tcp --dport 22 -j ACCEPT\n\
             -A INPUT -p tcp --dport 22 -j ACCEPT\n\
             COMMIT\n",
            Family::V4,
        )
        .unwrap();
        let v6 = parse_save(
            "*filter\n:INPUT ACCEPT [0:0]\n\
             -A INPUT -p tcp --dport 22 -j ACCEPT\n\
             COMMIT\n",
            Family::V6,
        )
        .unwrap();
        let d = dual_stack_diff(&v4, &v6);
        assert_eq!(d.matched, 1, "one pair");
        assert_eq!(d.v4_only.len(), 1, "one extra on v4 side");
        assert_eq!(d.v6_only.len(), 0);
    }
}
