# EverMemory 深度审查报告

**审查日期**：2026-03-12
**审查范围**：源代码（72个TS文件）+ 测试套件（19个测试文件）+ 文档包（28个文档）
**总体结论**：架构设计优秀，代码质量良好，但存在系统性错误处理缺口、测试覆盖盲区、文档严重滞后三类问题。

---

## 一、代码质量审查

### 1.1 总体评分：7.5 / 10

| 维度 | 评分 | 说明 |
|------|------|------|
| 架构分层 | 9/10 | 职责分离清晰，无严重越界 |
| 类型安全 | 8/10 | 几乎无 `any`，类型覆盖全面 |
| 错误处理 | 5/10 | JSON.parse 无防御、异常上抛问题系统性存在 |
| 资源管理 | 5/10 | 内存泄漏风险未处理 |
| 数据验证 | 6/10 | 数据库读取后类型断言未校验枚举值 |
| 可观测性 | 7/10 | debug_events 设计好，但无监控指标 |

---

### 1.2 P1 高风险问题（2处）

#### **P1-1：Runtime Context 内存泄漏**
**文件**：`src/runtime/context.ts`

```typescript
const sessionContexts = new Map<string, RuntimeSessionContext>();
// ← 无 TTL，无 LRU，无清理机制
```

**风险**：长期运行服务中，每个历史 session 的上下文永久驻留内存，最终 OOM。
`clearSessionContext()` 函数已定义但在任何地方均未被调用。

**修复方向**：实现基于时间的过期清理，或在 `sessionEnd` hook 中主动调用 `clearSessionContext()`。

---

#### **P1-2：BehaviorService 异常上抛**
**文件**：`src/core/behavior/service.ts`

```typescript
if (!reflection) {
  throw new Error(`Reflection not found: ${input.reflectionId}`);
}
```

**风险**：`promoteFromReflection()` 在 `sessionEnd` hook 中被调用，未捕获的异常会中断整个会话结束流程。
**修复方向**：改为返回 `{ promotedRules: [], rejected: [], error: string }` 结果对象，保持与其他 service 的统一风格。

---

### 1.3 P2 中等风险问题（6处）

#### **P2-1：JSON.parse 无防御（系统性）**
**涉及文件**：`briefingRepo.ts`、`intentRepo.ts`、`experienceRepo.ts`、`reflectionRepo.ts`、`profileRepo.ts`

所有 repo 中的 `JSON.parse()` 均无 `try-catch`。数据库损坏或迁移异常时，整个查询链会抛出未处理异常。
**修复方向**：封装统一的 `safeJsonParse<T>(raw, fallback): T` 工具函数。

---

#### **P2-2：数据库读取后类型断言未校验**
**文件**：`src/storage/memoryRepo.ts`

```typescript
type: row.type as MemoryItem['type'],  // 未校验是否在合法枚举范围内
```

**风险**：数据库被手动修改或迁移引入非法值时，类型断言不报错，脏数据静默流入业务层。
**修复方向**：对 `row.type`、`row.lifecycle`、`row.state` 等枚举字段做显式校验。

---

#### **P2-3：Token Budget 计算失真**
**文件**：`src/core/briefing/service.ts`

```typescript
const actualApproxTokens = JSON.stringify(briefing.sections).length;
// ← 字符数 ≠ Token 数
```

**风险**：中文内容下，1个字符约 1-2 个 token；代码片段下差异更大。`bootTokenBudget: 1200` 的配置实际控制的是字符数，而非 token 数，会导致实际输出超出或远低于预期。
**修复方向**：改用 `Math.ceil(charLength / 4)` 作为近似，或集成轻量 tokenizer。

---

#### **P2-4：SemanticRepo LIKE 特殊字符未转义**
**文件**：`src/storage/semanticRepo.ts`

```typescript
searchTokens.map((token) => `%\"${token}\"%`)
// ← LIKE 中的 % _ \ 未转义
```

**风险**：若 token 中包含 `%` 或 `_`，LIKE 查询语义会被破坏，返回错误结果。

---

#### **P2-5：ReflectionService 缺失 Experience 静默跳过**
**文件**：`src/core/reflection/service.ts`

```typescript
.filter((item): item is ExperienceLog => Boolean(item))
// ← 找不到的 experience_id 被默默丢弃
```

**风险**：反思质量静默降级，无日志、无警告，operator 无法感知。

---

#### **P2-6：Profile userId 后置验证**
**文件**：`src/core/profile/projection.ts`

空字符串检查在数据库查询之后执行，存在不必要的无效查询。

---

### 1.4 P3 建议改进（12处）

| # | 文件 | 问题 |
|---|------|------|
| 1 | `src/core/memory/service.ts` | L39-40 使用 `decision.type!` 非空断言 |
| 2 | `src/retrieval/service.ts` | `memoryNeed='deep'` 时 `pickIntentQuery()` 返回空字符串，导致查询退化 |
| 3 | `src/retrieval/keyword.ts` | 权重系数硬编码（term coverage 0.5、recency 0.3 等），无配置化路径 |
| 4 | `src/core/memory/lifecycle.ts` | CJK bigram 分词中正则对大文本有性能隐患 |
| 5 | `src/core/intent/service.ts` | `fallbackHeuristics=false` 时异常直接上抛，hook 层无保障 |
| 6 | `src/core/reflection/experience.ts` | `repeat-pattern` 检测条件过于宽泛，可能产生误检 |
| 7 | `src/hooks/sessionEnd.ts` | `pickTriggerKind()` 同时满足多条件时优先级不透明 |
| 8 | `src/tools/status.ts` | `archivedMemoryCount` 查询逻辑冗余 |
| 9 | `src/core/profile/projection.ts` | 偏好/风格识别正则硬编码，国际化维护成本高 |
| 10 | `src/runtime/context.ts` | `clearSessionContext()` 定义后从未被调用 |
| 11 | `src/config.ts` | `readObject()` 类型断言 `as Record<string, unknown>` 有改进空间 |
| 12 | `src/storage/migrations.ts` | 无回滚机制（单向迁移是设计选择，但应在文档中明确声明） |

---

## 二、测试套件审查

### 2.1 总体覆盖评估

| 类别 | 覆盖率 | 评价 |
|------|--------|------|
| 正常路径（Happy Path） | ~90% | 优秀 |
| 拒绝/错误路径（Reject/Error Path） | ~40% | 明显不足 |
| 边界条件（Boundary Conditions） | ~30% | 严重不足 |
| 并发/极限场景 | 0% | 完全缺失 |

**优势**：
- 19个测试文件无任何 `test.skip` / `test.todo`，全部活跃
- 测试隔离完善：每个测试有独立临时数据库，cleanup 彻底
- 断言粒度细致，无空洞的 `assert(true)`
- 通过 debug_events 验证内部流程，可观测性好

---

### 2.2 关键测试缺口

#### **缺口-1（P0）：Write Policy 拒绝矩阵不完整**
`memory-service.test.ts` 中仅有 1 个拒绝场景（低价值闲聊），未覆盖：
- `duplicate` 拒绝
- `conflict` 拒绝
- `empty content` 拒绝
- `invalid_type` 拒绝
- `invalid_lifecycle` 拒绝

---

#### **缺口-2（P0）：LLM Fallback 异常场景不完整**
`intent-llm.test.ts` 仅测了 invalid JSON，未覆盖：
- LLM 返回 `null`
- 响应超时（模拟）
- 关键字段缺失（`intentType` 为空）
- 字段类型错误（`confidence` 为字符串）
- 部分 JSON（truncated response）

---

#### **缺口-3（P0）：行为规则冲突解决未测**
`behavior.test.ts` 仅测了 `duplicate_rule` 检测，未覆盖：
- 同类别高低优先级冲突时的升降级
- `appliesTo` 重叠 scope 的处理
- `supersede` 链的正确性
- 孤立规则（evidence 记录被删除后）

---

#### **缺口-4（P1）：Lifecycle Consolidation 事务安全**
`lifecycle-maintenance.test.ts` 测了正常 merge 和 archive，未覆盖：
- merge 过程中部分失败后状态一致性
- `semantic_index` 与 `memory_items` 的同步一致性
- 大批量 consolidation 的幂等性

---

#### **缺口-5（P1）：Profile explicit-over-inferred 保证**
`profile-projection.test.ts` 有基本测试，但未专门验证：
- derived 字段永远不覆盖 explicit 字段的不变量
- 相互矛盾的 memory 写入后 profile 的稳定性

---

#### **缺口-6（P1）：跨 Scope 数据隔离**
无专门测试验证：
- `userId` 不同的数据是否真正隔离
- `chatId` scope 不泄漏到 `project` scope
- `global` recall 与 `user` recall 的优先级

---

#### **缺口-7（P2）：异常抛出验证**
全套测试中无一处使用 `assert.throws()` 或等价断言，无法验证异常处理路径的正确行为。

---

### 2.3 测试质量问题

| 编号 | 问题 | 涉及文件 |
|------|------|---------|
| TQ-1 | 无 `assert.throws()` 使用，异常路径未测 | 全部文件 |
| TQ-2 | LLM parser 只测 1 个失败场景 | `intent-llm.test.ts` |
| TQ-3 | 无 `limit`/`maxRecall` 边界验证 | `retrieval.test.ts` |
| TQ-4 | 无特殊字符/SQL 注入防御测试 | `retrieval.test.ts` |
| TQ-5 | 公共 helper（`createTempDbPath` 等）在各文件重复定义 | 多个文件 |

---

## 三、文档一致性审查

### 3.1 文档-代码一致性：总体良好，局部严重滞后

| 检查��� | 状态 | 说明 |
|--------|------|------|
| 工具列表（README vs src/tools/） | ✅ 100% 一致 | 9 个工具全部对应 |
| 配置参数（README vs constants.ts） | ✅ 100% 一致 | 所有默认值匹配 |
| 数据库表名（README vs migrations.ts） | ✅ 100% 一致 | 10 张表全部对应 |
| npm 命令（README vs package.json） | ✅ 100% 一致 | |
| Phase 状态（roadmap vs 代码） | ❌ 严重滞后 | 见下方 |
| 完成总结（PHASE1_SUMMARY vs 代码） | ❌ 严重滞后 | 见下方 |
| 文档索引（docs-index vs 实际文件） | ⚠️ 不完整 | 2个文档未被索引 |

---

### 3.2 重大文档滞后问题

#### **文档滞后-1（严重）：PHASE1_COMPLETION_SUMMARY.md 描述的是旧状态**

该文档声称：
- "Phase 1 仅包含 4 个工具（store/recall/briefing/status）"
- "Intent analysis、Reflection、Behavior rules **明确不在 Phase 1 范围**"

而实际代码：
- 已有 **9 个工具**（+intent/reflect/rules/profile/consolidate）
- 已完整实现 Phase 2（意图分析）、Phase 3（反思）、Phase 4（行为规则）、Phase 5（检索优化/用户画像）
- Schema 版本已到 `v6`（`PHASE5_PROFILE_SCHEMA_VERSION`）

**影响**：任何人（包括 AI 代理）读到此文档都会对当前���目状态产生严重误判。

---

#### **文档滞后-2（严重）：evermemory-phase-roadmap.md 部分内容已过时**

文档将 Phase 2-5 的部分描述写为"规划中"，而这些阶段均已完成实现。
**master-plan.md** 中已正确标注 Phase 1-5 为 COMPLETE，但 roadmap 文档与之存在内容矛盾。

---

#### **文档滞后-3（中等）：docs-index 未索引 2 个已存在文档**

以下文档存在于 `docs/` 但未被 `evermemory-docs-index.md` 收录：
- `evermemory-quality-audit-report.md`
- `evermemory-quality-remediation-task-list.md`

---

### 3.3 ��档内部矛盾清单

| 编号 | 文档A | 文档B | 矛盾内容 |
|------|-------|-------|---------|
| CONT-1 | `phase-roadmap.md` 部分章节写"待规划" | `master-plan.md` 标注"已完成" | Phase 2-5 状态表述不一致 |
| CONT-2 | `PHASE1_COMPLETION_SUMMARY.md` 说"不做 intent/reflection" | `master-plan.md` 说"Phase 2-4 已完成" | 项目完成状态相互矛盾 |
| CONT-3 | `docs-audit-checklist.md` 的可用性检查项均为 `[ ]` 未勾选 | QA-5 已标注"已完成" | 清单状态未同步 |

---

## 四、综合问题优先级总表

### P1 — 必须修复（影响运行稳定性）

| # | 问题 | 文件 | 类型 |
|---|------|------|------|
| 1 | Runtime Context 内存泄漏（无过期清理） | `src/runtime/context.ts` | 代码缺陷 |
| 2 | BehaviorService 未处理异常上抛 | `src/core/behavior/service.ts` | 代码缺陷 |
| 3 | Write Policy 拒绝矩阵测试严重不足 | `test/memory-service.test.ts` | 测试缺口 |
| 4 | LLM fallback 异常场景未覆盖 | `test/intent-llm.test.ts` | 测试缺口 |
| 5 | PHASE1_COMPLETION_SUMMARY 严重误导 | `PHASE1_COMPLETION_SUMMARY.md` | 文档滞后 |

### P2 — 应尽快修复（影响可靠性/正确性）

| # | 问题 | 文件 | 类型 |
|---|------|------|------|
| 6 | JSON.parse 无防御（系统性，5个 repo） | `src/storage/*.ts` | 代码缺陷 |
| 7 | 数据库读取后枚举值未校验 | `src/storage/memoryRepo.ts` | 代码缺陷 |
| 8 | Token Budget 计算失真（字符≠token） | `src/core/briefing/service.ts` | 代码缺陷 |
| 9 | Semantic LIKE 特殊字符未转义 | `src/storage/semanticRepo.ts` | 代码缺陷 |
| 10 | 行为规则冲突解决测试缺失 | `test/behavior.test.ts` | 测试缺口 |
| 11 | Lifecycle consolidation 事务安全测试缺失 | `test/lifecycle-maintenance.test.ts` | 测试缺口 |
| 12 | phase-roadmap 内容滞后/矛��� | `docs/evermemory-phase-roadmap.md` | 文档矛盾 |
| 13 | docs-index 未收录 2 个已有文档 | `docs/evermemory-docs-index.md` | 文档缺口 |

### P3 — 建议改进（不影响正确性）

| # | 问题 |
|---|------|
| 14 | `clearSessionContext()` 从未被调用 |
| 15 | `memoryNeed='deep'` 时检索查询退化 |
| 16 | 检索权重硬编码，缺乏配置化 |
| 17 | 无 `assert.throws()` 测试异常路径 |
| 18 | 测试辅助函数重复定义，应提取公共 helper |
| 19 | docs-audit-checklist 可用性检查项未勾选 |
| 20 | Profile/experience 正则模式硬编码 |

---

## 五、审查结论

### 代码层面
架构设计高质量，但错误处理存在系统性短板——核心问题是**防御性编程不足**：JSON.parse 无保护、异常上抛未拦截、内存不清理。这些问题在正常使用下不会触发，但在边界情况（数据库数据异常、LLM 调用失败、长时间运行）下会造成静默故障。

### 测试层面
正常流程覆盖良好，但**拒绝路径、异常路径、并发安全几乎未测**。当前测试套件更多证明"功能能跑通"，而非证明"边界情况安全"。

### 文档层面
文档包体系设计优秀，但**完成状态描述严重滞后**：`PHASE1_COMPLETION_SUMMARY.md` 描述的现实与代码实际相差整整 4 个 Phase。这是当前文档体系最大的风险点，会对后续开发者（或 AI 代理）产生严重误导。

---

## 六、修复工作量估算

| 优先级 | 问题数量 | 预计工作量 | 建议时间窗口 |
|--------|---------|-----------|-------------|
| P1 | 5 项 | 8-12 小时 | 立即修复 |
| P2 | 8 项 | 12-16 小时 | 1 周内完成 |
| P3 | 7 项 | 6-10 小时 | 2 周内完成 |
| **总计** | **20 项** | **26-38 小时** | **3 周内全部完成** |

---

## 七、建议修复顺序

### 第一批（P1 代码缺陷，2-3小时）
1. 修复 `src/runtime/context.ts` 内存泄漏
2. 修复 `src/core/behavior/service.ts` 异常处理

### 第二批（P2 系统性代码缺陷，6-8小时）
3. 封装 `safeJsonParse()` 并替换所有 repo 中的 JSON.parse
4. 在 `memoryRepo.ts` 中添加枚举值校验
5. 修复 token budget 计算
6. 修复 semantic LIKE 转义

### 第三批（P1+P2 测试缺口，8-10小时）
7. 补充 write policy 拒绝矩阵测试
8. 补充 LLM fallback 异常场景测试
9. 补充行为规则冲突测试
10. 补充 lifecycle 事务安全测试

### 第四批（P1+P2 文档修复，2-3小时）
11. 重写 `PHASE1_COMPLETION_SUMMARY.md` 或创建 `PHASE5_COMPLETION_SUMMARY.md`
12. 更新 `evermemory-phase-roadmap.md` 状态
13. 更新 `evermemory-docs-index.md` 索引

### 第五批（P3 改进，6-10小时）
14. 其他 P3 建议改进项

---

*审查完成。共发现 P1 问题 5 项、P2 问题 8 项、P3 问题 7 项。建议优先修复 P1 和 P2 问题后再进行 Phase 6 开发。*
