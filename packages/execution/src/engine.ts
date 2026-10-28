import { invariant, newId, systemClock, digest, sha256 } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type {
  EvaluationDefinition,
  EvaluationPlan,
  EvaluationRun,
  ExecutionProfile,
  ExecutionStep,
  ExecutionEvent,
  StepAttempt,
  PlannedStep,
  RunContext,
  TaskExecution,
  RawObservation,
  MetricResult,
  RuleResult,
  Evidence,
  RunStatus,
  StepStatus,
  ErrorRecord,
} from '@uxq/contracts';
import { transitionRun } from '@uxq/contracts';
import type { RunStore, StoredRun } from './storage.js';
import { compilePlan } from './compiler.js';

export interface ExecutionPorts {
  store: RunStore;
  clock?: Clock;
  executeStep?: StepExecutor;
}

export type StepExecutor = (
  step: PlannedStep,
  context: ExecutionContext,
) => Promise<StepExecutionResult>;

export interface ExecutionContext {
  runId: string;
  stepId: string;
  attemptId: string;
  profile: ExecutionProfile;
  observations: RawObservation[];
  evidence: Evidence[];
  signal: AbortSignal;
}

export interface StepExecutionResult {
  status: 'PASSED' | 'FAILED' | 'ERROR';
  observations?: RawObservation[];
  evidence?: Evidence[];
  metrics?: MetricResult[];
  rules?: RuleResult[];
  taskExecution?: TaskExecution;
  error?: { code: string; message: string; category: ErrorRecord['category'] };
}

interface SchedulerState {
  runId: string;
  steps: Map<string, ExecutionStep>;
  stepDefs: Map<string, PlannedStep>;
  cancelled: boolean;
  cancelSignal: AbortController;
}

const defaultExecutor: StepExecutor = async () => ({ status: 'PASSED' });

export async function createRun(
  definition: EvaluationDefinition,
  profileOverrides?: Partial<ExecutionProfile>,
  ports?: ExecutionPorts,
): Promise<{ plan: EvaluationPlan; run: EvaluationRun; context: RunContext }> {
  const clock = ports?.clock ?? systemClock;
  const input: PlanInput = { definition };
  if (profileOverrides) input.profileOverrides = profileOverrides;
  const plan = compilePlan(input, clock);

  const run: EvaluationRun = {
    id: newId('run'),
    schemaVersion: '1.0.0',
    createdAt: clock.now(),
    planId: plan.id,
    planDigest: plan.planDigest,
    definitionId: definition.id,
    status: 'CREATED',
    revision: 0,
    contextId: newId('ctx'),
    executionCommitted: false,
    limitations: [],
  };

  const context: RunContext = {
    id: run.contextId,
    schemaVersion: '1.0.0',
    createdAt: clock.now(),
    runId: run.id,
    engineVersion: '0.1.0',
    nodeVersion: process.version,
    platform: process.platform,
    profile: plan.profile,
    configSources: { maxConcurrency: 'DEFAULT', runTimeoutMs: 'DEFAULT' },
    environmentFingerprint: digest({ platform: process.platform, node: process.version }),
    sampleDescription: definition.name,
    limitations: [],
  };

  if (ports?.store) {
    await ports.store.createRun(definition, plan, run, context);
    await recordEvent(ports.store, run.id, clock, {
      type: 'RunCreated',
      runId: run.id,
    });
  }

  return { plan, run, context };
}

interface PlanInput {
  definition: EvaluationDefinition;
  profileOverrides?: Partial<ExecutionProfile>;
}

export async function executeRun(runId: string, ports: ExecutionPorts): Promise<StoredRun> {
  const clock = ports.clock ?? systemClock;
  const store = ports.store;
  const executor = ports.executeStep ?? defaultExecutor;

  let stored = await store.loadRun(runId);

  // PREPARING
  stored.run = transitionRun(stored.run, {
    to: 'PREPARING',
    expectedRevision: stored.run.revision,
    at: clock.now(),
    reason: '开始准备执行环境',
  });
  await store.saveRun(stored);
  await recordEvent(store, runId, clock, { type: 'RunPreparationStarted', runId });

  // Initialize step states
  const stepStates = new Map<string, ExecutionStep>();
  for (const planned of stored.plan.steps) {
    const step: ExecutionStep = {
      id: newId('step'),
      schemaVersion: '1.0.0',
      createdAt: clock.now(),
      runId,
      stepId: planned.stepId,
      status: 'PENDING',
      revision: 0,
      attemptIds: [],
      outputIds: [],
    };
    stepStates.set(planned.stepId, step);
  }
  stored.steps = [...stepStates.values()];
  await store.saveRun(stored);

  // RUNNING
  stored.run = transitionRun(stored.run, {
    to: 'RUNNING',
    expectedRevision: stored.run.revision,
    at: clock.now(),
    reason: '环境准备完成，开始执行步骤',
    preflightPassed: true,
  });
  await store.saveRun(stored);
  await recordEvent(store, runId, clock, { type: 'RunStarted', runId });

  const schedulerState: SchedulerState = {
    runId,
    steps: stepStates,
    stepDefs: new Map(stored.plan.steps.map((s) => [s.stepId, s])),
    cancelled: false,
    cancelSignal: new AbortController(),
  };

  await scheduleDAG(schedulerState, stored, executor, store, clock, runId);

  // Determine final run status
  stored = await store.loadRun(runId);
  const finalStatus = determineRunStatus(stored.steps);

  stored.run = transitionRun(stored.run, {
    to: finalStatus,
    expectedRevision: stored.run.revision,
    at: clock.now(),
    reason: `所有步骤已完成，最终状态：${finalStatus}`,
    executionCommitted: finalStatus === 'COMPLETED' || finalStatus === 'PARTIAL',
  });
  await store.saveRun(stored);

  const eventType: ExecutionEvent['type'] =
    finalStatus === 'COMPLETED'
      ? 'RunCompleted'
      : finalStatus === 'PARTIAL'
        ? 'RunPartiallyCompleted'
        : finalStatus === 'FAILED'
          ? 'RunFailed'
          : 'RunCancelled';
  await recordEvent(store, runId, clock, { type: eventType, runId });

  await store.updateManifest(runId, (m) => {
    const committed = finalStatus === 'COMPLETED' || finalStatus === 'PARTIAL';
    const files =
      committed && m.files.length === 0
        ? [
            {
              path: 'events.jsonl',
              digest: sha256('events'),
              bytes: 0,
              mediaType: 'application/x-jsonl',
            },
          ]
        : m.files;
    return {
      ...m,
      revision: m.revision + 1,
      runStatus: finalStatus,
      executionCommitted: committed,
      files,
    };
  });

  return store.loadRun(runId);
}

async function scheduleDAG(
  state: SchedulerState,
  stored: StoredRun,
  executor: StepExecutor,
  store: RunStore,
  clock: Clock,
  runId: string,
): Promise<void> {
  const maxConcurrency = stored.plan.profile.maxConcurrency;
  const running = new Set<string>();
  const completed = new Set<string>();
  const failed = new Set<string>();
  const blocked = new Set<string>();

  while (completed.size + failed.size + blocked.size < state.stepDefs.size) {
    if (state.cancelled) break;

    const ready: PlannedStep[] = [];
    for (const planned of stored.plan.steps) {
      const step = state.steps.get(planned.stepId)!;
      if (step.status !== 'PENDING') continue;
      if (running.has(planned.stepId)) continue;

      const deps = planned.dependsOn;
      const allDepsCompleted = deps.every((d) => completed.has(d));
      const anyDepFailed = deps.some((d) => failed.has(d));
      const anyDepBlocked = deps.some((d) => blocked.has(d));

      if (anyDepFailed || anyDepBlocked) {
        const reason = anyDepFailed ? '依赖步骤失败' : '依赖步骤被阻塞';
        step.status = 'BLOCKED';
        step.reason = reason;
        step.endedAt = clock.now();
        blocked.add(planned.stepId);
        await store.saveRun(stored);
        await recordEvent(store, runId, clock, {
          type: 'StepBlocked',
          runId,
          stepId: planned.stepId,
          reason,
        });
        continue;
      }

      if (allDepsCompleted && running.size < maxConcurrency) {
        ready.push(planned);
      }
    }

    if (ready.length === 0 && running.size === 0) break;

    const batch = ready.slice(0, maxConcurrency - running.size);
    const promises = batch.map(async (planned) => {
      const step = state.steps.get(planned.stepId)!;
      running.add(planned.stepId);

      const attemptId = newId('attempt');
      step.status = 'RUNNING';
      step.startedAt = clock.now();
      step.attemptIds = [attemptId];
      await store.saveRun(stored);

      await recordEvent(store, runId, clock, {
        type: 'StepStarted',
        runId,
        stepId: planned.stepId,
      });

      const attempt: StepAttempt = {
        id: attemptId,
        schemaVersion: '1.0.0',
        createdAt: clock.now(),
        runId,
        stepId: planned.stepId,
        number: 1,
        status: 'RUNNING',
        startedAt: clock.now(),
        evidenceIds: [],
        outputIds: [],
      };
      stored.attempts.push(attempt);

      const context: ExecutionContext = {
        runId,
        stepId: planned.stepId,
        attemptId,
        profile: stored.plan.profile,
        observations: stored.observations,
        evidence: stored.evidence,
        signal: state.cancelSignal.signal,
      };

      let result: StepExecutionResult;
      try {
        const timeoutMs = planned.timeoutMs ?? stored.plan.profile.stepTimeoutMs;
        result = await withTimeout(executor(planned, context), timeoutMs);
      } catch (error) {
        result = {
          status: 'ERROR',
          error: {
            code: 'STEP_TIMEOUT',
            message: error instanceof Error ? error.message : '步骤执行超时',
            category: 'EXECUTION',
          },
        };
      }

      // Complete attempt
      attempt.status = result.status === 'PASSED' ? 'PASSED' : 'FAILED';
      attempt.endedAt = clock.now();
      attempt.durationMs = Date.parse(attempt.endedAt) - Date.parse(attempt.startedAt);
      if (result.error) {
        const errRecord: ErrorRecord = {
          code: result.error.code,
          message: result.error.message,
          category: result.error.category,
        };
        attempt.error = errRecord;
      }

      // Collect results
      if (result.observations) stored.observations.push(...result.observations);
      if (result.evidence) stored.evidence.push(...result.evidence);
      if (result.metrics) stored.metrics.push(...result.metrics);
      if (result.rules) stored.rules.push(...result.rules);
      if (result.taskExecution) stored.tasks.push(result.taskExecution);

      // Update step status
      step.status = result.status as StepStatus;
      step.endedAt = clock.now();
      if (result.status !== 'PASSED') {
        step.reason = result.error?.message ?? '步骤未通过';
      }

      running.delete(planned.stepId);
      if (result.status === 'PASSED') {
        completed.add(planned.stepId);
        await recordEvent(store, runId, clock, {
          type: 'StepPassed',
          runId,
          stepId: planned.stepId,
        });
      } else {
        failed.add(planned.stepId);
        const evtType: ExecutionEvent['type'] =
          result.status === 'ERROR' ? 'StepError' : 'StepFailed';
        const evtPayload: Record<string, unknown> = {
          type: evtType,
          runId,
          stepId: planned.stepId,
        };
        if (result.error) {
          evtPayload.reason = result.error.message;
          evtPayload.error = {
            code: result.error.code,
            message: result.error.message,
            category: result.error.category,
          };
        }
        await recordEvent(
          store,
          runId,
          clock,
          evtPayload as Partial<ExecutionEvent> & { type: ExecutionEvent['type']; runId: string },
        );

        if (planned.required && stored.plan.profile.failureMode === 'STOP_ON_REQUIRED_FAILURE') {
          state.cancelled = true;
          state.cancelSignal.abort();
        }
      }

      await store.saveRun(stored);
    });

    await Promise.all(promises);
  }

  // Mark remaining PENDING steps as BLOCKED when cancelled or stuck
  for (const planned of stored.plan.steps) {
    const step = state.steps.get(planned.stepId)!;
    if (step.status === 'PENDING') {
      step.status = 'BLOCKED';
      step.reason = state.cancelled ? '运行已取消' : '依赖未满足';
      step.endedAt = clock.now();
      await recordEvent(store, runId, clock, {
        type: 'StepBlocked',
        runId,
        stepId: planned.stepId,
        reason: step.reason,
      });
    }
  }
  await store.saveRun(stored);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`超时 ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function determineRunStatus(steps: ExecutionStep[]): RunStatus {
  const statuses = steps.map((s) => s.status);
  if (statuses.every((s) => s === 'PASSED')) return 'COMPLETED';
  if (statuses.some((s) => s === 'RUNNING')) return 'RUNNING';
  if (statuses.some((s) => s === 'ERROR')) return 'FAILED';
  if (statuses.some((s) => s === 'FAILED' || s === 'BLOCKED' || s === 'SKIPPED')) return 'PARTIAL';
  return 'COMPLETED';
}

async function recordEvent(
  store: RunStore,
  runId: string,
  clock: Clock,
  partial: Partial<ExecutionEvent> & { type: ExecutionEvent['type']; runId: string },
): Promise<void> {
  const event: ExecutionEvent = {
    id: newId('evt'),
    schemaVersion: '1.0.0',
    createdAt: clock.now(),
    sequence: 0,
    occurredAt: clock.now(),
    recordedAt: clock.now(),
    outputIds: [],
    ...partial,
    runId,
    type: partial.type,
  } as ExecutionEvent;
  await store.appendEvent(runId, event);
}

export async function cancelRun(
  runId: string,
  store: RunStore,
  clock: Clock = systemClock,
): Promise<void> {
  const stored = await store.loadRun(runId);
  const terminal: readonly RunStatus[] = ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'];
  invariant(!terminal.includes(stored.run.status), 'RUN_TERMINAL', '已结束运行不能取消');

  stored.run = transitionRun(stored.run, {
    to: 'CANCELLED',
    expectedRevision: stored.run.revision,
    at: clock.now(),
    reason: '用户请求取消',
    executionCommitted: stored.run.executionCommitted,
  });
  await store.saveRun(stored);
  await recordEvent(store, runId, clock, { type: 'RunCancelRequested', runId });
  await recordEvent(store, runId, clock, { type: 'RunCancelled', runId });
}
