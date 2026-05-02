# Third Party Licenses

This project incorporates work from, depends on, or takes design inspiration
from the following third-party projects.

## Frontend

### Self-authored UI components (in this repo, not vendored)

The components under `frontend/src/components/ui/` and
`frontend/src/components/react-bits/` are **original lightweight components
written for this project**. They are stylistically inspired by, but are
NOT copies of, the following:

- **shadcn/ui** (https://ui.shadcn.com) — MIT — inspired the new-york
  variant, the slate base palette, and the `cn()` / `cva` patterns. The
  `components.json` config is kept to allow future migration to upstream
  shadcn/ui via `pnpm dlx shadcn@latest add ...` if richer
  Radix-backed primitives become necessary.
- **react-bits** (https://reactbits.dev / https://github.com/DavidHDev/react-bits)
  — MIT + Commons Clause — inspired the aurora background, gradient text,
  and countdown ring visuals. The Commons Clause restricts selling
  react-bits **itself** as a product and does not affect this project's
  use of independently authored components in the same style.

### Major runtime dependencies

| Package | License | Purpose |
|---|---|---|
| react, react-dom | MIT | UI runtime |
| @tanstack/react-query | MIT | Server-state cache |
| @tanstack/react-router | MIT | Routing (used programmatically; file-routes optional) |
| @tanstack/react-table | MIT | Tabular rule view |
| @dnd-kit/* | MIT | Drag-and-drop reorder |
| react-hook-form, @hookform/resolvers | MIT | Form state |
| zod | MIT | Schema validation |
| zustand | MIT | Client UI store |
| tailwindcss, tailwind-merge, tailwindcss-animate | MIT | Styling |
| class-variance-authority, clsx | Apache-2.0 / MIT | Conditional classes |
| lucide-react | ISC | Icon set |

Run `pnpm licenses ls` for the full transitive list.

## Backend (Rust)

| Crate | License | Purpose |
|---|---|---|
| axum | MIT | HTTP framework |
| tokio | MIT | Async runtime |
| tower, tower-http | MIT | Service / middleware layers |
| tower-sessions, tower-sessions-sqlx-store | MIT | Session store |
| axum-login | MIT | Auth integration |
| password-auth | MIT/Apache-2.0 | argon2id password hashing |
| sqlx, libsqlite3-sys | MIT/Apache-2.0 | SQLite via runtime queries |
| rust-embed | MIT | Static asset embedding |
| figment | MIT/Apache-2.0 | Layered config loading |
| serde, serde_json, serde_with | MIT/Apache-2.0 | (De)serialization |
| chrono | MIT/Apache-2.0 | Timestamps |
| uuid | MIT/Apache-2.0 | Token generation |
| tracing, tracing-subscriber | MIT | Structured logging |
| thiserror, anyhow | MIT/Apache-2.0 | Error types |
| rand | MIT/Apache-2.0 | Bootstrap password generation |

Run `cargo about generate` (with a license template) for the full transitive
list including indirect dependencies.

## License of this project

This project is MIT-licensed — see `LICENSE`. The third-party components
listed above retain their original licenses; this file only documents them.
