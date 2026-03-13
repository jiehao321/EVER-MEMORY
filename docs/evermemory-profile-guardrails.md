# EverMemory Profile Guardrails

## 目标

防止 `derived` profile 越权成为事实源、canonical 字段或高风险决策依据。

## 核心边界

### stable
- 仅来自 **explicit / non-inference** memory。
- 结构上带有：
  - `source: "stable_explicit"`
  - `canonical: true`
  - `evidenceRefs`
- 可作为较强事实依据展示。

### derived
- 仅作为 **弱提示（weak hint）**。
- 结构上带有：
  - `source: "derived_inference"`
  - `guardrail: "weak_hint"`
  - `canonical: false`
  - `confidence`
  - `evidenceRefs`
- 不得被视为 explicit fact。
- 不得升级为 canonical。
- 不得覆盖 stable / explicit 字段。

## 具体 guardrails

1. **derived 不覆盖 explicit**
   - 若存在 `stable.explicitPreferences.communication_style`，则不再生成 `derived.communicationStyle`。
   - 若 explicit constraint 已覆盖某类 work pattern，derived work pattern 会被抑制。

2. **derived 永不 canonical**
   - 无论置信度多高，derived 字段固定为：
     - `canonical: false`
     - `guardrail: "weak_hint"`

3. **tool/status 明示边界**
   - `evermemory_profile` 返回 `summary`，区分：
     - `stableCanonicalFields`
     - `derivedHintFields`
     - `derivedGuardrail`
   - `evermemory_status` 返回：
     - `latestProfile.stableCanonicalFields`
     - `latestProfile.derivedWeakHints`
     - `latestProfileRecompute.stable`
     - `latestProfileRecompute.derived`

4. **evidenceRefs 必须可追溯**
   - stable/derived 都携带 `evidenceRefs`。
   - derived 同时必须携带 `confidence`，避免被误读成硬事实。

## 风险提示

- 当前 guardrail 解决的是“表示层 + 投影层 + tool/status 输出层”的边界问题。
- 如果未来有下游消费方直接把 `derived` 当成决策输入，仍需在消费端继续校验 `canonical === false` / `guardrail === "weak_hint"`。
- `behaviorHints` 目前仍是字符串列表，未附加同等级别的显式 provenance 元数据。

## 推荐消费规则

- 高风险动作、身份判断、长期偏好确认：只信 `stable`。
- `derived` 只可用于：
  - 提示候选偏好
  - 排序微调
  - 生成追问
- 不可用于：
  - 覆盖用户明确说明
  - 自动执行高风险动作
  - 写回 canonical profile
