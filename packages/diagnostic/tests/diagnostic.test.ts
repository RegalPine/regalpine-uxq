import { describe, expect, it } from 'vitest';
import type { RuleResult, MetricResult } from '@uxq/contracts';
import { generateSignals, createFinding, deduplicateFindings } from '../src/index.js';

function metricResult(
  metricId: string,
  status: MetricResult['status'] = 'MEASURED',
  value: number = 0,
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
  return { ...base, status, reason: '证据不足' };
}

function ruleResult(ruleId: string, outcome: RuleResult['outcome'] = 'PASS'): RuleResult {
  const base = {
    id: `rule-${ruleId}`,
    schemaVersion: '1.0.0' as const,
    createdAt: '2026-01-01T00:00:00Z',
    runId: 'run-1',
    ruleId,
    ruleVersion: '1.0.0',
    configurationDigest: 'abc',
    inputMetricResultIds: [],
    evidenceIds: [],
    evaluatedAt: '2026-01-01T00:00:00Z',
    reason: '测试',
  };
  if (outcome === 'EXECUTION_ERROR')
    return {
      ...base,
      executionStatus: 'ERROR',
      outcome,
      error: { code: 'TEST', message: '测试错误', category: 'EXECUTION' },
    };
  return { ...base, executionStatus: 'COMPLETED', outcome };
}

describe('诊断信号', () => {
  it('规则失败生成信号', () => {
    const signals = generateSignals(
      [ruleResult('rule-1', 'FAIL')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.sourceType).toBe('RULE');
    expect(signals[0]!.valid).toBe(true);
  });
  it('规则错误生成无效信号', () => {
    const signals = generateSignals(
      [ruleResult('rule-1', 'EXECUTION_ERROR')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.valid).toBe(false);
  });
  it('规则通过不生成信号', () => {
    const signals = generateSignals(
      [ruleResult('rule-1', 'PASS')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(signals).toHaveLength(0);
  });
  it('证据不足指标生成信号', () => {
    const signals = generateSignals(
      [],
      [metricResult('metric-1', 'INSUFFICIENT_EVIDENCE')],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.sourceType).toBe('METRIC');
  });
});

describe('Finding 创建', () => {
  it('从信号创建 Finding', () => {
    const signals = generateSignals(
      [ruleResult('rule-1', 'FAIL')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    const finding = createFinding(signals[0]!, 'run-1', '2026-01-01T00:00:00Z');
    expect(finding.lifecycle).toBe('NEW');
    expect(finding.evaluationRunIds).toEqual(['run-1']);
    expect(finding.deduplicationKey).toBeTruthy();
  });
});

describe('Finding 去重', () => {
  it('相同去重键合并', () => {
    const signals = generateSignals(
      [ruleResult('rule-1', 'FAIL')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    const finding1 = createFinding(signals[0]!, 'run-1', '2026-01-01T00:00:00Z');
    const finding2 = createFinding(signals[0]!, 'run-1', '2026-01-01T00:00:01Z');
    const deduplicated = deduplicateFindings([finding1, finding2]);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]!.revision).toBe(2);
  });
  it('不同去重键保留', () => {
    const signals1 = generateSignals(
      [ruleResult('rule-1', 'FAIL')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    const signals2 = generateSignals(
      [ruleResult('rule-2', 'FAIL')],
      [],
      'run-1',
      '2026-01-01T00:00:00Z',
    );
    const finding1 = createFinding(signals1[0]!, 'run-1', '2026-01-01T00:00:00Z');
    const finding2 = createFinding(signals2[0]!, 'run-1', '2026-01-01T00:00:00Z');
    const deduplicated = deduplicateFindings([finding1, finding2]);
    expect(deduplicated).toHaveLength(2);
  });
});
