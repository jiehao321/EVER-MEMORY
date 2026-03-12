# EverMemory 质量整改任务清单

## 1. 文档目标

本文档把《EverMemory 质量审计报告》中的问题，进一步拆成可执行、可派发、可验收的整改任务清单。

目标是让后续实现代理（如 Codex）可以直接按 QA batch 执行，而不是停留在“知道有问题”。

---

## 2. 使用方式

推荐使用顺序：

1. 先阅读：
   - `evermemory-quality-audit-report.md`
   - `evermemory-master-plan.md`
   - `evermemory-task-planning-principles.md`
   - `evermemory-acceptance-handbook.md`

2. 然后按本文档顺序执行 QA batch。

3. 每完成一个 batch：
   - 运行验证命令
   - 产出阶段汇报
   - 审核通过后再进入下一批

---

## 3. 整改总原则

本轮质量整改不是做新功能，必须遵守：

1. **不扩新 phase 能力**
2. **优先收口工程问题**
3. **不做无意义大重构**
4. **每一批都要可验证**
5. **避免“修质量”顺手改业务范围**

---

## 4. QA 总体拆分

建议拆成 5 个 QA batch：

- **QA-1** — 版本管理与仓库基线整理
- **QA-2** — 验证链路重构（doctor / test / validate 解耦）
- **QA-3** — 构建产物与目录整洁度收口
- **QA-4** — 类型系统按领域拆分
- **QA-5** — 文档-实现一致性巡检与最终收口

### 当前执行状态（2026-03-11）

| QA Batch | 状态 | 结果摘要 |
|---|---:|---|
| QA-1 | 已完成 | 新增 `.gitignore`，明确忽略依赖、构建产物、运行时数据 |
| QA-2 | 已完成 | 新增 `test:unit` 与 `validate`，`doctor` 与单测链路解耦 |
| QA-3 | 已完成 | `dist`（运行时）与 `dist-test`（测试）分离，构建边界更清晰 |
| QA-4 | 已完成 | `src/types.ts` 拆分为 `src/types/*.ts`，保留兼容导出入口 |
| QA-5 | 已完成（关键文档） | README 与关键执行/规划文档完成一致性更新；其余文档持续随 phase 收口 |

这样拆的好处：
- 每批边界清楚
- 风险低
- 容易回退
- 不会一口气改到看不清问题

---

# QA-1 — 版本管理与仓库基线整理

## Objective
建立清晰的项目级版本管理基线，让后续 phase / batch 开发具备稳定提交历史。

## Why now
没有健康的 git 基线，后续所有修复和 phase 推进都会越来越难管理。

## Scope in
- 检查当前项目 repo 状态
- 明确项目内应提交与不应提交的内容
- 补基础 `.gitignore`（如果缺）
- 形成项目级干净工作树基线
- 给出建议提交分组

## Scope out
- 不改业务逻辑
- 不做功能新增

## Files to add/change
可能涉及：
- `.gitignore`
- `README.md`（如需说明开发约定）
- 其他少量仓库元信息

## Validation
- `git status` 应更清楚
- 明确哪些文件应纳入版本管理
- 不应再出现 build 产物/依赖目录混入主变更集

## Definition of Done
- 项目级 git 管理边界清楚
- `.gitignore` 合理
- 后续能按 batch 稳定提交

## Risks
- 一不小心忽略过多文件
- 把应保留的工程文件也排除了

---

# QA-2 — 验证链路重构（doctor / test / validate 解耦）

## Objective
把当前过度耦合的验证命令拆开，让“环境体检”和“代码测试”不再强绑定。

## Why now
当前 `npm test` 被 `doctor` 前置拦截，导致代码测试结果与环境问题混在一起。

## Scope in
- 调整 `package.json` scripts
- 保留 `doctor`
- 新增/整理：
  - `test:unit` 或同类命令
  - `validate`
- 明确 README 中的命令说明

## Scope out
- 不解决所有环境问题
- 不改业务逻辑

## Files to add/change
- `package.json`
- `README.md`
- 如必要：`scripts/doctor.mjs`

## Validation
至少验证：
- `npm run check`
- `npm run build`
- `npm run doctor`
- `npm run test:unit`（或等价命令）
- `npm run validate`

## Definition of Done
- 单元测试可独立运行
- doctor 仍保留
- validate 作为完整体检入口存在
- README 中的命令说明与实际一致

## Risks
- 命令拆完后文档没跟上
- validate/test 的责任边界不清楚

---

# QA-3 — 构建产物与目录整洁度收口

## Objective
清理源码、构建产物、测试编译产物之间的边界，降低项目目录噪音。

## Why now
当前 dist/source/test build 边界不够清晰，会影响后续搜索、维护和代理执行质量。

## Scope in
- 统一 dist 输出策略
- 明确 test build 输出位置/策略
- 收紧 `.gitignore`
- 减少 source/dist 结构混淆

## Scope out
- 不做业务逻辑重构
- 不改 phase 功能范围

## Files to add/change
可能涉及：
- `tsconfig.json`
- `package.json`
- `.gitignore`
- `README.md`

## Validation
- `npm run build` 后输出结构清楚
- 搜索源码时不容易误碰 dist
- git 状态不被 build 产物污染

## Definition of Done
- build artifact 边界清晰
- 目录整洁度明显改善
- 工具/代理更容易区分 source 与 output

## Risks
- 误伤当前测试链路
- 输出路径调整后 import/脚本失配

---

# QA-4 — 类型系统按领域拆分

## Objective
把当前不断膨胀的 `src/types.ts` 按领域拆分，降低后续扩展成本。

## Why now
如果继续把 intent / reflection / behavior / profile / tools 全堆在一个 types 文件里，后面会越来越难维护。

## Scope in
- 领域拆分类型文件
- 调整 import/export
- 保持外部 contract 不乱变

## Scope out
- 不顺手改业务语义
- 不借机做大规模重构

## Files to add/change
建议方向：
- `src/types/memory.ts`
- `src/types/intent.ts`
- `src/types/reflection.ts`
- `src/types/runtime.ts`
- `src/types/tools.ts`
- `src/types/config.ts`
- `src/types/index.ts`
- 调整现有 import 引用

## Validation
- `npm run check`
- `npm run build`
- `npm run test:unit` / `npm run test`

## Definition of Done
- 领域类型拆分完成
- import/export 清楚
- 外部使用方式不混乱

## Risks
- 类型循环依赖
- import 改动面较大

---

# QA-5 — 文档-实现一致性巡检与最终收口

## Objective
对 README、docs index、final summary、命令说明、当前 phase 状态做统一核对，确保文档与代码状态一致。

## Why now
在经历多轮快速推进后，文档容易局部不一致，需要最后统一收口。

## Scope in
- README consistency pass
- docs index consistency pass
- phase status wording check
- script/command docs update
- 审计清单逐项核对

## Scope out
- 不再新增大文档体系
- 不扩新功能

## Files to add/change
可能涉及：
- `README.md`
- `docs/evermemory-docs-index.md`
- `docs/evermemory-final-planning-summary.md`
- `docs/evermemory-docs-audit-checklist.md`
- `docs/evermemory-quality-audit-report.md`

## Validation
- 文档路径真实存在
- phase 描述与代码状态一致
- commands 与 package.json 一致
- 审计清单可打勾完成

## Definition of Done
- 文档-实现一致性达到可交付状态
- 后续给 Codex 使用时不容易误导

## Risks
- 只改一半，导致局部仍冲突
- phase 状态表述模糊

---

## 5. 推荐执行顺序

建议严格按以下顺序：

1. **QA-1**：先把仓库边界与版本管理理清
2. **QA-2**：再拆验证链路
3. **QA-3**：再收口目录与产物
4. **QA-4**：再做类型拆分
5. **QA-5**：最后做文档一致性总收口

### 为什么不能乱序
- 没 git 基线，后面不好管理改动
- 没验证链路，后面不方便确认整改质量
- 没目录收口，类型拆分时会继续受噪音干扰
- 文档一致性应放在最后，因为前面整改会改变现状

---

## 6. 每个 QA batch 的统一汇报要求

后续每批整改都要求 Codex 汇报：

1. 本阶段整改了什么
2. 新增/修改文件
3. 为什么这样改
4. 验证结果
5. 剩余风险
6. 下一步建议

并执行：
- `npm run check`
- `npm run build`
- 对应测试命令

---

## 7. 最终整改完成标准

当以下条件成立时，可认为本轮质量整改完成：

- git / 版本管理边界清楚
- 验证链路清楚可用
- 构建产物与源码边界清楚
- 类型系统拆分合理
- README / docs / phase 状态一致
- 后续继续给 Codex 推进时，项目工程质量不会明显拖后腿

---

## 8. 结论

这份整改清单的核心目标，不是“再做一轮漂亮文档”，
而是：

**把 EverMemory 从“设计强、基础不错，但工程收口不足”的状态，推进到“后续可以稳定持续开发”的状态。**
