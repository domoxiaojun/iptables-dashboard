//! Built-in firewall rule templates seeded into the database on first run.

#[derive(Debug, Clone)]
pub struct BuiltinTemplate {
    pub name: &'static str,
    pub category: &'static str,
    pub description: &'static str,
    /// JSON-encoded `Vec<TemplateRule>` — see frontend types/templates.ts for shape.
    pub rules_json: &'static str,
}

pub fn all() -> &'static [BuiltinTemplate] {
    &[
        BuiltinTemplate {
            name: "SSH 限速 (防暴力)",
            category: "ssh",
            description: "对 22 端口启用 conntrack + recent，限制单 IP 每分钟最多 5 次新连接",
            rules_json: r#"[
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"protocol":"tcp","dport":"22","matches":[{"name":"conntrack","args":["--ctstate","NEW"]},{"name":"recent","args":["--set","--name","ssh-rate"]}],"jump":"ACCEPT"}},
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"protocol":"tcp","dport":"22","matches":[{"name":"conntrack","args":["--ctstate","NEW"]},{"name":"recent","args":["--update","--seconds","60","--hitcount","5","--name","ssh-rate"]}],"jump":"DROP"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "Web 反向代理常用 (80/443)",
            category: "web",
            description: "放行入站 80/443，常用于反向代理前置",
            rules_json: r#"[
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"protocol":"tcp","dport":"80","jump":"ACCEPT"}},
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"protocol":"tcp","dport":"443","jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"tcp","dport":"80","jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"tcp","dport":"443","jump":"ACCEPT"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "已建立连接放行",
            category: "core",
            description: "通过 conntrack 放行 RELATED,ESTABLISHED",
            rules_json: r#"[
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"matches":[{"name":"conntrack","args":["--ctstate","RELATED,ESTABLISHED"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"matches":[{"name":"conntrack","args":["--ctstate","RELATED,ESTABLISHED"]}],"jump":"ACCEPT"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "回环放行 (lo)",
            category: "core",
            description: "放行本地 lo 接口",
            rules_json: r#"[
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"in_interface":"lo","jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"in_interface":"lo","jump":"ACCEPT"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "ICMPv6 基础放行 (NDP/PMTUD)",
            category: "icmp6",
            description: "放行 RFC 4890 必备的 ICMPv6 类型 (1,2,3,4,128,129,133-136)",
            rules_json: r#"[
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","1"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","2"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","3"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","4"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","128"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","129"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","133"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","134"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","135"]}],"jump":"ACCEPT"}},
              {"family":"v6","table":"filter","chain":"INPUT","spec":{"protocol":"ipv6-icmp","matches":[{"name":"icmp6","args":["--icmpv6-type","136"]}],"jump":"ACCEPT"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "Docker 兼容预留",
            category: "docker",
            description: "在 FORWARD 链顶部预留 DOCKER-USER 链以避免影响 Docker 自动规则",
            rules_json: r#"[
              {"family":"v4","table":"filter","chain":"FORWARD","spec":{"jump":"DOCKER-USER"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "丢包前先 LOG",
            category: "logging",
            description: "在 INPUT 链结尾添加 LOG，再统一 DROP",
            rules_json: r#"[
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"jump":"LOG","target_args":["--log-prefix","iptables drop: ","--log-level","4"]}},
              {"family":"v4","table":"filter","chain":"INPUT","spec":{"jump":"DROP"}}
            ]"#,
        },
        BuiltinTemplate {
            name: "NAT 端口转发示例 (8080→80)",
            category: "nat",
            description: "把入站 8080 端口转发到本机 80 端口",
            rules_json: r#"[
              {"family":"v4","table":"nat","chain":"PREROUTING","spec":{"protocol":"tcp","dport":"8080","jump":"REDIRECT","target_args":["--to-ports","80"]}}
            ]"#,
        },
    ]
}
