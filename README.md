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
