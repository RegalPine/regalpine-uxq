import { assertTimeOrder, digest, invariant } from '@uxq/core';
import type { RunBundle, EvaluationSnapshot, Evidence, ReportDocument } from './generated.js';
import {
  assertLocalInvariants,
  assertMetricValue,
  isEvidenceUsable,
  requireRef,
  unique,
} from './invariants.js';

/** 已过 Schema 的集合完整性；不从缺失引用猜测关联，也不将文件存在视为证据有效。 */
export function assertRunIntegrity(bundle: RunBundle): void {
  const { run, plan, definition, context } = bundle;
  assertLocalInvariants('EvaluationDefinition', definition);
  assertLocalInvariants('EvaluationPlan', plan);
  assertLocalInvariants('EvaluationRun', run);
  assertLocalInvariants('ExecutionProfile', context.profile);
  invariant(
    run.planId === plan.id && run.planDigest === plan.planDigest,
    'RUN_PLAN',
    '运行与计划引用不一致',
  );
  invariant(
    run.definitionId === definition.id &&
      plan.definitionId === definition.id &&
      plan.definitionVersion === definition.definitionVersion,
    'RUN_DEFINITION',
    '运行定义或版本不一致',
  );
  invariant(
    plan.definitionDigest === digest(definition),
    'DEFINITION_DIGEST',
    '定义快照摘要不匹配',
  );
  invariant(
    context.runId === run.id && run.contextId === context.id,
    'RUN_CONTEXT',
    '运行上下文归属不一致',
  );
  invariant(
    digest(context.profile) === digest(plan.profile),
    'CONTEXT_PROFILE',
    '执行上下文与固定计划配置不同',
  );
  const planned = unique(plan.steps, (entry) => entry.stepId, '计划步骤');
  const steps = unique(bundle.steps, (entry) => entry.stepId, '执行步骤');
  const attempts = unique(bundle.attempts, (entry) => entry.id, '执行尝试');
  const evidence = unique(bundle.evidence, (entry) => entry.id, '证据');
  const observations = unique(bundle.observations, (entry) => entry.id, '观测');
  const metrics = unique(bundle.metrics, (entry) => entry.id, '指标结果');
  unique(bundle.metrics, (entry) => entry.metricId, '运行指标');
  unique(bundle.rules, (entry) => entry.ruleId, '运行规则');
  const metricDefinitions = unique(definition.metrics, (entry) => entry.id, '指标定义');
  const ruleDefinitions = unique(definition.rules, (entry) => entry.id, '规则定义');
  const taskDefinitions = unique(definition.tasks, (entry) => entry.id, '任务定义');
  const allRecords = [
    run,
    context,
    ...bundle.steps,
    ...bundle.attempts,
    ...bundle.events,
    ...bundle.tasks,
    ...bundle.observations,
    ...bundle.metrics,
    ...bundle.rules,
    ...bundle.evidence,
  ];
  unique(allRecords, (record) => record.id, '运行对象');
  for (const record of allRecords)
    if ('runId' in record)
      invariant(record.runId === run.id, 'CROSS_RUN_REFERENCE', '运行集合包含其他 Run 的对象');
  for (const entry of plan.metricVersions) {
    const metric = requireRef(metricDefinitions, entry.id, '固定指标版本');
    invariant(
      metric.version === entry.version &&
        metric.implementationVersion === entry.implementationVersion,
      'METRIC_VERSION',
      '计划指标定义或实现版本不匹配',
    );
  }
  invariant(
    plan.metricVersions.length === definition.metrics.length &&
      plan.ruleVersions.length === definition.rules.length,
    'PLAN_VERSION_COVERAGE',
    '计划必须固定全部定义版本',
  );
  for (const entry of plan.ruleVersions)
    invariant(
      requireRef(ruleDefinitions, entry.id, '固定规则版本').version === entry.version,
      'RULE_VERSION',
      '计划规则版本不匹配',
    );
  invariant(
    plan.policyVersion.id === definition.policy.id &&
      plan.policyVersion.version === definition.policy.version,
    'POLICY_VERSION',
    '计划评分策略版本不匹配',
  );

  for (const step of steps.values()) {
    assertLocalInvariants('ExecutionStep', step);
    const declaration = requireRef(planned, step.stepId, '实际步骤');
    const ownAttempts = step.attemptIds.map((id) => requireRef(attempts, id, '步骤尝试'));
    for (const [index, attempt] of ownAttempts.entries())
      invariant(
        attempt.stepId === step.stepId && attempt.number === index + 1,
        'ATTEMPT_SEQUENCE',
        '尝试归属或序号不连续',
      );
    const maxAttempts = declaration.retryPolicy?.maxAttempts ?? plan.profile.maxAttempts;
    invariant(ownAttempts.length <= maxAttempts, 'ATTEMPT_LIMIT', '尝试数量超过固定策略');
    if (step.status === 'PASSED') {
      invariant(
        ownAttempts.at(-1)?.status === 'PASSED',
        'STEP_ATTEMPT_OUTCOME',
        '通过步骤必须具有通过的最终尝试',
      );
      for (const parent of declaration.dependsOn)
        invariant(
          requireRef(steps, parent, '成功步骤依赖').status === 'PASSED',
          'FAILED_DEPENDENCY',
          '依赖未通过不能完成下游步骤',
        );
    }
    if (step.status !== 'PENDING' && step.startedAt)
      invariant(
        bundle.events.some((event) => event.type === 'StepStarted' && event.stepId === step.stepId),
        'MISSING_STEP_EVENT',
        '已开始步骤必须有开始事件',
      );
  }
  for (const attempt of attempts.values()) {
    assertLocalInvariants('StepAttempt', attempt);
    invariant(
      requireRef(steps, attempt.stepId, '尝试步骤').attemptIds.includes(attempt.id),
      'ORPHAN_ATTEMPT',
      '尝试未被步骤登记',
    );
    for (const id of attempt.evidenceIds) requireRef(evidence, id, '尝试证据');
  }
  for (const [index, event] of bundle.events.entries()) {
    invariant(event.sequence === index + 1, 'EVENT_SEQUENCE', '事件序号必须从 1 连续递增');
    assertTimeOrder(event.occurredAt, event.recordedAt);
    if (event.stepId) requireRef(planned, event.stepId, '事件步骤');
    if (event.attemptId)
      invariant(
        requireRef(attempts, event.attemptId, '事件尝试').stepId === event.stepId,
        'EVENT_ATTEMPT',
        '事件的步骤与尝试归属不一致',
      );
  }
  for (const task of bundle.tasks) {
    assertLocalInvariants('TaskExecution', task);
    invariant(
      requireRef(taskDefinitions, task.taskId, '任务执行定义').version === task.taskVersion,
      'TASK_VERSION',
      '任务执行版本与定义不同',
    );
    invariant(
      requireRef(attempts, task.attemptId, '任务尝试').stepId === task.stepId,
      'TASK_ATTEMPT',
      '任务与尝试归属不同',
    );
    for (const id of task.evidenceIds) requireRef(evidence, id, '任务证据');
  }
  for (const observation of observations.values()) {
    assertLocalInvariants('RawObservation', observation);
    invariant(
      requireRef(attempts, observation.attemptId, '观测尝试').stepId === observation.stepId,
      'OBSERVATION_ATTEMPT',
      '观测与尝试归属不同',
    );
    for (const id of observation.evidenceIds) requireRef(evidence, id, '观测证据');
  }
  for (const item of evidence.values()) {
    assertLocalInvariants('Evidence', item);
    if (item.stepId) requireRef(planned, item.stepId, '证据步骤');
    if (item.attemptId)
      invariant(
        requireRef(attempts, item.attemptId, '证据尝试').stepId === item.stepId,
        'EVIDENCE_ATTEMPT',
        '证据与尝试归属不同',
      );
    for (const id of item.derivedFromIds) requireRef(evidence, id, '派生证据来源');
  }
  assertEvidenceGraph(evidence);
  for (const result of metrics.values()) {
    assertLocalInvariants('MetricResult', result);
    const metric = requireRef(metricDefinitions, result.metricId, '结果指标');
    invariant(
      result.metricVersion === metric.version &&
        result.implementationVersion === metric.implementationVersion &&
        result.dimensionId === metric.dimensionId,
      'METRIC_PROVENANCE',
      '指标结果定义、实现或维度不匹配',
    );
    for (const id of result.observationIds) requireRef(observations, id, '指标输入观测');
    for (const id of result.evidenceIds) requireRef(evidence, id, '指标证据');
    if (result.status === 'MEASURED') {
      assertMetricValue(metric, result.value);
      invariant(metric.unit === result.unit, 'METRIC_UNIT', '指标结果单位与定义不一致');
      if (metric.evidenceRequired)
        invariant(
          result.evidenceIds.length > 0 &&
            result.evidenceIds.every((id) =>
              isEvidenceUsable(evidence.get(id)!, result.measuredAt),
            ),
          'INVALID_MEASUREMENT_EVIDENCE',
          '测量所需证据不足、失效或未经授权',
        );
    }
  }
  for (const result of bundle.rules) {
    invariant(
      requireRef(ruleDefinitions, result.ruleId, '规则结果').version === result.ruleVersion,
      'RULE_PROVENANCE',
      '规则结果版本不匹配',
    );
    for (const id of result.inputMetricResultIds) requireRef(metrics, id, '规则输入指标');
    for (const id of result.evidenceIds) requireRef(evidence, id, '规则证据');
  }
  const terminal = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(run.status);
  if (terminal) {
    invariant(
      [...steps.values()].every((step) => !['PENDING', 'RUNNING'].includes(step.status)) &&
        [...attempts.values()].every((attempt) => attempt.status !== 'RUNNING'),
      'UNSETTLED_EXECUTION',
      '运行结束前必须结算步骤和尝试',
    );
    const eventType = {
      COMPLETED: 'RunCompleted',
      PARTIAL: 'RunPartiallyCompleted',
      FAILED: 'RunFailed',
      CANCELLED: 'RunCancelled',
    }[run.status as 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'CANCELLED'];
    invariant(
      bundle.events.some((event) => event.type === eventType),
      'MISSING_RUN_TERMINAL_EVENT',
      '终态运行缺少结束事件',
    );
    if (run.status === 'COMPLETED') {
      invariant(steps.size === planned.size, 'MISSING_STEPS', '完成运行缺少计划步骤');
      for (const declaration of planned.values())
        if (declaration.required)
          invariant(
            requireRef(steps, declaration.stepId, '必需步骤').status === 'PASSED',
            'INCOMPLETE_REQUIRED_STEPS',
            '必需步骤未通过不能声明运行完成',
          );
    }
  }
}

function assertEvidenceGraph(evidence: ReadonlyMap<string, Evidence>): void {
  const active = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string): void => {
    invariant(!active.has(id), 'EVIDENCE_CYCLE', '证据派生关系存在循环');
    if (done.has(id)) return;
    active.add(id);
    for (const parent of requireRef(evidence, id, '证据').derivedFromIds) visit(parent);
    active.delete(id);
    done.add(id);
  };
  for (const id of evidence.keys()) visit(id);
}

export function assertEvaluationIntegrity(bundle: RunBundle, snapshot: EvaluationSnapshot): void {
  const { evaluation, policy, scores, dimensions, findings, signals } = snapshot;
  assertLocalInvariants('EvaluationSnapshot', snapshot);
  invariant(
    ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(bundle.run.status) &&
      bundle.run.executionCommitted,
    'SETTLEMENT_RUN_STATE',
    '仅可结算已结束且执行产物已提交的运行',
  );
  invariant(
    evaluation.runId === bundle.run.id &&
      evaluation.policyId === policy.id &&
      evaluation.policyVersion === policy.version &&
      evaluation.policyDigest === digest(policy),
    'EVALUATION_PROVENANCE',
    '评价归属或评分策略不匹配',
  );
  const metrics = unique(bundle.metrics, (item) => item.id, '指标结果');
  const ruleResults = unique(bundle.rules, (item) => item.id, '规则结果');
  const evidence = unique(bundle.evidence, (item) => item.id, '证据');
  const metricDefinitions = unique(bundle.definition.metrics, (item) => item.id, '指标定义');
  const scoreIndex = unique(scores, (item) => item.id, '指标评分');
  unique(scores, (item) => item.metricResultId, '重复评分输入');
  unique(dimensions, (item) => item.dimensionId, '维度结果');
  const dimensionIndex = unique(dimensions, (item) => item.id, '维度结果');
  const findingIndex = unique(findings, (item) => item.id, '问题');
  const signalIndex = unique(signals, (item) => item.id, '信号');
  for (const id of evaluation.metricResultIds) requireRef(metrics, id, '评价指标');
  for (const id of evaluation.ruleResultIds) requireRef(ruleResults, id, '评价规则');
  for (const id of evaluation.evidenceIds) requireRef(evidence, id, '评价证据');
  for (const [ids, index, label] of [
    [evaluation.scoreResultIds, scoreIndex, '评分'],
    [evaluation.dimensionResultIds, dimensionIndex, '维度'],
    [evaluation.findingIds, findingIndex, '问题'],
  ] as const) {
    invariant(
      ids.length === index.size && ids.every((id) => index.has(id)),
      'EVALUATION_RESULT_SET',
      `评价${label}引用与实际快照不一致`,
    );
  }
  for (const score of scores) {
    const metricResult = requireRef(metrics, score.metricResultId, '评分输入');
    invariant(
      score.runId === bundle.run.id &&
        score.metricId === metricResult.metricId &&
        score.policyId === policy.id &&
        score.policyVersion === policy.version,
      'SCORE_PROVENANCE',
      '评分输入归属、策略或指标不一致',
    );
    if (score.status === 'SCORED')
      invariant(
        metricResult.status === 'MEASURED',
        'UNMEASURED_SCORE',
        '非测量输入不能生成有效分数',
      );
    const binding = policy.bindings.find((entry) => entry.metricId === score.metricId);
    invariant(
      binding && binding.weight === score.weight,
      'SCORE_BINDING',
      '评分必须关联策略中的显式权重',
    );
  }
  for (const dimension of dimensions) {
    invariant(dimension.runId === bundle.run.id, 'CROSS_RUN_REFERENCE', '维度结果属于其他运行');
    for (const id of dimension.scoreResultIds)
      invariant(
        requireRef(metricDefinitions, requireRef(scoreIndex, id, '维度评分').metricId, '维度指标')
          .dimensionId === dimension.dimensionId,
        'DIMENSION_INPUT',
        '评分归入错误维度',
      );
  }
  for (const signal of signals) {
    invariant(signal.runId === bundle.run.id, 'CROSS_RUN_REFERENCE', '诊断信号属于其他运行');
    for (const id of signal.sourceResultIds)
      invariant(
        metrics.has(id) ||
          ruleResults.has(id) ||
          bundle.observations.some((entry) => entry.id === id),
        'SIGNAL_SOURCE',
        '诊断信号来源不存在',
      );
    for (const id of signal.evidenceIds) requireRef(evidence, id, '信号证据');
  }
  for (const finding of findings) {
    invariant(
      finding.evaluationRunIds.includes(bundle.run.id),
      'FINDING_RUN',
      '问题快照未关联当次运行',
    );
    for (const id of finding.diagnosticSignalIds) requireRef(signalIndex, id, '问题信号');
    for (const link of finding.evidenceLinks) requireRef(evidence, link.evidenceId, '问题证据');
    if (finding.type === 'CONFIRMED_DEFECT')
      invariant(
        finding.evidenceLinks.some(
          (link) =>
            link.relation === 'SUPPORTS' &&
            isEvidenceUsable(evidence.get(link.evidenceId)!, evaluation.createdAt),
        ),
        'FINDING_VALID_EVIDENCE',
        '确认缺陷必须有有效且允许用于评价的支持证据',
      );
  }
  const selected = evaluation.metricResultIds.map((id) => metrics.get(id)!);
  invariant(
    evaluation.coverage.planned === bundle.definition.metrics.length &&
      evaluation.coverage.applicable ===
        bundle.definition.metrics.length -
          selected.filter((item) => item.status === 'NOT_APPLICABLE').length &&
      evaluation.coverage.measured ===
        selected.filter((item) => item.status === 'MEASURED').length &&
      evaluation.coverage.scored === scores.filter((item) => item.status === 'SCORED').length,
    'EVALUATION_COVERAGE',
    '评价覆盖计数与真实输入不一致',
  );
  if (evaluation.overallOutcome === 'PASS') {
    invariant(
      evaluation.coverage.ratio !== null && evaluation.coverage.ratio >= policy.minimumCoverage,
      'PASS_COVERAGE',
      '覆盖不足不能判为通过',
    );
    invariant(
      policy.allowPartial || evaluation.evaluationStatus === 'COMPLETE',
      'PASS_COMPLETENESS',
      '未声明部分评价策略时不可部分通过',
    );
  }
}

export function assertReportIntegrity(report: ReportDocument): void {
  assertLocalInvariants('EvaluationResult', report.evaluation);
  invariant(
    report.provenance.runId === report.evaluation.runId &&
      report.provenance.evaluationResultId === report.evaluation.id &&
      report.provenance.policyId === report.evaluation.policyId &&
      report.provenance.policyVersion === report.evaluation.policyVersion,
    'REPORT_PROVENANCE',
    '报告来源与评价不一致',
  );
  const referenced = new Set(report.evaluation.metricResultIds);
  invariant(
    report.metrics.length === referenced.size &&
      report.metrics.every(
        (metric) => referenced.has(metric.id) && metric.runId === report.provenance.runId,
      ),
    'REPORT_METRICS',
    '报告指标与结算来源不一致',
  );
  for (const finding of report.findings) assertLocalInvariants('Finding', finding);
  const evidence = unique(report.evidenceIndex, (item) => item.id, '报告证据');
  for (const finding of report.findings)
    for (const link of finding.evidenceLinks) requireRef(evidence, link.evidenceId, '报告问题证据');
}
