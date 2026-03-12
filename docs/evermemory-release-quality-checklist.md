# EverMemory 发布质量检查清单

## 1. 目标

在每次发布或关键变更前，使用统一流程完成质量验收，避免“本地可用但线上不可用”。

---

## 2. 必跑命令

1. 基础门禁：

```bash
npm run quality:gate
```

2. OpenClaw 真实门禁（含 smoke + security）：

```bash
npm run quality:gate:openclaw
```

---

## 3. 验收要求

1. `quality:gate` 必须 PASS  
2. `quality:gate:openclaw` 必须 PASS  
3. 产出门禁 report 路径并在阶段汇报中记录  
4. 当前变更必须有独立 commit，并推送远端

---

## 4. 安全门禁基线

- 脚本：`npm run test:openclaw:security`
- 基线文件：`config/openclaw-security-baseline.json`
- 作用：防止 OpenClaw 主机侧安全姿态回退（critical/warn 不可无感上升）

---

## 5. 发布前人工复核

1. `openclaw plugins info evermemory` 显示 `Status: loaded`
2. `openclaw gateway status` 显示 `Runtime: running` 且 `RPC probe: ok`
3. 确认无未提交变更：`git status -sb`
4. 确认远端同步：`git push origin main`
