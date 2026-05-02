# Architecture

## Workspace layout

```
crates/
├── ipt-core/         # IO-free domain model + parser + renderer + diff + guard
├── ipt-executor/     # Executor trait + LocalExec implementation
└── ipt-web/          # axum server, HTTP API, embedded frontend
frontend/             # React + Vite + TS + Tailwind + TanStack Router
docker/               # Multi-stage Dockerfile + entrypoint + compose
deploy/systemd/       # systemd unit for non-container deploys
.github/workflows/    # CI + release pipelines
```

## Data flow

```
Browser ──HTTP──▶ axum Router ──▶ Handler
                               └──▶ AppState
                                     ├── SqlitePool   (sqlx)
                                     ├── Executor     (tokio::process::Command)
                                     ├── TwoPhaseManager
                                     └── StatsBroadcaster (broadcast::Sender)
                                                  ▲
                       background tick task ──────┘
```

## Two-step activation timeline

```
t=0     POST /apply
        ├── snapshot pre-state (auto_pre_apply)
        ├── iptables-restore --test
        ├── iptables-restore  ─▶ kernel netfilter changes
        ├── tokio::time::sleep(N)  +  oneshot::Receiver
        ├── pending.json saved
        └── return { token, expires_at }

t<N     POST /apply/{token}/confirm  → oneshot.send(Confirm) → cancel timer
        OR
        POST /apply/{token}/abort   → oneshot.send(Abort) → restore(pre)
        OR
        timer expires                → restore(pre) automatically

restart recovery:
  on startup, TwoPhaseManager::recover() loads pending.json and rolls back
  any tokens that the server crashed mid-window.
```

## Database schema

- `users` — single-user auth, argon2 hashed
- `snapshots` — every apply records pre + post; manual labels too
- `templates` — built-in seeded on first run + user-created
- `audit_log` — every state-changing operation
- `pending_apply` — in-flight two-step tokens
- `login_attempts` — brute-force counters
- `tower_sessions` — managed by tower-sessions-sqlx-store

## iptables backend detection (Docker)

The Alpine runtime image includes both `iptables-legacy` and `iptables-nft`.
At container start `docker/entrypoint.sh` probes the host backend and
symlinks `/usr/sbin/iptables*` → the matching tool. This avoids the
"iptables-nft inside container, iptables-legacy on host → two split rule
sets" trap that catches naive deployments.

## Why no rust-iptables (libxtables) binding?

`yaa110/rust-iptables` wraps libxtables, which:
- requires the matching version of iptables to be linked
- doesn't transparently work with the iptables-nft compatibility shim
- pinned the project to a single backend at compile time

`tokio::process::Command` invoking the CLI binaries is uniformly compatible
with both legacy and nft, supports any iptables version available on the
host, and gives us native error messages users can paste into search.
