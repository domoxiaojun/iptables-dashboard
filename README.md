# iptables-dashboard

> IPv4 / IPv6 双栈 iptables 可视化管理面板 — 基于 Rust + React + Docker。

[English](#english) | 中文

---

## 特性

- 🎯 **IPv4 + IPv6 双栈一体管理**：顶栏切换 [IPv4 | IPv6 | 双栈对比]，一眼看出双栈漂移
- 🛡️ **两步激活 + 自动回滚**：N 秒未确认自动恢复旧规则，防止把自己锁出去
- 📸 **多版本快照与一键回滚**：每次 apply 自动留底；可手动打标签
- ⚠️ **ICMPv6 守卫**：识别 RFC 4890 必须放行的 ICMPv6 类型，错误配置直接拦截
- 📊 **实时流量计数器（SSE）**：每条规则的命中包数 / 字节数实时刷新
- 📜 **防火墙日志流（SSE）**：`journalctl -kf` 优先、`dmesg --follow` 回退，按 iptables 关键字过滤
- 📚 **内置规则模板库**：SSH 限速、Web 反代、ICMPv6 基础、Docker 兼容、NAT 转发等
- 🔐 **单用户认证 + 暴力防护**：argon2id + tower-sessions，失败次数指数退避
- 🐳 **单 Docker 镜像（amd64/arm64）**：Alpine 基础，~30 MB；同时提供静态 musl 二进制 + systemd unit
- 🔄 **iptables-legacy / iptables-nft 自动适配**：容器启动时探测宿主机后端
- ️ **键盘快捷键**：`N` 新建、`Delete` 删除选中、`Ctrl+Enter` 应用、`/` 搜索
-  **规则批量操作**：多选 + 批量删除，支持 Shift 连选
- 📥 **规则导入**：粘贴 iptables-save 格式规则行，一键预览并导入
- 🔒 **HTTP 安全头**：CSP、X-Frame-Options、Referrer-Policy 等
- ⏱️ **会话空闲超时**：默认 8 小时无操作自动登出，5 分钟前警告
- 📈 **API 速率限制**：默认 120 次/分钟（仅写操作）
- 💾 **数据库备份**：一键下载 SQLite 完整备份
-  **增强健康检查**：返回 uptime、数据库大小、磁盘剩余空间

## 快速开始

### 方式一：Docker 一键启动（推荐）

```bash
docker run -d --name iptables-dashboard \
  --net=host \
  --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -v ipt-data:/var/lib/iptables-dashboard \
  -v ipt-config:/etc/iptables-dashboard \
  -e IPTD_BOOTSTRAP_USERNAME=admin \
  -e IPTD_BOOTSTRAP_PASSWORD=please-change-me \
  --restart=unless-stopped \
  ghcr.io/domoxiaojun/iptables-dashboard:latest
```

然后浏览器访问 `http://你的主机IP:7642`，用上面设置的用户名密码登录。

> ⚠️ **公网部署一定要前置反向代理（Caddy / Traefik / nginx）做 HTTPS**。
> 默认监听 7642，端口本身不带 TLS。建议把 `IPTD_LISTEN` 设为 `127.0.0.1:7642` 然后由反代终结 TLS。

### 方式二：docker-compose

创建 `docker-compose.yml`：

```yaml
services:
  iptables-dashboard:
    image: ghcr.io/domoxiaojun/iptables-dashboard:latest
    container_name: iptables-dashboard
    network_mode: host
    cap_add:
      - NET_ADMIN
      - NET_RAW
    volumes:
      - ipt-data:/var/lib/iptables-dashboard
      - ipt-config:/etc/iptables-dashboard
    environment:
      IPTD_LISTEN: 127.0.0.1:7642        # bind loopback only; reverse-proxy in front
      RUST_LOG: info
      IPTD_BOOTSTRAP_USERNAME: admin
      IPTD_BOOTSTRAP_PASSWORD: your-secure-password-here
    restart: unless-stopped

volumes:
  ipt-data:
  ipt-config:
```

启动：

```bash
docker compose up -d
```

### 方式三：自托管构建（无需 host 工具链）

仓库自带 multi-stage 的 `docker/Dockerfile.allinone`：先在 builder 阶段编前端 + Rust，再把产物拷进 alpine runtime；本机不需要装 cargo / pnpm / node。

```bash
git clone https://github.com/domoxiaojun/iptables-dashboard && cd iptables-dashboard
docker build -f docker/Dockerfile.allinone -t iptd:local .
docker run -d --name iptd \
  --net=host --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -v ipt-data:/var/lib/iptables-dashboard \
  -v ipt-config:/etc/iptables-dashboard \
  --restart=unless-stopped \
  iptd:local
```

> 跟 `docker/Dockerfile` 的关系：后者是 release.yml CI 用的 **runtime-only** 版本，binary 由 host 端 `cargo-zigbuild` 预先交叉编译并放进 `docker/bin/`，本地不能直接 `docker build`。要做多架构发布走 CI；要在单台 VPS 自托管走 `Dockerfile.allinone`。

## 为什么需要这些 capabilities？

容器内执行 `iptables` / `ip6tables` 实际上是通过 netlink 操作宿主机内核的 netfilter。要做到这一点必须：

1. `--net=host`：与宿主机共享网络命名空间（否则只能看到容器自己的规则）
2. `--cap-add=NET_ADMIN`：操作 netfilter 的根本能力
3. `--cap-add=NET_RAW`：iptables 某些匹配模块需要

**不需要 `--privileged`** — 上述两个 capabilities 是面板的最小可用集。

## 配置

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `IPTD_LISTEN` | `0.0.0.0:7642` | 监听地址 |
| `IPTD_DATA_DIR` | `/var/lib/iptables-dashboard` | 数据目录（SQLite、快照、pending） |
| `IPTD_CONFIG_DIR` | `/etc/iptables-dashboard` | 配置文件目录 |
| `IPTD_BOOTSTRAP_USERNAME` | `admin` | 初始管理员用户名 |
| `IPTD_BOOTSTRAP_PASSWORD` | （随机生成） | 初始密码；留空则自动生成 32 位随机密码并写入 `${IPTD_DATA_DIR}/initial-admin-password.txt` |
| `IPTD_LOG_LEVEL` | `info` | 日志级别：trace, debug, info, warn, error |
| `IPTD_LOG_FORMAT` | `compact` | 日志格式：compact 或 json |
| `IPTD_TWO_STEP_SECONDS` | `30` | 两步激活确认窗口（秒） |
| `IPTD_STATS_PERIOD_SECONDS` | `10` | 流量统计刷新间隔（秒） |

### 配置文件

首次启动时会自动从 `config.example.toml` 复制一份到 `${IPTD_CONFIG_DIR}/config.toml`。支持 TOML 格式，完整配置见 [`docker/config.example.toml`](docker/config.example.toml)。

配置优先级：环境变量 > TOML 文件 > 内置默认值。

### 安全配置

```toml
[security]
two_step_seconds = 30          # 两步激活确认窗口
max_login_attempts = 5         # 登录失败次数限制
lockout_seconds = 900          # 锁定时间（秒）
allowed_ips = []               # IP 白名单（空=全部允许）
trusted_proxies = []           # 可信代理（用于 X-Forwarded-For）
session_idle_seconds = 28800   # 会话空闲超时（秒，默认 8 小时）
api_rate_limit = 120           # API 写操作限流（次/分钟，0=禁用）
```

## 架构

```
┌─────────────────────────────┐
│ Browser  ──── 7642 ──── ▶  │
│                          ┌──┴────────────────────────────┐
│                          │ Rust binary (axum + tokio)     │
│                          │                                │
│                          │  ipt-web ─ HTTP/SSE/SQLite      │
│                          │     │                          │
│                          │  ipt-executor ─ tokio::process  │
│                          │     │     │                    │
│                          │  iptables  ip6tables           │
│                          │     │     │                    │
│                          │  netfilter (kernel netns)      │
│                          └────────────────────────────────┘
└─────────────────────────────┘
```

### Crate 结构

```
crates/
├── ipt-core/         # IO-free 领域层：model / parser / render / diff / guard
├── ipt-executor/     # Executor trait + LocalExec（tokio::process 调用 iptables CLI）
└── ipt-web/          # axum 路由 + SQLite + tower-sessions + 嵌入前端
frontend/             # React + Vite + TS + Tailwind + TanStack Router
docker/               # Multi-stage Dockerfile + entrypoint + compose
deploy/systemd/       # systemd unit for non-container deploys
```

完整设计文档见 [`docs/architecture.md`](docs/architecture.md) 和 [`docs/security.md`](docs/security.md)。

## 开发

### 容器化开发栈（推荐）

```bash
# 启动开发栈（容器内 cargo watch + frontend pnpm dev，源码 HMR）
docker compose -f docker/docker-compose.dev.yml up
```

### 本机开发（Linux）

```bash
# 后端
cargo run -p ipt-web

# 前端（另一个终端）
cd frontend && pnpm install && pnpm dev
```

前端在 `http://localhost:5173`，`/api` 请求自动代理到后端 `127.0.0.1:7642`。

### 测试

```bash
# 后端测试
cargo test --workspace

# 前端测试
cd frontend && pnpm test

# 前端类型检查
cd frontend && pnpm typecheck

# 前端 lint
cd frontend && pnpm lint
```

### 构建前端并嵌入后端

```bash
cd frontend && pnpm install && pnpm build
rm -rf crates/ipt-web/static && cp -r frontend/dist crates/ipt-web/static
cargo build --release -p ipt-web
```

## 部署

### 反向代理配置示例

#### Caddy

```caddy
panel.example.com {
    reverse_proxy 127.0.0.1:7642
}
```

#### Nginx

```nginx
server {
    listen 443 ssl;
    server_name panel.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:7642;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

配置后设置环境变量：

```bash
IPTD_LISTEN=127.0.0.1:7642
IPTD_SECURITY__TRUSTED_PROXIES=127.0.0.1
```

### systemd 部署（非容器）

```bash
# 安装二进制
sudo cp target/release/iptables-dashboard /usr/local/bin/
sudo cp deploy/systemd/iptables-dashboard.service /etc/systemd/system/

# 创建用户
sudo useradd -r -s /usr/sbin/nologin iptables-dashboard

# 创建目录
sudo mkdir -p /var/lib/iptables-dashboard /etc/iptables-dashboard
sudo chown iptables-dashboard:iptables-dashboard /var/lib/iptables-dashboard /etc/iptables-dashboard

# 启用并启动
sudo systemctl enable iptables-dashboard
sudo systemctl start iptables-dashboard
```

## 首次登录

首次启动时，如果没有设置 `IPTD_BOOTSTRAP_PASSWORD`，系统会：

1. 生成一个 32 位随机密码（字母+数字）
2. 打印到 stderr（`docker logs iptables-dashboard` 可以看到）
3. 写入文件 `${IPTD_DATA_DIR}/initial-admin-password.txt`（权限 0600）

登录后**必须立即修改密码**，否则无法执行任何写操作。

## 备份与恢复

### 备份

通过 Web UI：设置页面 → 数据备份 → 下载备份

或通过 API：

```bash
curl -o backup.sqlite http://127.0.0.1:7642/api/v1/backup \
  -H 'Cookie: iptd_session=...'
```

### 恢复

将备份文件复制到数据目录并重启：

```bash
cp backup.sqlite /var/lib/iptables-dashboard/data.sqlite
docker restart iptables-dashboard
```

## 升级

```bash
docker pull ghcr.io/domoxiaojun/iptables-dashboard:latest
docker stop iptables-dashboard && docker rm iptables-dashboard
# 重新运行 docker run 命令（数据卷会保留）
```

## 健康检查

```bash
curl http://127.0.0.1:7642/api/v1/health
```

返回示例：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "pending_applies": 0,
  "backend": "nft",
  "uptime_seconds": 86400,
  "db_size_bytes": 1048576,
  "disk_free_bytes": 10737418240
}
```

## License

[MIT](LICENSE).

第三方组件（shadcn/ui、react-bits 等）的协议见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

---

## English

A modern, dual-stack visualization panel for managing iptables / ip6tables on Linux hosts. Designed as a single Docker image (Alpine, multi-arch) plus optional static-musl binaries with a systemd unit for non-container deployments.

### Highlights

- IPv4 + IPv6 in one UI with explicit dual-stack diff view
- Two-step activation: every change auto-rolls back if not confirmed in N seconds
- ICMPv6 guard prevents you from breaking IPv6 with a blanket DROP
- Snapshots, audit log, brute-force protection, built-in rule templates
- Keyboard shortcuts, batch operations, rule import from iptables-save format
- HTTP security headers, session idle timeout, API rate limiting
- Database backup/restore, enhanced health checks

### Tech Stack

- **Backend**: Rust 1.88 + axum 0.8 + sqlx + tower-sessions
- **Frontend**: React 18 + Vite + TanStack Router + TanStack Query + Tailwind + shadcn-style components
- **Deployment**: Docker (Alpine, multi-arch) or static musl binary + systemd

### Quick Start

```bash
docker run -d --name iptables-dashboard \
  --net=host \
  --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -v ipt-data:/var/lib/iptables-dashboard \
  -v ipt-config:/etc/iptables-dashboard \
  -e IPTD_BOOTSTRAP_USERNAME=admin \
  -e IPTD_BOOTSTRAP_PASSWORD=please-change-me \
  --restart=unless-stopped \
  ghcr.io/domoxiaojun/iptables-dashboard:latest
```

Then visit `http://YOUR_HOST_IP:7642` and login with the credentials above.

> ⚠️ **For public deployments, always put a reverse proxy (Caddy / Traefik / nginx) in front for HTTPS.**
> Set `IPTD_LISTEN=127.0.0.1:7642` and let the proxy terminate TLS.

### Self-hosted Build

```bash
git clone https://github.com/domoxiaojun/iptables-dashboard && cd iptables-dashboard
docker build -f docker/Dockerfile.allinone -t iptd:local .
docker run -d --name iptd \
  --net=host --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -v ipt-data:/var/lib/iptables-dashboard \
  -v ipt-config:/etc/iptables-dashboard \
  --restart=unless-stopped \
  iptd:local
```

### Development

```bash
# Containerized dev stack (recommended)
docker compose -f docker/docker-compose.dev.yml up

# Or locally (Linux)
cargo run -p ipt-web   # backend
cd frontend && pnpm dev   # frontend
```

See `docs/` for deployment and architecture details.
# iptables-dashboard

> IPv4 / IPv6 双栈 iptables 可视化管理面板 — 基于 Rust + React + Docker。

[English](#english) | 中文

---

## 特性

- 🎯 **IPv4 + IPv6 双栈一体管理**：顶栏切换 [IPv4 | IPv6 | 双栈对比]，一眼看出双栈漂移
- 🛡️ **两步激活 + 自动回滚**：N 秒未确认自动恢复旧规则，三层兜底（进程内 oneshot + pending.json 持久化 + atd 外部定时器），防止把自己锁出去
- 📸 **多版本快照与一键回滚**：每次 apply 自动留底；可手动打标签
- ⚠️ **ICMPv6 守卫**：识别 RFC 4890 必须放行的 ICMPv6 类型，错误配置直接拦截
- 📊 **实时流量计数器（SSE）**：每条规则的命中包数 / 字节数实时刷新
- 📜 **防火墙日志流（SSE）**：`journalctl -kf` 优先、`dmesg --follow` 回退，按 iptables 关键字过滤
- 📚 **内置规则模板库**：SSH 限速、Web 反代、ICMPv6 基础、Docker 兼容、NAT 转发等
- 🔐 **单用户认证 + 暴力防护**：argon2 + tower-sessions，失败次数指数退避
- 🐳 **单 Docker 镜像（amd64/arm64）**：Alpine 基础，~30 MB；同时提供静态 musl 二进制 + systemd unit
- 🔄 **iptables-legacy / iptables-nft 自动适配**：容器启动时探测宿主机后端

## 一键启动 (Docker)

```bash
docker run -d --name iptables-dashboard \
  --net=host \
  --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -v ipt-data:/var/lib/iptables-dashboard \
  -v ipt-config:/etc/iptables-dashboard \
  -e IPTD_BOOTSTRAP_USERNAME=admin \
  -e IPTD_BOOTSTRAP_PASSWORD=please-change-me \
  --restart=unless-stopped \
  ghcr.io/domoxiaojun/iptables-dashboard:latest
```

然后浏览器访问 `http://你的主机IP:7642` ，用上面设置的用户名密码登录。

> ⚠️ **公网部署一定要前置反向代理（Caddy / Traefik / nginx）做 HTTPS**。
> 默认监听 7642，端口本身不带 TLS。建议把 `IPTD_LISTEN` 设为 `127.0.0.1:7642` 然后由反代终结 TLS。

## docker-compose 示例

参见 [`docker/docker-compose.yml`](docker/docker-compose.yml)（拉 ghcr.io 上的官方镜像）。

## 自托管：在 VPS 上一条命令构建运行（无需 host 工具链）

仓库自带一个 multi-stage 的 [`docker/Dockerfile.allinone`](docker/Dockerfile.allinone)：先在 builder 阶段编前端 + Rust，再把产物拷进 alpine runtime；本机不需要装 cargo / pnpm / node。

```bash
git clone https://github.com/domoxiaojun/iptables-dashboard && cd iptables-dashboard
docker build -f docker/Dockerfile.allinone -t iptd:local .
docker run -d --name iptd \
  --net=host --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -v ipt-data:/var/lib/iptables-dashboard \
  -v ipt-config:/etc/iptables-dashboard \
  --restart=unless-stopped \
  iptd:local
```

> 跟 [`docker/Dockerfile`](docker/Dockerfile) 的关系：后者是 release.yml CI 用的 **runtime-only** 版本，binary 由 host 端 `cargo-zigbuild` 预先交叉编译并放进 `docker/bin/`，本地不能直接 `docker build`。要做多架构发布走 CI；要在单台 VPS 自托管走 `Dockerfile.allinone`。

## 为什么需要这些 capabilities？

容器内执行 `iptables` / `ip6tables` 实际上是通过 netlink 操作宿主机内核的 netfilter。要做到这一点必须：

1. `--net=host`：与宿主机共享网络命名空间（否则只能看到容器自己的规则）
2. `--cap-add=NET_ADMIN`：操作 netfilter 的根本能力
3. `--cap-add=NET_RAW`：iptables 某些匹配模块需要

**不需要 `--privileged`** — 上述两个 capabilities 是面板的最小可用集。

## 架构

```
┌─────────────────────────────┐
│ Browser  ──── 7642 ──── ▶  │
│                          ┌──┴────────────────────────────┐
│                          │ Rust binary (axum + tokio)     │
│                          │                                │
│                          │  ipt-web ─ HTTP/SSE/SQLite      │
│                          │     │                          │
│                          │  ipt-executor ─ tokio::process  │
│                          │     │     │                    │
│                          │  iptables  ip6tables           │
│                          │     │     │                    │
│                          │  netfilter (kernel netns)      │
│                          └────────────────────────────────┘
└─────────────────────────────┘
```

完整设计文档见 [`docs/architecture.md`](docs/architecture.md)。

## 开发

```bash
# 启动开发栈（容器内 cargo watch + frontend pnpm dev，源码 HMR）
docker compose -f docker/docker-compose.dev.yml up

# 或者本机 (Linux)
cargo run -p ipt-web   # 后端
cd frontend && pnpm dev   # 前端
```

测试：
```bash
cargo test --workspace
cd frontend && pnpm test
```

## License

[MIT](LICENSE).

第三方组件（shadcn/ui、react-bits 等）的协议见 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

---

## English

A modern, dual-stack visualization panel for managing iptables / ip6tables on Linux hosts. Designed as a single Docker image (Alpine, multi-arch) plus optional static-musl binaries with a systemd unit for non-container deployments.

Highlights:
- IPv4 + IPv6 in one UI with explicit dual-stack diff view
- Two-step activation: every change auto-rolls back if not confirmed in N seconds
- ICMPv6 guard prevents you from breaking IPv6 with a blanket DROP
- Snapshots, audit log, brute-force protection, built-in rule templates
- Backend: Rust 1.88 + axum 0.8 + sqlx + tower-sessions
- Frontend: React 18 + Vite + TanStack Router + TanStack Query + Tailwind + shadcn-style components

See `docs/` for deployment and architecture details.
