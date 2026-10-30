export { calculateMetric } from './calculate.js';
import { digest, newId } from '@uxq/core';
import type { MetricResult, ObservationInput } from '@uxq/contracts';
import type { MetricExecutionContext, MetricImplementation } from '@uxq/measurement';
import { aggregateSamples } from '@uxq/measurement';
import type { MetricDefinition } from '@uxq/contracts';

function buildResult(
  definition: MetricDefinition,
  observations: readonly ObservationInput[],
  context: MetricExecutionContext,
  aggregation: ReturnType<typeof aggregateSamples>,
  evidenceIds: string[] = [],
): MetricResult {
  const now = context.clock.now();
  const base = {
    id: newId('metric'),
    schemaVersion: '1.0.0' as const,
    createdAt: now,
    runId: context.runId,
    metricId: definition.id,
    metricVersion: definition.version,
    implementationVersion: definition.implementationVersion,
    dimensionId: definition.dimensionId,
    measuredAt: now,
    evidenceIds,
    observationIds: observations.map((observation) => observation.sampleId),
    excludedSampleIds: observations
      .filter((observation) => observation.excluded)
      .map((observation) => observation.sampleId),
    sampleCount: aggregation.sampleCount,
    inputDigest: digest(observations),
    limitations: definition.limitations,
  };
  if (aggregation.status === 'MEASURED' && aggregation.value !== undefined) {
    const result: Record<string, unknown> = {
      ...base,
      status: 'MEASURED',
      value: aggregation.value,
    };
    if (definition.unit) result.unit = definition.unit;
    return result as unknown as MetricResult;
  }
  return {
    ...base,
    status: aggregation.status as 'INSUFFICIENT_EVIDENCE' | 'NOT_APPLICABLE' | 'INVALID',
    reason: aggregation.reason ?? '未知原因',
  };
}

/** 数值聚合指标实现：支持 MEAN/MEDIAN/P95/SUM/COUNT/LATEST/SUCCESS_RATE/RATIO。 */
export function createNumericAggregation(
  metricId: string,
  implementationVersion: string,
): MetricImplementation {
  return {
    metricId,
    implementationVersion,
    calculate(observations, context) {
      const definition = (this as unknown as { __definition?: MetricDefinition }).__definition;
      const values = observations
        .map((observation) => observation.value as number)
        .filter((value) => Number.isFinite(value));
      const aggregation = aggregateSamples(
        {
          values,
          unit: observations[0]?.unit ?? definition?.unit ?? '',
          expectedUnit: definition?.unit ?? '',
          excludedCount: observations.length - values.length,
          minimumSamples: definition?.minimumSamples ?? 1,
        },
        definition?.aggregation ?? 'MEAN',
      );
      return buildResult(definition!, observations, context, aggregation);
    },
  };
}

/** 简单数值指标：从观测值直接聚合，用于离线和演示场景。 */
export class SimpleNumericMetric implements MetricImplementation {
  constructor(
    readonly metricId: string,
    readonly implementationVersion: string,
    private readonly definition: MetricDefinition,
  ) {}

  calculate(
    observations: readonly ObservationInput[],
    context: MetricExecutionContext,
  ): MetricResult {
    const values = observations
      .map((observation) => observation.value as number)
      .filter((value) => Number.isFinite(value));
    const aggregation = aggregateSamples(
      {
        values,
        unit: observations[0]?.unit ?? this.definition.unit ?? '',
        expectedUnit: this.definition.unit ?? '',
        excludedCount: observations.length - values.length,
        minimumSamples: this.definition.minimumSamples,
      },
      this.definition.aggregation,
    );
    return buildResult(this.definition, observations, context, aggregation);
  }
}

/** 布尔指标：返回最后一个有效布尔值，成功比例应另定义为数值指标。 */
export class BooleanMetric implements MetricImplementation {
  constructor(
    readonly metricId: string,
    readonly implementationVersion: string,
    private readonly definition: MetricDefinition,
  ) {}

  calculate(
    observations: readonly ObservationInput[],
    context: MetricExecutionContext,
  ): MetricResult {
    context.signal.throwIfAborted();
    const inputs = observations.filter((observation) => !observation.excluded && observation.key === this.definition.sourceKey)
      .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
    const now = context.clock.now();
    const base = {
      id: newId('metric'),
      schemaVersion: '1.0.0',
      createdAt: now,
      runId: context.runId,
      metricId: this.definition.id,
      metricVersion: this.definition.version,
      implementationVersion: this.definition.implementationVersion,
      dimensionId: this.definition.dimensionId,
      measuredAt: now,
      evidenceIds: [] as string[],
      observationIds: observations.map((observation) => observation.sampleId),
      excludedSampleIds: observations
        .filter((observation) => observation.excluded)
        .map((observation) => observation.sampleId),
      sampleCount: inputs.length,
      inputDigest: digest(observations),
      limitations: this.definition.limitations,
    } as const;
    if (!this.definition.applicable) return { ...base, status: 'NOT_APPLICABLE', reason: '指标不适用' };
    if (inputs.length < Math.max(1, this.definition.minimumSamples) || this.definition.evidenceRequired) {
      return { ...base, status: 'INSUFFICIENT_EVIDENCE', reason: '样本或关联证据不足；需要证据时请使用 calculateMetric' };
    }
    if (this.definition.aggregation !== 'LATEST' || inputs.some((input) => typeof input.value !== 'boolean')) {
      return { ...base, status: 'INVALID', reason: '布尔指标需要 LATEST 聚合和布尔观测值' };
    }
    return { ...base, status: 'MEASURED', value: inputs.at(-1)!.value as boolean };
  }
}
