# EverMemory Phase 3 任务拆分

## 1. Phase 3 总体拆分

建议拆成 5 个 batch：

- **3A** — experience/reflection schema + storage foundation
- **3B** — experience logging service
- **3C** — reflection service + candidate lesson/rule generation
- **3D** — session_end minimal integration
- **3E** — reflect tool + docs/tests/quality 收口

---

# Batch 3A — experience/reflection schema + storage foundation

## Objective
新增 ExperienceLog / ReflectionRecord 类型、migration、repo。

## Scope in
- schema
- migrations
- experienceRepo
- reflectionRepo

## Scope out
- 不做 service logic
- 不做 tool
- 不做 hook integration

## Files to add
- `src/storage/experienceRepo.ts`
- `src/storage/reflectionRepo.ts`

## Files to change
- `src/types.ts`
- `src/storage/migrations.ts`
- `src/index.ts`

## Definition of Done
- migration 可重复执行
- repo insert/find 基础可用

---

# Batch 3B — experience logging service

## Objective
实现 experience logging service，用于把 interaction outcome 变成结构化 experience logs。

## Scope in
- experience service
- minimal signal mapping
- debug events

## Scope out
- 不做 reflection generation

## Files to add
- `src/core/reflection/experience.ts`

## Files to change
- `src/index.ts`
- `src/types.ts`

## Definition of Done
- 可从输入生成合法 ExperienceLog
- 可持久化
- 可记录 `experience_logged`

---

# Batch 3C — reflection service + candidate lesson/rule generation

## Objective
实现 ReflectionService，生成 ReflectionRecord 和 candidate rules。

## Scope in
- reflection service
- candidate rule generation
- threshold gating
- debug events

## Scope out
- 不做 active rule promotion

## Files to add
- `src/core/reflection/service.ts`
- `src/core/reflection/candidateRules.ts`

## Files to change
- `src/index.ts`
- `src/types.ts`

## Definition of Done
- manual review 可生成 reflection
- candidate rule 可输出但不激活

---

# Batch 3D — session_end minimal integration

## Objective
把 experience/reflection 最小接进 session_end。

## Scope in
- session_end hook
- experience write
- thresholded reflection
- runtime-safe integration

## Scope out
- 不做 profile/rules/archive

## Files to add
- `src/hooks/sessionEnd.ts`

## Files to change
- `src/index.ts`

## Definition of Done
- session_end 可写 experience
- 满足条件可生成 reflection

---

# Batch 3E — reflect tool + docs/tests/quality 收口

## Objective
补 reflect tool、README/docs、tests，形成 Phase 3 最小可交付。

## Files to add
- `src/tools/reflect.ts`
- `test/experience.test.ts`
- `test/reflection.test.ts`
- `test/session-end.test.ts`

## Files to change
- `src/tools/index.ts`
- `README.md`
- `src/index.ts`

## Definition of Done
- evermemory_reflect tool 可用
- docs/test 收口完成
- Phase 3 可正式总结

---

## 2. 执行顺序

必须按：
- 3A
- 3B
- 3C
- 3D
- 3E

不要跳步。

---

## 3. 总体验收标准

Phase 3 结束时，应具备：
- experience logs
- reflection records
- candidate rules
- session_end minimal reflection path
- reflect tool
- docs/tests/quality 收口
