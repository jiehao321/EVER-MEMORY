# EverMemory 模块责任图

## 1. 文档目标

本文档用于说明各目录/模块的职责边界，防止后续实现时职责混乱。

---

## 2. 模块责任

### `src/storage/`
职责：
- SQLite/db/migrations/repositories
- 只处理持久化和 row/object mapping

不负责：
- 业务判断
- runtime orchestration

### `src/core/memory/`
职责：
- memory write policy
- normalization
- lifecycle decisions
- conflict/promotion/summarization baseline

### `src/core/intent/`
职责：
- intent analysis
- heuristics
- LLM enrich
- parser/fallback

### `src/core/reflection/`
职责：
- experience logging
- reflection generation
- candidate rules

### `src/core/behavior/`
职责：
- behavior rules
- promotion gating
- applicability/ranking

### `src/core/profile/`
职责：
- projected profile synthesis
- stable/derived separation

### `src/core/briefing/`
职责：
- boot briefing generation
- continuity composition

### `src/retrieval/`
职责：
- structured/keyword/semantic/hybrid recall
- ranking

### `src/hooks/`
职责：
- OpenClaw integration points
- should stay thin

### `src/tools/`
职责：
- explicit tool surface
- JSON-safe request/response contracts

### `src/runtime/`
职责：
- session-scoped runtime state/helpers
- no long-term business truth

### `src/llm/`
职责：
- structured LLM invocation helpers
- parser/validation support

---

## 3. 总规则

一条铁规则：

**Hook 不写重逻辑，Tool 不重写业务，Repo 不做策略判断，Core 才是业务逻辑中心。**
