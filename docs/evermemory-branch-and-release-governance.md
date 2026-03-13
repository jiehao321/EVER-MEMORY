# EverMemory 分支与发布治理（0.0.1）

## 1. 目标

建立可执行、可审计的发布纪律：

1. 禁止在 `main` 直接开发
2. 发布流程全程可复现
3. 发布前后工作树保持干净
4. 测试数据不滞留在 OpenClaw 实例中

---

## 2. 分支规则

- 日常开发分支：`feature/*`、`fix/*`
- 发布分支：`release/*`
- 禁止在 `main` 直接改动

统一使用守卫脚本：

```bash
npm run repo:guard
```

守卫默认要求：

- 非 `main` 分支
- 工作树无未提交改动

---

## 3. 提交与合并规则

1. 提交按单一主题拆分，禁止“混合大提交”。
2. 每个提交至少通过：`npm run check && npm run test:unit`。
3. 发布分支完成后，通过 PR 合并到 `main`（禁止直接 push 覆盖）。

---

## 4. 发布流程（标准）

1. 切换到 `release/x.y.z` 分支
2. 版本号一致性检查（`package.json`、`plugin.json`、`openclaw.plugin.json`）
3. 执行发布评测：

```bash
npm run release:evaluate
```

4. 评测通过后打包：

```bash
npm run release:pack
```

5. 记录证据路径（report + package）
6. 合并回 `main` 并打 tag

---

## 5. 测试数据清理规则

任何真实测试或发布评测完成后，必须清理测试数据：

```bash
npm run openclaw:cleanup:test-data
```

发布评测脚本已内置 finalize 清理步骤；若中途异常，仍要求人工补跑一次清理命令。

---

## 6. 0.0.1 出版标准

必须同时满足：

1. `npm run release:0.0.1:evaluate` 结果为 `GO`
2. `npm run release:0.0.1:pack` 成功并产出 `.tgz`
3. `npm run repo:guard` 在发布提交后通过
4. 发布记录文档 `evermemory-release-0.0.1.md` 已更新为最终结果
