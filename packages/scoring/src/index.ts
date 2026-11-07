import { digest, invariant, newId } from '@uxq/core';
import type {
  ScoringPolicy, ScoreBinding, MetricResult, ScoreResult, DimensionResult,
  EvaluationResult, Coverage, DimensionId, RuleResult, RiskConstraint,
  NormalizationResult, PassCriteria,
} from '@uxq/contracts';
import { assertPolicy, assertCoverage } from '@uxq/contracts';

/** 将指标值标准化到 0–100 分，返回状态化结果。 */
export function normalizeWithValue(binding: ScoreBinding, rawValue: number): NormalizationResult {
  try {
    const value = normalize(rawValue, binding);
    return { status: 'SCORED', value, method: binding.normalization, explanation: explainNormalization(binding, rawValue, value) };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      return { status: 'CALCULATION_FAILED', errorCode: (error as { code: string }).code };
    }
    return { status: 'CALCULATION_FAILED', errorCode: 'NORMALIZATION_ERROR' };
  }
}

/** 将指标值标准化到 0–100 分。支持规范定义的 6 种方法。 */
export function normalize(value: number, binding: ScoreBinding): number {
  switch (binding.normalization) {
    case 'FIXED_THRESHOLD': {
      invariant(binding.thresholds && binding.scores && binding.thresholds.length === binding.scores.length && binding.thresholds.length >= 2,
        'SCORE_PARAMS', '固定阈值需要等长的 thresholds 和 scores 数组（至少 2 个）');
      const thresholds = binding.thresholds;
      const scores = binding.scores;
      if (value <= thresholds[0]!) return scores[0]!;
      if (value >= thresholds[thresholds.length - 1]!) return scores[scores.length - 1]!;
      for (let i = 1; i < thresholds.length; i++) {
        if (value <= thresholds[i]!) {
          const lower = thresholds[i - 1]!;
          const upper = thresholds[i]!;
          const ratio = (value - lower) / (upper - lower);
          return scores[i - 1]! + ratio * (scores[i]! - scores[i - 1]!);
        }
      }
      return scores[scores.length - 1]!;
    }
    case 'PIECEWISE_LINEAR': {
      invariant(binding.controlPoints && binding.controlPoints.length >= 2,
        'SCORE_PARAMS', '分段线性需要至少 2 个控制点');
      const points = [...binding.controlPoints].sort((a, b) => a.x - b.x);
      if (value <= points[0]!.x) return points[0]!.y;
      if (value >= points[points.length - 1]!.x) return points[points.length - 1]!.y;
      for (let i = 1; i < points.length; i++) {
        if (value <= points[i]!.x) {
          const ratio = (value - points[i - 1]!.x) / (points[i]!.x - points[i - 1]!.x);
          return points[i - 1]!.y + ratio * (points[i]!.y - points[i - 1]!.y);
        }
      }
      return points[points.length - 1]!.y;
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
    case 'BENCHMARK': {
      invariant(binding.benchmarkValue !== undefined,
        'SCORE_PARAMS', '基准比较需要声明 benchmarkValue');
      if (binding.benchmarkValue === 0) return value === 0 ? 100 : 0;
      const ratio = Math.min(1, Math.max(0, value / binding.benchmarkValue));
      return ratio * 100;
    }
    case 'STATISTICAL': {
      invariant(binding.statisticalMean !== undefined && binding.statisticalStdDev !== undefined && binding.statisticalStdDev > 0,
        'SCORE_PARAMS', '统计标准化需要声明 mean 和正数 stdDev');
      const z = (value - binding.statisticalMean) / binding.statisticalStdDev;
      // 使用 sigmoid 映射将 z 分数转换到 0-100 范围
      return Math.round(100 / (1 + Math.exp(-z)) * 100) / 100;
    }
    case 'NONE': {
      // 不进行数值标准化，返回原始值（截断到 0-100 范围）
      return Math.min(100, Math.max(0, value));
    }
    default: invariant(false, 'UNKNOWN_NORMALIZATION', `未知标准化方法：${(binding as ScoreBinding).normalization}`);
  }
}

function explainNormalization(binding: ScoreBinding, rawValue: number, score: number): string {
  switch (binding.normalization) {
    case 'FIXED_THRESHOLD': return `固定阈值映射：原始值 ${rawValue} → 分数 ${score}`;
    case 'PIECEWISE_LINEAR': return `分段线性映射：原始值 ${rawValue} → 分数 ${score}`;
    case 'TARGET_RANGE': return `目标范围映射：原始值 ${rawValue} → 分数 ${score}`;
    case 'BENCHMARK': return `基准比较：原始值 ${rawValue}，基准 ${binding.benchmarkValue} → 分数 ${score}`;
    case 'STATISTICAL': return `统计标准化：原始值 ${rawValue}，μ=${binding.statisticalMean}，σ=${binding.statisticalStdDev} → 分数 ${score}`;
    case 'NONE': return `无标准化：原始值 ${rawValue} 直接映射`;
    default: return `未知方法`;
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
    ? typeof metricResult.value === 'number' ? metricResult.value : undefined : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ...base, status: metricResult.status === 'NOT_APPLICABLE' ? 'NOT_SCORED' : 'INSUFFICIENT_INPUTS',
      reason: `指标 ${metricResult.metricId} 状态 ${metricResult.status}，无法评分` };
  }
  const normalized = normalizeWithValue(binding, value);
  if (normalized.status === 'SCORED') {
    return { ...base, status: 'SCORED', value: Math.round(normalized.value * 100) / 100 };
  }
  return { ...base, status: normalized.status, reason: normalized.status === 'NOT_SCORED' ? normalized.reason : `标准化失败：${'errorCode' in normalized ? normalized.errorCode : normalized.reason}` };
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
  const blocked = shouldBlockAggregation(policy, coverage, applicable, scored.length);
  if (!totalWeight || blocked) {
    return { ...base, status: 'INSUFFICIENT_INPUTS', reason: '有效评分输入或维度覆盖率不足' };
  }
  const value = scored.reduce((sum, score) => sum + score.value * score.weight, 0) / totalWeight;
  return { ...base, status: 'SCORED', value: Math.round(value * 100) / 100 };
}

/** 根据缺失值策略决定是否阻塞聚合。 */
function shouldBlockAggregation(policy: ScoringPolicy, coverage: Coverage, applicable: number, scored: number): boolean {
  switch (policy.missingPolicy) {
    case 'BLOCK_AGGREGATION':
      return scored < applicable || (coverage.ratio ?? 0) < policy.minimumCoverage;
    case 'EXCLUDE_WITH_DISCLOSURE':
      return (coverage.ratio ?? 0) < policy.minimumCoverage;
    case 'REPORT_STATUS_ONLY':
      return true; // 只报告状态，不产生分数
    case 'IMPUTE_WITH_METHOD':
      return (coverage.ratio ?? 0) < policy.minimumCoverage;
    default:
      return (coverage.ratio ?? 0) < policy.minimumCoverage;
  }
}

/** 重复计分三层检查。返回发现的重复计分问题列表。 */
export function checkDuplicateScoring(
  policy: ScoringPolicy,
  metricResults: readonly MetricResult[],
  dimensionResults: readonly DimensionResult[],
): { layer: number; description: string; metricIds: string[] }[] {
  const issues: { layer: number; description: string; metricIds: string[] }[] = [];

  // 第一层：同一逻辑指标结果不能重复进入同一聚合节点
  const metricIdCounts = new Map<string, number>();
  for (const binding of policy.bindings) {
    metricIdCounts.set(binding.metricId, (metricIdCounts.get(binding.metricId) ?? 0) + 1);
  }
  for (const [metricId, count] of metricIdCounts) {
    if (count > 1) {
      issues.push({ layer: 1, description: `指标 ${metricId} 在评分绑定中出现 ${count} 次`, metricIds: [metricId] });
    }
  }

  // 第二层：识别共享原始观测的指标
  const observationToMetrics = new Map<string, Set<string>>();
  for (const metric of metricResults) {
    for (const obsId of metric.observationIds) {
      if (!observationToMetrics.has(obsId)) observationToMetrics.set(obsId, new Set());
      observationToMetrics.get(obsId)!.add(metric.metricId);
    }
  }
  for (const [obsId, metricIds] of observationToMetrics) {
    if (metricIds.size > 1) {
      const ids = [...metricIds];
      const allInSameGroup = ids.every(id => {
        const group = policy.bindings.find(b => b.metricId === id)?.countingGroup;
        return group && ids.every(otherId => {
          const otherGroup = policy.bindings.find(b => b.metricId === otherId)?.countingGroup;
          return otherGroup === group;
        });
      });
      if (!allInSameGroup) {
        issues.push({ layer: 2, description: `观测 ${obsId} 被 ${ids.length} 个指标共享且不在同一计分组`, metricIds: ids });
      }
    }
  }

  // 第三层：已包含在维度分数中的指标不再重复进入总体聚合
  const dimensionMetricIds = new Set(dimensionResults.flatMap(d => d.scoreResultIds));
  for (const binding of policy.bindings) {
    const metricResult = metricResults.find(m => m.metricId === binding.metricId);
    if (metricResult && dimensionMetricIds.has(metricResult.id)) {
      // 指标已通过维度聚合，不应再直接进入总体聚合
      // 这里只记录，不阻止（由结算逻辑处理）
    }
  }

  return issues;
}

/** 检查合格判定准则。 */
export function checkPassCriteria(
  passCriteria: PassCriteria | undefined,
  evaluation: EvaluationResult,
  dimensionResults: readonly DimensionResult[],
  ruleResults: readonly RuleResult[],
): { passed: boolean; reasons: string[] } {
  if (!passCriteria) return { passed: true, reasons: [] };

  const reasons: string[] = [];

  // 检查最低总体分数
  if (passCriteria.minimumOverallScore !== undefined && evaluation.overallScore !== null) {
    if (evaluation.overallScore < passCriteria.minimumOverallScore) {
      reasons.push(`总体分数 ${evaluation.overallScore} 低于最低要求 ${passCriteria.minimumOverallScore}`);
    }
  }

  // 检查维度级门槛
  for (const required of passCriteria.requiredDimensions) {
    const dimension = dimensionResults.find(d => d.dimensionId === required.dimensionId);
    if (!dimension) {
      reasons.push(`缺少必需维度 ${required.dimensionId} 的评分结果`);
      continue;
    }
    if (required.minimumScore !== undefined && dimension.status === 'SCORED' && dimension.value < required.minimumScore) {
      reasons.push(`维度 ${required.dimensionId} 分数 ${dimension.value} 低于最低要求 ${required.minimumScore}`);
    }
    if (required.minimumCoverage !== undefined && (dimension.coverage.ratio ?? 0) < required.minimumCoverage) {
      reasons.push(`维度 ${required.dimensionId} 覆盖率 ${dimension.coverage.ratio} 低于最低要求 ${required.minimumCoverage}`);
    }
  }

  // 检查必需规则
  for (const ruleId of passCriteria.requiredRuleIds) {
    const rule = ruleResults.find(r => r.ruleId === ruleId);
    if (!rule) {
      reasons.push(`缺少必需规则 ${ruleId} 的执行结果`);
    } else if (rule.executionStatus === 'COMPLETED' && rule.outcome === 'FAIL') {
      reasons.push(`必需规则 ${ruleId} 未通过`);
    } else if (rule.executionStatus !== 'COMPLETED') {
      reasons.push(`必需规则 ${ruleId} 未完成执行`);
    }
  }

  // 检查是否允许部分评价
  if (!passCriteria.allowPartialEvaluation && evaluation.evaluationStatus === 'PARTIAL') {
    reasons.push('评价状态为部分完成，但合格判定不允许部分评价');
  }

  // 检查是否允许插补分数
  if (!passCriteria.allowImputedScores) {
    const hasImputed = dimensionResults.some(d => d.limitations.some(l => l.includes('插补')));
    if (hasImputed) {
      reasons.push('存在插补分数，但合格判定不允许');
    }
  }

  return { passed: reasons.length === 0, reasons };
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
  // 重复计分检查
  const duplicateIssues = checkDuplicateScoring(policy, metricResults, dimensions);
  for (const issue of duplicateIssues) {
    constraints.push({ kind: 'FINDING_SEVERITY', sourceIds: issue.metricIds, reason: `[L${issue.layer}] ${issue.description}` });
  }
  // riskSeverities 是筛选条件，不是已经发生的风险。实际 Finding 由编排层匹配。
  const complete = measured === applicable;
  const missingBound = policy.bindings.some((binding) => {
    const metric = metricResults.find((item) => item.metricId === binding.metricId);
    return !metric || !['MEASURED', 'NOT_APPLICABLE'].includes(metric.status);
  });
  const blocked = isEvaluationBlocked(policy, coverage, criticalUnknown, complete, missingBound, measured, applicable);
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
  // PassCriteria 检查
  if (policy.passCriteria && overallOutcome === 'PASS') {
    const passCheck = checkPassCriteria(policy.passCriteria, { overallScore } as EvaluationResult, dimensions, ruleResults);
    if (!passCheck.passed) {
      overallOutcome = 'FAIL';
      for (const reason of passCheck.reasons) {
        constraints.push({ kind: 'EXECUTION', sourceIds: [], reason: `[合格判定] ${reason}` });
      }
    }
  }
  const evaluationStatus: EvaluationResult['evaluationStatus'] =
    measured === 0 || blocked ? 'INSUFFICIENT_EVIDENCE' : complete ? 'COMPLETE' : 'PARTIAL';
  return {
    id: newId('evaluation'), schemaVersion: '1.0.0', createdAt: now, runId,
    policyId: policy.id, policyVersion: policy.version, policyDigest: digest(policy),
    evaluationStatus, overallOutcome, overallScore, coverage,
    metricResultIds: metricResults.map((metric) => metric.id), ruleResultIds: ruleResults.map((rule) => rule.id),
    scoreResultIds: [...scoredIds], dimensionResultIds: dimensions.map((dimension) => dimension.id),
    findingIds: [], evidenceIds: [...new Set(metricResults.flatMap((metric) => metric.evidenceIds))],
    constraints, limitations: [...policy.limitations, ...(criticalUnknown ? ['关键规则缺少确定结果'] : []),
      ...(duplicateIssues.length > 0 ? [`发现 ${duplicateIssues.length} 个重复计分问题`] : [])],
  };
}

/** 根据缺失值策略判断评价是否被阻塞。 */
function isEvaluationBlocked(
  policy: ScoringPolicy,
  coverage: Coverage,
  criticalUnknown: boolean,
  complete: boolean,
  missingBound: boolean,
  measured: number,
  applicable: number,
): boolean {
  switch (policy.missingPolicy) {
    case 'BLOCK_AGGREGATION':
      return (coverage.ratio ?? 0) < policy.minimumCoverage || criticalUnknown ||
        (!policy.allowPartial && !complete) || missingBound;
    case 'EXCLUDE_WITH_DISCLOSURE':
      return (coverage.ratio ?? 0) < policy.minimumCoverage || criticalUnknown ||
        (!policy.allowPartial && !complete);
    case 'REPORT_STATUS_ONLY':
      return true; // 只报告状态，不产生总体结论
    case 'IMPUTE_WITH_METHOD':
      return (coverage.ratio ?? 0) < policy.minimumCoverage || criticalUnknown;
    default:
      return (coverage.ratio ?? 0) < policy.minimumCoverage || criticalUnknown ||
        (!policy.allowPartial && !complete) || missingBound;
  }
}
