# EverMemory OpenClaw 主机安全硬化报告（2026-03-12）

## 1. 目标

在不影响 EverMemory 插件可用性的前提下，降低 OpenClaw 主机侧高风险暴露。

---

## 2. 执行动作

1. 新增主机硬化脚本：`npm run openclaw:harden`
2. 收紧配置项：
- `channels.telegram.groupPolicy = allowlist`
- `channels.feishu.groupPolicy = allowlist`
- `plugins.allow` 显式白名单
- `tools.fs.workspaceOnly = true`
- `agents.defaults.sandbox.mode` 按环境自适应（有 Docker 用 `all`，无 Docker 用 `off`）
3. 重启网关并复测门禁

---

## 3. 安全审计结果（前后对比）

- 硬化前：`critical=2`, `warn=6`
- 硬化后：`critical=0`, `warn=5`

关键变化：
- 消除了开放群策略 + 高危工具暴露导致的 critical 项
- 降低了 runtime/fs 在开放群场景下的暴露风险

---

## 4. 可用性验证

执行：`npm run quality:gate:openclaw`

结果：
- `doctor/check/build/test:unit` 全通过
- `test:openclaw:smoke` 通过
- `test:openclaw:security` 通过（基线：`critical<=0`, `warn<=5`）

---

## 5. 遗留风险（非阻塞）

当前仍有 warn 项：
- `gateway.trusted_proxies_missing`
- `channels.feishu.doc_owner_open_id`
- `security.trust_model.multi_user_heuristic`
- `plugins.tools_reachable_permissive_policy`
- `plugins.installs_unpinned_npm_specs`

这些项不再是 blocking critical，但建议后续按运维策略逐项收口。
