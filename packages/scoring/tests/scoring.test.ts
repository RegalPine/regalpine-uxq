import { describe, expect, it } from 'vitest';
import type {
  ScoringPolicy,
  MetricResult,
  ScoreBinding,
  DimensionResult,
  RuleResult,
} from '@uxq/contracts';
import { normalize, scoreMetric, aggregateDimension, settleEvaluation } from '../src/index.js';

function metricResult(
  metricId: string,
  value: number,
  status: MetricResult['status'] = 'MEASURED',
): MetricResult {
  const base = {
    id: `result-${metricId}`,
    schemaVersion: '1.0.0' as const,
    createdAt: '2026-01-01T00:00:00Z',
    runId: 'run-1',
    metricId,
    metricVersion: '1.0.0',
    implementationVersion: '1.0.0',
    dimensionId: 'D02' as const,
    measuredAt: '2026-01-01T00:00:00Z',
    evidenceIds: [],
    observationIds: [],
    excludedSampleIds: [],
    sampleCount: 1,
    inputDigest: 'abc',
    limitations: [],
  };
  if (status === 'MEASURED') return { ...base, status, value, unit: 'ms' };
  return { ...base, status, reason: '测试原因' };
}

function policy(overrides: Partial<ScoringPolicy> = {}): ScoringPolicy {
  return {
    id: 'policy-1',
    schemaVersion: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    version: '1.0.0',
    name: '测试策略',
    mode: 'SCORE',
    bindings: [
      { metricId: 'metric-1', weight: 1, normalization: 'LINEAR_LOWER', min: 0, max: 100 },
    ],
    dimensions: [{ dimensionId: 'D02', weight: 1, minimumCoverage: 0 }],
    missingPolicy: 'EXCLUDE',
    minimumCoverage: 0,
    allowPartial: true,
    criticalRuleIds: [],
    riskSeverities: [],
    rationale: '测试',
    limitations: [],
    ...overrides,
  };
}

describe('标准化', () => {
  it('LINEAR_LOWER 值越低分越高', () => {
    const binding: ScoreBinding = {
      metricId: 'metric-1',
      weight: 1,
      normalization: 'LINEAR_LOWER',
      min: 0,
      max: 100,
    };
    expect(normalize(0, binding)).toBe(100);
    expect(normalize(100, binding)).toBe(0);
    expect(normalize(50, binding)).toBe(50);
  });
  it('LINEAR_HIGHER 值越高分越高', () => {
    const binding: ScoreBinding = {
      metricId: 'metric-1',
      weight: 1,
      normalization: 'LINEAR_HIGHER',
      min: 0,
      max: 100,
    };
    expect(normalize(0, binding)).toBe(0);
    expect(normalize(100, binding)).toBe(100);
  });
  it('TARGET_RANGE 在范围内满分', () => {
    const binding: ScoreBinding = {
      metricId: 'metric-1',
      weight: 1,
      normalization: 'TARGET_RANGE',
      min: 0,
      max: 100,
      targetMin: 40,
      targetMax: 60,
    };
    expect(normalize(50, binding)).toBe(100);
    expect(normalize(0, binding)).toBe(0);
  });
  it('BOOLEAN 真为满分', () => {
    const binding: ScoreBinding = { metricId: 'metric-1', weight: 1, normalization: 'BOOLEAN' };
    expect(normalize(1, binding)).toBe(100);
    expect(normalize(0, binding)).toBe(0);
  });
});

describe('评分', () => {
  it('MEASURED 指标产生分数', () => {
    const score = scoreMetric(
      policy(),
      policy().bindings[0]!,
      metricResult('metric-1', 50),
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(score.status).toBe('SCORED');
    expect((score as { value: number }).value).toBe(50);
  });
  it('非 MEASURED 指标不产生分数', () => {
    const score = scoreMetric(
      policy(),
      policy().bindings[0]!,
      metricResult('metric-1', 0, 'INSUFFICIENT_EVIDENCE'),
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(score.status).toBe('INSUFFICIENT_INPUTS');
  });
});

describe('维度聚合', () => {
  it('加权平均', () => {
    const scores = [
      {
        id: 'score-1',
        schemaVersion: '1.0.0' as const,
        createdAt: '2026-01-01T00:00:00Z',
        runId: 'run-1',
        metricResultId: 'r1',
        metricId: 'metric-1',
        policyId: 'policy-1',
        policyVersion: '1.0.0',
        weight: 1,
        calculatedAt: '2026-01-01T00:00:00Z',
        status: 'SCORED' as const,
        value: 80,
      },
      {
        id: 'score-2',
        schemaVersion: '1.0.0' as const,
        createdAt: '2026-01-01T00:00:00Z',
        runId: 'run-1',
        metricResultId: 'r2',
        metricId: 'metric-2',
        policyId: 'policy-1',
        policyVersion: '1.0.0',
        weight: 1,
        calculatedAt: '2026-01-01T00:00:00Z',
        status: 'SCORED' as const,
        value: 60,
      },
    ];
    const dimension = aggregateDimension(
      policy({
        bindings: [
          { metricId: 'metric-1', weight: 1, normalization: 'LINEAR_LOWER', min: 0, max: 100 },
          { metricId: 'metric-2', weight: 1, normalization: 'LINEAR_LOWER', min: 0, max: 100 },
        ],
      }),
      'D02',
      scores,
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(dimension.status).toBe('SCORED');
    expect((dimension as { value: number }).value).toBe(70);
  });
});

describe('总体结算', () => {
  it('无评分输入返回 INCONCLUSIVE', () => {
    const result = settleEvaluation(policy(), [], [], [], 'run-1', '2026-01-01T00:00:00Z');
    expect(result.overallOutcome).toBe('INCONCLUSIVE');
    expect(result.overallScore).toBeNull();
  });
  it('关键规则失败导致 FAIL', () => {
    const policyWithCritical = policy({ criticalRuleIds: ['rule-1'] });
    const ruleResult: RuleResult = {
      id: 'rule-result-1',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      runId: 'run-1',
      ruleId: 'rule-1',
      ruleVersion: '1.0.0',
      configurationDigest: 'abc',
      inputMetricResultIds: [],
      evidenceIds: [],
      evaluatedAt: '2026-01-01T00:00:00Z',
      reason: '失败',
      executionStatus: 'COMPLETED',
      outcome: 'FAIL',
    };
    const dimension: DimensionResult = {
      id: 'dim-1',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      runId: 'run-1',
      dimensionId: 'D02',
      scoreResultIds: [],
      excludedMetricIds: [],
      coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
      weight: 1,
      limitations: [],
      status: 'SCORED',
      value: 100,
    };
    const result = settleEvaluation(
      policyWithCritical,
      [dimension],
      [ruleResult],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(result.overallOutcome).toBe('FAIL');
  });
  it('低于门槛导致 FAIL', () => {
    const strictPolicy = policy({ overallThreshold: 80 });
    const dimension: DimensionResult = {
      id: 'dim-1',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      runId: 'run-1',
      dimensionId: 'D02',
      scoreResultIds: [],
      excludedMetricIds: [],
      coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
      weight: 1,
      limitations: [],
      status: 'SCORED',
      value: 50,
    };
    const result = settleEvaluation(
      strictPolicy,
      [dimension],
      [],
      [metricResult('metric-1', 50)],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(result.overallOutcome).toBe('FAIL');
  });
  it('高于门槛通过', () => {
    const lenientPolicy = policy({ overallThreshold: 30 });
    const dimension: DimensionResult = {
      id: 'dim-1',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      runId: 'run-1',
      dimensionId: 'D02',
      scoreResultIds: [],
      excludedMetricIds: [],
      coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
      weight: 1,
      limitations: [],
      status: 'SCORED',
      value: 80,
    };
    const result = settleEvaluation(
      lenientPolicy,
      [dimension],
      [],
      [metricResult('metric-1', 20)],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(result.overallOutcome).toBe('PASS');
    expect(result.overallScore).toBe(80);

    const withoutMeasurements = settleEvaluation(
      lenientPolicy, [dimension], [], [], 'run-1', '2026-01-01T00:00:00Z',
    );
    expect(withoutMeasurements.overallScore).toBeNull();
    expect(withoutMeasurements.overallOutcome).toBe('INCONCLUSIVE');
    expect(withoutMeasurements.evaluationStatus).toBe('INSUFFICIENT_EVIDENCE');
  });
});
