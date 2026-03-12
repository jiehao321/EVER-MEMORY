# EverMemory 风险与依赖矩阵

## 1. 文档目标

本文档用于集中管理项目级风险、阶段依赖、关键阻塞点和控制策略。

---

## 2. 阶段依赖矩阵

| 阶段 | 直接依赖 | 说明 |
|---|---|---|
| Phase 1 | 无 | foundation |
| Phase 2 | Phase 1 | understanding 建立在 memory substrate 之上 |
| Phase 3 | Phase 1, Phase 2 | reflection 需要 memory + understanding |
| Phase 4 | Phase 2, Phase 3 | behavior evolution 需要 intent + reflection evidence |
| Phase 5 | Phase 1~4 | retrieval/lifecycle 优化依赖前面结构稳定 |
| Phase 6 | 全部前置阶段 | extended ops 建立在主系统稳定之后 |

---

## 3. 核心风险矩阵

| 风险 | 所在阶段 | 严重性 | 控制策略 |
|---|---|---:|---|
| memory pollution | 1~5 | 高 | deterministic baseline、episodic-first、promotion gating |
| retrieval noise | 2~5 | 高 | scope strict、targeted recall、top-k cap |
| latency blow-up | 2~5 | 高 | fast/slow path separation |
| bad structured LLM outputs | 2~4 | 中 | parser/schema validation/fallback |
| reflection hallucination | 3 | 高 | evidence-backed、candidate-only |
| behavior drift | 4 | 高 | promotion thresholds、supersede/deprecate、debug visibility |
| architecture overgrowth | 全阶段 | 高 | scope freeze、small batches |
| test debt | 全阶段 | 中 | each batch adds minimal tests |

---

## 4. 关键阻塞条件

以下情况出现时，应暂停当前 phase：

1. 关键 contract 不稳定
2. check/build/test 连续失败
3. critical path 延迟明显恶化
4. debug visibility 不足，无法解释系统行为
5. candidate outputs 已开始影响 runtime，但无 promotion policy 保护

---

## 5. 推荐控制规则

1. 每 phase 先 scope freeze
2. 每 batch 必带 validation
3. 每新增核心对象，先 schema/repo，再 service/integration
4. 所有长期行为变化，必须 evidence-backed
5. 所有 LLM 输出必须可 fallback
