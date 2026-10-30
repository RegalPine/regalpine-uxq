import { invariant, newId, systemClock } from '@uxq/core';
import type { Clock } from '@uxq/core';
import { assertDefinition, assertPlanSteps, isEvidenceUsable, parseContract, validateEvaluation } from '@uxq/contracts';
import type { EvaluationDefinition, EvaluationSnapshot, ScoringPolicy, RawObservation,
  Evidence, RunBundle, PlannedStep, ScoreResult, MetricResult, TaskExecution } from '@uxq/contracts';
import { executeActions, PlaywrightBrowserAdapter } from '@uxq/browser';
import type { BrowserAdapter, BrowserSession, CaptureOptions } from '@uxq/browser';
import { calculateMetric } from '@uxq/metrics';
import { evaluateRule } from '@uxq/rules';
import { aggregateDimension, scoreMetric, settleEvaluation } from '@uxq/scoring';
import { generateSignals, createFinding, deduplicateFindings } from '@uxq/diagnostic';
import type { ExecutionContext, StepExecutor } from './engine.js';
import type { StoredRun, RunStore } from './storage.js';

function browserStep(step: PlannedStep): boolean {
  return step.kind === 'BROWSER_SETUP' || step.kind === 'PAGE_NAVIGATION' ||
    step.kind === 'TASK_EXECUTION' || Boolean(step.action);
}
function sessionKey(step: PlannedStep): string { return step.sessionId ?? step.taskId ?? 'default'; }

/** 将定义中的每类步骤接入真实执行；资源由调用方在 finally 中关闭。 */
export function createEvaluationExecutor(definition: EvaluationDefinition, store: RunStore,
  adapter: BrowserAdapter = new PlaywrightBrowserAdapter(), clock: Clock = systemClock): {
    executeStep: StepExecutor; close: () => Promise<void>;
  } {
  assertDefinition(definition);
  assertPlanSteps(definition.steps.map((step) => browserStep(step)
    ? { ...step, sessionId: sessionKey(step) } : step) as EvaluationDefinition['steps']);
  const sessions = new Map<string, Promise<BrowserSession>>();
  const metricProducers = new Map<string, string>();
  const ruleProducers = new Map<string, string>();
  for (const step of definition.steps) {
    for (const [ids, registry] of [[step.metricIds ?? [], metricProducers], [step.ruleIds ?? [], ruleProducers]] as const) {
      for (const id of ids) { invariant(!registry.has(id), 'DUPLICATE_PRODUCER', `结果 ${id} 存在多个生产步骤`); registry.set(id, step.stepId); }
    }
  }
  let totalArtifactBytes = 0;
  const getSession = async (step: PlannedStep, ctx: ExecutionContext): Promise<BrowserSession> => {
    ctx.signal.throwIfAborted();
    const key = sessionKey(step);
    if (!sessions.has(key)) {
      invariant(sessions.size < ctx.profile.maxPages, 'MAX_PAGES', '浏览器会话超过 maxPages 配额');
      sessions.set(key, adapter.launch(ctx.profile));
    }
    const session = await sessions.get(key)!;
    if (ctx.signal.aborted) { await session.close(); ctx.signal.throwIfAborted(); }
    return session;
  };
  const executeStep: StepExecutor = async (step, ctx) => {
    ctx.signal.throwIfAborted();
    if (step.kind === 'OBSERVATION_CAPTURE' && step.observation) {
      const input = step.observation;
      const now = clock.now();
      const ev: Evidence = {
        id: newId('evidence'), schemaVersion: '1.0.0', createdAt: now, runId: ctx.runId,
        stepId: ctx.stepId, attemptId: ctx.attemptId, sourceCategory: input.source,
        materialType: 'OBSERVATION', sourceMethod: 'definition.observation',
        lifecycle: 'VALIDATED', validity: 'VALID', summary: `定义文件输入：${input.key}`,
        content: { key: input.key, value: input.value }, derivedFromIds: [], observedAt: input.observedAt,
        privacy: { classification: 'INTERNAL', redacted: false, allowedPurposes: ['EVALUATION', 'VERIFICATION'],
          retentionUntil: new Date(Date.parse(now) + 30 * 86400000).toISOString() },
        limitations: ['由定义文件提供的观测；不是本次真实浏览器采集，也不证明外部数据真实性'],
      };
      invariant(input.source !== 'E4', 'RESEARCH_CONSENT_REQUIRED',
        '定义内观测不支持研究同意记录；请使用具备 consentRef 的研究证据导入流程');
      const observation: RawObservation = { ...input, id: newId('obs'), schemaVersion: '1.0.0',
        createdAt: now, runId: ctx.runId, stepId: ctx.stepId, attemptId: ctx.attemptId, evidenceIds: [ev.id] };
      return { status: 'PASSED', observations: [observation], evidence: [ev] };
    }
    if (browserStep(step)) {
      const task = step.taskId ? definition.tasks.find((item) => item.id === step.taskId) : undefined;
      if (task?.sideEffect === 'WRITE') invariant(task.authorized && ctx.profile.allowSideEffects,
        'SIDE_EFFECT_DENIED', '写入任务同时需要任务授权与 allowSideEffects');
      const session = await getSession(step, ctx);
      const abort = () => { void session.close().catch(() => undefined); };
      ctx.signal.addEventListener('abort', abort, { once: true });
      const options: CaptureOptions = { entityId: definition.target.id, scenarioId: task?.scenarioId ?? step.stepId,
        signal: ctx.signal, saveArtifact: async (path, data) => {
          invariant(data.byteLength <= ctx.profile.maxArtifactBytes &&
            totalArtifactBytes + data.byteLength <= ctx.profile.maxTotalArtifactBytes, 'ARTIFACT_LIMIT', '证据超过大小配额');
          totalArtifactBytes += data.byteLength;
          return store.appendArtifact(ctx.runId, path, data);
        } };
      try {
        const startedAt = clock.now();
        const result = await executeActions(session, task?.actions ?? (step.action ? [step.action] : []),
          ctx.runId, ctx.stepId, ctx.attemptId, clock, options);
        const version = session.browserVersion ? { browserVersion: session.browserVersion } : {};
        if (!task) { session.assertHealthy?.(); return { status: 'PASSED', ...result, ...version }; }
        invariant(session.checkCondition, 'CONDITIONS_UNSUPPORTED', '浏览器适配器不支持任务条件核验');
        const business = await Promise.all(task.businessConditions.map((condition) => session.checkCondition!(condition)));
        const feedback = await Promise.all(task.feedbackConditions.map((condition) => session.checkCondition!(condition)));
        const businessSuccess = business.every(Boolean);
        const feedbackSuccess = feedback.every(Boolean);
        const endedAt = clock.now();
        const taskExecution: TaskExecution = {
          id: newId('task'), schemaVersion: '1.0.0', createdAt: startedAt,
          runId: ctx.runId, stepId: ctx.stepId, attemptId: ctx.attemptId, taskId: task.id, taskVersion: task.version,
          outcome: businessSuccess && feedbackSuccess ? 'SUCCESS' : 'FAILURE', businessSuccess, feedbackSuccess,
          startedAt, endedAt, durationMs: Date.parse(endedAt) - Date.parse(startedAt), method: 'AUTOMATED',
          evidenceIds: result.evidence.map((item) => item.id), errors: [], limitations: ['自动化任务不代表真实用户成功率'],
        };
        session.assertHealthy?.();
        return { status: businessSuccess && feedbackSuccess ? 'PASSED' : 'FAILED', ...result, taskExecution, ...version,
          ...(!businessSuccess || !feedbackSuccess ? { error: { code: 'TASK_CONDITION_FAILED', message: '任务业务或反馈条件未满足', category: 'EXECUTION' as const } } : {}) };
      } finally { ctx.signal.removeEventListener('abort', abort); }
    }
    if (step.kind === 'METRIC_CALCULATION') {
      const refs = new Set(step.inputRefs.filter((ref) => ref.contract === 'RawObservation').map((ref) => ref.stepId));
      const observations = ctx.observations.filter((item) => refs.has(item.stepId));
      return { status: 'PASSED', metrics: step.metricIds!.map((id) => calculateMetric(
        definition.metrics.find((metric) => metric.id === id)!, observations,
        { runId: ctx.runId, clock, signal: ctx.signal }, ctx.evidence)) };
    }
    if (step.kind === 'RULE_EVALUATION') {
      const refs = new Set(step.inputRefs.filter((ref) => ref.contract === 'MetricResult').map((ref) => ref.stepId));
      const metrics = new Map((ctx.metrics ?? []).filter((item) => refs.has(metricProducers.get(item.metricId)!)).map((metric) => [metric.metricId, metric]));
      return { status: 'PASSED', rules: step.ruleIds!.map((id) => evaluateRule(
        definition.rules.find((rule) => rule.id === id)!, metrics, ctx.runId, clock.now())) };
    }
    if (step.kind === 'SCORING') {
      const refs = new Set(step.inputRefs.filter((ref) => ref.contract === 'MetricResult').map((ref) => ref.stepId));
      return { status: 'PASSED', scores: scoreInputs(definition.policy,
        (ctx.metrics ?? []).filter((metric) => refs.has(metricProducers.get(metric.metricId)!)), ctx.runId, clock.now()) };
    }
    if (step.kind === 'EVIDENCE_VALIDATION') {
      for (const evidence of ctx.evidence) {
        parseContract('Evidence', evidence);
        invariant(isEvidenceUsable(evidence, clock.now()), 'INVALID_EVIDENCE', '证据尚未有效或已过期');
        if (evidence.artifact) await store.readArtifact(ctx.runId, evidence.artifact);
      }
      return { status: 'PASSED' };
    }
    if (step.kind === 'ENVIRONMENT_CHECK') { parseContract('ExecutionProfile', ctx.profile); return { status: 'PASSED' }; }
    if (step.kind === 'RESULT_FINALIZATION') {
      for (const metric of ctx.metrics ?? []) parseContract('MetricResult', metric);
      for (const rule of ctx.rules ?? []) parseContract('RuleResult', rule);
      return { status: 'PASSED' };
    }
    throw new Error(`尚不支持步骤：${step.kind}`);
  };
  return { executeStep, close: async () => {
    await Promise.all([...sessions.values()].map(async (session) => {
      try { await (await session).close(); } catch { /* 启动失败已由运行步骤记录。 */ }
    }));
    sessions.clear();
  } };
}

function scoreInputs(policy: ScoringPolicy, metrics: readonly MetricResult[], runId: string, now: string): ScoreResult[] {
  return policy.bindings.flatMap((binding) => {
    const metric = metrics.find((item) => item.metricId === binding.metricId);
    return metric ? [scoreMetric(policy, binding, metric, runId, now)] : [];
  });
}

export function runBundle(stored: StoredRun): RunBundle {
  return { schemaVersion: '1.0.0', definition: stored.definition, plan: stored.plan, run: stored.run,
    context: stored.context, steps: stored.steps, attempts: stored.attempts, events: stored.events,
    tasks: stored.tasks, observations: stored.observations, metrics: stored.metrics, rules: stored.rules, evidence: stored.evidence };
}

/** 旧运行没有快照时只给出缺失说明，不重新测量或伪造覆盖率。 */
export function latestSnapshot(stored: StoredRun): EvaluationSnapshot {
  const snapshot = stored.snapshots?.at(-1);
  if (snapshot) return snapshot;
  const policy = stored.definition.policy;
  const applicable = stored.definition.metrics.length - stored.metrics.filter((metric) => metric.status === 'NOT_APPLICABLE').length;
  const measured = stored.metrics.filter((metric) => metric.status === 'MEASURED').length;
  const evaluation = {
    ...settleEvaluation(policy, [], stored.rules, stored.metrics, stored.run.id, systemClock.now()),
    coverage: { planned: stored.definition.metrics.length, applicable, measured, scored: 0, ratio: applicable ? measured / applicable : null },
    overallScore: null, overallOutcome: 'NOT_RATED' as const, evaluationStatus: 'INSUFFICIENT_EVIDENCE' as const,
    limitations: ['运行没有持久化评价快照；请重新评价或显式 settle'],
  };
  return { evaluation, policy, scores: [], dimensions: [], signals: [], findings: [] };
}

/** 最终结算补齐未执行结果并保存不可变快照；重结算使用同一批实测指标。 */
export async function persistEvaluation(stored: StoredRun, store: RunStore,
  policy: ScoringPolicy = stored.definition.policy, clock: Clock = systemClock): Promise<EvaluationSnapshot> {
  assertDefinition({ ...stored.definition, policy });
  invariant(stored.run.executionCommitted && ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(stored.run.status),
    'SETTLEMENT_RUN_STATE', '仅可结算已结束且执行事实已提交的运行');
  const now = clock.now();
  for (const definition of stored.definition.metrics) {
    if (!stored.metrics.some((metric) => metric.metricId === definition.id)) {
      const missing = calculateMetric(definition, [], { runId: stored.run.id, clock, signal: new AbortController().signal });
      stored.metrics.push(missing);
    }
  }
  for (const rule of stored.definition.rules) {
    if (!stored.rules.some((result) => result.ruleId === rule.id)) {
      stored.rules.push(evaluateRule(rule, new Map(), stored.run.id, now));
    }
  }
  // 历史测量保持不变；新结算必须按当前用途、时点及工件摘要复核支持证据。
  const unusableMetrics = new Set<string>();
  for (const metric of stored.metrics) {
    if (metric.status !== 'MEASURED' || !stored.definition.metrics.find((item) => item.id === metric.metricId)?.evidenceRequired) continue;
    if (!metric.evidenceIds.length) unusableMetrics.add(metric.id);
    for (const id of metric.evidenceIds) {
      const evidence = stored.evidence.find((item) => item.id === id);
      if (!evidence || !isEvidenceUsable(evidence, now)) { unusableMetrics.add(metric.id); continue; }
      if (evidence.artifact) {
        try { await store.readArtifact(stored.run.id, evidence.artifact); }
        catch { unusableMetrics.add(metric.id); }
      }
    }
  }
  const scores = scoreInputs(policy, stored.metrics, stored.run.id, now).map((score): ScoreResult => {
    if (score.status !== 'SCORED' || !unusableMetrics.has(score.metricResultId)) return score;
    const { value: _value, ...base } = score;
    return { ...base, status: 'INSUFFICIENT_INPUTS', reason: '本次结算所需证据已失效、过期或工件不可验证' };
  });
  const dimensions = policy.dimensions.map((dimension) => aggregateDimension(policy, dimension.dimensionId,
    scores.filter((score) => stored.definition.metrics.find((metric) => metric.id === score.metricId)?.dimensionId === dimension.dimensionId), stored.run.id, now));
  const evaluation = settleEvaluation(policy, dimensions, stored.rules, stored.metrics, stored.run.id, now);
  evaluation.scoreResultIds = scores.map((score) => score.id);
  evaluation.coverage.scored = scores.filter((score) => score.status === 'SCORED').length;
  const signals = generateSignals(stored.rules, stored.metrics, stored.run.id, now);
  for (const signal of signals) {
    signal.entityId = stored.definition.target.id;
    const rule = stored.definition.rules.find((item) => item.id === signal.problemKey);
    if (rule?.finding) Object.assign(signal, rule.finding);
    if (signal.type === 'CONFIRMED_DEFECT' && !signal.evidenceIds.some((id) => stored.evidence.some((item) => item.id === id && isEvidenceUsable(item, now)))) {
      signal.type = 'POTENTIAL_DEFECT'; signal.confidence = 'LOW';
    }
  }
  const findings = deduplicateFindings(signals.map((signal) => createFinding(signal, stored.run.id, now, stored.evidence)));
  evaluation.findingIds = findings.map((finding) => finding.id);
  for (const finding of findings.filter((item) => item.type === 'CONFIRMED_DEFECT' && policy.riskSeverities.includes(item.severity))) {
    evaluation.constraints.push({ kind: 'FINDING_SEVERITY', sourceIds: [finding.id], reason: `存在 ${finding.severity} 级别确认问题` });
    evaluation.overallOutcome = 'FAIL';
  }
  if (unusableMetrics.size) {
    evaluation.evaluationStatus = 'INSUFFICIENT_EVIDENCE'; evaluation.overallScore = null; evaluation.overallOutcome = 'INCONCLUSIVE';
    evaluation.limitations.push('本次结算存在已失效、过期或不可验证的必需证据；测量覆盖率仅反映历史采集');
  }
  if (stored.run.status !== 'COMPLETED') {
    evaluation.evaluationStatus = 'EXECUTION_FAILED'; evaluation.overallScore = null; evaluation.overallOutcome = 'INCONCLUSIVE';
    evaluation.limitations.push('执行步骤未全部成功，不能出具总体评分');
  }
  evaluation.limitations = [...new Set([...evaluation.limitations, ...stored.definition.limitations,
    ...stored.evidence.flatMap((item) => item.limitations)])];
  const snapshot: EvaluationSnapshot = { evaluation, policy, scores, dimensions, signals, findings };
  parseContract('EvaluationSnapshot', snapshot);
  if (stored.run.executionCommitted) validateEvaluation(runBundle(stored), snapshot);
  const artifact = await store.appendArtifact(stored.run.id, `evaluations/${evaluation.id}.json`,
    new TextEncoder().encode(JSON.stringify(snapshot, null, 2)));
  (stored.snapshots ??= []).push(snapshot);
  stored.evaluations.push(evaluation);
  stored.manifest.evaluations.push({ evaluationResultId: evaluation.id, policyId: policy.id,
    policyVersion: policy.version, createdAt: now, artifact: { ...artifact, mediaType: 'application/json' } });
  stored.manifest.revision++;
  await store.saveRun(stored);
  return snapshot;
}
