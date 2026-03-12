# EverMemory Phase 7 详细技术方案

## 1. 文档定位

Phase 7 聚焦发布质量与运行硬化，不扩展新的 memory 业务能力。

目标是把已经完成的 Phase 1~6 能力，升级为可持续、可审计、可发布的工程体系。

---

## 2. 核心目标

1. 一键执行发布前质量门禁
2. 将 OpenClaw 真实运行态 smoke test 纳入标准验收路径
3. 固化 CI 与本地门禁职责边界
4. 收口发布流程与关键风险项

---

## 3. 范围定义

## Scope In
- 质量门禁脚本化（doctor/check/build/test/smoke）
- 门禁报告落盘（可追溯）
- CI workflow 收口与文档一致性
- OpenClaw 运行态验证流程标准化

## Scope Out
- 不新增 memory 核心业务能力
- 不改动 phase 1~6 的功能语义
- 不做 UI 产品化工作

---

## 4. 技术策略

1. 本地门禁与远端门禁分层
- 本地：`quality:gate` / `quality:gate:openclaw`
- CI：`doctor + check + build + test:unit`

2. OpenClaw 门禁独立
- 使用 `test:openclaw:smoke` 验证插件加载、tool 调用、DB 证据
- 失败即非零退出

3. 证据优先
- 每次门禁执行生成报告路径并输出 run 证据
- 验收报告必须引用门禁结果

---

## 5. 风险与控制

风险 1：本地与 CI 结果不一致  
控制：明确 CI 不跑 OpenClaw smoke，本地发布前必须跑 `quality:gate:openclaw`

风险 2：OpenClaw 环境波动影响验收稳定性  
控制：smoke test 使用固定最小链路（store/recall/DB）并且 scope 显式化

风险 3：流程有命令但无人执行  
控制：将门禁命令写入 README/验收报告，发布前作为硬要求

---

## 6. 完成定义

Phase 7 完成时应满足：
- `quality:gate` 与 `quality:gate:openclaw` 可用
- CI workflow 持续执行基本门禁
- 文档与实际命令一致
- 每次推进有可追溯提交记录
