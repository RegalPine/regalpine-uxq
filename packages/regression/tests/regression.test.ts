import { describe, expect, it } from 'vitest';
import type { Timestamp, Clock } from '@uxq/core';
import type {
  EvaluationRun,
  EvaluationPlan,
  RunContext,
  EvaluationResult,
  MetricResult,
  RuleResult,
  ExecutionProfile,
} from '@uxq/contracts';
import { defaultProfile } from '@uxq/contracts';
import { createInMemoryBaselineStore, checkComparability, compareRuns } from '@uxq/regression';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;
const clock: Clock = { now: () => fixedTime, monotonic: () => 0 };

function makeRun(overrides?: Partial<EvaluationRun>): EvaluationRun {
  return {
    id: 'run-1',
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    planId: 'plan-1',
    planDigest: 'abc123',
    definitionId: 'def-1',
    status: 'COMPLETED',
    revision: 1,
    contextId: 'ctx-1',
    executionCommitted: true,
    endedAt: fixedTime,
    endReason: '完成',
    startedAt: fixedTime,
    limitations: [],
    ...overrides,
  };
}

function makePlan(overrides?: Partial<EvaluationPlan>): EvaluationPlan {
  return {
    id: 'plan-1',
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    definitionId: 'def-1',
    definitionVersion: '1.0.0',
    definitionDigest: 'def-digest',
    compilerVersion: '0.1.0',
    steps: [
      {
        stepId: 'step-1',
        kind: 'SCORING',
        dependsOn: [],
        required: true,
        inputRefs: [],
        outputContracts: ['ScoreResult'],
        requiredCapabilities: [],
      },
    ],
    profile: defaultProfile(),
    metricVersions: [{ id: 'm1', version: '1.0.0' }],
    ruleVersions: [{ id: 'r1', version: '1.0.0' }],
    policyVersion: { id: 'p1', version: '1.0.0' },
    requiredCapabilities: [],
    planDigest: 'plan-digest',
    ...overrides,
  };
}

function makeContext(overrides?: Partial<RunContext>): RunContext {
  return {
    id: 'ctx-1',
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    runId: 'run-1',
    engineVersion: '0.1.0',
    nodeVersion: 'v24.0.0',
    platform: 'darwin',
    profile: defaultProfile(),
    configSources: {},
    environmentFingerprint: 'fp',
    sampleDescription: 'test',
    limitations: [],
    ...overrides,
  };
}

function makeEvaluation(overrides?: Partial<EvaluationResult>): EvaluationResult {
  return {
    id: 'eval-1',
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    runId: 'run-1',
    policyId: 'p1',
    policyVersion: '1.0.0',
    policyDigest: 'pd',
    evaluationStatus: 'COMPLETE',
    overallOutcome: 'PASS',
    overallScore: 85,
    coverage: { planned: 10, applicable: 10, measured: 10, scored: 10, ratio: 1 },
    metricResultIds: [],
    ruleResultIds: [],
    scoreResultIds: [],
    dimensionResultIds: [],
    findingIds: [],
    evidenceIds: [],
    constraints: [],
    limitations: [],
    ...overrides,
  };
}

function makeMetric(id: string, value: number): MetricResult {
  return {
    id: `mr-${id}`,
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    runId: 'run-1',
    metricId: id,
    metricVersion: '1.0.0',
    implementationVersion: '1.0.0',
    dimensionId: 'D01',
    measuredAt: fixedTime,
    evidenceIds: [],
    observationIds: [],
    excludedSampleIds: [],
    sampleCount: 1,
    inputDigest: 'd',
    limitations: [],
    status: 'MEASURED',
    value,
  };
}

function makeRule(id: string, outcome: 'PASS' | 'FAIL'): RuleResult {
  return {
    id: `rr-${id}`,
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    runId: 'run-1',
    ruleId: id,
    ruleVersion: '1.0.0',
    configurationDigest: 'cd',
    inputMetricResultIds: [],
    evidenceIds: [],
    evaluatedAt: fixedTime,
    reason: 'test',
    executionStatus: 'COMPLETED',
    outcome,
  };
}

describe('基线管理', () => {
  it('创建基线', () => {
    const store = createInMemoryBaselineStore(clock);
    const baseline = store.createBaseline(
      'v1',
      'run-1',
      makeRun(),
      makePlan(),
      makeContext(),
      makeEvaluation(),
    );
    expect(baseline.name).toBe('v1');
    expect(baseline.runId).toBe('run-1');
    expect(baseline.planDigest).toBe('plan-digest');
  });

  it('重复创建同名基线拒绝', () => {
    const store = createInMemoryBaselineStore(clock);
    store.createBaseline('v1', 'run-1', makeRun(), makePlan(), makeContext(), makeEvaluation());
    expect(() =>
      store.createBaseline(
        'v1',
        'run-2',
        makeRun({ id: 'run-2' }),
        makePlan(),
        makeContext(),
        makeEvaluation(),
      ),
    ).toThrow('基线已存在');
  });

  it('更新基线保留历史版本', () => {
    const store = createInMemoryBaselineStore(clock);
    store.createBaseline('v1', 'run-1', makeRun(), makePlan(), makeContext(), makeEvaluation());
    const updated = store.updateBaseline(
      'v1',
      'run-2',
      '修复了性能问题',
      makeRun({ id: 'run-2' }),
      makePlan(),
      makeContext(),
      makeEvaluation({ id: 'eval-2', overallScore: 90 }),
    );
    expect(updated.runId).toBe('run-2');
    expect(updated.updateReason).toBe('修复了性能问题');
    expect(updated.previousVersion?.runId).toBe('run-1');
  });

  it('更新不存在基线拒绝', () => {
    const store = createInMemoryBaselineStore(clock);
    expect(() =>
      store.updateBaseline(
        'nope',
        'run-1',
        'reason',
        makeRun(),
        makePlan(),
        makeContext(),
        makeEvaluation(),
      ),
    ).toThrow('基线不存在');
  });

  it('更新基线无原因拒绝', () => {
    const store = createInMemoryBaselineStore(clock);
    store.createBaseline('v1', 'run-1', makeRun(), makePlan(), makeContext(), makeEvaluation());
    expect(() =>
      store.updateBaseline(
        'v1',
        'run-2',
        '',
        makeRun(),
        makePlan(),
        makeContext(),
        makeEvaluation(),
      ),
    ).toThrow('更新基线必须提供原因');
  });

  it('列出和删除基线', () => {
    const store = createInMemoryBaselineStore(clock);
    store.createBaseline('a', 'run-1', makeRun(), makePlan(), makeContext(), makeEvaluation());
    store.createBaseline(
      'b',
      'run-2',
      makeRun({ id: 'run-2' }),
      makePlan(),
      makeContext(),
      makeEvaluation(),
    );
    expect(store.listBaselines().length).toBe(2);
    store.deleteBaseline('a');
    expect(store.listBaselines().length).toBe(1);
    expect(store.getBaseline('a')).toBeUndefined();
  });
});

describe('可比性判定', () => {
  it('完全相同配置为 COMPARABLE', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
    };
    const result = checkComparability(base, { ...base });
    expect(result.comparability).toBe('COMPARABLE');
  });

  it('不同定义 ID 为 NOT_COMPARABLE', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd1',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
    };
    const current = { ...base, definitionId: 'd2' };
    const result = checkComparability(base, current);
    expect(result.comparability).toBe('NOT_COMPARABLE');
  });

  it('不同评分策略为 NOT_COMPARABLE', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp1',
      policyVersion: '1',
    };
    const current = { ...base, policyId: 'sp2' };
    const result = checkComparability(base, current);
    expect(result.comparability).toBe('NOT_COMPARABLE');
  });

  it('不同定义版本为 COMPARABLE_WITH_CAVEATS', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
    };
    const current = { ...base, definitionVersion: '2' };
    const result = checkComparability(base, current);
    expect(result.comparability).toBe('COMPARABLE_WITH_CAVEATS');
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it('不同浏览器版本为 COMPARABLE_WITH_CAVEATS', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
      browserVersion: 'chrome-120',
    };
    const current = { ...base, browserVersion: 'chrome-121' };
    const result = checkComparability(base, current);
    expect(result.comparability).toBe('COMPARABLE_WITH_CAVEATS');
  });
});

describe('运行比较', () => {
  it('比较指标变化', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
      metrics: [makeMetric('m1', 100)],
      rules: [makeRule('r1', 'PASS')],
      evaluation: makeEvaluation({ overallScore: 80 }),
    };
    const current = {
      ...base,
      metrics: [makeMetric('m1', 120)],
      rules: [makeRule('r1', 'PASS')],
      evaluation: makeEvaluation({ overallScore: 85, id: 'eval-2' }),
    };
    const result = compareRuns(base, current);
    expect(result.comparability).toBe('COMPARABLE');
    expect(result.metricDeltas.length).toBe(1);
    expect(result.metricDeltas[0]!.delta).toBe(20);
    expect(result.scoreDelta).toBe(5);
  });

  it('比较规则变化', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
      metrics: [],
      rules: [makeRule('r1', 'PASS')],
      evaluation: makeEvaluation(),
    };
    const current = {
      ...base,
      rules: [makeRule('r1', 'FAIL')],
      evaluation: makeEvaluation({ overallOutcome: 'FAIL', id: 'eval-2' }),
    };
    const result = compareRuns(base, current);
    expect(result.ruleDeltas[0]!.changed).toBe(true);
    expect(result.ruleDeltas[0]!.baselineOutcome).toBe('PASS');
    expect(result.ruleDeltas[0]!.currentOutcome).toBe('FAIL');
  });

  it('缺失指标处理', () => {
    const base = {
      planDigest: 'p',
      definitionId: 'd',
      definitionVersion: '1',
      policyId: 'sp',
      policyVersion: '1',
      metrics: [makeMetric('m1', 100)],
      rules: [],
      evaluation: makeEvaluation(),
    };
    const current = {
      ...base,
      metrics: [],
      evaluation: makeEvaluation({ id: 'eval-2' }),
    };
    const result = compareRuns(base, current);
    expect(result.metricDeltas.length).toBe(1);
    expect(result.metricDeltas[0]!.currentValue).toBeNull();
  });
});
