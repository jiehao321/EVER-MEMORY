# EverMemory Runtime Validation Report Template

- Report date:
- Operator:
- Branch / commit:
- Environment:
  - OS:
  - Node:
  - npm:
- Validation scope:
  - [ ] preference memory
  - [ ] project continuity
  - [ ] correction → reflection → rule
  - [ ] false rule suppression
  - [ ] scope isolation
  - [ ] channel neutrality（simulated）

---

## 1. Commands Run

```bash
npm run build:test && node --test dist-test/test/runtime-validation.test.js
npm run test:unit
```

如有额外命令，补充在下方：

```bash
# additional commands
```

---

## 2. Execution Summary

- runtime-validation pack result:
- unit test result:
- overall status: PASS / PARTIAL PASS / FAIL

---

## 3. Scenario Results

### 3.1 Preference Memory

- Status: PASS / FAIL
- Hard metrics:
  - [ ] write accepted=true
  - [ ] inferred type=preference
  - [ ] recall returns same-user memory
- Proxy metrics:
  - [ ] recall.total >= 1
- Notes:

### 3.2 Project Continuity

- Status: PASS / FAIL
- Hard metrics:
  - [ ] intent.type=planning
  - [ ] recalled memory contains same project scope
  - [ ] runtime interaction context updated
- Proxy metrics:
  - [ ] recall.total >= 1
- Notes:

### 3.3 Correction → Reflection → Rule

- Status: PASS / FAIL
- Hard metrics:
  - [ ] reflection created
  - [ ] candidate rule contains correction-confirmation guidance
  - [ ] promotion created active behavior rule
  - [ ] rule load returns promoted rule
- Proxy metrics:
  - [ ] debug events emitted (`reflection_created`, `rule_promoted`)
- Notes:

### 3.4 False Rule Suppression

- Status: PASS / FAIL
- Hard metrics:
  - [ ] over-broad candidate rejected
  - [ ] reject reason=`statement_too_vague`
- Proxy metrics:
  - [ ] debug event emitted (`rule_rejected`)
- Notes:

### 3.5 Scope Isolation

- Status: PASS / FAIL
- Hard metrics:
  - [ ] no cross-user leakage
  - [ ] no cross-project leakage
  - [ ] returned scopes match query scopes
- Proxy metrics:
  - [ ] result totals stable across rerun
- Notes:

### 3.6 Channel Neutrality（Simulated）

- Status: PASS / FAIL
- Hard metrics:
  - [ ] same user memory recalled in multiple channels
  - [ ] channel-scoped rule only applied to target channel
- Proxy metrics:
  - [ ] runtime interactions show expected per-channel rule differences
- Notes:

---

## 4. Detailed Test Output

粘贴关键输出或摘要：

```text
# runtime-validation.test.ts output
```

```text
# npm run test:unit summary
```

---

## 5. Regressions / Failures

| Area | Symptom | Severity | Suspected cause | Next action |
|---|---|---|---|---|
| example | recall empty for project replay | high | scope filter regression | inspect retrieval + memory repo |

---

## 6. Hard Metrics vs Proxy Metrics Assessment

### Hard metrics verdict

- Passed:
- Failed:
- Blockers:

### Proxy metrics verdict

- Healthy signals:
- Weak signals:
- Ambiguous signals:

---

## 7. Gaps Not Covered Yet

- [ ] real multi-channel E2E replay
- [ ] transcript fixture pipeline
- [ ] long-horizon cross-session continuity
- [ ] archived/restored memory replay validation
- [ ] human-reviewed rule quality rubric

---

## 8. Final Verdict

- Release recommendation: GO / CONDITIONAL GO / NO-GO
- Confidence:
- Rationale:

---

## 9. Follow-up Checklist

- [ ] fix failing hard metrics
- [ ] add missing fixtures
- [ ] attach report to phase deliverables
- [ ] sync validation matrix if assertions changed
