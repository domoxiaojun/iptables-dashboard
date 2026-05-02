# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 暗色模式（system 跟随 OS / light / dark 三态切换，AppShell 顶栏图标按钮，启动期 bootstrapTheme 防 FOUC）
- 全局 Toast 通知（sonner）：改密、apply confirm/abort/expired、TOCTOU 冲突等关键路径
- 顶层 ErrorBoundary（不让未捕获异常变白屏；恢复 / 刷新双按钮）
- QueryBoundary 组件 + 默认 Skeleton + Error retry 卡片（已接入 AuditPage 示范）
- AppShell mobile 抽屉（< lg 时变 fixed drawer + overlay，hamburger 触发，路由变化自动关）
- Dialog 升级为 @radix-ui/react-dialog（focus trap / portal / scroll lock / 真正可访问），保持原对外 API + 新 `dismissable` prop
- 新增 Tooltip、DropdownMenu 组件（基于 radix），Button 支持 `asChild`（radix Slot）
- IP 白名单（`security.allowed_ips`，支持精确 IP + CIDR；loopback 访问 `/api/v1/health` 始终放行）

### Changed
- 两步激活简化为两层（in-process oneshot + pending.json + recover）；wedged-runtime 兜底改由 systemd / docker restart 配合启动期 recover 提供
- partial-rollback 失败不再写 `EMERGENCY.md`，改为 audit log 记录错误 + 保留 pending 行，等下次 abort / startup recover 重试

### Removed
- Layer 3 `at` 外部兜底（`schedule_external_abort` / `_internal/apply` 路由 / 容器内 atd / Dockerfile 装 `at`）
- `MAX_ROLLBACK_ATTEMPTS` 状态机与 pending row 的 `attempts/last_error/failed_at` 写入逻辑（DB 列保留为兼容旧迁移）
- `ipt-web` 的 lib + bin 拆分（retention 测试改为同文件 `#[cfg(test)] mod tests`）

## [0.1.0] - 2026-05-02

### Added
- 初始项目骨架（Rust workspace + React 前端）
- IPv4/IPv6 双栈规则查看与编辑
- dry-run 预览 + 两步激活（N 秒未确认自动回滚）
- 多版本规则快照与一键回滚
- 流量计数器 SSE 实时推送
- 防火墙日志 SSE 流（journalctl 优先，dmesg 回退）
- 内置规则模板库
- ICMPv6 守卫
- 两步激活第三层兜底：`at` 调度内部回调端点
- Docker 多架构镜像（amd64/arm64，CI 内 cargo-zigbuild 原生交叉编译）
- 单二进制 musl 静态链接发行
