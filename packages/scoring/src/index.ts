import { digest, invariant, newId } from '@uxq/core';
import type {
  ScoringPolicy, ScoreBinding, MetricResult, ScoreResult, DimensionResult,
  EvaluationResult, Coverage, DimensionId, RuleResult, RiskConstraint,
} from '@uxq/contracts';
import { assertPolicy, assertCoverage } from '@uxq/contracts';

/** 将指标值标准化到 0–100 分。 */
export function normalize(value: number, binding: ScoreBinding): number {
  switch (binding.normalization) {
    case 'LINEAR_HIGHER':
    case 'LINEAR_LOWER': {
      invariant(binding.min !== undefined && binding.max !== undefined && binding.min < binding.max,
        'SCORE_RANGE', '线性评分需要递增的 min/max');
      const ratio = Math.min(1, Math.max(0, (value - binding.min) / (binding.max - binding.min)));
      return (binding.normalization === 'LINEAR_HIGHER' ? ratio : 1 - ratio) * 100;
    }
    case 'TARGET_RANGE': {
      invariant(binding.min !== undefined && binding.max !== undefined &&
        binding.targetMin !== undefined && binding.targetMax !== undefined,
        'SCORE_RANGE', '目标范围需要完整参数');
      if (value >= binding.targetMin && value <= binding.targetMax) return 100;
      if (value < binding.min || value > binding.max) return 0;
      const distance = value < binding.targetMin ? binding.targetMin - value : value - binding.targetMax;
      const maxDistance = Math.max(binding.targetMin - binding.min, binding.max - binding.targetMax);
      return maxDistance > 0 ? (1 - distance / maxDistance) * 100 : 0;
    }
    case 'BOOLEAN': return value > 0 ? 100 : 0;
    default: invariant(false, 'UNKNOWN_NORMALIZATION', '未知标准化方法');
  }
}

/** 非实测结果不会被补零或替换为近似分数。 */
export function scoreMetric(policy: ScoringPolicy, binding: ScoreBinding,
  metricResult: MetricResult, runId: string, now: string): ScoreResult {
  const base = {
    id: newId('score'), schemaVersion: '1.0.0' as const, createdAt: now, runId,
    metricResultId: metricResult.id, metricId: metricResult.metricId,
    policyId: policy.id, policyVersion: policy.version, weight: binding.weight, calculatedAt: now,
  };
  const value = metricResult.status === 'MEASURED'
    ? typeof metricResult.value === 'boolean' && binding.normalization === 'BOOLEAN'
      ? Number(metricResult.value) : metricResult.value : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ...base, status: metricResult.status === 'NOT_APPLICABLE' ? 'NOT_SCORED' : 'INSUFFICIENT_INPUTS',
      reason: `指标 ${metricResult.metricId} 状态 ${metricResult.status}，无法评分` };
  }
  return { ...base, status: 'SCORED', value: Math.round(normalize(value, binding) * 100) / 100 };
}

/** 输入必须是本维度的全部绑定（含未评分项），避免漏测被隐藏。 */
export function aggregateDimension(policy: ScoringPolicy, dimensionId: DimensionId,
  scores: readonly ScoreResult[], runId: string, now: string): DimensionResult {
  const config = policy.dimensions.find((item) => item.dimensionId === dimensionId);
  invariant(config, 'MISSING_DIMENSION_WEIGHT', `维度 ${dimensionId} 未声明权重`);
  const scored = scores.filter((score) => score.status === 'SCORED');
  const applicable = scores.filter((score) => score.status !== 'NOT_SCORED').length;
  const totalWeight = scored.reduce((sum, score) => sum + score.weight, 0);
  const coverage: Coverage = { planned: scores.length, applicable, measured: scored.length,
    scored: scored.length, ratio: applicable ? scored.length / applicable : null };
  assertCoverage(coverage);
  const base = {
    id: newId('dimension'), schemaVersion: '1.0.0' as const, createdAt: now, runId, dimensionId,
    scoreResultIds: scored.map((score) => score.id),
    excludedMetricIds: scores.filter((score) => score.status !== 'SCORED').map((score) => score.metricId),
    coverage, weight: config.weight, limitations: [] as string[],
  };
  if (!totalWeight || (coverage.ratio ?? 0) < config.minimumCoverage ||
    (policy.missingPolicy === 'BLOCK' && coverage.scored < applicable)) {
    return { ...base, status: 'INSUFFICIENT_INPUTS', reason: '有效评分输入或维度覆盖率不足' };
  }
  const value = scored.reduce((sum, score) => sum + score.value * score.weight, 0) / totalWeight;
  return { ...base, status: 'SCORED', value: Math.round(value * 100) / 100 };
}

/** 结算只消费已有测量。覆盖率按指标而非维度统计；缺失关键规则不能通过。 */
export function settleEvaluation(policy: ScoringPolicy, dimensions: readonly DimensionResult[],
  ruleResults: readonly RuleResult[], metricResults: readonly MetricResult[], runId: string,
  now: string): EvaluationResult {
  assertPolicy(policy);
  const scoredDimensions = dimensions.filter((dimension) => dimension.status === 'SCORED');
  const totalWeight = scoredDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const scoredIds = new Set(dimensions.flatMap((dimension) => dimension.scoreResultIds));
  const applicable = metricResults.filter((metric) => metric.status !== 'NOT_APPLICABLE').length;
  const measured = metricResults.filter((metric) => metric.status === 'MEASURED').length;
  const coverage: Coverage = { planned: metricResults.length, applicable, measured,
    scored: scoredIds.size, ratio: applicable ? measured / applicable : null };
  assertCoverage(coverage);
  const constraints: RiskConstraint[] = [];
  let criticalUnknown = false;
  for (const id of policy.criticalRuleIds) {
    const rule = ruleResults.find((result) => result.ruleId === id);
    if (rule?.executionStatus === 'COMPLETED' && rule.outcome === 'FAIL') {
      constraints.push({ kind: 'CRITICAL_RULE', sourceIds: [rule.id], reason: `关键规则 ${id} 未通过` });
    } else if (!rule || rule.executionStatus !== 'COMPLETED' || rule.outcome !== 'PASS') {
      criticalUnknown = true;
    }
  }
  // riskSeverities 是筛选条件，不是已经发生的风险。实际 Finding 由编排层匹配。
  const complete = measured === applicable;
  const missingBound = policy.bindings.some((binding) => {
    const metric = metricResults.find((item) => item.metricId === binding.metricId);
    return !metric || !['MEASURED', 'NOT_APPLICABLE'].includes(metric.status);
  });
  const blocked = (coverage.ratio ?? 0) < policy.minimumCoverage || criticalUnknown ||
    (!policy.allowPartial && !complete) || (policy.missingPolicy === 'BLOCK' && missingBound);
  const canScore = policy.mode === 'SCORE' && measured > 0 && totalWeight > 0 && !blocked;
  const overallScore = canScore
    ? Math.round(scoredDimensions.reduce((sum, dimension) => sum + dimension.value * dimension.weight, 0) / totalWeight * 100) / 100
    : null;
  let overallOutcome: EvaluationResult['overallOutcome'];
  if (constraints.length) overallOutcome = 'FAIL';
  else if (blocked) overallOutcome = 'INCONCLUSIVE';
  else if (policy.mode === 'DESCRIPTIVE') overallOutcome = 'NOT_RATED';
  else if (overallScore === null || scoredDimensions.length < dimensions.filter((d) => d.coverage.applicable > 0).length)
    overallOutcome = 'INCONCLUSIVE';
  else overallOutcome = policy.overallThreshold !== undefined && overallScore < policy.overallThreshold ? 'FAIL' : 'PASS';
  return {
    id: newId('evaluation'), schemaVersion: '1.0.0', createdAt: now, runId,
    policyId: policy.id, policyVersion: policy.version, policyDigest: digest(policy),
    evaluationStatus: measured === 0 || blocked ? 'INSUFFICIENT_EVIDENCE' : complete ? 'COMPLETE' : 'PARTIAL',
    overallOutcome, overallScore, coverage,
    metricResultIds: metricResults.map((metric) => metric.id), ruleResultIds: ruleResults.map((rule) => rule.id),
    scoreResultIds: [...scoredIds], dimensionResultIds: dimensions.map((dimension) => dimension.id),
    findingIds: [], evidenceIds: [...new Set(metricResults.flatMap((metric) => metric.evidenceIds))],
    constraints, limitations: [...policy.limitations, ...(criticalUnknown ? ['关键规则缺少确定结果'] : [])],
  };
}
