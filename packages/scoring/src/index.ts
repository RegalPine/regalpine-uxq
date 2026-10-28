import { digest, invariant, newId } from '@uxq/core';
import type {
  ScoringPolicy,
  ScoreBinding,
  MetricResult,
  ScoreResult,
  DimensionResult,
  EvaluationResult,
  Coverage,
  DimensionId,
  RuleResult,
  RiskConstraint,
} from '@uxq/contracts';
import { assertPolicy, assertCoverage } from '@uxq/contracts';

/** 将指标值标准化到 0–100 分。 */
export function normalize(value: number, binding: ScoreBinding): number {
  switch (binding.normalization) {
    case 'LINEAR_HIGHER': {
      invariant(
        binding.min !== undefined && binding.max !== undefined,
        'SCORE_RANGE',
        '线性高分需要 min/max',
      );
      if (value <= binding.min) return 0;
      if (value >= binding.max) return 100;
      return ((value - binding.min) / (binding.max - binding.min)) * 100;
    }
    case 'LINEAR_LOWER': {
      invariant(
        binding.min !== undefined && binding.max !== undefined,
        'SCORE_RANGE',
        '线性低分需要 min/max',
      );
      if (value >= binding.max) return 0;
      if (value <= binding.min) return 100;
      return ((binding.max - value) / (binding.max - binding.min)) * 100;
    }
    case 'TARGET_RANGE': {
      invariant(
        binding.min !== undefined &&
          binding.max !== undefined &&
          binding.targetMin !== undefined &&
          binding.targetMax !== undefined,
        'SCORE_RANGE',
        '目标范围需要完整参数',
      );
      if (value >= binding.targetMin && value <= binding.targetMax) return 100;
      if (value < binding.min || value > binding.max) return 0;
      const distance =
        value < binding.targetMin ? binding.targetMin - value : value - binding.targetMax;
      const maxDistance = Math.max(
        binding.targetMin - binding.min,
        binding.max - binding.targetMax,
      );
      return maxDistance > 0 ? (1 - distance / maxDistance) * 100 : 0;
    }
    case 'BOOLEAN':
      return value > 0 ? 100 : 0;
    default:
      invariant(false, 'UNKNOWN_NORMALIZATION', `未知标准化方法`);
  }
}

/** 评分单个指标结果；非 MEASURED 不产生分数。 */
export function scoreMetric(
  policy: ScoringPolicy,
  binding: ScoreBinding,
  metricResult: MetricResult,
  runId: string,
  now: string,
): ScoreResult {
  if (metricResult.status !== 'MEASURED' || typeof metricResult.value !== 'number') {
    return {
      id: newId('score'),
      schemaVersion: '1.0.0',
      createdAt: now,
      runId,
      metricResultId: metricResult.id,
      metricId: metricResult.metricId,
      policyId: policy.id,
      policyVersion: policy.version,
      weight: binding.weight,
      calculatedAt: now,
      status: 'INSUFFICIENT_INPUTS',
      reason: `指标 ${metricResult.metricId} 状态 ${metricResult.status}，无法评分`,
    };
  }
  const normalized = normalize(metricResult.value, binding);
  return {
    id: newId('score'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    metricResultId: metricResult.id,
    metricId: metricResult.metricId,
    policyId: policy.id,
    policyVersion: policy.version,
    weight: binding.weight,
    calculatedAt: now,
    status: 'SCORED',
    value: Math.round(normalized * 100) / 100,
  };
}

/** 维度聚合：加权平均，排除未评分项；披露覆盖率。 */
export function aggregateDimension(
  policy: ScoringPolicy,
  dimensionId: DimensionId,
  scores: readonly ScoreResult[],
  runId: string,
  now: string,
): DimensionResult {
  const dimensionWeight = policy.dimensions.find(
    (dimension) => dimension.dimensionId === dimensionId,
  );
  invariant(dimensionWeight, 'MISSING_DIMENSION_WEIGHT', `维度 ${dimensionId} 未声明权重`);
  const applicable = scores.filter((score) => score.status === 'SCORED');
  const totalWeight = applicable.reduce((sum, score) => sum + score.weight, 0);
  const coverage: Coverage = {
    planned: policy.bindings.filter((binding) => {
      const metric = policy.bindings.find(
        (bindingItem) => bindingItem.metricId === binding.metricId,
      );
      return metric !== undefined;
    }).length,
    applicable: scores.length,
    measured: applicable.length,
    scored: applicable.length,
    ratio: scores.length > 0 ? applicable.length / scores.length : null,
  };
  assertCoverage(coverage);
  if (applicable.length === 0 || totalWeight === 0) {
    return {
      id: newId('dimension'),
      schemaVersion: '1.0.0',
      createdAt: now,
      runId,
      dimensionId,
      scoreResultIds: applicable.map((score) => score.id),
      excludedMetricIds: scores
        .filter((score) => score.status !== 'SCORED')
        .map((score) => score.metricId),
      coverage,
      weight: dimensionWeight.weight,
      limitations: [],
      status: 'INSUFFICIENT_INPUTS',
      reason: '无有效评分输入',
    };
  }
  const weighted =
    applicable.reduce((sum, score) => sum + (score.value as number) * score.weight, 0) /
    totalWeight;
  return {
    id: newId('dimension'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    dimensionId,
    scoreResultIds: applicable.map((score) => score.id),
    excludedMetricIds: scores
      .filter((score) => score.status !== 'SCORED')
      .map((score) => score.metricId),
    coverage,
    weight: dimensionWeight.weight,
    limitations: [],
    status: 'SCORED',
    value: Math.round(weighted * 100) / 100,
  };
}

/** 总体评价结算：维度加权，检查关键规则和覆盖率门槛。 */
export function settleEvaluation(
  policy: ScoringPolicy,
  dimensions: readonly DimensionResult[],
  ruleResults: readonly RuleResult[],
  metricResults: readonly MetricResult[],
  runId: string,
  now: string,
): EvaluationResult {
  assertPolicy(policy);
  const scoredDimensions = dimensions.filter((dimension) => dimension.status === 'SCORED');
  const totalWeight = scoredDimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
  const totalPlanned = policy.dimensions.length;
  const totalApplicable = dimensions.length;
  const totalMeasured = scoredDimensions.length;
  const coverage: Coverage = {
    planned: totalPlanned,
    applicable: totalApplicable,
    measured: totalMeasured,
    scored: totalMeasured,
    ratio: totalApplicable > 0 ? totalMeasured / totalApplicable : null,
  };
  assertCoverage(coverage);
  const constraints: RiskConstraint[] = [];
  for (const criticalRuleId of policy.criticalRuleIds) {
    const ruleResult = ruleResults.find((rule) => rule.ruleId === criticalRuleId);
    if (ruleResult && ruleResult.executionStatus === 'COMPLETED' && ruleResult.outcome === 'FAIL') {
      constraints.push({
        kind: 'CRITICAL_RULE',
        sourceIds: [ruleResult.id],
        reason: `关键规则 ${criticalRuleId} 未通过`,
      });
    }
  }
  for (const severity of policy.riskSeverities) {
    constraints.push({
      kind: 'FINDING_SEVERITY',
      sourceIds: [],
      reason: `策略声明关注 ${severity} 级别问题`,
    });
  }
  if (coverage.scored === 0) {
    return {
      id: newId('evaluation'),
      schemaVersion: '1.0.0',
      createdAt: now,
      runId,
      policyId: policy.id,
      policyVersion: policy.version,
      policyDigest: digest(policy),
      evaluationStatus: 'INSUFFICIENT_EVIDENCE',
      overallOutcome: 'INCONCLUSIVE',
      overallScore: null,
      coverage,
      metricResultIds: metricResults.map((metric) => metric.id),
      ruleResultIds: ruleResults.map((rule) => rule.id),
      scoreResultIds: [],
      dimensionResultIds: [],
      findingIds: [],
      evidenceIds: [],
      constraints,
      limitations: policy.limitations,
    };
  }
  const overallScore =
    totalWeight > 0
      ? scoredDimensions.reduce(
          (sum, dimension) => sum + (dimension.value as number) * dimension.weight,
          0,
        ) / totalWeight
      : null;
  const roundedScore = overallScore !== null ? Math.round(overallScore * 100) / 100 : null;
  let outcome: EvaluationResult['overallOutcome'] = 'PASS';
  if (constraints.some((constraint) => constraint.kind === 'CRITICAL_RULE')) outcome = 'FAIL';
  else if (
    roundedScore !== null &&
    policy.overallThreshold !== undefined &&
    roundedScore < policy.overallThreshold
  )
    outcome = 'FAIL';
  else if (coverage.ratio !== null && coverage.ratio < policy.minimumCoverage)
    outcome = 'INCONCLUSIVE';
  else if (scoredDimensions.length < totalPlanned) outcome = 'INCONCLUSIVE';
  return {
    id: newId('evaluation'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    policyId: policy.id,
    policyVersion: policy.version,
    policyDigest: digest(policy),
    evaluationStatus: policy.mode === 'DESCRIPTIVE' ? 'COMPLETE' : 'COMPLETE',
    overallOutcome: outcome,
    overallScore: roundedScore,
    coverage,
    metricResultIds: metricResults.map((metric) => metric.id),
    ruleResultIds: ruleResults.map((rule) => rule.id),
    scoreResultIds: dimensions.flatMap((dimension) => dimension.scoreResultIds),
    dimensionResultIds: dimensions.map((dimension) => dimension.id),
    findingIds: [],
    evidenceIds: [],
    constraints,
    limitations: policy.limitations,
  };
}
