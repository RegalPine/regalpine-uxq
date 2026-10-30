import { describe, expect, it } from 'vitest';
import { parseContract } from '@uxq/contracts';
import type { MetricDefinition, RawObservation, Evidence } from '@uxq/contracts';
import type { Timestamp } from '@uxq/core';
import { calculateMetric } from '../src/index.js';

const now = '2026-01-01T00:00:00Z' as Timestamp;
const context = { runId: 'run-1', clock: { now: () => now, monotonic: () => 0 }, signal: new AbortController().signal };
const metric: MetricDefinition = {
  id: 'metric-1', schemaVersion: '1.0.0', createdAt: now, version: '1.0.0', implementationVersion: '1.0.0',
  name: '测量测试', description: '验证计算边界', dimensionId: 'D02', metricType: 'OBS', valueKind: 'NUMBER',
  direction: 'LOWER_IS_BETTER', sourceKey: 'n', unit: 'count', aggregation: 'LATEST', minimumSamples: 1,
  required: true, applicable: true, evidenceRequired: false, limitations: [],
};
function observation(key: string, value: number | boolean, sampleId = 'sample-1'): RawObservation {
  return { id: `obs-${key}-${sampleId}`, schemaVersion: '1.0.0', createdAt: now, runId: 'run-1', stepId: 'capture', attemptId: 'attempt-1',
    key, value, unit: 'count', entityId: 'page', scenarioId: 'scenario', sampleId, source: 'E1', method: 'AUTOMATED',
    observedAt: now, excluded: false, evidenceIds: [] };
}

describe('基于真实观测计算指标', () => {
  it('保留真实观测引用，不把 sampleId 当 observationId', () => {
    const input = observation('n', 2);
    const result = calculateMetric(metric, [input], context);
    expect(result).toMatchObject({ status: 'MEASURED', value: 2, observationIds: [input.id], sampleCount: 1 });
    expect(() => parseContract('MetricResult', result)).not.toThrow();
  });
  it('无样本、排除样本均不补零，不适用单独保留', () => {
    expect(calculateMetric(metric, [], context).status).toBe('INSUFFICIENT_EVIDENCE');
    const result = calculateMetric(metric, [{ ...observation('n', 2), excluded: true, exclusionReason: '排除' }], context);
    expect(result).toMatchObject({ status: 'INSUFFICIENT_EVIDENCE', excludedSampleIds: ['sample-1'] });
    expect(calculateMetric({ ...metric, applicable: false }, [], context).status).toBe('NOT_APPLICABLE');
  });
  it('数值类型及单位不符时无效，合法 false 是实测值', () => {
    expect(calculateMetric(metric, [observation('n', false)], context).status).toBe('INVALID');
    expect(calculateMetric(metric, [{ ...observation('n', 2), unit: 'ms' }], context).status).toBe('INVALID');
    const { unit: _unit, ...booleanMetric } = metric;
    expect(calculateMetric({ ...booleanMetric, valueKind: 'BOOLEAN' }, [observation('n', false)], context))
      .toMatchObject({ status: 'MEASURED', value: false });
  });
  it('必需证据缺失、过期或未获用途授权时不能测量', () => {
    const input = { ...observation('n', 2), evidenceIds: ['ev-1'] };
    const required = { ...metric, evidenceRequired: true };
    const evidence: Evidence = {
      id: 'ev-1', schemaVersion: '1.0.0', createdAt: now, runId: 'run-1', sourceCategory: 'E1', materialType: 'DOM',
      sourceMethod: 'test', lifecycle: 'VALIDATED', validity: 'VALID', summary: '证据', content: { value: 2 },
      derivedFromIds: [], observedAt: now, privacy: { classification: 'INTERNAL', redacted: false,
        allowedPurposes: ['EVALUATION'], retentionUntil: '2026-02-01T00:00:00Z' }, limitations: [],
    };
    expect(calculateMetric(required, [input], context).status).toBe('INSUFFICIENT_EVIDENCE');
    expect(calculateMetric(required, [input], context, [evidence]).status).toBe('MEASURED');
    evidence.privacy.retentionUntil = '2025-12-31T00:00:00Z';
    expect(calculateMetric(required, [input], context, [evidence]).status).toBe('INSUFFICIENT_EVIDENCE');
    evidence.privacy.retentionUntil = '2026-02-01T00:00:00Z'; evidence.privacy.allowedPurposes = ['VERIFICATION'];
    expect(calculateMetric(required, [input], context, [evidence]).status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('RATIO 严格配对，拒绝重复、错组、单位混合和非数值', () => {
    const ratio: MetricDefinition = { ...metric, aggregation: 'RATIO', numeratorKey: 'n', denominatorKey: 'd', unit: 'ratio' };
    const n = observation('n', 1), d = observation('d', 2);
    expect(calculateMetric(ratio, [n, d], context)).toMatchObject({ status: 'MEASURED', value: 0.5, sampleCount: 1 });
    expect(calculateMetric(ratio, [n, { ...d, value: 0 }], context).status).toBe('NOT_APPLICABLE');
    expect(calculateMetric(ratio, [n], context).status).toBe('INSUFFICIENT_EVIDENCE');
    expect(calculateMetric(ratio, [n, n, d, d], context).status).toBe('INVALID');
    expect(calculateMetric(ratio, [n, { ...d, sampleId: 'other' }], context).status).toBe('INVALID');
    expect(calculateMetric(ratio, [n, { ...d, unit: 'ms' }], context).status).toBe('INVALID');
    expect(calculateMetric(ratio, [n, { ...d, value: false }], context).status).toBe('INVALID');
  });
});
