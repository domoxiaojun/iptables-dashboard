//! iptables-save text → [`ParsedSave`] parser.
//!
//! The parser is intentionally line-oriented and forgiving: any flag we don't
//! understand is preserved verbatim in `RuleSpec::extra` so the round-trip
//! through [`crate::render`] is lossless.

use crate::model::{
    is_builtin_chain, ChainPolicy, ChainSpec, Counters, Family, MatchExt, ParsedSave, ParsedTable,
    Rule, RuleSpec, TableKind,
};
use std::collections::BTreeMap;
use std::str::FromStr;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("line {line}: {message}")]
    Line { line: usize, message: String },
    #[error("unexpected end of input — missing COMMIT for table {0}")]
    MissingCommit(String),
}

fn err(line: usize, msg: impl Into<String>) -> ParseError {
    ParseError::Line {
        line,
        message: msg.into(),
    }
}

/// Parse an `iptables-save` / `ip6tables-save` dump.
pub fn parse_save(input: &str, family: Family) -> Result<ParsedSave, ParseError> {
    let mut save = ParsedSave::empty(family);
    let mut current: Option<(TableKind, ParsedTable)> = None;
    // counts seq per (table, chain)
    let mut seq_counters: BTreeMap<(TableKind, String), u32> = BTreeMap::new();

    for (idx, raw_line) in input.lines().enumerate() {
        let line_no = idx + 1;
        let line = raw_line.trim_end_matches('\r');

        // skip blank lines
        if line.trim().is_empty() {
            continue;
        }
        // skip comments
        if line.starts_with('#') {
            continue;
        }

        // table marker
        if let Some(name) = line.strip_prefix('*') {
            if let Some((_, table)) = current.take() {
                // Saw a new *table without a preceding COMMIT — accept it but
                // store what we have so far.
                save.tables.insert(table.kind, table);
            }
            let kind = TableKind::from_str(name.trim())
                .map_err(|e| err(line_no, format!("bad table marker: {e}")))?;
            current = Some((
                kind,
                ParsedTable {
                    kind,
                    chains: Vec::new(),
                    rules: Vec::new(),
                },
            ));
            continue;
        }

        if line.trim() == "COMMIT" {
            if let Some((_, table)) = current.take() {
                save.tables.insert(table.kind, table);
            }
            continue;
        }

        // chain declaration
        if let Some(rest) = line.strip_prefix(':') {
            let (kind, table) = match current.as_mut() {
                Some(c) => c,
                None => return Err(err(line_no, "chain decl outside any table")),
            };
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.is_empty() {
                return Err(err(line_no, "empty chain declaration"));
            }
            let name = parts[0].to_string();
            let policy_str = parts.get(1).copied().unwrap_or("-");
            let policy = if policy_str == "-" {
                None
            } else {
                Some(
                    ChainPolicy::from_str(policy_str)
                        .map_err(|e| err(line_no, format!("bad policy: {e}")))?,
                )
            };
            let counters = parts
                .get(2)
                .and_then(|s| parse_bracketed_counters(s).ok())
                .flatten()
                .or(Some(Counters::default()));
            let builtin = is_builtin_chain(&name);
            table.chains.push(ChainSpec {
                family,
                table: *kind,
                name,
                policy,
                builtin,
                counters,
            });
            continue;
        }

        // rule line — possibly prefixed with [pkts:bytes]
        let (counters, body) = strip_leading_counters(line);
        let body = body.trim_start();

        // -N CHAIN / --new-chain CHAIN — explicit chain creation (used by
        // hand-written scripts). iptables-save itself emits `:CHAIN - [0:0]`
        // for user-defined chains, but iptables-restore accepts both forms.
        if let Some(rest) = body
            .strip_prefix("-N ")
            .or_else(|| body.strip_prefix("--new-chain "))
        {
            let (kind, table) = match current.as_mut() {
                Some(c) => c,
                None => return Err(err(line_no, "-N outside any table")),
            };
            let name = match rest.split_whitespace().next() {
                Some(s) if !s.is_empty() => s.to_string(),
                _ => return Err(err(line_no, "-N requires a chain name")),
            };
            if !table.chains.iter().any(|c| c.name == name) {
                let builtin = is_builtin_chain(&name);
                table.chains.push(ChainSpec {
                    family,
                    table: *kind,
                    name,
                    policy: None,
                    builtin,
                    counters: Some(Counters::default()),
                });
            }
            continue;
        }

        if body.starts_with("-A ") || body.starts_with("--append ") {
            let (kind, table) = match current.as_mut() {
                Some(c) => c,
                None => return Err(err(line_no, "rule outside any table")),
            };
            let argv = tokenize(body).map_err(|e| err(line_no, e))?;
            // first two tokens are -A CHAIN
            if argv.len() < 2 {
                return Err(err(line_no, "truncated rule"));
            }
            let chain = argv[1].clone();
            let spec = parse_rule_spec(&argv[2..]);
            let key = (*kind, chain.clone());
            let entry = seq_counters.entry(key).or_insert(0);
            let seq = *entry;
            *entry += 1;
            // Normalize the raw text by re-rendering from the structured spec
            // so that round-trip tests are stable regardless of the exact
            // original argument ordering.
            let canonical_body = crate::render::render_spec(&spec);
            let raw = if canonical_body.is_empty() {
                format!("-A {}", chain)
            } else {
                format!("-A {} {}", chain, canonical_body)
            };
            table.rules.push(Rule {
                id: None,
                family,
                table: *kind,
                chain,
                seq,
                spec,
                raw,
                counters,
            });
            continue;
        }

        // unknown line — ignore but trace
        tracing::trace!(line = line, "ignoring unrecognized iptables-save line");
    }

    if let Some((_, table)) = current {
        // dump without trailing COMMIT — be lenient
        save.tables.insert(table.kind, table);
    }

    Ok(save)
}

fn strip_leading_counters(line: &str) -> (Option<Counters>, &str) {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('[') {
        return (None, line);
    }
    if let Some(end) = trimmed.find(']') {
        let bracketed = &trimmed[..=end];
        let rest = &trimmed[end + 1..];
        if let Ok(Some(c)) = parse_bracketed_counters(bracketed) {
            return (Some(c), rest);
        }
    }
    (None, line)
}

fn parse_bracketed_counters(s: &str) -> Result<Option<Counters>, &'static str> {
    let s = s.trim();
    let inner = s.strip_prefix('[').and_then(|s| s.strip_suffix(']'));
    let Some(inner) = inner else {
        return Ok(None);
    };
    let Some((p, b)) = inner.split_once(':') else {
        return Err("missing colon in counters");
    };
    let packets: u64 = p.parse().map_err(|_| "bad packets")?;
    let bytes: u64 = b.parse().map_err(|_| "bad bytes")?;
    Ok(Some(Counters { packets, bytes }))
}

/// Tokenize a rule line into argv-style strings, honoring double-quoted
/// substrings (e.g. `--log-prefix "iptables: "`).
pub fn tokenize(line: &str) -> Result<Vec<String>, String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut chars = line.chars().peekable();
    let mut in_quote = false;
    while let Some(c) = chars.next() {
        match c {
            '"' => in_quote = !in_quote,
            '\\' if in_quote => {
                if let Some(next) = chars.next() {
                    cur.push(next);
                }
            }
            c if c.is_whitespace() && !in_quote => {
                if !cur.is_empty() {
                    out.push(std::mem::take(&mut cur));
                }
            }
            other => cur.push(other),
        }
    }
    if in_quote {
        return Err("unterminated double quote".into());
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    Ok(out)
}

const CONSUME_END_OF_RULE: &[&str] = &["-j", "--jump", "-g", "--goto"];

fn parse_rule_spec(args: &[String]) -> RuleSpec {
    let mut spec = RuleSpec::default();
    let mut i = 0;

    while i < args.len() {
        let a = &args[i];
        match a.as_str() {
            "!" => {
                // negation prefix — attach to next captured field
                if i + 2 < args.len() {
                    let key = &args[i + 1];
                    let val = &args[i + 2];
                    let combined = format!("!{val}");
                    match key.as_str() {
                        "-s" | "--source" => {
                            spec.source = Some(combined);
                            i += 3;
                            continue;
                        }
                        "-d" | "--destination" => {
                            spec.destination = Some(combined);
                            i += 3;
                            continue;
                        }
                        "-i" | "--in-interface" => {
                            spec.in_interface = Some(combined);
                            i += 3;
                            continue;
                        }
                        "-o" | "--out-interface" => {
                            spec.out_interface = Some(combined);
                            i += 3;
                            continue;
                        }
                        "-p" | "--protocol" => {
                            spec.protocol = Some(combined);
                            i += 3;
                            continue;
                        }
                        _ => {
                            spec.extra.push("!".into());
                            i += 1;
                            continue;
                        }
                    }
                } else {
                    spec.extra.push("!".into());
                    i += 1;
                }
            }
            "-p" | "--protocol" => {
                if let Some(v) = args.get(i + 1) {
                    spec.protocol = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "-s" | "--source" => {
                if let Some(v) = args.get(i + 1) {
                    spec.source = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "-d" | "--destination" => {
                if let Some(v) = args.get(i + 1) {
                    spec.destination = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "-i" | "--in-interface" => {
                if let Some(v) = args.get(i + 1) {
                    spec.in_interface = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "-o" | "--out-interface" => {
                if let Some(v) = args.get(i + 1) {
                    spec.out_interface = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--sport" | "--source-port" | "--source-ports" | "--sports" => {
                if let Some(v) = args.get(i + 1) {
                    spec.sport = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--dport" | "--destination-port" | "--destination-ports" | "--dports" => {
                if let Some(v) = args.get(i + 1) {
                    spec.dport = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "-f" | "--fragment" => {
                spec.fragment = Some(true);
                i += 1;
            }
            "-m" | "--match" => {
                let name = match args.get(i + 1) {
                    Some(v) => v.clone(),
                    None => {
                        i += 1;
                        continue;
                    }
                };
                let mut margs = Vec::new();
                let mut j = i + 2;
                while j < args.len() {
                    let next = &args[j];
                    if next == "-m"
                        || next == "--match"
                        || CONSUME_END_OF_RULE.contains(&next.as_str())
                        || is_top_level_field(next)
                    {
                        break;
                    }
                    margs.push(next.clone());
                    j += 1;
                }
                // surface the most useful fields directly
                match name.as_str() {
                    "comment" => {
                        // -m comment --comment "..."
                        let mut k = 0;
                        while k < margs.len() {
                            if margs[k] == "--comment" {
                                if let Some(v) = margs.get(k + 1) {
                                    spec.comment = Some(v.clone());
                                }
                                k += 2;
                            } else {
                                k += 1;
                            }
                        }
                    }
                    _ => {}
                }
                spec.matches.push(MatchExt { name, args: margs });
                i = j;
            }
            "-j" | "--jump" => {
                if let Some(v) = args.get(i + 1) {
                    spec.jump = Some(v.clone());
                    // consume subsequent target args until next top-level flag
                    let mut j = i + 2;
                    while j < args.len() {
                        let next = &args[j];
                        if is_top_level_field(next) || next == "-m" || next == "--match" {
                            break;
                        }
                        spec.target_args.push(next.clone());
                        j += 1;
                    }
                    i = j;
                } else {
                    i += 1;
                }
            }
            "-g" | "--goto" => {
                if let Some(v) = args.get(i + 1) {
                    spec.goto = Some(v.clone());
                    i += 2;
                } else {
                    i += 1;
                }
            }
            other => {
                spec.extra.push(other.to_string());
                i += 1;
            }
        }
    }

    // post-processing: surface target sub-flags
    if let Some(idx) = spec
        .target_args
        .iter()
        .position(|s| s == "--reject-with" || s == "--log-prefix" || s == "--log-level")
    {
        // We keep them in `target_args` as well — they're already
        // round-trip-rendered there. No-op for now.
        let _ = idx;
    }

    spec
}

fn is_top_level_field(s: &str) -> bool {
    matches!(
        s,
        "-p" | "--protocol"
            | "-s"
            | "--source"
            | "-d"
            | "--destination"
            | "-i"
            | "--in-interface"
            | "-o"
            | "--out-interface"
            | "--sport"
            | "--source-port"
            | "--source-ports"
            | "--sports"
            | "--dport"
            | "--destination-port"
            | "--destination-ports"
            | "--dports"
            | "-f"
            | "--fragment"
            | "!"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Family;

    #[test]
    fn parses_minimal_filter_dump() {
        let input = r#"# Generated by iptables-save
*filter
:INPUT ACCEPT [0:0]
:FORWARD DROP [0:0]
:OUTPUT ACCEPT [12:345]
:DOCKER - [0:0]
[0:0] -A INPUT -i lo -j ACCEPT
-A INPUT -p tcp -m tcp --dport 22 -j ACCEPT
COMMIT
# Completed
"#;
        let parsed = parse_save(input, Family::V4).unwrap();
        let filter = parsed.tables.get(&TableKind::Filter).unwrap();
        assert_eq!(filter.chains.len(), 4);
        assert_eq!(filter.rules.len(), 2);
        assert_eq!(filter.rules[0].chain, "INPUT");
        assert_eq!(filter.rules[0].spec.in_interface.as_deref(), Some("lo"));
        assert_eq!(filter.rules[1].spec.dport.as_deref(), Some("22"));
        assert_eq!(filter.rules[0].seq, 0);
        assert_eq!(filter.rules[1].seq, 1);
    }

    #[test]
    fn handles_comment_and_quoted_log_prefix() {
        let input = r#"*filter
:INPUT DROP [0:0]
-A INPUT -j LOG --log-prefix "iptables: bad input " -m comment --comment "tagged"
COMMIT
"#;
        let parsed = parse_save(input, Family::V4).unwrap();
        let r = &parsed.tables[&TableKind::Filter].rules[0];
        assert_eq!(r.spec.jump.as_deref(), Some("LOG"));
        assert!(r.spec.target_args.iter().any(|s| s == "--log-prefix"));
        assert_eq!(r.spec.comment.as_deref(), Some("tagged"));
    }

    #[test]
    fn parses_negated_source() {
        let input = "*filter\n:INPUT ACCEPT [0:0]\n-A INPUT ! -s 10.0.0.0/8 -j DROP\nCOMMIT\n";
        let parsed = parse_save(input, Family::V4).unwrap();
        let r = &parsed.tables[&TableKind::Filter].rules[0];
        assert_eq!(r.spec.source.as_deref(), Some("!10.0.0.0/8"));
        assert_eq!(r.spec.jump.as_deref(), Some("DROP"));
    }

    #[test]
    fn parses_n_chain_directive() {
        let input = r#"*filter
-N USER_CHAIN
:INPUT ACCEPT [0:0]
-A USER_CHAIN -j RETURN
-A INPUT -j USER_CHAIN
COMMIT
"#;
        let parsed = parse_save(input, Family::V4).unwrap();
        let filter = parsed.tables.get(&TableKind::Filter).unwrap();
        let chain_names: Vec<&str> = filter.chains.iter().map(|c| c.name.as_str()).collect();
        assert!(chain_names.contains(&"USER_CHAIN"));
        assert_eq!(filter.rules.len(), 2);
        assert_eq!(filter.rules[0].chain, "USER_CHAIN");
    }

    #[test]
    fn n_chain_is_idempotent_with_colon_decl() {
        // If a script declares a chain twice (`-N FOO` then `:FOO -`),
        // we should keep only one entry.
        let input = r#"*filter
-N FOO
:FOO - [0:0]
:INPUT ACCEPT [0:0]
COMMIT
"#;
        let parsed = parse_save(input, Family::V4).unwrap();
        let filter = parsed.tables.get(&TableKind::Filter).unwrap();
        let foo_count = filter.chains.iter().filter(|c| c.name == "FOO").count();
        assert_eq!(foo_count, 1);
    }
}
