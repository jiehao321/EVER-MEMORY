# EverMemory 发布质量检查清单

## 1. 目标

在每次发布或关键变更前，使用统一流程完成质量验收，避免“本地可用但线上不可用”，并保证分支纪律与工作树干净。

---

## 2. 分支与工作树门禁（先跑）

1. 切到发布分支（禁止 `main`）：

```bash
git checkout release/<version>
```

2. 分支/工作树守卫：

```bash
npm run repo:guard
```

---

## 3. 必跑命令（发布评测）

1. 正式版评测：

```bash
npm run release:evaluate
```

2. 正式版打包：

```bash
npm run release:pack
```

---

## 4. 验收要求

1. `release:evaluate` 必须 `GO`  
2. `release:pack` 必须成功并产出 `.tgz`  
3. 产出 report 路径并记录到发布文档  
4. 发布后 `git status -sb` 干净  
5. 测试数据清理命令执行通过：

```bash
npm run openclaw:cleanup:test-data
```

---

## 5. 安全门禁基线

- 脚本：`npm run test:openclaw:security`
- 基线文件：`config/openclaw-security-baseline.json`
- 作用：防止 OpenClaw 主机侧安全姿态回退（critical/warn 不可无感上升）

---

## 6. 发布前人工复核

1. `openclaw plugins info evermemory` 显示 `Status: loaded`
2. `openclaw gateway status` 显示 `Runtime: running` 且 `RPC probe: ok`
3. 确认无未提交变更：`git status -sb`
4. 确认发布分支已推送远端：`git push origin release/<version>`
