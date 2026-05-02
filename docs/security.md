# Security model

## Threat surface

The panel must run with `CAP_NET_ADMIN` + `CAP_NET_RAW` and host network
namespace access. This is the smallest privilege set that lets it do its
job; it is also high enough that compromise of the panel is equivalent to
compromising the host firewall. Treat the panel itself as a sensitive
admin surface.

## Network access control

Three layers, applied in this order on every request:

1. **`security.allowed_ips`** — an explicit IP / CIDR allow-list. Empty by
   default (preserves backwards compatibility); when set, every request
   from outside the list is rejected with `403` *before* it touches the
   session layer or burns a brute-force counter. Loopback access to
   `/api/v1/health` is always allowed so Docker / K8s probes keep
   working. The check uses the real client IP (X-Forwarded-For when the
   peer is in `trusted_proxies`, otherwise the connection peer).
2. **`security.trusted_proxies`** — IPs / CIDRs whose `X-Forwarded-For`
   header is honored. Without this, putting the panel behind a reverse
   proxy would attribute every request to the proxy IP (defeating both
   brute-force lockout and `allowed_ips`).
3. **Brute-force lockout** — see Authentication below.

## Authentication

- argon2id password hashes (`password-auth` crate)
- `tower-sessions` server-side sessions stored in SQLite — `Strict` SameSite,
  `HttpOnly`, 7-day inactivity timeout
- After 5 failed logins from one IP within 15 minutes, that IP is locked out
- `axum-login::login_required!` (or equivalent middleware) protects every
  state-changing endpoint

## Two-step activation

Every kernel-mutating endpoint (`/apply`, snapshot restore, template apply)
runs through `TwoPhaseManager` — see `docs/architecture.md`. Two layers:

1. **In-process** — `tokio::sync::oneshot` + `tokio::time::sleep`
2. **Crash-safe** — `pending.json` is fsynced before kernel changes; on
   startup `safety::recover()` rolls back any unfinished tokens

A wedged tokio runtime that still keeps the HTTP listener alive is not
handled in-process. Instead, run under a supervisor that restarts the
process: `systemd Restart=on-failure` (binary install) or Docker
`--restart=unless-stopped` paired with the built-in HEALTHCHECK
(container install). The new process runs `recover()` on startup and
rolls back any orphan pending applies.

## ICMPv6 guard

`ipt_core::guard::validate_v6` enforces RFC 4890 essentials. The required
types (1, 2, 3, 4, 128, 129, 133–136) must either be ACCEPTed explicitly or
the chain default policy must permit them. A blanket
`-p ipv6-icmp -j DROP` triggers a hard error that requires `force=true`
and an audit-logged override to bypass.

## Command injection

Every iptables CLI invocation goes through `tokio::process::Command::arg()`
— never string interpolation into a shell. User input is validated before
hitting the executor.

## CSRF / XSS

- Cookies carry `SameSite=Strict; HttpOnly`
- All state-changing endpoints require `Content-Type: application/json` and
  the auth cookie; CORS is disabled by default
- Frontend renders user data exclusively through React's text-only paths
  (no `dangerouslyInnerHTML`)

## TLS

The server speaks HTTP only — direct TLS is intentionally not supported.
Run a reverse proxy (Caddy, Traefik, nginx, …) in front for TLS
termination, certificate renewal, and request limits. Bind the dashboard
to `127.0.0.1:7642` (`IPTD_LISTEN=127.0.0.1:7642`) so the only reachable
path is via the proxy.
