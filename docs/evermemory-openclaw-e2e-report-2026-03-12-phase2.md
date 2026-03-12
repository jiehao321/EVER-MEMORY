# EverMemory OpenClaw 实测报告（Phase 2）

## 1. 执行目标

- 在真实 OpenClaw 运行态验证 EverMemory 插件可用性。
- 验证工具调用链路：`evermemory_store` / `evermemory_recall` / `evermemory_status`。
- 验证记忆写入是否真实落盘，并明确跨会话召回边界。

执行日期：2026-03-12

---

## 2. 运行环境

- OpenClaw Gateway：运行中（`ws://127.0.0.1:18789`）
- 插件：`evermemory`，状态 `loaded`
- 工具暴露：`evermemory_store`、`evermemory_recall`、`evermemory_status`

---

## 3. 关键实测结果

### 3.1 store 成功（基础链路）

- Run ID: `fe41e96b-31c8-4f6e-a99e-91e1e04fcea0`
- 结果：`Stored memory: 项目总监实测：E2E-1773328891-phase2，验证跨会话召回。importance 0.82`

### 3.2 recall 返回 0（根因定位）

- Run ID: `5eabcfc2-ebfd-45d2-8f46-fedc10350b1b`
- 结果：`命中条数：0`
- DB 校验：`memory_items` 中存在对应记录（写入成功）。
- 根因：默认 scope 隔离策略按 `chatId=sessionKey/sessionId` 生效；使用不同 session 做 recall 时，scope 不同导致无命中，属于设计行为。

### 3.3 共享 scope 跨会话召回成功（修正复测）

- Store Run ID: `c990ff80-8a10-44f1-8f4c-01df50aa9d61`
- Recall Run ID: `16439011-ab5e-4807-95d3-3c11f57bec9e`
- 显式 scope：`{ chatId: "evermemory-e2e-shared-chat", project: "evermemory" }`
- 结果：`Found 1 memory item(s)`
- DB 二次校验：记录存在且 `scope_chat_id=evermemory-e2e-shared-chat`

### 3.4 status 工具可用性

- Run ID: `d34111e0-f3f9-4f9d-8d16-c2aec7bd04c9`
- 结果：`memoryCount=..., active=..., archived=...`（符合当前工具 contract）
- 说明：`ready/dbPath/isDryRun/vectorEnabled/retrievalEnabled` 不在当前 `evermemory_status` 的文本输出 contract 中。

---

## 4. 质量门禁回归

执行命令：`npm run test:unit`

- 结果：通过
- 统计：`53 passed, 0 failed`

---

## 5. 结论（可用性）

- EverMemory 已在真实 OpenClaw 运行态完成可用性验证。
- 关键能力（store/recall/status）可用，且写入落盘可验证。
- “跨会话 recall 失败”在默认配置下是 scope 隔离设计，不是数据丢失或功能故障。

可进入下一阶段（在明确 scope 策略下推进联调与业务实测）。
