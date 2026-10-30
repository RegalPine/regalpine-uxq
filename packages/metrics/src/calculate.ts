import { digest, newId } from '@uxq/core';
import { assertMetricValue, isEvidenceUsable } from '@uxq/contracts';
import type { MetricDefinition, MetricResult, RawObservation, Evidence, MeasuredValue } from '@uxq/contracts';
import { aggregateSamples } from '@uxq/measurement';
import type { MetricExecutionContext } from '@uxq/measurement';

/** 根据声明计算；保留原始观测 ID、排除样本和证据来源。 */
export function calculateMetric(definition: MetricDefinition, observations: readonly RawObservation[],
  context: MetricExecutionContext, evidence: readonly Evidence[] = []): MetricResult {
  context.signal.throwIfAborted();
  const keys = definition.aggregation === 'RATIO'
    ? [definition.numeratorKey, definition.denominatorKey] : [definition.sourceKey];
  const selected = observations.filter((item) => keys.includes(item.key));
  const samples = selected.filter((item) => !item.excluded)
    .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  const now = context.clock.now();
  const evidenceIds = [...new Set(samples.flatMap((item) => item.evidenceIds))];
  const base = {
    id: newId('metric'), schemaVersion: '1.0.0' as const, createdAt: now, runId: context.runId,
    metricId: definition.id, metricVersion: definition.version, implementationVersion: definition.implementationVersion,
    dimensionId: definition.dimensionId, measuredAt: now, evidenceIds,
    observationIds: samples.map((item) => item.id),
    excludedSampleIds: selected.filter((item) => item.excluded).map((item) => item.sampleId),
    sampleCount: samples.length, inputDigest: digest(selected), limitations: [...definition.limitations],
  };
  const unavailable = (status: 'INSUFFICIENT_EVIDENCE' | 'NOT_APPLICABLE' | 'INVALID', reason: string): MetricResult =>
    ({ ...base, status, reason });
  if (!definition.applicable) return unavailable('NOT_APPLICABLE', '指标声明为不适用');
  if (samples.length < Math.max(1, definition.minimumSamples)) return unavailable('INSUFFICIENT_EVIDENCE', '有效观测样本不足');
  if (definition.evidenceRequired && samples.some((sample) => !sample.evidenceIds.length ||
    sample.evidenceIds.some((id) => !evidence.some((item) => item.id === id && isEvidenceUsable(item, now))))) {
    return unavailable('INSUFFICIENT_EVIDENCE', '观测缺少有效、未过期且获准用于评价的证据');
  }
  try {
    let value: MeasuredValue;
    if (definition.aggregation === 'RATIO') {
      const numerator = samples.filter((sample) => sample.key === definition.numeratorKey);
      const denominator = samples.filter((sample) => sample.key === definition.denominatorKey);
      if (numerator.length < Math.max(1, definition.minimumSamples) || denominator.length < Math.max(1, definition.minimumSamples))
        return unavailable('INSUFFICIENT_EVIDENCE', '比率的分子或分母样本不足');
      if (samples.some((sample) => typeof sample.value !== 'number' || !Number.isFinite(sample.value)))
        return unavailable('INVALID', '比率输入必须是有限数值');
      const pairKey = (sample: RawObservation) => JSON.stringify([sample.entityId, sample.scenarioId, sample.sampleId]);
      const divisors = new Map(denominator.map((sample) => [pairKey(sample), sample]));
      if (new Set(numerator.map(pairKey)).size !== numerator.length || divisors.size !== denominator.length ||
        numerator.length !== denominator.length || numerator.some((sample) => !divisors.has(pairKey(sample)))) {
        return unavailable('INVALID', '比率样本必须按实体、场景和 sampleId 唯一成对');
      }
      const inputUnit = numerator[0]!.unit;
      if (samples.some((sample) => sample.unit !== inputUnit))
        return unavailable('INVALID', '比率的分子和分母必须使用相同单位');
      const divisor = denominator.reduce((sum, sample) => sum + (sample.value as number), 0);
      if (divisor === 0) return unavailable('NOT_APPLICABLE', '分母为零');
      value = numerator.reduce((sum, sample) => sum + (sample.value as number), 0) / divisor;
      base.sampleCount = numerator.length;
    } else if (definition.valueKind === 'NUMBER') {
      for (const sample of samples) {
        assertMetricValue(definition, sample.value);
        if (sample.unit !== definition.unit) return unavailable('INVALID', '观测单位与指标声明不一致');
      }
      const result = aggregateSamples({ values: samples.map((item) => item.value as number),
        unit: definition.unit ?? '', expectedUnit: definition.unit ?? '', excludedCount: 0,
        minimumSamples: Math.max(1, definition.minimumSamples) }, definition.aggregation);
      if (result.status !== 'MEASURED' || result.value === undefined) return unavailable(result.status === 'MEASURED' ? 'INVALID' : result.status, result.reason ?? '无聚合值');
      value = result.value;
    } else {
      if (definition.aggregation !== 'LATEST') return unavailable('INVALID', '非数值指标仅支持 LATEST 聚合');
      for (const sample of samples) assertMetricValue(definition, sample.value);
      value = samples.at(-1)!.value as MeasuredValue;
    }
    assertMetricValue(definition, value);
    return { ...base, status: 'MEASURED', value, ...(definition.unit ? { unit: definition.unit } : {}) };
  } catch (error) {
    return unavailable('INVALID', error instanceof Error ? error.message : '指标输入无效');
  }
}
