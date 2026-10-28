import { invariant, newId, digest, systemClock } from '@uxq/core';
import type { Clock, Timestamp } from '@uxq/core';
import type {
  EvaluationRun,
  EvaluationResult,
  EvaluationPlan,
  MetricResult,
  RuleResult,
  ScoreResult,
  DimensionResult,
  Comparability,
  RunContext,
  Finding,
  IdList,
  MeasuredValue,
} from '@uxq/contracts';

export interface Baseline {
  id: string;
  name: string;
  runId: string;
  planDigest: string;
  definitionId: string;
  definitionVersion: string;
  policyId: string;
  policyVersion: string;
  browserVersion?: string;
  viewport?: { width: number; height: number };
  createdAt: string;
  updatedAt: string;
  updateReason?: string;
  previousVersion?: Baseline;
  evaluationResultId: string;
}

export interface ComparisonDimension {
  name: string;
  comparable: boolean;
  reason?: string;
}

export interface MetricDelta {
  metricId: string;
  baselineValue: MeasuredValue | null;
  currentValue: MeasuredValue | null;
  delta: number | null;
  deltaPercent: number | null;
}

export interface RuleDelta {
  ruleId: string;
  baselineOutcome: string;
  currentOutcome: string;
  changed: boolean;
}

export interface ComparisonResult {
  comparability: Comparability;
  dimensions: ComparisonDimension[];
  metricDeltas: MetricDelta[];
  ruleDeltas: RuleDelta[];
  baselineScore: number | null;
  currentScore: number | null;
  scoreDelta: number | null;
  baselineOutcome: string;
  currentOutcome: string;
  caveats: string[];
}

export interface BaselineStore {
  createBaseline(name: string, runId: string, run: EvaluationRun, plan: EvaluationPlan, context: RunContext, evaluation: EvaluationResult): Baseline;
  updateBaseline(name: string, runId: string, reason: string, run: EvaluationRun, plan: EvaluationPlan, context: RunContext, evaluation: EvaluationResult): Baseline;
  getBaseline(name: string): Baseline | undefined;
  listBaselines(): Baseline[];
  deleteBaseline(name: string): void;
}

export function createInMemoryBaselineStore(clock: Clock = systemClock): BaselineStore {
  const baselines = new Map<string, Baseline>();

  return {
    createBaseline(name, runId, run, plan, context, evaluation) {
      invariant(!baselines.has(name), 'BASELINE_EXISTS', `基线已存在：${name}`);
      const now = clock.now();
      const base: Record<string, unknown> = {
        id: newId('baseline'),
        name,
        runId,
        planDigest: plan.planDigest,
        definitionId: plan.definitionId,
        definitionVersion: plan.definitionVersion,
        policyId: evaluation.policyId,
        policyVersion: evaluation.policyVersion,
        viewport: context.profile.viewport,
        createdAt: now,
        updatedAt: now,
        evaluationResultId: evaluation.id,
      };
      if (context.browserVersion) base.browserVersion = context.browserVersion;
      const baseline = base as unknown as Baseline;
      baselines.set(name, baseline);
      return baseline;
    },

    updateBaseline(name, runId, reason, run, plan, context, evaluation) {
      const existing = baselines.get(name);
      invariant(existing, 'BASELINE_NOT_FOUND', `基线不存在：${name}`);
      invariant(reason.trim().length > 0, 'BASELINE_REASON', '更新基线必须提供原因');
      const now = clock.now();
      const base: Record<string, unknown> = {
        id: existing.id,
        name,
        runId,
        planDigest: plan.planDigest,
        definitionId: plan.definitionId,
        definitionVersion: plan.definitionVersion,
        policyId: evaluation.policyId,
        policyVersion: evaluation.policyVersion,
        viewport: context.profile.viewport,
        createdAt: existing.createdAt,
        updatedAt: now,
        updateReason: reason,
        previousVersion: { ...existing },
        evaluationResultId: evaluation.id,
      };
      if (context.browserVersion) base.browserVersion = context.browserVersion;
      const updated = base as unknown as Baseline;
      baselines.set(name, updated);
      return updated;
    },

    getBaseline(name) {
      return baselines.get(name);
    },

    listBaselines() {
      return [...baselines.values()];
    },

    deleteBaseline(name) {
      baselines.delete(name);
    },
  };
}

/** 检查两个运行的可比性。 */
export function checkComparability(
  baseline: { planDigest: string; definitionId: string; definitionVersion: string; policyId: string; policyVersion: string; browserVersion?: string; viewport?: { width: number; height: number } },
  current: { planDigest: string; definitionId: string; definitionVersion: string; policyId: string; policyVersion: string; browserVersion?: string; viewport?: { width: number; height: number } },
): { comparability: Comparability; dimensions: ComparisonDimension[]; caveats: string[] } {
  const dimensions: ComparisonDimension[] = [];
  const caveats: string[] = [];

  // Definition identity
  const sameDefinition = baseline.definitionId === current.definitionId;
  const defDim: ComparisonDimension = { name: 'definition-id', comparable: sameDefinition };
  if (!sameDefinition) defDim.reason = '评价定义 ID 不同';
  dimensions.push(defDim);

  const sameDefinitionVersion = baseline.definitionVersion === current.definitionVersion;
  const defVersionDim: ComparisonDimension = { name: 'definition-version', comparable: sameDefinitionVersion };
  if (!sameDefinitionVersion) defVersionDim.reason = '评价定义版本不同，指标和规则可能已变化';
  dimensions.push(defVersionDim);
  if (!sameDefinitionVersion) caveats.push('定义版本不同，比较结果可能受配置变化影响');

  // Plan digest
  const samePlan = baseline.planDigest === current.planDigest;
  const planDim: ComparisonDimension = { name: 'plan-digest', comparable: samePlan };
  if (!samePlan) planDim.reason = '执行计划不同';
  dimensions.push(planDim);
  if (!samePlan) caveats.push('执行计划不同，步骤和依赖可能已变化');

  // Policy
  const samePolicy = baseline.policyId === current.policyId && baseline.policyVersion === current.policyVersion;
  const policyDim: ComparisonDimension = { name: 'scoring-policy', comparable: samePolicy };
  if (!samePolicy) policyDim.reason = '评分策略不同';
  dimensions.push(policyDim);
  if (!samePolicy) caveats.push('评分策略不同，分数不能直接比较');

  // Browser
  const sameBrowser = baseline.browserVersion === current.browserVersion;
  const browserDim: ComparisonDimension = { name: 'browser-version', comparable: sameBrowser };
  if (!sameBrowser) browserDim.reason = '浏览器版本不同';
  dimensions.push(browserDim);
  if (!sameBrowser) caveats.push('浏览器版本不同，渲染差异可能影响结果');

  // Viewport
  const sameViewport = baseline.viewport?.width === current.viewport?.width && baseline.viewport?.height === current.viewport?.height;
  const viewportDim: ComparisonDimension = { name: 'viewport', comparable: sameViewport };
  if (!sameViewport) viewportDim.reason = '视口尺寸不同';
  dimensions.push(viewportDim);

  // Determine overall comparability
  const criticalDiffs = dimensions.filter((d) => !d.comparable && ['definition-id', 'scoring-policy'].includes(d.name));
  if (criticalDiffs.length > 0) {
    return { comparability: 'NOT_COMPARABLE', dimensions, caveats };
  }

  const anyDiffs = dimensions.some((d) => !d.comparable);
  if (anyDiffs) {
    return { comparability: 'COMPARABLE_WITH_CAVEATS', dimensions, caveats };
  }

  return { comparability: 'COMPARABLE', dimensions, caveats };
}

/** 比较两个运行的指标和规则结果。 */
export function compareRuns(
  baseline: { planDigest: string; definitionId: string; definitionVersion: string; policyId: string; policyVersion: string; browserVersion?: string; viewport?: { width: number; height: number }; metrics: MetricResult[]; rules: RuleResult[]; evaluation: EvaluationResult },
  current: { planDigest: string; definitionId: string; definitionVersion: string; policyId: string; policyVersion: string; browserVersion?: string; viewport?: { width: number; height: number }; metrics: MetricResult[]; rules: RuleResult[]; evaluation: EvaluationResult },
): ComparisonResult {
  const { comparability, dimensions, caveats } = checkComparability(baseline, current);

  // Compare metrics
  const baselineMetrics = new Map(baseline.metrics.filter((m) => m.status === 'MEASURED').map((m) => [m.metricId, m]));
  const currentMetrics = new Map(current.metrics.filter((m) => m.status === 'MEASURED').map((m) => [m.metricId, m]));

  const metricDeltas: MetricDelta[] = [];
  const allMetricIds = new Set([...baselineMetrics.keys(), ...currentMetrics.keys()]);
  for (const metricId of allMetricIds) {
    const bMetric = baselineMetrics.get(metricId);
    const cMetric = currentMetrics.get(metricId);
    const bValue = bMetric && bMetric.status === 'MEASURED' ? bMetric.value : null;
    const cValue = cMetric && cMetric.status === 'MEASURED' ? cMetric.value : null;

    let delta: number | null = null;
    let deltaPercent: number | null = null;
    if (typeof bValue === 'number' && typeof cValue === 'number') {
      delta = cValue - bValue;
      deltaPercent = bValue !== 0 ? (delta / Math.abs(bValue)) * 100 : null;
    }

    metricDeltas.push({ metricId, baselineValue: bValue, currentValue: cValue, delta, deltaPercent });
  }

  // Compare rules
  const baselineRules = new Map(baseline.rules.map((r) => [r.ruleId, r]));
  const currentRules = new Map(current.rules.map((r) => [r.ruleId, r]));

  const ruleDeltas: RuleDelta[] = [];
  const allRuleIds = new Set([...baselineRules.keys(), ...currentRules.keys()]);
  for (const ruleId of allRuleIds) {
    const bRule = baselineRules.get(ruleId);
    const cRule = currentRules.get(ruleId);
    const bOutcome = bRule?.outcome ?? 'NOT_EVALUATED';
    const cOutcome = cRule?.outcome ?? 'NOT_EVALUATED';
    ruleDeltas.push({ ruleId, baselineOutcome: bOutcome, currentOutcome: cOutcome, changed: bOutcome !== cOutcome });
  }

  const baselineScore = baseline.evaluation.overallScore;
  const currentScore = current.evaluation.overallScore;
  const scoreDelta = baselineScore !== null && currentScore !== null ? currentScore - baselineScore : null;

  return {
    comparability,
    dimensions,
    metricDeltas,
    ruleDeltas,
    baselineScore,
    currentScore,
    scoreDelta,
    baselineOutcome: baseline.evaluation.overallOutcome,
    currentOutcome: current.evaluation.overallOutcome,
    caveats,
  };
}
