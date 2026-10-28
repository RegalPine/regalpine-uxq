import { describe, expect, it } from 'vitest';
import { digest } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type { MetricDefinition, ObservationInput, MetricResult } from '@uxq/contracts';
import {
  validateObservationInput,
  normalizeObservation,
  aggregateSamples,
  cacheKey,
  isCacheEligible,
  MetricRegistry,
  executeMetric,
} from '../src/index.js';
import type { MetricExecutionContext, MetricImplementation } from '../src/index.js';

const clock: Clock = {
  now: () => '2026-01-01T00:00:00Z' as unknown as import('@uxq/core').Timestamp,
  monotonic: () => 0,
};
const signal = new AbortController().signal;
const context: MetricExecutionContext = { runId: 'run-1', clock, signal };

function metricDef(overrides: Partial<MetricDefinition> = {}): MetricDefinition {
  return {
    id: 'metric-1',
    schemaVersion: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    version: '1.0.0',
    implementationVersion: '1.0.0',
    name: '测试指标',
    description: '测试用',
    dimensionId: 'D02',
    metricType: 'CALC',
    valueKind: 'NUMBER',
    direction: 'LOWER_IS_BETTER',
    sourceKey: 'duration',
    unit: 'ms',
    aggregation: 'MEAN',
    minimumSamples: 1,
    minimum: 0,
    maximum: 100,
    required: true,
    applicable: true,
    evidenceRequired: false,
    limitations: [],
    ...overrides,
  };
}

function observation(value: number, overrides: Partial<ObservationInput> = {}): ObservationInput {
  return {
    key: 'duration',
    value,
    unit: 'ms',
    entityId: 'target-1',
    scenarioId: 'scenario-1',
    source: 'E1',
    method: 'AUTOMATED',
    observedAt: '2026-01-01T00:00:00Z',
    sampleId: `sample-${value}`,
    excluded: false,
    ...overrides,
  };
}

describe('观测校验', () => {
  it('合法观测通过校验', () => {
    expect(() => validateObservationInput(observation(42), metricDef())).not.toThrow();
  });
  it('键名不匹配拒绝', () => {
    expect(() =>
      validateObservationInput(observation(42, { key: 'wrong' }), metricDef()),
    ).toThrow();
  });
  it('单位不匹配拒绝', () => {
    expect(() =>
      validateObservationInput(observation(42, { unit: 'seconds' }), metricDef()),
    ).toThrow();
  });
  it('数值指标拒绝非数字', () => {
    expect(() => validateObservationInput(observation(NaN), metricDef())).toThrow();
  });
  it('布尔指标需要布尔值', () => {
    const definition = metricDef({ valueKind: 'BOOLEAN', sourceKey: 'success' });
    expect(() =>
      validateObservationInput({ ...observation(1), key: 'success', value: true }, definition),
    ).not.toThrow();
    expect(() =>
      validateObservationInput({ ...observation(1), key: 'success', value: 42 }, definition),
    ).toThrow();
  });
});

describe('观测规范化', () => {
  it('生成独立标识并保留原始数据', () => {
    const normalized = normalizeObservation(observation(42));
    expect(normalized.id).toMatch(/^obs-/);
    expect(normalized.value).toBe(42);
    expect(normalized.key).toBe('duration');
  });
});

describe('聚合', () => {
  const base = { unit: 'ms', expectedUnit: 'ms', excludedCount: 0, minimumSamples: 1 };
  it('MEAN 正确计算', () => {
    const result = aggregateSamples({ ...base, values: [10, 20, 30] }, 'MEAN');
    expect(result.status).toBe('MEASURED');
    expect(result.value).toBe(20);
  });
  it('MEDIAN 奇数样本取中间', () => {
    const result = aggregateSamples({ ...base, values: [10, 20, 30] }, 'MEDIAN');
    expect(result.value).toBe(20);
  });
  it('MEDIAN 偶数样本取平均', () => {
    const result = aggregateSamples({ ...base, values: [10, 20, 30, 40] }, 'MEDIAN');
    expect(result.value).toBe(25);
  });
  it('P95 取第 95 百分位', () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);
    const result = aggregateSamples({ ...base, values }, 'P95');
    expect(result.value).toBe(19);
  });
  it('SUM 求和', () => {
    expect(aggregateSamples({ ...base, values: [1, 2, 3] }, 'SUM').value).toBe(6);
  });
  it('COUNT 计数', () => {
    expect(aggregateSamples({ ...base, values: [1, 2, 3] }, 'COUNT').value).toBe(3);
  });
  it('LATEST 取最后', () => {
    expect(aggregateSamples({ ...base, values: [10, 20, 30] }, 'LATEST').value).toBe(30);
  });
  it('SUCCESS_RATE 计算成功比例', () => {
    const result = aggregateSamples({ ...base, values: [1, 0, 1, 1] }, 'SUCCESS_RATE');
    expect(result.value).toBe(75);
  });
  it('RATIO 分母为零返回 NOT_APPLICABLE', () => {
    const result = aggregateSamples({ ...base, values: [5, 0] }, 'RATIO');
    expect(result.status).toBe('NOT_APPLICABLE');
  });
  it('RATIO 正常计算', () => {
    const result = aggregateSamples({ ...base, values: [3, 4] }, 'RATIO');
    expect(result.value).toBeCloseTo(0.75);
  });
  it('样本不足返回 INSUFFICIENT_EVIDENCE', () => {
    const result = aggregateSamples({ ...base, values: [], minimumSamples: 1 }, 'MEAN');
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('单位不匹配拒绝', () => {
    expect(() =>
      aggregateSamples({ ...base, values: [1], expectedUnit: 'seconds' }, 'MEAN'),
    ).toThrow();
  });
  it('过滤非有限数', () => {
    const result = aggregateSamples({ ...base, values: [10, NaN, 20, Infinity] }, 'MEAN');
    expect(result.value).toBe(15);
    expect(result.sampleCount).toBe(2);
  });
});

describe('缓存', () => {
  it('相同输入产生相同缓存键', () => {
    const key1 = cacheKey('metric-1', '1.0.0', '1.0.0', 'abc', 'def');
    const key2 = cacheKey('metric-1', '1.0.0', '1.0.0', 'abc', 'def');
    expect(key1).toBe(key2);
  });
  it('不同输入产生不同缓存键', () => {
    const key1 = cacheKey('metric-1', '1.0.0', '1.0.0', 'abc', 'def');
    const key2 = cacheKey('metric-1', '1.0.0', '1.0.0', 'xyz', 'def');
    expect(key1).not.toBe(key2);
  });
  it('版本变化使缓存失效', () => {
    const key1 = cacheKey('metric-1', '1.0.0', '1.0.0', 'abc', 'def');
    const key2 = cacheKey('metric-1', '2.0.0', '1.0.0', 'abc', 'def');
    expect(key1).not.toBe(key2);
  });
  it('只有 MEASURED 且有样本才可缓存', () => {
    const measured: MetricResult = {
      id: 'm1',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      runId: 'run-1',
      metricId: 'metric-1',
      metricVersion: '1.0.0',
      implementationVersion: '1.0.0',
      dimensionId: 'D02',
      measuredAt: '2026-01-01T00:00:00Z',
      evidenceIds: [],
      observationIds: [],
      excludedSampleIds: [],
      sampleCount: 1,
      inputDigest: 'abc',
      limitations: [],
      status: 'MEASURED',
      value: 42,
      unit: 'ms',
    };
    expect(isCacheEligible(measured)).toBe(true);
    expect(isCacheEligible({ ...measured, status: 'INSUFFICIENT_EVIDENCE', reason: 'x' })).toBe(
      false,
    );
    expect(isCacheEligible({ ...measured, sampleCount: 0 })).toBe(false);
  });
});

describe('注册表', () => {
  it('注册和解析指标定义', () => {
    const registry = new MetricRegistry();
    const definition = metricDef();
    registry.registerDefinition(definition);
    expect(registry.resolveDefinition('metric-1', '1.0.0')).toBe(definition);
  });
  it('重复版本拒绝', () => {
    const registry = new MetricRegistry();
    registry.registerDefinition(metricDef());
    expect(() => registry.registerDefinition(metricDef())).toThrow();
  });
  it('未注册版本拒绝', () => {
    const registry = new MetricRegistry();
    expect(() => registry.resolveDefinition('metric-1', '9.9.9')).toThrow();
  });
  it('注册实现需匹配定义版本', () => {
    const registry = new MetricRegistry();
    registry.registerDefinition(metricDef());
    const implementation: MetricImplementation = {
      metricId: 'metric-1',
      implementationVersion: '1.0.0',
      calculate: () => ({}) as MetricResult,
    };
    registry.registerImplementation(implementation, '1.0.0');
    expect(registry.resolveImplementation('metric-1', '1.0.0')).toBe(implementation);
  });
  it('实现版本不匹配拒绝', () => {
    const registry = new MetricRegistry();
    registry.registerDefinition(metricDef({ implementationVersion: '2.0.0' }));
    const implementation: MetricImplementation = {
      metricId: 'metric-1',
      implementationVersion: '1.0.0',
      calculate: () => ({}) as MetricResult,
    };
    expect(() => registry.registerImplementation(implementation, '2.0.0')).toThrow();
  });
});

describe('指标执行', () => {
  it('不适用指标返回 NOT_APPLICABLE', () => {
    const registry = new MetricRegistry();
    const definition = metricDef({ applicable: false });
    registry.registerDefinition(definition);
    const result = executeMetric(registry, definition, [observation(42)], context);
    expect(result.status).toBe('NOT_APPLICABLE');
  });
  it('证据不足返回 INSUFFICIENT_EVIDENCE', () => {
    const registry = new MetricRegistry();
    const definition = metricDef({ evidenceRequired: true });
    registry.registerDefinition(definition);
    const implementation: MetricImplementation = {
      metricId: 'metric-1',
      implementationVersion: '1.0.0',
      calculate: () => ({}) as MetricResult,
    };
    registry.registerImplementation(implementation, '1.0.0');
    const result = executeMetric(registry, definition, [], context);
    expect(result.status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('正常执行调用实现', () => {
    const registry = new MetricRegistry();
    const definition = metricDef();
    registry.registerDefinition(definition);
    const implementation: MetricImplementation = {
      metricId: 'metric-1',
      implementationVersion: '1.0.0',
      calculate(observations, ctx) {
        return {
          id: 'metric-result-1',
          schemaVersion: '1.0.0',
          createdAt: ctx.clock.now(),
          runId: ctx.runId,
          metricId: definition.id,
          metricVersion: definition.version,
          implementationVersion: definition.implementationVersion,
          dimensionId: definition.dimensionId,
          measuredAt: ctx.clock.now(),
          evidenceIds: [],
          observationIds: observations.map((observation) => observation.sampleId),
          excludedSampleIds: [],
          sampleCount: observations.length,
          inputDigest: digest(observations),
          limitations: [],
          status: 'MEASURED',
          value: 42,
          unit: 'ms',
        };
      },
    };
    registry.registerImplementation(implementation, '1.0.0');
    const result = executeMetric(registry, definition, [observation(42)], context);
    expect(result.status).toBe('MEASURED');
    expect((result as unknown as { value: number }).value).toBe(42);
  });
});
