import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { Clock, Timestamp } from '@uxq/core';
import type { EvaluationDefinition, EvaluationRun, RunContext, PlannedStep } from '@uxq/contracts';
import { openLocalStore, compilePlan, createRun, executeRun, cancelRun } from '@uxq/execution';
import type { RunStore } from '@uxq/execution';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;
const clock: Clock = {
  now: () => fixedTime,
  monotonic: () => 0,
};

function makeDefinition(overrides?: Partial<EvaluationDefinition>): EvaluationDefinition {
  const base: EvaluationDefinition = {
    id: 'def-test-1',
    schemaVersion: '1.0.0',
    createdAt: fixedTime,
    definitionVersion: '0.1.0',
    name: '测试定义',
    target: {
      id: 'target-1',
      name: '测试目标',
      type: 'PAGE',
      version: '0.0.0',
      environment: 'test',
    },
    scope: {
      entityIds: [],
      routes: [],
      taskIds: [],
      exclusions: [],
      limitations: [],
    },
    dimensions: ['D01'],
    methods: ['AUTOMATED'],
    metrics: [
      {
        id: 'metric-1',
        schemaVersion: '1.0.0',
        createdAt: fixedTime,
        version: '0.1.0',
        implementationVersion: '0.1.0',
        name: '测试指标',
        description: '测试用指标',
        dimensionId: 'D01',
        metricType: 'OBS',
        valueKind: 'NUMBER',
        direction: 'LOWER_IS_BETTER',
        sourceKey: 'test-key',
        unit: 'ms',
        aggregation: 'LATEST',
        minimumSamples: 1,
        minimum: 0,
        maximum: 10000,
        required: true,
        applicable: true,
        evidenceRequired: false,
        limitations: [],
      },
    ],
    rules: [],
    policy: {
      id: 'policy-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      version: '0.1.0',
      name: '测试策略',
      mode: 'SCORE',
      bindings: [
        { metricId: 'metric-1', weight: 1, normalization: 'LINEAR_LOWER', min: 0, max: 10000 },
      ],
      dimensions: [{ dimensionId: 'D01', weight: 1, minimumCoverage: 0 }],
      missingPolicy: 'EXCLUDE',
      minimumCoverage: 0,
      allowPartial: true,
      criticalRuleIds: [],
      riskSeverities: [],
      rationale: '测试',
      limitations: [],
    },
    tasks: [],
    steps: [
      {
        stepId: 'step-obs',
        kind: 'OBSERVATION_CAPTURE',
        dependsOn: [],
        required: true,
        inputRefs: [],
        outputContracts: ['RawObservation'],
        requiredCapabilities: [],
        observation: {
          key: 'test-key',
          value: 1500,
          unit: 'ms',
          entityId: 'target-1',
          scenarioId: 'scenario-1',
          source: 'E1',
          method: 'AUTOMATED',
          observedAt: fixedTime,
          sampleId: 'sample-1',
          excluded: false,
        },
      },
      {
        stepId: 'step-metric',
        kind: 'METRIC_CALCULATION',
        dependsOn: ['step-obs'],
        required: true,
        inputRefs: [{ stepId: 'step-obs', contract: 'RawObservation' }],
        outputContracts: ['MetricResult'],
        requiredCapabilities: [],
        metricIds: ['metric-1'],
      },
      {
        stepId: 'step-score',
        kind: 'SCORING',
        dependsOn: ['step-metric'],
        required: true,
        inputRefs: [{ stepId: 'step-metric', contract: 'MetricResult' }],
        outputContracts: ['ScoreResult'],
        requiredCapabilities: [],
      },
    ],
    limitations: [],
    ...overrides,
  };
  return base;
}

let tempDir: string;
let store: RunStore;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'uxq-test-'));
  store = await openLocalStore(tempDir, clock);
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('存储适配', () => {
  it('创建和加载运行', async () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition }, clock);
    const run: EvaluationRun = {
      id: 'run-test-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      planId: plan.id,
      planDigest: plan.planDigest,
      definitionId: definition.id,
      status: 'CREATED',
      revision: 0,
      contextId: 'ctx-1',
      executionCommitted: false,
      limitations: [],
    };
    const context: RunContext = {
      id: 'ctx-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: run.id,
      engineVersion: '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      profile: plan.profile,
      configSources: {},
      environmentFingerprint: 'test',
      sampleDescription: 'test',
      limitations: [],
    };

    await store.createRun(definition, plan, run, context);
    const loaded = await store.loadRun(run.id);
    expect(loaded.run.id).toBe(run.id);
    expect(loaded.run.status).toBe('CREATED');
    expect(loaded.plan.planDigest).toBe(plan.planDigest);
  });

  it('列出运行', async () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition }, clock);
    for (const id of ['run-a', 'run-b']) {
      const run: EvaluationRun = {
        id,
        schemaVersion: '1.0.0',
        createdAt: fixedTime,
        planId: plan.id,
        planDigest: plan.planDigest,
        definitionId: definition.id,
        status: 'CREATED',
        revision: 0,
        contextId: 'ctx-1',
        executionCommitted: false,
        limitations: [],
      };
      const context: RunContext = {
        id: 'ctx-1',
        schemaVersion: '1.0.0',
        createdAt: fixedTime,
        runId: run.id,
        engineVersion: '0.1.0',
        nodeVersion: process.version,
        platform: process.platform,
        profile: plan.profile,
        configSources: {},
        environmentFingerprint: 'test',
        sampleDescription: 'test',
        limitations: [],
      };
      await store.createRun(definition, plan, run, context);
    }
    const runs = await store.listRuns();
    expect(runs.sort()).toEqual(['run-a', 'run-b']);
  });

  it('工件写入和读取并校验摘要', async () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition }, clock);
    const run: EvaluationRun = {
      id: 'run-artifact',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      planId: plan.id,
      planDigest: plan.planDigest,
      definitionId: definition.id,
      status: 'CREATED',
      revision: 0,
      contextId: 'ctx-1',
      executionCommitted: false,
      limitations: [],
    };
    const context: RunContext = {
      id: 'ctx-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: run.id,
      engineVersion: '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      profile: plan.profile,
      configSources: {},
      environmentFingerprint: 'test',
      sampleDescription: 'test',
      limitations: [],
    };
    await store.createRun(definition, plan, run, context);

    const content = new TextEncoder().encode('test artifact content');
    const ref = await store.appendArtifact(run.id, 'test/artifact.txt', content);
    expect(ref.path).toBe('test/artifact.txt');
    expect(ref.bytes).toBe(content.byteLength);

    const read = await store.readArtifact(run.id, ref);
    expect(new TextDecoder().decode(read)).toBe('test artifact content');
  });

  it('摘要不匹配时拒绝读取', async () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition }, clock);
    const run: EvaluationRun = {
      id: 'run-digest',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      planId: plan.id,
      planDigest: plan.planDigest,
      definitionId: definition.id,
      status: 'CREATED',
      revision: 0,
      contextId: 'ctx-1',
      executionCommitted: false,
      limitations: [],
    };
    const context: RunContext = {
      id: 'ctx-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: run.id,
      engineVersion: '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      profile: plan.profile,
      configSources: {},
      environmentFingerprint: 'test',
      sampleDescription: 'test',
      limitations: [],
    };
    await store.createRun(definition, plan, run, context);

    const content = new TextEncoder().encode('original');
    const ref = await store.appendArtifact(run.id, 'test.txt', content);
    const badRef = { ...ref, digest: 'bad-digest' };
    await expect(store.readArtifact(run.id, badRef)).rejects.toThrow('工件摘要不匹配');
  });

  it('单写者锁', async () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition }, clock);
    const run: EvaluationRun = {
      id: 'run-lock',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      planId: plan.id,
      planDigest: plan.planDigest,
      definitionId: definition.id,
      status: 'CREATED',
      revision: 0,
      contextId: 'ctx-1',
      executionCommitted: false,
      limitations: [],
    };
    const context: RunContext = {
      id: 'ctx-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: run.id,
      engineVersion: '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      profile: plan.profile,
      configSources: {},
      environmentFingerprint: 'test',
      sampleDescription: 'test',
      limitations: [],
    };
    await store.createRun(definition, plan, run, context);

    const release = await store.acquireLock(run.id);
    await expect(store.acquireLock(run.id)).rejects.toThrow('已被锁定');
    await release();
    // After release, should be able to acquire again
    const release2 = await store.acquireLock(run.id);
    await release2();
  });

  it('更新 manifest', async () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition }, clock);
    const run: EvaluationRun = {
      id: 'run-manifest',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      planId: plan.id,
      planDigest: plan.planDigest,
      definitionId: definition.id,
      status: 'CREATED',
      revision: 0,
      contextId: 'ctx-1',
      executionCommitted: false,
      limitations: [],
    };
    const context: RunContext = {
      id: 'ctx-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: run.id,
      engineVersion: '0.1.0',
      nodeVersion: process.version,
      platform: process.platform,
      profile: plan.profile,
      configSources: {},
      environmentFingerprint: 'test',
      sampleDescription: 'test',
      limitations: [],
    };
    await store.createRun(definition, plan, run, context);

    const updated = await store.updateManifest(run.id, (m) => ({
      ...m,
      revision: m.revision + 1,
      runStatus: 'RUNNING',
    }));
    expect(updated.revision).toBe(1);
    expect(updated.runStatus).toBe('RUNNING');
  });
});

describe('计划编译器', () => {
  it('编译合法定义生成稳定摘要', () => {
    const definition = makeDefinition();
    const plan1 = compilePlan({ definition }, clock);
    const plan2 = compilePlan({ definition }, clock);
    expect(plan1.planDigest).toBe(plan2.planDigest);
    expect(plan1.definitionId).toBe(definition.id);
    expect(plan1.steps.length).toBe(3);
  });

  it('拒绝循环依赖', () => {
    const definition = makeDefinition({
      steps: [
        {
          stepId: 'step-a',
          kind: 'OBSERVATION_CAPTURE',
          dependsOn: ['step-b'],
          required: true,
          inputRefs: [],
          outputContracts: ['RawObservation'],
          requiredCapabilities: [],
          observation: {
            key: 'k',
            value: 1,
            entityId: 'e',
            scenarioId: 's',
            source: 'E1',
            method: 'AUTOMATED',
            observedAt: fixedTime,
            sampleId: 's1',
            excluded: false,
          },
        },
        {
          stepId: 'step-b',
          kind: 'METRIC_CALCULATION',
          dependsOn: ['step-a'],
          required: true,
          inputRefs: [{ stepId: 'step-a', contract: 'RawObservation' }],
          outputContracts: ['MetricResult'],
          requiredCapabilities: [],
          metricIds: ['metric-1'],
        },
      ] as [PlannedStep, ...PlannedStep[]],
    });
    expect(() => compilePlan({ definition }, clock)).toThrow('循环依赖');
  });

  it('合并配置覆盖', () => {
    const definition = makeDefinition();
    const plan = compilePlan({ definition, profileOverrides: { maxConcurrency: 4 } }, clock);
    expect(plan.profile.maxConcurrency).toBe(4);
  });
});

describe('执行引擎', () => {
  it('创建和运行完整流程', async () => {
    const definition = makeDefinition();
    const { run } = await createRun(definition, undefined, { store, clock });
    expect(run.status).toBe('CREATED');

    const stored = await executeRun(run.id, { store, clock });
    expect(stored.run.status).toBe('COMPLETED');
    expect(stored.steps.length).toBe(3);
    expect(stored.events.length).toBeGreaterThan(0);
  });

  it('步骤失败导致 PARTIAL', async () => {
    const definition = makeDefinition();
    const { run } = await createRun(definition, undefined, { store, clock });

    const failExecutor = async (step: PlannedStep) => {
      if (step.stepId === 'step-obs') {
        return {
          status: 'FAILED' as const,
          error: { code: 'TEST_FAIL', message: '测试失败', category: 'EXECUTION' as const },
        };
      }
      return { status: 'PASSED' as const };
    };

    const stored = await executeRun(run.id, { store, clock, executeStep: failExecutor });
    expect(['PARTIAL', 'FAILED']).toContain(stored.run.status);
  });

  it('依赖失败阻塞下游', async () => {
    const definition = makeDefinition();
    const { run } = await createRun(definition, undefined, { store, clock });

    const failFirst = async (step: PlannedStep) => {
      if (step.stepId === 'step-obs') {
        return {
          status: 'FAILED' as const,
          error: { code: 'FAIL', message: '失败', category: 'EXECUTION' as const },
        };
      }
      return { status: 'PASSED' as const };
    };

    const stored = await executeRun(run.id, { store, clock, executeStep: failFirst });
    const blockedStep = stored.steps.find((s) => s.stepId === 'step-metric');
    expect(blockedStep?.status).toBe('BLOCKED');
  });

  it('取消运行', async () => {
    const definition = makeDefinition();
    const { run } = await createRun(definition, undefined, { store, clock });

    // Move to RUNNING first
    let stored = await store.loadRun(run.id);
    stored.run = {
      ...stored.run,
      status: 'RUNNING',
      startedAt: fixedTime,
      revision: stored.run.revision + 1,
    };
    await store.saveRun(stored);

    await cancelRun(run.id, store, clock);
    stored = await store.loadRun(run.id);
    expect(stored.run.status).toBe('CANCELLED');
  });

  it('终态运行不能取消', async () => {
    const definition = makeDefinition();
    const { run } = await createRun(definition, undefined, { store, clock });
    await executeRun(run.id, { store, clock });

    await expect(cancelRun(run.id, store, clock)).rejects.toThrow('已结束运行不能取消');
  });

  it('STOP_ON_REQUIRED_FAILURE 停止调度', async () => {
    const definition = makeDefinition({
      profile: { failureMode: 'STOP_ON_REQUIRED_FAILURE' },
    });
    const { run } = await createRun(definition, undefined, { store, clock });

    const failRequired = async (step: PlannedStep) => {
      if (step.stepId === 'step-obs') {
        return {
          status: 'FAILED' as const,
          error: { code: 'FAIL', message: '必需步骤失败', category: 'EXECUTION' as const },
        };
      }
      return { status: 'PASSED' as const };
    };

    const stored = await executeRun(run.id, { store, clock, executeStep: failRequired });
    // After STOP_ON_REQUIRED_FAILURE, downstream should be blocked
    const downstream = stored.steps.filter((s) => s.status === 'BLOCKED');
    expect(downstream.length).toBeGreaterThan(0);
  });
});
