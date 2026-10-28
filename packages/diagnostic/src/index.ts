import { digest, invariant, newId } from '@uxq/core';
import type {
  Finding,
  DiagnosticSignal,
  RuleResult,
  MetricResult,
  Evidence,
  EvidenceLink,
  FindingLifecycleStatus,
  VerificationPlan,
  VerificationResult,
  RootCauseHypothesis,
  Recommendation,
  EvaluationDefinition,
  IdList,
  Comparability,
} from '@uxq/contracts';

/** 从规则失败和异常指标生成基础诊断信号；不修改原始测量事实。 */
export function generateSignals(
  ruleResults: readonly RuleResult[],
  metricResults: readonly MetricResult[],
  runId: string,
  now: string,
): DiagnosticSignal[] {
  const signals: DiagnosticSignal[] = [];
  for (const rule of ruleResults) {
    if (rule.executionStatus === 'COMPLETED' && rule.outcome === 'FAIL') {
      signals.push({
        id: newId('signal'),
        schemaVersion: '1.0.0',
        createdAt: now,
        runId,
        sourceResultIds: [rule.id],
        sourceType: 'RULE',
        valid: true,
        reason: `规则 ${rule.ruleId} 未通过：${rule.reason}`,
        problemKey: rule.ruleId,
        title: `规则失败：${rule.ruleId}`,
        description: rule.reason,
        type: 'CONFIRMED_DEFECT',
        severity: 'S2',
        priority: 'P1',
        confidence: 'HIGH',
        entityId: runId,
        scenarioId: rule.ruleId,
        evidenceIds: rule.evidenceIds,
      });
    }
    if (rule.executionStatus === 'ERROR') {
      signals.push({
        id: newId('signal'),
        schemaVersion: '1.0.0',
        createdAt: now,
        runId,
        sourceResultIds: [rule.id],
        sourceType: 'RULE',
        valid: false,
        reason: `规则 ${rule.ruleId} 执行错误：${rule.reason}`,
        problemKey: rule.ruleId,
        title: `规则执行错误：${rule.ruleId}`,
        description: rule.reason,
        type: 'INSUFFICIENT_EVIDENCE',
        severity: 'S3',
        priority: 'P2',
        confidence: 'LOW',
        entityId: runId,
        scenarioId: rule.ruleId,
        evidenceIds: [],
      });
    }
  }
  for (const metric of metricResults) {
    if (metric.status === 'INSUFFICIENT_EVIDENCE') {
      signals.push({
        id: newId('signal'),
        schemaVersion: '1.0.0',
        createdAt: now,
        runId,
        sourceResultIds: [metric.id],
        sourceType: 'METRIC',
        valid: true,
        reason: `指标 ${metric.metricId} 证据不足`,
        problemKey: metric.metricId,
        title: `证据不足：${metric.metricId}`,
        description: metric.reason ?? '无详细说明',
        type: 'INSUFFICIENT_EVIDENCE',
        severity: 'S3',
        priority: 'P2',
        confidence: 'MEDIUM',
        entityId: runId,
        scenarioId: metric.metricId,
        evidenceIds: metric.evidenceIds,
      });
    }
  }
  return signals;
}

/** 从信号创建 Finding；去重键基于实体、场景和问题语义。 */
export function createFinding(
  signal: DiagnosticSignal,
  runId: string,
  now: string,
  evidence: readonly Evidence[] = [],
): Finding {
  const evidenceLinks: EvidenceLink[] = evidence
    .filter((item) => signal.evidenceIds.includes(item.id))
    .map((item) => ({
      evidenceId: item.id,
      subjectId: signal.id,
      subjectType: 'Finding' as const,
      relation: 'SUPPORTS' as const,
      purpose: signal.reason,
    }));
  return {
    id: newId('finding'),
    schemaVersion: '1.0.0',
    createdAt: now,
    problemKey: signal.problemKey,
    title: signal.title,
    description: signal.description,
    type: signal.type,
    severity: signal.severity,
    priority: signal.priority,
    confidence: signal.confidence,
    entityId: signal.entityId,
    scenarioId: signal.scenarioId,
    lifecycle: 'NEW',
    revision: 1,
    evaluationRunIds: [runId],
    diagnosticSignalIds: [signal.id],
    evidenceLinks,
    affectedEntityIds: [signal.entityId],
    rootCauseHypothesisIds: [],
    recommendationIds: [],
    verificationResultIds: [],
    firstObservedAt: now,
    lastObservedAt: now,
    deduplicationKey: digest({
      entity: signal.entityId,
      scenario: signal.scenarioId,
      problem: signal.problemKey,
    }),
    limitations: [],
  };
}

/** 基础去重：相同 deduplicationKey 的 Finding 合并，保留最新证据。 */
export function deduplicateFindings(findings: readonly Finding[]): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const finding of findings) {
    const existing = byKey.get(finding.deduplicationKey);
    if (!existing) {
      byKey.set(finding.deduplicationKey, finding);
      continue;
    }
    byKey.set(finding.deduplicationKey, {
      ...existing,
      diagnosticSignalIds: [
        ...new Set([...existing.diagnosticSignalIds, ...finding.diagnosticSignalIds]),
      ],
      evidenceLinks: [...existing.evidenceLinks, ...finding.evidenceLinks],
      evaluationRunIds: [...new Set([...existing.evaluationRunIds, ...finding.evaluationRunIds])],
      lastObservedAt:
        finding.lastObservedAt > existing.lastObservedAt
          ? finding.lastObservedAt
          : existing.lastObservedAt,
      revision: existing.revision + 1,
    });
  }
  return [...byKey.values()];
}

/** Finding 生命周期合法转换。 */
const findingTransitions: Record<FindingLifecycleStatus, readonly FindingLifecycleStatus[]> = {
  NEW: ['TRIAGED', 'INVALID', 'CLOSED'],
  TRIAGED: ['INVESTIGATING', 'ACCEPTED', 'WONT_FIX', 'INVALID', 'CLOSED'],
  INVESTIGATING: ['CONFIRMED', 'REOPENED', 'INVALID', 'CLOSED'],
  CONFIRMED: ['PLANNED', 'ACCEPTED', 'WONT_FIX', 'INVALID', 'CLOSED'],
  ACCEPTED: ['PLANNED', 'CLOSED'],
  PLANNED: ['IN_PROGRESS', 'CLOSED'],
  IN_PROGRESS: ['FIXED', 'CLOSED'],
  FIXED: ['VERIFIED', 'REOPENED', 'CLOSED'],
  VERIFIED: ['CLOSED', 'REOPENED'],
  REOPENED: ['TRIAGED', 'INVESTIGATING', 'INVALID', 'CLOSED'],
  WONT_FIX: ['REOPENED', 'CLOSED'],
  INVALID: ['REOPENED'],
  CLOSED: ['REOPENED'],
};

/** 转换 Finding 生命周期。 */
export function transitionFinding(
  finding: Finding,
  to: FindingLifecycleStatus,
  reason: string,
  now: string,
): Finding {
  invariant(
    findingTransitions[finding.lifecycle]?.includes(to),
    'FINDING_TRANSITION',
    `不允许从 ${finding.lifecycle} 转换到 ${to}`,
  );
  invariant(reason.trim().length > 0, 'TRANSITION_REASON', '生命周期转换必须有原因');
  return {
    ...finding,
    lifecycle: to,
    revision: finding.revision + 1,
    lastObservedAt: now,
  };
}

/** 创建根因假设。 */
export function createRootCauseHypothesis(
  findingIds: IdList,
  description: string,
  evidence: readonly Evidence[] = [],
  now: string,
): RootCauseHypothesis {
  invariant(findingIds.length > 0, 'FINDING_REQUIRED', '根因假设必须关联至少一个问题');
  return {
    id: newId('hypothesis'),
    schemaVersion: '1.0.0',
    createdAt: now,
    findingIds,
    description,
    status: 'HYPOTHESIS',
    confidence: 'LOW',
    evidenceLinks: evidence.map((e) => ({
      evidenceId: e.id,
      subjectId: findingIds[0]!,
      subjectType: 'RootCauseHypothesis' as const,
      relation: 'SUPPORTS' as const,
      purpose: description,
    })),
    limitations: [],
  };
}

/** 创建改进建议。 */
export function createRecommendation(
  findingIds: IdList,
  rootCauseHypothesisIds: IdList,
  description: string,
  expectedOutcomes: string[],
  verificationPlanIds: IdList = [],
  now: string,
): Recommendation {
  invariant(findingIds.length > 0, 'FINDING_REQUIRED', '建议必须关联至少一个问题');
  return {
    id: newId('recommendation'),
    schemaVersion: '1.0.0',
    createdAt: now,
    findingIds,
    rootCauseHypothesisIds,
    description,
    expectedOutcomes,
    verificationPlanIds,
    confidence: 'MEDIUM',
    limitations: [],
  };
}

/** 创建验证计划。 */
export function createVerificationPlan(
  findingIds: IdList,
  recommendationIds: IdList,
  baselineRunId: string,
  definition: EvaluationDefinition,
  requiredRuleIds: IdList,
  requiredMetricIds: IdList,
  acceptanceCriteria: string[],
  allowCaveats: boolean,
  now: string,
): VerificationPlan {
  invariant(findingIds.length > 0, 'FINDING_REQUIRED', '验证计划必须关联至少一个问题');
  invariant(acceptanceCriteria.length > 0, 'CRITERIA_REQUIRED', '验证计划必须声明验收条件');
  invariant(
    requiredRuleIds.length > 0 || requiredMetricIds.length > 0,
    'REQUIREMENT_REQUIRED',
    '验证计划必须声明所需规则或指标',
  );
  const base: Omit<VerificationPlan, 'criteriaDigest'> = {
    id: newId('vplan'),
    schemaVersion: '1.0.0',
    createdAt: now,
    findingIds,
    recommendationIds,
    baselineRunId,
    definition,
    requiredRuleIds,
    requiredMetricIds,
    acceptanceCriteria,
    allowCaveats,
  };
  const criteriaDigest = digest({
    findingIds,
    requiredRuleIds,
    requiredMetricIds,
    acceptanceCriteria,
  });
  return { ...base, criteriaDigest };
}

/** 创建验证结果。 */
export function createVerificationResult(
  planId: string,
  criteriaDigest: string,
  findingIds: IdList,
  comparability: Comparability,
  now: string,
  runId?: string,
  evidenceIds: IdList = [],
): VerificationResult {
  const base: Record<string, unknown> = {
    id: newId('vresult'),
    schemaVersion: '1.0.0',
    createdAt: now,
    planId,
    criteriaDigest,
    findingIds,
    status: 'PENDING',
    comparability,
    evidenceIds,
    reason: '验证已创建',
  };
  if (runId) base.runId = runId;
  return base as unknown as VerificationResult;
}

/** 更新验证结果状态。 */
export function transitionVerification(
  result: VerificationResult,
  to: VerificationResult['status'],
  reason: string,
  now: string,
  runId?: string,
  evidenceIds?: IdList,
): VerificationResult {
  const updated: VerificationResult = {
    ...result,
    status: to,
    reason,
  };
  if (to === 'RUNNING') updated.startedAt = now;
  if (['PASSED', 'FAILED', 'INCONCLUSIVE', 'BLOCKED', 'CANCELLED'].includes(to)) {
    updated.endedAt = now;
  }
  if (runId) updated.runId = runId;
  if (evidenceIds) updated.evidenceIds = evidenceIds;
  return updated;
}

/** 跨运行 Finding 历史管理。 */
export interface FindingHistory {
  findings: Finding[];
  addRunFindings(runId: string, findings: Finding[]): void;
  findByKey(deduplicationKey: string): Finding | undefined;
  findByRun(runId: string): Finding[];
  merge(newFindings: Finding[]): { merged: Finding[]; created: Finding[]; updated: Finding[] };
}

export function createFindingHistory(initial: Finding[] = []): FindingHistory {
  const findings = [...initial];

  return {
    get findings() {
      return findings;
    },

    addRunFindings(runId, newFindings) {
      for (const finding of newFindings) {
        if (!finding.evaluationRunIds.includes(runId)) {
          finding.evaluationRunIds = [...finding.evaluationRunIds, runId];
        }
      }
    },

    findByKey(key) {
      return findings.find((f) => f.deduplicationKey === key);
    },

    findByRun(runId) {
      return findings.filter((f) => f.evaluationRunIds.includes(runId));
    },

    merge(newFindings) {
      const created: Finding[] = [];
      const updated: Finding[] = [];
      const byKey = new Map(findings.map((f) => [f.deduplicationKey, f]));

      for (const finding of newFindings) {
        const existing = byKey.get(finding.deduplicationKey);
        if (!existing) {
          byKey.set(finding.deduplicationKey, finding);
          created.push(finding);
        } else {
          const merged: Finding = {
            ...existing,
            diagnosticSignalIds: [
              ...new Set([...existing.diagnosticSignalIds, ...finding.diagnosticSignalIds]),
            ],
            evidenceLinks: [...existing.evidenceLinks, ...finding.evidenceLinks],
            evaluationRunIds: [
              ...new Set([...existing.evaluationRunIds, ...finding.evaluationRunIds]),
            ],
            lastObservedAt:
              finding.lastObservedAt > existing.lastObservedAt
                ? finding.lastObservedAt
                : existing.lastObservedAt,
            revision: existing.revision + 1,
          };
          byKey.set(finding.deduplicationKey, merged);
          updated.push(merged);
        }
      }

      findings.length = 0;
      findings.push(...byKey.values());
      return { merged: findings, created, updated };
    },
  };
}
