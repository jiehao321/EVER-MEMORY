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

- `release evaluate`: `GO`（2026-03-13）
- `release pack`: `PASS`（2026-03-13）
- `git worktree clean`: `PASS`
- `openclaw plugins info evermemory`: `Version: 0.0.1`

---

## 5. 产物与证据（本次执行后填写）

- evaluate report: `/tmp/evermemory-release-evaluate-v0.0.1-2026-03-13T10-51-54.085Z.json`
- pack report: `/tmp/evermemory-release-pack-v0.0.1-2026-03-13T10-52-03.201Z.json`
- package file: `/tmp/evermemory-release/evermemory-0.0.1.tgz`
- recall benchmark: `/tmp/evermemory-recall-benchmark-2026-03-13T10-51-53.706Z.json`（19/20，95%）
- soak report: `/tmp/evermemory-openclaw-soak-2026-03-13T10-51-48.105Z.json`（7/7）
- quality gate openclaw: `/tmp/evermemory-quality-gate-2026-03-13T10-48-39.782Z.json`

---

## 6. 发布后核对

1. `npm run repo:guard` 通过
2. `npm run openclaw:cleanup:test-data` 再次执行并通过（`totalDeleted=0`）
3. 无遗留未提交改动（`git status --short` 为空）
