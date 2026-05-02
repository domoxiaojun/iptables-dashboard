use ipt_core::{parse_save, render_save, Family};
use std::fs;

fn fixture(name: &str) -> String {
    let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    fs::read_to_string(path).expect("fixture exists")
}

#[test]
fn round_trip_v4_typical_server() {
    let input = fixture("v4_typical_server.save");
    let parsed = parse_save(&input, Family::V4).expect("parse");
    let rendered = render_save(&parsed);
    let reparsed = parse_save(&rendered, Family::V4).expect("re-parse");
    pretty_assertions::assert_eq!(parsed, reparsed);
}

#[test]
fn round_trip_v6_typical_server() {
    let input = fixture("v6_typical_server.save");
    let parsed = parse_save(&input, Family::V6).expect("parse");
    let rendered = render_save(&parsed);
    let reparsed = parse_save(&rendered, Family::V6).expect("re-parse");
    pretty_assertions::assert_eq!(parsed, reparsed);
}

#[test]
fn round_trip_v4_empty() {
    let input = fixture("v4_empty.save");
    let parsed = parse_save(&input, Family::V4).expect("parse");
    let rendered = render_save(&parsed);
    let reparsed = parse_save(&rendered, Family::V4).expect("re-parse");
    pretty_assertions::assert_eq!(parsed, reparsed);
}

#[test]
fn parses_docker_chain_set() {
    let input = fixture("v4_typical_server.save");
    let parsed = parse_save(&input, Family::V4).expect("parse");
    let filter = parsed
        .tables
        .get(&ipt_core::TableKind::Filter)
        .expect("filter table");
    let chain_names: Vec<&str> = filter.chains.iter().map(|c| c.name.as_str()).collect();
    assert!(chain_names.contains(&"DOCKER"));
    assert!(chain_names.contains(&"DOCKER-USER"));
}
