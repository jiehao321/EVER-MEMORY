import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCandidateQuality, type AutoMemoryCandidate } from '../../../src/core/memory/autoCaptureEval.js';
import { AUTO_CAPTURE_MIN_QUALITY } from '../../../src/tuning.js';

function makeCandidate(kind: AutoMemoryCandidate['kind'], content: string): AutoMemoryCandidate {
  return {
    kind,
    memory: {
      content,
      type: 'fact',
      lifecycle: 'episodic',
      source: { kind: 'runtime_project', actor: 'system' },
      scope: { userId: 'u1', project: 'test' },
    },
  };
}

test('decision: high quality when content matches DECISION_PATTERNS', () => {
  const quality = evaluateCandidateQuality(makeCandidate('decision', '最近决策：采用 TypeScript strict mode'));
  assert.equal(quality, 1.0);
});

test('decision: low quality when content is generic outcome', () => {
  const quality = evaluateCandidateQuality(makeCandidate('decision', 'run_success'));
  assert.ok(quality < AUTO_CAPTURE_MIN_QUALITY, `Expected quality ${quality} < ${AUTO_CAPTURE_MIN_QUALITY}`);
});

test('decision: medium quality for ambiguous content', () => {
  const quality = evaluateCandidateQuality(makeCandidate('decision', '完成了数据库优化的第一阶段工作'));
  assert.equal(quality, 0.6);
});

test('explicit_constraint: high quality when matches CONSTRAINT_PATTERNS', () => {
  const quality = evaluateCandidateQuality(makeCandidate('explicit_constraint', '关键约束：不要修改 production 数据库'));
  assert.equal(quality, 1.0);
});

test('explicit_constraint: rejected when no constraint signal', () => {
  const quality = evaluateCandidateQuality(makeCandidate('explicit_constraint', '关键约束：今天天气不错，适合编程'));
  assert.ok(quality < AUTO_CAPTURE_MIN_QUALITY, `Expected quality ${quality} < ${AUTO_CAPTURE_MIN_QUALITY}`);
});

test('user_preference: high quality when matches PREFERENCE_PATTERNS', () => {
  const quality = evaluateCandidateQuality(makeCandidate('user_preference', '用户偏好记录：我喜欢简洁的代码风格'));
  assert.equal(quality, 1.0);
});

test('user_preference: rejected when no preference signal', () => {
  const quality = evaluateCandidateQuality(makeCandidate('user_preference', '用户偏好记录：今天完成了代码审查'));
  assert.ok(quality < AUTO_CAPTURE_MIN_QUALITY, `Expected quality ${quality} < ${AUTO_CAPTURE_MIN_QUALITY}`);
});

test('next_step: high quality when matches NEXT_STEP_PATTERNS', () => {
  const quality = evaluateCandidateQuality(makeCandidate('next_step', '下一步：实现 semantic search 功能'));
  assert.equal(quality, 1.0);
});

test('next_step: high quality for verb-like imperative content', () => {
  const quality = evaluateCandidateQuality(makeCandidate('next_step', '下一步：完成数据库迁移'));
  assert.equal(quality, 1.0);
});

test('next_step: generic narrative sentence is rejected', () => {
  const quality = evaluateCandidateQuality(makeCandidate('next_step', '今天完成了数据库迁移和测试回归'));
  assert.ok(quality < AUTO_CAPTURE_MIN_QUALITY, `Expected quality ${quality} < ${AUTO_CAPTURE_MIN_QUALITY}`);
});

test('project_state: high quality with ≥2 filled parts', () => {
  const quality = evaluateCandidateQuality(makeCandidate(
    'project_state',
    '项目状态更新：项目(apollo)；输入: 实现搜索功能；执行: 添加了 hybrid retrieval；结果: 测试通过',
  ));
  assert.equal(quality, 1.0);
});

test('project_state: low quality with only 1 filled part', () => {
  const quality = evaluateCandidateQuality(makeCandidate(
    'project_state',
    '项目状态更新：项目(apollo)；执行: 执行了操作',
  ));
  assert.ok(quality < AUTO_CAPTURE_MIN_QUALITY, `Expected quality ${quality} < ${AUTO_CAPTURE_MIN_QUALITY}`);
});

test('project_state: zero quality with no filled parts', () => {
  const quality = evaluateCandidateQuality(makeCandidate('project_state', '项目状态更新：项目(apollo)'));
  assert.equal(quality, 0);
});

test('project_summary: high quality with ≥3 filled sections', () => {
  const content = '项目连续性摘要（apollo）；状态：Phase 2 进行中；关键约束：不要修改 API 接口；最近决策：采用 TypeScript；下一步：实现测试';
  const quality = evaluateCandidateQuality(makeCandidate('project_summary', content));
  assert.equal(quality, 1);
});

test('project_summary: zero quality with placeholders', () => {
  const content = '项目连续性摘要（apollo）；状态：待补充；关键约束：待补充；最近决策：待补充；下一步：待确认';
  const quality = evaluateCandidateQuality(makeCandidate('project_summary', content));
  assert.equal(quality, 0);
});

test('too short content returns 0 for any kind', () => {
  const quality = evaluateCandidateQuality(makeCandidate('decision', 'ok'));
  assert.equal(quality, 0);
});
