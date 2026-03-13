# EverMemory 正式版发布记录 0.0.1

## 1. 发布目标

将当前能力收敛为一个可交付、可回滚、可审计的正式版包 `0.0.1`。

---

## 2. 版本边界

- `package.json`: `0.0.1`
- `plugin.json`: `0.0.1`
- `openclaw.plugin.json`: `0.0.1`

---

## 3. 发布执行命令

```bash
npm run release:0.0.1:evaluate
npm run release:0.0.1:pack
```

说明：

- 评测脚本包含分支/工作树守卫、类型检查、单测、Agent Teams release、OpenClaw soak、recall benchmark。
- 评测结束后强制执行 `openclaw:cleanup:test-data`。

---

## 4. 发布门禁结果（本次执行后填写）

- `release evaluate`: 待执行
- `release pack`: 待执行
- `git worktree clean`: 待执行

---

## 5. 产物与证据（本次执行后填写）

- evaluate report: 待补充
- pack report: 待补充
- package file: 待补充

---

## 6. 发布后核对

1. `npm run repo:guard` 通过
2. `npm run openclaw:cleanup:test-data` 再次执行并通过
3. 无遗留未提交改动（`git status --short` 为空）
