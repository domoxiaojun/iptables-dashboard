//! ICMPv6 / NDP guard — block configurations that would break IPv6 connectivity.
//!
//! Reference: RFC 4890 — "Recommendations for Filtering ICMPv6 Messages in
//! Firewalls". The minimum essential ICMPv6 types that must be permitted on
//! INPUT/OUTPUT for IPv6 to work at all are:
//!   - 1   Destination Unreachable
//!   - 2   Packet Too Big          (for path MTU discovery)
//!   - 3   Time Exceeded
//!   - 4   Parameter Problem
//!   - 128 Echo Request
//!   - 129 Echo Reply
//!   - 133 Router Solicitation     (NDP)
//!   - 134 Router Advertisement    (NDP)
//!   - 135 Neighbor Solicitation   (NDP)
//!   - 136 Neighbor Advertisement  (NDP)
//!   - 137 Redirect                (NDP, can be dropped on hardened hosts)

use crate::model::{ChainPolicy, Family, ParsedSave, Rule, TableKind};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum GuardSeverity {
    /// Will almost certainly break IPv6 connectivity.
    Error,
    /// Strongly discouraged; user must override explicitly.
    Warn,
    /// Informational note.
    Info,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuardWarning {
    pub severity: GuardSeverity,
    pub code: String,
    pub message: String,
    pub chain: Option<String>,
    /// Suggested rules the user should ensure exist.
    pub suggested_rules: Vec<String>,
}

const REQUIRED_TYPES: &[u8] = &[1, 2, 3, 4, 128, 129, 133, 134, 135, 136];

/// Inspect the v6 rule set and return guard warnings.
///
/// `parsed` must be the v6 family. If a v4 dump is passed, returns empty.
pub fn validate_v6(parsed: &ParsedSave) -> Vec<GuardWarning> {
    if parsed.family != Family::V6 {
        return Vec::new();
    }

    let mut out = Vec::new();
    let filter = match parsed.tables.get(&TableKind::Filter) {
        Some(t) => t,
        None => return out,
    };

    // 1) Default policy on INPUT — if it's DROP/REJECT, we need explicit allows
    let input_policy = filter
        .chains
        .iter()
        .find(|c| c.name == "INPUT")
        .and_then(|c| c.policy);

    let default_drop = matches!(input_policy, Some(ChainPolicy::Drop));

    // 2) Find any rule that would unconditionally drop ICMPv6
    for r in &filter.rules {
        if r.chain != "INPUT" {
            continue;
        }
        if is_icmpv6_drop(r) && !is_specific_type(r) {
            out.push(GuardWarning {
                severity: GuardSeverity::Error,
                code: "ICMP6_BLANKET_DROP".into(),
                message: format!(
                    "rule #{} on INPUT drops all ICMPv6 — IPv6 will be unusable",
                    r.seq + 1
                ),
                chain: Some(r.chain.clone()),
                suggested_rules: required_rules_text(),
            });
        }
    }

    if default_drop {
        // verify each required type is matched by some ACCEPT rule
        let mut allowed: std::collections::BTreeSet<u8> = Default::default();
        for r in &filter.rules {
            if r.chain != "INPUT" {
                continue;
            }
            if !is_icmpv6(r) {
                continue;
            }
            if r.spec.jump.as_deref() != Some("ACCEPT") {
                continue;
            }
            for t in icmpv6_types(r) {
                allowed.insert(t);
            }
        }
        let missing: Vec<u8> = REQUIRED_TYPES
            .iter()
            .filter(|t| !allowed.contains(t))
            .copied()
            .collect();
        if !missing.is_empty() {
            out.push(GuardWarning {
                severity: GuardSeverity::Error,
                code: "ICMP6_MISSING_REQUIRED_TYPES".into(),
                message: format!(
                    "INPUT default policy is DROP but the following ICMPv6 types lack ACCEPT rules: {}",
                    missing
                        .iter()
                        .map(u8::to_string)
                        .collect::<Vec<_>>()
                        .join(", ")
                ),
                chain: Some("INPUT".into()),
                suggested_rules: required_rules_text(),
            });
        }
    }

    out
}

fn is_icmpv6(r: &Rule) -> bool {
    r.spec
        .protocol
        .as_deref()
        .map(|p| matches!(p, "ipv6-icmp" | "icmpv6" | "icmp6"))
        .unwrap_or(false)
}

fn is_icmpv6_drop(r: &Rule) -> bool {
    is_icmpv6(r)
        && matches!(r.spec.jump.as_deref(), Some("DROP") | Some("REJECT"))
}

fn is_specific_type(r: &Rule) -> bool {
    r.spec
        .matches
        .iter()
        .any(|m| m.args.iter().any(|a| a == "--icmpv6-type"))
}

/// Extract any `--icmpv6-type N` values from the rule's match extensions.
fn icmpv6_types(r: &Rule) -> Vec<u8> {
    let mut out = Vec::new();
    for m in &r.spec.matches {
        let mut iter = m.args.iter();
        while let Some(a) = iter.next() {
            if a == "--icmpv6-type" {
                if let Some(v) = iter.next() {
                    if let Ok(n) = v.parse::<u8>() {
                        out.push(n);
                    } else if let Some(n) = name_to_icmpv6_type(v) {
                        out.push(n);
                    }
                }
            }
        }
    }
    out
}

fn name_to_icmpv6_type(s: &str) -> Option<u8> {
    Some(match s {
        "destination-unreachable" => 1,
        "packet-too-big" => 2,
        "time-exceeded" => 3,
        "parameter-problem" => 4,
        "echo-request" => 128,
        "echo-reply" => 129,
        "router-solicitation" => 133,
        "router-advertisement" => 134,
        "neighbour-solicitation" | "neighbor-solicitation" => 135,
        "neighbour-advertisement" | "neighbor-advertisement" => 136,
        "redirect" => 137,
        _ => return None,
    })
}

fn required_rules_text() -> Vec<String> {
    REQUIRED_TYPES
        .iter()
        .map(|t| {
            format!("ip6tables -A INPUT -p ipv6-icmp -m icmp6 --icmpv6-type {t} -j ACCEPT")
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::parse_save;

    #[test]
    fn detects_blanket_icmpv6_drop() {
        let dump = "*filter\n:INPUT ACCEPT [0:0]\n-A INPUT -p ipv6-icmp -j DROP\nCOMMIT\n";
        let p = parse_save(dump, Family::V6).unwrap();
        let w = validate_v6(&p);
        assert!(w.iter().any(|w| w.code == "ICMP6_BLANKET_DROP"));
    }

    #[test]
    fn passes_when_all_required_types_allowed() {
        let mut s = String::from("*filter\n:INPUT DROP [0:0]\n");
        for t in [1, 2, 3, 4, 128, 129, 133, 134, 135, 136] {
            s.push_str(&format!(
                "-A INPUT -p ipv6-icmp -m icmp6 --icmpv6-type {t} -j ACCEPT\n"
            ));
        }
        s.push_str("COMMIT\n");
        let p = parse_save(&s, Family::V6).unwrap();
        let w = validate_v6(&p);
        assert!(
            w.iter().all(|w| w.severity != GuardSeverity::Error),
            "got: {w:?}"
        );
    }
}
