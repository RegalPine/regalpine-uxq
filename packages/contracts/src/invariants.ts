import { assertTimeOrder, digest, invariant, parseTimestamp } from '@uxq/core';
import type {
  ContractMap,
  Coverage,
  EvaluationDefinition,
  EvaluationPlan,
  EvaluationRun,
  ExecutionProfile,
  ExecutionStep,
  StepAttempt,
  TaskDefinition,
  TaskExecution,
  MetricDefinition,
  MetricResult,
  ScoringPolicy,
  ScoreBinding,
  Evidence,
  Finding,
  RuleExpression,
  VerificationPlan,
  VerificationResult,
  ObservationInput,
  RunManifest,
  EvaluationResult,
  EvaluationSnapshot,
  SuccessCondition,
  DimensionResult,
  RuleDefinition,
  RunContext,
} from './generated.js';

export function unique<T>(
  items: readonly T[],
  key: (item: T) => string,
  label: string,
): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    invariant(!result.has(id), 'DUPLICATE_ID', `${label} 存在重复标识：${id}`);
    result.set(id, item);
  }
  return result;
}

export function requireRef<T>(map: ReadonlyMap<string, T>, id: string, label: string): T {
  const value = map.get(id);
  invariant(value !== undefined, 'MISSING_REFERENCE', `${label} 引用不存在：${id}`);
  return value;
}

export function planDigest(plan: Omit<EvaluationPlan, 'planDigest'> | EvaluationPlan): string {
  const { id: _id, createdAt: _createdAt, ...semantic } = plan;
  const { planDigest: _digest, ...content } = semantic as typeof semantic & { planDigest?: string };
  return digest(content);
}

export function verificationDigest(
  plan: Omit<VerificationPlan, 'criteriaDigest'> | VerificationPlan,
): string {
  const { id: _id, createdAt: _createdAt, ...semantic } = plan;
  const { criteriaDigest: _digest, ...content } = semantic as typeof semantic & {
    criteriaDigest?: string;
  };
  return digest(content);
}

export function ruleMetricIds(expression: RuleExpression): string[] {
  if ('children' in expression) return [...new Set(expression.children.flatMap(ruleMetricIds))];
  if ('child' in expression) return ruleMetricIds(expression.child);
  if (expression.op === 'BETWEEN')
    invariant(expression.lower <= expression.upper, 'RULE_RANGE', '规则区间下界不能超过上界');
  return [expression.metricId];
}

export function assertProfile(profile: ExecutionProfile): void {
  invariant(
    profile.initialDelayMs <= profile.maxDelayMs,
    'RETRY_DELAY',
    '初始重试延迟不能超过最大延迟',
  );
  invariant(
    profile.maxArtifactBytes <= profile.maxTotalArtifactBytes,
    'ARTIFACT_BUDGET',
    '单工件预算不能超过总预算',
  );
  for (const origin of profile.allowedOrigins) {
    const url = new URL(origin);
    invariant(
      ['http:', 'https:'].includes(url.protocol) &&
        !url.username &&
        !url.password &&
        url.origin === origin,
      'INVALID_ORIGIN',
      '授权网络必须是无凭据、无路径的 HTTP(S) origin',
    );
  }
}

export function assertMetricDefinition(metric: MetricDefinition): void {
  if (metric.minimum !== undefined && metric.maximum !== undefined)
    invariant(metric.minimum <= metric.maximum, 'METRIC_RANGE', '指标值域上下界无效');
  if (metric.valueKind === 'CATEGORY')
    invariant((metric.categories?.length ?? 0) > 0, 'CATEGORY_DOMAIN', '分类指标必须声明允许类别');
  if (metric.valueKind === 'STRUCTURED') {
    invariant((metric.structure?.length ?? 0) > 0, 'STRUCTURED_DOMAIN', '结构指标必须声明字段契约');
    unique(metric.structure!, (field) => field.key, '结构指标字段');
    for (const field of metric.structure!)
      if (field.kind === 'CATEGORY')
        invariant((field.categories?.length ?? 0) > 0, 'CATEGORY_DOMAIN', '分类字段必须声明类别');
  }
  if (metric.aggregation === 'RATIO')
    invariant(
      metric.valueKind === 'NUMBER' && metric.numeratorKey && metric.denominatorKey,
      'RATIO_INPUTS',
      '比率指标必须声明数值输出、分子与分母来源',
    );
  if (['MEAN', 'MEDIAN', 'P95', 'SUM', 'COUNT', 'SUCCESS_RATE'].includes(metric.aggregation))
    invariant(metric.valueKind === 'NUMBER', 'AGGREGATE_VALUE_KIND', '数值聚合必须输出数值');
  if (metric.metricType === 'PROXY')
    invariant(metric.limitations.length > 0, 'PROXY_LIMITATION', '代理指标必须披露限制');
}

export function assertMetricValue(metric: MetricDefinition, value: unknown): void {
  if (metric.valueKind === 'NUMBER') {
    invariant(
      typeof value === 'number' && Number.isFinite(value),
      'METRIC_VALUE_KIND',
      '指标需要有限数值',
    );
    if (metric.minimum !== undefined)
      invariant(value >= metric.minimum, 'METRIC_RANGE', '测量值低于声明下界');
    if (metric.maximum !== undefined)
      invariant(value <= metric.maximum, 'METRIC_RANGE', '测量值超过声明上界');
  } else if (metric.valueKind === 'BOOLEAN')
    invariant(typeof value === 'boolean', 'METRIC_VALUE_KIND', '指标需要布尔值');
  else if (metric.valueKind === 'CATEGORY')
    invariant(
      typeof value === 'string' && metric.categories?.includes(value),
      'METRIC_VALUE_KIND',
      '指标类别不在声明范围内',
    );
  else {
    invariant(
      value !== null && typeof value === 'object' && !Array.isArray(value),
      'METRIC_VALUE_KIND',
      '结构指标需要对象',
    );
    const object = value as Record<string, unknown>;
    const fields = unique(metric.structure ?? [], (field) => field.key, '结构指标字段');
    for (const key of Object.keys(object))
      invariant(fields.has(key), 'METRIC_STRUCTURE', '结构指标包含未声明字段');
    for (const field of fields.values()) {
      if (!(field.key in object)) {
        invariant(!field.required, 'METRIC_STRUCTURE', '结构指标缺少必填字段');
        continue;
      }
      const entry = object[field.key];
      invariant(
        field.kind === 'NUMBER'
          ? typeof entry === 'number' && Number.isFinite(entry)
          : field.kind === 'BOOLEAN'
            ? typeof entry === 'boolean'
            : typeof entry === 'string' && field.categories?.includes(entry),
        'METRIC_STRUCTURE',
        '结构指标字段类型或类别无效',
      );
    }
  }
}

function assertBinding(binding: ScoreBinding): void {
  if (binding.normalization !== 'BOOLEAN')
    invariant(
      binding.min !== undefined && binding.max !== undefined && binding.min < binding.max,
      'SCORE_RANGE',
      '数值评分必须声明递增 min/max',
    );
  if (binding.normalization === 'TARGET_RANGE')
    invariant(
      binding.targetMin !== undefined &&
        binding.targetMax !== undefined &&
        binding.min! <= binding.targetMin &&
        binding.targetMin <= binding.targetMax &&
        binding.targetMax <= binding.max!,
      'SCORE_TARGET_RANGE',
      '目标范围必须位于评分范围内',
    );
}

export function assertPolicy(policy: ScoringPolicy): void {
  unique(policy.bindings, (item) => item.metricId, '评分绑定');
  unique(policy.dimensions, (item) => item.dimensionId, '维度权重');
  const groups = policy.bindings.filter((item) => item.countingGroup !== undefined);
  unique(groups, (item) => item.countingGroup!, '计分去重组');
  for (const binding of policy.bindings) assertBinding(binding);
  if (policy.mode === 'SCORE')
    invariant(
      policy.bindings.length > 0 && policy.dimensions.length > 0,
      'EMPTY_SCORING_POLICY',
      '评分模式必须声明绑定及维度权重',
    );
  else
    invariant(
      policy.bindings.length === 0 &&
        policy.dimensions.length === 0 &&
        policy.overallThreshold === undefined,
      'DESCRIPTIVE_POLICY',
      '描述模式不允许数值评分配置',
    );
}

function assertCondition(condition: SuccessCondition): void {
  if (['TEXT', 'VISIBLE', 'ATTRIBUTE'].includes(condition.kind))
    invariant(condition.selector, 'CONDITION_SELECTOR', '界面成功条件必须有定位器');
  if (condition.kind === 'VISIBLE')
    invariant(
      typeof condition.equals === 'boolean',
      'CONDITION_TYPE',
      '可见性条件必须与布尔值比较',
    );
  if (condition.kind === 'ATTRIBUTE')
    invariant(condition.attribute, 'CONDITION_ATTRIBUTE', '属性条件必须声明属性名');
  if (condition.kind === 'URL')
    invariant(typeof condition.equals === 'string', 'CONDITION_TYPE', 'URL 条件必须声明字符串');
  if (condition.kind === 'BUSINESS_JSON')
    invariant(
      condition.url && condition.field,
      'BUSINESS_CONDITION',
      '业务成功条件必须声明接口及字段',
    );
}

export function assertTask(task: TaskDefinition): void {
  for (const condition of [...task.businessConditions, ...task.feedbackConditions])
    assertCondition(condition);
  if (task.sideEffect === 'WRITE')
    invariant(
      task.authorized && task.testDataScope,
      'SIDE_EFFECT_AUTHORIZATION',
      '副作用任务必须声明授权和测试数据范围',
    );
}

/** 返回每一步的传递依赖，供预检和调度共用；不是执行器。 */
export function assertPlanSteps(steps: EvaluationPlan['steps']): Map<string, Set<string>> {
  const index = unique(steps, (step) => step.stepId, '步骤');
  const visiting = new Set<string>();
  const ancestors = new Map<string, Set<string>>();
  const visit = (id: string): Set<string> => {
    invariant(!visiting.has(id), 'DAG_CYCLE', '计划存在循环依赖');
    const existing = ancestors.get(id);
    if (existing) return existing;
    const step = requireRef(index, id, '步骤依赖');
    visiting.add(id);
    const result = new Set<string>();
    for (const dependency of step.dependsOn) {
      result.add(dependency);
      for (const transitive of visit(dependency)) result.add(transitive);
    }
    visiting.delete(id);
    ancestors.set(id, result);
    return result;
  };
  for (const step of steps) visit(step.stepId);
  for (const step of steps) {
    for (const input of step.inputRefs) {
      const producer = requireRef(index, input.stepId, '输入生产者');
      invariant(
        ancestors.get(step.stepId)!.has(input.stepId),
        'INPUT_UNREACHABLE',
        '输入必须来自依赖祖先步骤',
      );
      invariant(
        producer.outputContracts.includes(input.contract),
        'OUTPUT_CONTRACT_MISMATCH',
        '生产者输出契约与输入引用不兼容',
      );
    }
    if (step.kind === 'TASK_EXECUTION')
      invariant(step.taskId, 'STEP_TASK', '任务执行步骤必须引用任务');
    if (step.kind === 'PAGE_NAVIGATION')
      invariant(step.action?.action === 'NAVIGATE', 'STEP_NAVIGATION', '导航步骤必须声明 NAVIGATE');
    if (step.kind === 'OBSERVATION_CAPTURE')
      invariant(
        Boolean(step.action) !== Boolean(step.observation),
        'STEP_OBSERVATION',
        '采集步骤必须且只能声明动作或离线观测',
      );
    if (step.kind === 'METRIC_CALCULATION')
      invariant((step.metricIds?.length ?? 0) > 0, 'STEP_METRICS', '指标步骤必须引用指标');
    if (step.kind === 'RULE_EVALUATION')
      invariant((step.ruleIds?.length ?? 0) > 0, 'STEP_RULES', '规则步骤必须引用规则');
    if (step.retryPolicy)
      invariant(
        step.retryPolicy.initialDelayMs <= step.retryPolicy.maxDelayMs,
        'RETRY_DELAY',
        '重试延迟上下界无效',
      );
    if (step.sessionId)
      for (const other of steps) {
        if (step.stepId !== other.stepId && step.sessionId === other.sessionId)
          invariant(
            ancestors.get(step.stepId)!.has(other.stepId) ||
              ancestors.get(other.stepId)!.has(step.stepId),
            'SHARED_SESSION_RACE',
            '共享浏览器会话的步骤必须有显式顺序',
          );
      }
  }
  return ancestors;
}

export function assertDefinition(definition: EvaluationDefinition): void {
  const metrics = unique(definition.metrics, (metric) => metric.id, '指标定义');
  const rules = unique(definition.rules, (rule) => rule.id, '规则定义');
  const tasks = unique(definition.tasks, (task) => task.id, '任务定义');
  assertPlanSteps(definition.steps);
  assertPolicy(definition.policy);
  for (const metric of metrics.values()) {
    assertMetricDefinition(metric);
    invariant(
      definition.dimensions.includes(metric.dimensionId),
      'METRIC_DIMENSION',
      '指标维度不在评价范围内',
    );
  }
  for (const rule of rules.values())
    for (const id of ruleMetricIds(rule.expression)) requireRef(metrics, id, '规则指标');
  for (const task of tasks.values()) assertTask(task);
  for (const id of definition.scope.taskIds) requireRef(tasks, id, '范围任务');
  for (const step of definition.steps) {
    for (const id of step.metricIds ?? []) requireRef(metrics, id, '步骤指标');
    for (const id of step.ruleIds ?? []) requireRef(rules, id, '步骤规则');
    if (step.taskId) {
      const task = requireRef(tasks, step.taskId, '步骤任务');
      if (
        task.sideEffect === 'WRITE' &&
        (step.retryPolicy?.maxAttempts ?? definition.profile?.maxAttempts ?? 1) > 1
      )
        invariant(task.idempotencyKey, 'UNSAFE_RETRY', '副作用任务重试必须具有幂等键');
    }
  }
  const dimensionWeights = new Set(
    definition.policy.dimensions.map((dimension) => dimension.dimensionId),
  );
  for (const binding of definition.policy.bindings) {
    const metric = requireRef(metrics, binding.metricId, '评分指标');
    invariant(
      dimensionWeights.has(metric.dimensionId),
      'MISSING_DIMENSION_WEIGHT',
      '评分指标必须有显式维度权重',
    );
    invariant(
      metric.direction !== 'DESCRIPTIVE_ONLY',
      'DESCRIPTIVE_METRIC_SCORE',
      '描述性指标不可评分',
    );
    if (metric.direction === 'CONTEXT_DEPENDENT')
      invariant(binding.contextRationale, 'CONTEXT_SCORE', '上下文相关指标评分必须声明依据');
    invariant(
      binding.normalization === 'BOOLEAN'
        ? metric.valueKind === 'BOOLEAN'
        : metric.valueKind === 'NUMBER',
      'SCORING_VALUE_KIND',
      '评分映射与指标值类型不兼容',
    );
  }
  for (const id of definition.policy.criticalRuleIds) requireRef(rules, id, '关键规则');
}

function assertRun(run: EvaluationRun): void {
  invariant(run.sourceRunId !== run.id, 'RUN_SOURCE_CYCLE', '重跑不能引用自身');
  const terminal = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(run.status);
  if (terminal)
    invariant(run.endedAt && run.endReason, 'RUN_TERMINAL_FIELDS', '终态运行必须有结束时间和依据');
  else
    invariant(
      run.endedAt === undefined && run.endReason === undefined && !run.executionCommitted,
      'RUN_ACTIVE_FIELDS',
      '活动运行不得携带终态字段或完成清单',
    );
  if (['RUNNING', 'COMPLETED', 'PARTIAL'].includes(run.status))
    invariant(run.startedAt, 'RUN_START_TIME', '已开始运行必须有开始时间');
  if (['CREATED', 'PREPARING'].includes(run.status))
    invariant(run.startedAt === undefined, 'RUN_PREMATURE_START', '运行开始前不得伪造开始时间');
  if (['COMPLETED', 'PARTIAL'].includes(run.status))
    invariant(run.executionCommitted, 'RUN_NOT_COMMITTED', '完成或部分完成必须提交执行产物');
  if (run.startedAt) assertTimeOrder(run.createdAt, run.startedAt);
  if (run.endedAt) assertTimeOrder(run.startedAt ?? run.createdAt, run.endedAt);
}

function assertStep(step: ExecutionStep): void {
  if (step.status === 'PENDING')
    invariant(
      !step.startedAt && !step.endedAt && step.attemptIds.length === 0,
      'STEP_PENDING_FIELDS',
      '待执行步骤不应带执行历史',
    );
  if (['RUNNING', 'PASSED', 'FAILED', 'ERROR'].includes(step.status))
    invariant(
      step.startedAt && step.attemptIds.length > 0,
      'STEP_START_FIELDS',
      '执行步骤必须有开始时间和尝试',
    );
  if (step.status === 'RUNNING')
    invariant(!step.endedAt, 'STEP_ACTIVE_END', '活动步骤不能有结束时间');
  if (!['PENDING', 'RUNNING'].includes(step.status))
    invariant(step.endedAt, 'STEP_END_TIME', '终态步骤必须有结束时间');
  if (['FAILED', 'SKIPPED', 'BLOCKED', 'ERROR'].includes(step.status))
    invariant(step.reason, 'STEP_REASON', '非通过步骤必须记录原因');
  if (step.startedAt) assertTimeOrder(step.createdAt, step.startedAt);
  if (step.endedAt) assertTimeOrder(step.startedAt ?? step.createdAt, step.endedAt);
}

function assertAttempt(attempt: StepAttempt): void {
  assertTimeOrder(attempt.createdAt, attempt.startedAt);
  if (attempt.status === 'RUNNING')
    invariant(
      attempt.endedAt === undefined &&
        attempt.durationMs === undefined &&
        attempt.error === undefined,
      'ATTEMPT_ACTIVE_FIELDS',
      '活动尝试不能携带终态数据',
    );
  else {
    invariant(
      attempt.endedAt && attempt.durationMs !== undefined,
      'ATTEMPT_END_FIELDS',
      '结束尝试必须有结束时间与单调耗时',
    );
    assertTimeOrder(attempt.startedAt, attempt.endedAt);
  }
  if (attempt.status === 'ERROR')
    invariant(attempt.error, 'ATTEMPT_ERROR', '错误尝试必须提供错误记录');
  if (attempt.number > 1)
    invariant(attempt.retryReason, 'ATTEMPT_RETRY_REASON', '重试必须保留原因');
}

function assertTaskExecution(task: TaskExecution): void {
  assertTimeOrder(task.startedAt, task.endedAt);
  if (task.outcome === 'SUCCESS')
    invariant(
      task.businessSuccess === true && task.feedbackSuccess === true && task.errors.length === 0,
      'TASK_SUCCESS_PROOF',
      '任务成功必须同时验证业务与界面反馈',
    );
  if (task.outcome === 'PARTIAL_SUCCESS')
    invariant(
      (task.businessSuccess === true) !== (task.feedbackSuccess === true),
      'TASK_PARTIAL_PROOF',
      '部分成功需要一个成功条件组未满足',
    );
  if (task.outcome === 'FAILURE')
    invariant(
      task.businessSuccess === false || task.feedbackSuccess === false,
      'TASK_FAILURE_PROOF',
      '任务失败必须有有效的未满足条件',
    );
  if (task.method === 'AUTOMATED')
    invariant(
      task.limitations.length > 0,
      'AUTOMATION_LIMITATION',
      '自动化任务必须说明不能代表真实用户成功',
    );
}

export function assertCoverage(coverage: Coverage): void {
  invariant(
    coverage.scored <= coverage.measured &&
      coverage.measured <= coverage.applicable &&
      coverage.applicable <= coverage.planned,
    'COVERAGE_COUNTS',
    '覆盖计数关系无效',
  );
  const expected = coverage.applicable === 0 ? null : coverage.measured / coverage.applicable;
  invariant(
    expected === null
      ? coverage.ratio === null
      : coverage.ratio !== null && Math.abs(coverage.ratio - expected) < 1e-10,
    'COVERAGE_RATIO',
    '覆盖率必须由已测量/适用计数计算；零分母为 null',
  );
}

export function isEvidenceUsable(
  evidence: Evidence,
  at: string,
  purpose: 'EVALUATION' | 'VERIFICATION' | 'SHARING' | 'RESEARCH' = 'EVALUATION',
): boolean {
  parseTimestamp(at);
  return (
    evidence.validity === 'VALID' &&
    evidence.lifecycle !== 'RETIRED' &&
    evidence.privacy.allowedPurposes.includes(purpose) &&
    Date.parse(evidence.privacy.retentionUntil) >= Date.parse(at) &&
    (purpose !== 'SHARING' ||
      evidence.privacy.classification !== 'SENSITIVE' ||
      evidence.privacy.redacted)
  );
}

function assertEvidence(evidence: Evidence): void {
  invariant(
    !(evidence.sourceCategory === 'E5' && evidence.materialType === 'EXTERNAL_CONSTRAINT'),
    'E5_AMBIGUOUS',
    '外部约束不能自动映射为间接推断证据',
  );
  if (evidence.lifecycle !== 'RETIRED')
    invariant(
      evidence.artifact !== undefined || evidence.content !== undefined,
      'EVIDENCE_CONTENT',
      '活动证据必须引用工件或内联事实',
    );
  if (evidence.lifecycle === 'DERIVED')
    invariant(evidence.derivedFromIds.length > 0, 'DERIVED_SOURCE', '派生证据必须保留来源');
  invariant(
    !evidence.derivedFromIds.includes(evidence.id),
    'EVIDENCE_SELF_REFERENCE',
    '派生证据不能引用自身',
  );
  if (evidence.lifecycle === 'VALIDATED')
    invariant(
      evidence.validity !== 'UNVERIFIED',
      'EVIDENCE_VALIDATION',
      '已完成验证的证据不能仍为未验证',
    );
  if (evidence.sourceCategory === 'E4' || evidence.privacy.classification === 'SENSITIVE')
    invariant(evidence.privacy.consentRef, 'CONSENT_REQUIRED', '用户研究或敏感证据必须有授权引用');
  assertTimeOrder(evidence.createdAt, evidence.privacy.retentionUntil);
}

function assertFinding(finding: Finding): void {
  assertTimeOrder(finding.firstObservedAt, finding.lastObservedAt);
  invariant(
    finding.duplicateOfFindingId !== finding.id,
    'FINDING_SELF_DUPLICATE',
    '问题不能是自身的重复项',
  );
  invariant(finding.evaluationRunIds.length > 0, 'FINDING_RUN', '问题必须关联运行');
  if (finding.type === 'CONFIRMED_DEFECT')
    invariant(
      finding.evidenceLinks.some((link) => link.relation === 'SUPPORTS'),
      'FINDING_EVIDENCE',
      '确认缺陷必须有支持证据',
    );
  if (finding.lifecycle === 'VERIFIED')
    invariant(
      finding.verificationResultIds.length > 0,
      'FINDING_VERIFICATION',
      '已验证问题必须关联有效复测记录',
    );
  for (const link of finding.evidenceLinks)
    invariant(
      link.subjectType === 'Finding' && link.subjectId === finding.id,
      'EVIDENCE_SUBJECT',
      '问题证据关联必须指向自身',
    );
}

function assertEvaluation(evaluation: EvaluationResult): void {
  assertCoverage(evaluation.coverage);
  if (['INSUFFICIENT_EVIDENCE', 'EXECUTION_FAILED'].includes(evaluation.evaluationStatus))
    invariant(
      evaluation.overallOutcome !== 'PASS',
      'UNPROVEN_PASS',
      '证据不足或执行失败不能判为通过',
    );
  if (evaluation.evaluationStatus === 'EXECUTION_FAILED')
    invariant(evaluation.overallScore === null, 'FAILED_SCORE', '执行失败不能生成总体分数');
  if (evaluation.coverage.scored === 0)
    invariant(evaluation.overallScore === null, 'EMPTY_SCORE', '无评分输入不能产生总体分数');
  if (
    evaluation.constraints.some((constraint) =>
      ['CRITICAL_RULE', 'FINDING_SEVERITY'].includes(constraint.kind),
    )
  )
    invariant(evaluation.overallOutcome !== 'PASS', 'RISK_PASS', '关键风险不能被总体通过掩盖');
}

function assertVerification(result: VerificationResult): void {
  if (result.startedAt) assertTimeOrder(result.createdAt, result.startedAt);
  if (result.endedAt) assertTimeOrder(result.startedAt ?? result.createdAt, result.endedAt);
  if (result.status === 'PASSED')
    invariant(
      result.runId && result.evidenceIds.length > 0 && result.comparability !== 'NOT_COMPARABLE',
      'VERIFICATION_PROOF',
      '验证通过必须有运行、证据与可比条件',
    );
  if (['PENDING', 'RUNNING'].includes(result.status))
    invariant(!result.endedAt, 'VERIFICATION_ACTIVE_END', '活动验证不能包含结束时间');
  else invariant(result.endedAt, 'VERIFICATION_END', '结束验证必须有结束时间');
  if (result.status === 'RUNNING')
    invariant(result.startedAt, 'VERIFICATION_START', '运行中的验证必须记录开始时间');
}

export function assertLocalInvariants(name: keyof ContractMap, value: unknown): void {
  switch (name) {
    case 'ExecutionProfile':
      assertProfile(value as ExecutionProfile);
      break;
    case 'MetricDefinition':
      assertMetricDefinition(value as MetricDefinition);
      break;
    case 'ScoringPolicy':
      assertPolicy(value as ScoringPolicy);
      break;
    case 'ScoreBinding':
      assertBinding(value as ScoreBinding);
      break;
    case 'DimensionResult':
      assertCoverage((value as DimensionResult).coverage);
      break;
    case 'RuleDefinition':
      ruleMetricIds((value as RuleDefinition).expression);
      break;
    case 'RunContext':
      assertProfile((value as RunContext).profile);
      break;
    case 'RuleExpression':
      ruleMetricIds(value as RuleExpression);
      break;
    case 'TaskDefinition':
      assertTask(value as TaskDefinition);
      break;
    case 'SuccessCondition':
      assertCondition(value as SuccessCondition);
      break;
    case 'EvaluationDefinition':
      assertDefinition(value as EvaluationDefinition);
      break;
    case 'EvaluationPlan': {
      const plan = value as EvaluationPlan;
      assertProfile(plan.profile);
      assertPlanSteps(plan.steps);
      unique(plan.metricVersions, (ref) => ref.id, '计划指标版本');
      unique(plan.ruleVersions, (ref) => ref.id, '计划规则版本');
      invariant(plan.planDigest === planDigest(plan), 'PLAN_DIGEST', '计划摘要不匹配');
      break;
    }
    case 'EvaluationRun':
      assertRun(value as EvaluationRun);
      break;
    case 'ExecutionStep':
      assertStep(value as ExecutionStep);
      break;
    case 'StepAttempt':
      assertAttempt(value as StepAttempt);
      break;
    case 'TaskExecution':
      assertTaskExecution(value as TaskExecution);
      break;
    case 'RawObservation':
    case 'ObservationInput': {
      const observation = value as ObservationInput;
      if (observation.excluded)
        invariant(observation.exclusionReason, 'EXCLUSION_REASON', '样本排除必须说明原因');
      break;
    }
    case 'MetricResult': {
      const result = value as MetricResult;
      if (result.status === 'MEASURED')
        invariant(result.sampleCount > 0, 'EMPTY_MEASUREMENT', '无样本不能宣称已测量');
      break;
    }
    case 'Coverage':
      assertCoverage(value as Coverage);
      break;
    case 'Evidence':
      assertEvidence(value as Evidence);
      break;
    case 'Finding':
      assertFinding(value as Finding);
      break;
    case 'EvaluationResult':
      assertEvaluation(value as EvaluationResult);
      break;
    case 'EvaluationSnapshot': {
      const snapshot = value as EvaluationSnapshot;
      assertEvaluation(snapshot.evaluation);
      assertPolicy(snapshot.policy);
      for (const dimension of snapshot.dimensions) assertCoverage(dimension.coverage);
      for (const finding of snapshot.findings) assertFinding(finding);
      break;
    }
    case 'VerificationPlan': {
      const plan = value as VerificationPlan;
      assertDefinition(plan.definition);
      invariant(
        plan.findingIds.length > 0 &&
          plan.acceptanceCriteria.length > 0 &&
          (plan.requiredMetricIds.length > 0 || plan.requiredRuleIds.length > 0),
        'EMPTY_VERIFICATION',
        '验证计划必须明确目标和验收条件',
      );
      invariant(
        plan.criteriaDigest === verificationDigest(plan),
        'VERIFICATION_DIGEST',
        '验证条件摘要不匹配',
      );
      break;
    }
    case 'VerificationResult':
      assertVerification(value as VerificationResult);
      break;
    case 'RunManifest': {
      const manifest = value as RunManifest;
      unique(manifest.files, (file) => file.path, '工件路径');
      unique(manifest.evaluations, (entry) => entry.evaluationResultId, '结算索引');
      unique(manifest.reports, (entry) => entry.id, '报告索引');
      if (!manifest.executionCommitted)
        invariant(
          manifest.evaluations.length === 0 && manifest.reports.length === 0,
          'UNCOMMITTED_MANIFEST',
          '未提交执行产物不能声明结算或报告',
        );
      else
        invariant(
          manifest.files.length > 0 &&
            ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(manifest.runStatus),
          'EMPTY_MANIFEST_COMMIT',
          '完成清单必须登记执行工件并处于终态',
        );
      for (const report of manifest.reports)
        invariant(
          report.runId === manifest.runId &&
            manifest.evaluations.some(
              (entry) => entry.evaluationResultId === report.evaluationResultId,
            ),
          'REPORT_MANIFEST',
          '报告索引必须引用本运行已提交的结算',
        );
      break;
    }
  }
}
