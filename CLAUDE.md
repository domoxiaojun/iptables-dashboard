# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 仓库总览

iptables-dashboard 是一个 IPv4/IPv6 双栈 iptables 可视化管理面板，由 **Rust 后端 + React 前端** 组成，最终发行形态是 **单二进制（musl 静态链接）** 与 **单 Docker 镜像（Alpine, multi-arch）**。

- Rust workspace（`Cargo.toml`）拆成 3 个 crate：`ipt-core` / `ipt-executor` / `ipt-web`
- 前端在 `frontend/`，pnpm 管理；产物通过 `rust-embed` 在编译时嵌入 `ipt-web` 二进制
- 设计文档：[`docs/architecture.md`](docs/architecture.md)、[`docs/security.md`](docs/architecture.md)
- 工具链固定为 Rust 1.88（见 [`rust-toolchain.toml`](rust-toolchain.toml)）；交叉编译目标为 `x86_64-unknown-linux-musl` 和 `aarch64-unknown-linux-musl`

## 常用命令

### 后端（Rust workspace）

```bash
cargo run -p ipt-web              # 运行后端服务（默认 0.0.0.0:7642）
cargo build --release             # 发行构建
cargo test --workspace            # 全部单测 + 集成测试
cargo test -p ipt-core round_trip # 跑单个测试 / 单个文件
cargo fmt --all                   # rustfmt（toolchain 已带）
cargo clippy --workspace --all-targets -- -D warnings   # 推荐的 lint
```

### 前端（`frontend/`，pnpm 9.15.2）

```bash
pnpm install
pnpm dev          # Vite dev server: http://0.0.0.0:5173，/api 代理到 127.0.0.1:7642
pnpm build        # tsc --noEmit + vite build → frontend/dist
pnpm test         # vitest run
pnpm test:watch   # vitest watch
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit
```

### 容器化开发栈

```bash
docker compose -f docker/docker-compose.dev.yml up   # 同时跑 cargo + pnpm dev，源码热更
```

### 把前端嵌入后端二进制

`ipt-web` 通过 `rust-embed` 嵌入 `crates/ipt-web/static/` 目录。**这一步在本地不会自动发生**，需要先构建前端再 copy（CI 在 release 流水线里自动做）：

```bash
cd frontend && pnpm install && pnpm build
rm -rf crates/ipt-web/static && cp -r frontend/dist crates/ipt-web/static
cargo build --release -p ipt-web
```

只调试后端 API 时不需要这一步——直接 `cargo run -p ipt-web` + `pnpm dev`，前端从 5173 通过 Vite proxy 访问 7642。

### 一条命令在 docker 里端到端构建

VPS 自托管或没有 host 工具链的环境用 [docker/Dockerfile.allinone](docker/Dockerfile.allinone)（multi-stage：node:20-alpine 编前端 → rust:1.88-alpine 编后端 → alpine:3.20 runtime）：

```bash
docker build -f docker/Dockerfile.allinone -t iptd:local .
```

跟 [docker/Dockerfile](docker/Dockerfile) 的分工：后者是 **runtime-only**，专给 [release.yml](.github/workflows/release.yml) 的多架构 CI 用——binary 由 host `cargo-zigbuild` 预先交叉编出来放 `docker/bin/` 再 COPY。本地不能直接 `docker build` 它。**两个文件都要保留**，改 `Dockerfile.allinone` 时同步检查 runtime stage 是否还跟 `docker/Dockerfile` 一致（base / 包 / entrypoint / healthcheck / env / volume）。

## 架构（big picture）

### Crate 边界

```
ipt-core       零 IO 的领域层：model / parser / render / diff / guard
ipt-executor   Executor trait + LocalExec（tokio::process 调用 iptables CLI）
ipt-web        axum 路由 + SQLite + tower-sessions + 嵌入前端
```

> `ipt-core` **不允许** 引入任何 IO / OS 依赖——这样它能在 fixture 文件上跑单测，无需 Linux 内核。新增功能时如果牵涉文件/进程/网络，应该落在 `ipt-executor` 或 `ipt-web` 里。

### Executor 抽象（不要绕过）

所有跟内核 netfilter 交互的命令都必须经过 `ipt_executor::Executor`（见 [crates/ipt-executor/src/lib.rs](crates/ipt-executor/src/lib.rs)）。理由：

- 永远 `tokio::process::Command::arg()`，**绝不字符串拼接进 shell**——这是命令注入的硬底线
- 同时兼容 `iptables-legacy` 与 `iptables-nft`：CLI 路径在 Docker `entrypoint.sh` 里探测后软链
- 故意不使用 `rust-iptables`/libxtables 绑定，原因写在 [docs/architecture.md](docs/architecture.md) 末段

### 两步激活（修改 `/apply` 路径前必读）

`safety::TwoPhaseManager`（[crates/ipt-web/src/safety/two_phase.rs](crates/ipt-web/src/safety/two_phase.rs)）保证任何内核变更都能自动回滚：

1. **In-process**：`tokio::sync::oneshot` + `tokio::time::sleep(N)`，N 秒未 confirm 就 restore pre-snapshot
2. **Crash-safe**：`pending.json` 在内核变更前 fsync；启动时 `TwoPhaseManager::recover()` 回滚遗留 token
3. **Wedged-runtime 兜底**：交给 `systemd Restart=on-failure` 或 docker `--restart=unless-stopped` + HEALTHCHECK；进程被外部杀死后启动期 `recover()` 接管

旧版本曾有第三层 `at` 外部定时器，已在 Unreleased 中移除（CHANGELOG.md 有记录）。**不要再加回这一层**，也不要给 `pending` row 引入新的 `attempts/last_error` 状态机。partial-rollback 失败时只写 audit log + 保留 pending row，等下次 abort/recover 重试。

### ICMPv6 guard

`ipt_core::guard::validate_v6` 强制 RFC 4890 必须放行的 ICMPv6 类型（1/2/3/4/128/129/133–136）。一刀切的 `-p ipv6-icmp -j DROP` 会被拦截，需要 `force=true` + audit-logged override 才能绕过。新增 v6 规则相关功能时**必须**调用这个 guard，不要在调用方自己判断 ICMPv6 行为。

### 配置加载顺序

`Config::load`（[crates/ipt-web/src/config.rs](crates/ipt-web/src/config.rs)）优先级从低到高：

1. 内置默认
2. TOML 文件（`IPTD_CONFIG_PATH` 或 `IPTD_CONFIG_DIR/config.toml`）
3. `IPTD_*` 环境变量（嵌套用 `__` 分隔）
4. 短名 env override（`IPTD_LISTEN`/`IPTD_DATA_DIR`/`IPTD_LOG_LEVEL`/`IPTD_LOG_FORMAT`/`IPTD_TWO_STEP_SECONDS`）—— 在 `apply_flat_env_overrides` 里手动映射，新增简写要往这里加

### IP 白名单 + 反代头

`app::ip_whitelist`（[crates/ipt-web/src/app.rs](crates/ipt-web/src/app.rs)）在 session/auth **之前** 跑：空配置 = 通透；非空时除 loopback 访问 `/api/v1/health` 外按 `security.allowed_ips`（IP 或 CIDR）匹配。真实客户端 IP 通过 `security.trusted_proxies` 决定是否信任 `X-Forwarded-For`。新增对外暴露的端点时不需要单独处理——这两层是全局 middleware。

### SQLite & 迁移

- 单一 SQLite 文件：`{data_dir}/data.sqlite`，`tower-sessions` 也共用同一个 pool
- 迁移在 [crates/ipt-web/src/db/migrations/](crates/ipt-web/src/db/migrations/) 里，启动时自动应用（`db::migrate`）
- 新增表/列：增量加 `00NN_xxx.sql`，**不要**改历史迁移
- 仓库不依赖 sqlx-cli/`.sqlx` 离线元数据；用的是运行时 query（不是 `query!` 宏），所以编译期不需要数据库

### 后端保留任务

`spawn_retention_task`（[crates/ipt-web/src/main.rs](crates/ipt-web/src/main.rs)）每天清理 `login_attempts`（保留 7 天）和 `audit_log`（保留 90 天）。

### 前端结构要点

- 入口 [frontend/src/main.tsx](frontend/src/main.tsx)：`ErrorBoundary` → `QueryClientProvider` → `RouterProvider` → `ThemedToaster`，启动前先 `bootstrapTheme()` 防 FOUC
- 路由 [frontend/src/router.tsx](frontend/src/router.tsx) 用 TanStack Router；`_authed` layout 在 `beforeLoad` 调 `/me`，401 重定向到 `/login`
- API 层 [frontend/src/lib/api.ts](frontend/src/lib/api.ts) 是极薄的 fetch 封装：始终 `credentials: 'include'`，错误统一 throw `ApiError(message, status, code)`
- UI 组件 [frontend/src/components/ui/](frontend/src/components/ui/) 是 shadcn 风格 + Radix（Dialog/DropdownMenu/Tooltip 都基于 `@radix-ui`）
- 设计 token 通过 CSS variable 暴露在 [frontend/src/styles/design-tokens.css](frontend/src/styles/design-tokens.css)；Tailwind 类引用 `var(--c-*)`/`var(--shadow-*)`，**不要**直接写颜色字面量
- 路径别名 `@/* → frontend/src/*`（见 [vite.config.ts](frontend/vite.config.ts) 与 [tsconfig.json](frontend/tsconfig.json)）

## 发布流水线（[.github/workflows/release.yml](.github/workflows/release.yml)）

`v*` tag 触发：

1. **binary** job × {amd64, arm64}：装 pnpm + node → `pnpm build` → 复制 `frontend/dist` 到 `crates/ipt-web/static` → `cargo zigbuild --release --target *-musl` → 上传 artifact + 打 tarball release
2. **docker** job × {amd64, arm64}：下载 binary artifact → 用 [docker/Dockerfile](docker/Dockerfile)（runtime-only，binary 由外部传入）`buildx build` → push `ghcr.io/.../iptables-dashboard:{tag}-{arch}`
3. **manifest** job：`docker buildx imagetools create` 合成多架构 manifest，同时打 `latest`

> [docker/Dockerfile](docker/Dockerfile) 是 **runtime-only** ——不在镜像里编译 Rust。要本地 `docker build` 它必须先把 `docker/bin/iptables-dashboard` 准备好，否则会失败。本地直接 `docker build` 走 [docker/Dockerfile.allinone](docker/Dockerfile.allinone)；HMR 开发栈走 [docker-compose.dev.yml](docker/docker-compose.dev.yml)。

## Git & commits

- 仓库 commit 风格见 `git log`：`feat(scope): ...` / `fix(...)`、`refactor(...)`、`chore(...)`，标题 lowercase
- **不要在 commit message 里加 Claude 风格的 annotation / `Co-Authored-By: Claude` 之类的尾注**——保持 human-like
- 默认分支 `main`，PR 也合到 `main`
