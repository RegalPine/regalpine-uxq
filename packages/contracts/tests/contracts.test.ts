import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { cloneJson, digest, UxqError } from '@uxq/core';
import {
  contractNames,
  contractEnum,
  getSchemaSource,
  parseContract,
  validateSchemaRegistry,
  validateEvaluation,
  isRelativeArtifactPath,
  planDigest,
  defaultProfile,
  migrateLegacy,
  canTransitionRun,
  canTransitionStep,
  transitionRun,
  transitionStep,
} from '../src/index.js';
import type { MetricDefinition, MetricResult, ScoreResult, RunStatus } from '../src/index.js';
import { at, base, later, makeBundle, makeSnapshot } from './fixtures.js';

function rejectsCode(action: () => unknown, code: string): void {
  try {
    action();
    expect.fail(`必须拒绝 ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(UxqError);
    expect((error as UxqError).code).toBe(code);
  }
}

// 类型断言验证实际生成结果，防止 allOf 同级属性被生成器漏掉。
function typeProof(metric: MetricResult, score: ScoreResult, definition: MetricDefinition): void {
  const name: string = definition.name;
  const dimension: string = definition.dimensionId;
  if (metric.status === 'MEASURED') {
    const value = metric.value;
    void value;
  } else {
    // @ts-expect-error 非 MEASURED 分支没有有效测量值
    const missing = metric.value;
    void missing;
  }
  if (score.status === 'SCORED') {
    const value: number = score.value;
    void value;
  } else {
    // @ts-expect-error 非 SCORED 分支没有分数
    const missing = score.value;
    void missing;
  }
  // @ts-expect-error 正式指标契约不可退化为只有 BaseRecord
  const incomplete: MetricDefinition = { id: 'm', schemaVersion: '1.0.0', createdAt: at };
  void [name, dimension, incomplete];
}
void typeProof;

describe('唯一 Schema 与判别联合', () => {
  it('全部公共契约可编译，生成分发与根源一致', async () => {
    expect(contractNames.length).toBeGreaterThan(90);
    expect(() => validateSchemaRegistry()).not.toThrow();
    const source = JSON.parse(await readFile('schemas/uxq.schema.json', 'utf8')) as unknown;
    expect(getSchemaSource()).toEqual(source);
    expect(contractEnum('OverallOutcome')).toEqual(['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT_RATED']);
    expect(contractEnum('MetricDirection')).toContain('CONTEXT_DEPENDENT');
  });
  it('合法完整 Run 与结算通过；校验不修改输入', () => {
    const bundle = makeBundle();
    const before = digest(bundle);
    const parsed = parseContract('RunBundle', bundle);
    expect(parsed).toEqual(bundle);
    expect(parsed).not.toBe(bundle);
    expect(validateEvaluation(bundle, makeSnapshot(bundle)).snapshot.evaluation.overallScore).toBe(
      100,
    );
    expect(digest(bundle)).toBe(before);
  });
  it('零值可测量，未知字段/状态/缺失值和非有限值拒绝', () => {
    const metric = makeBundle().metrics[0]!;
    expect(parseContract('MetricResult', metric).status).toBe('MEASURED');
    rejectsCode(
      () => parseContract('MetricResult', { ...metric, status: 'UNKNOWN' }),
      'SCHEMA_VALIDATION',
    );
    rejectsCode(
      () => parseContract('MetricResult', { ...metric, unexpected: true }),
      'SCHEMA_VALIDATION',
    );
    rejectsCode(
      () => parseContract('MetricResult', { ...metric, value: Infinity }),
      'NON_JSON_VALUE',
    );
    const { value: _value, ...missing } = metric as Extract<MetricResult, { status: 'MEASURED' }>;
    rejectsCode(() => parseContract('MetricResult', missing), 'SCHEMA_VALIDATION');
    rejectsCode(
      () => parseContract('MetricResult', { ...metric, status: 'NOT_EVALUATED', reason: '未执行' }),
      'SCHEMA_VALIDATION',
    );
    rejectsCode(
      () => parseContract('MetricResult', { ...missing, unit: undefined }),
      'NON_JSON_VALUE',
    );
  });
  it('非评分分支不可携带零分，规则执行失败不可 PASS/FAIL', () => {
    const bundle = makeBundle();
    const score = makeSnapshot(bundle).scores[0]!;
    rejectsCode(
      () => parseContract('ScoreResult', { ...score, status: 'NOT_SCORED', reason: '未评分' }),
      'SCHEMA_VALIDATION',
    );
    rejectsCode(
      () => parseContract('RuleResult', { ...bundle.rules[0], executionStatus: 'ERROR' }),
      'SCHEMA_VALIDATION',
    );
    const { value: _value, ...withoutValue } = score as Extract<ScoreResult, { status: 'SCORED' }>;
    expect(
      parseContract('ScoreResult', {
        ...withoutValue,
        status: 'NOT_SCORED',
        reason: '没有适用映射',
      }).status,
    ).toBe('NOT_SCORED');
  });
  it('未知版本拒绝，未测量样本不得伪造有效结果', () => {
    const metric = makeBundle().metrics[0]!;
    rejectsCode(
      () => parseContract('MetricResult', { ...metric, schemaVersion: '9.0.0' }),
      'UNSUPPORTED_SCHEMA_VERSION',
    );
    rejectsCode(
      () => parseContract('MetricResult', { ...metric, sampleCount: 0 }),
      'EMPTY_MEASUREMENT',
    );
  });
  it.each(['../a', '/a', 'a\\b', 'a//b', 'a/./b', 'a/../b', 'file:///x', '%2e%2e/x', 'a\0b'])(
    '工件路径拒绝 %j',
    (input) => {
      expect(isRelativeArtifactPath(input)).toBe(false);
    },
  );
  it('默认配置来自 Schema，拒绝范围无效与带凭据网络授权', () => {
    const profile = defaultProfile();
    expect(profile.maxAttempts).toBe(1);
    expect(profile.allowedOrigins).toEqual([]);
    expect(profile.allowSideEffects).toBe(false);
    rejectsCode(
      () => parseContract('ExecutionProfile', { ...profile, maxConcurrency: 0 }),
      'SCHEMA_VALIDATION',
    );
    rejectsCode(
      () =>
        parseContract('ExecutionProfile', { ...profile, initialDelayMs: 3000, maxDelayMs: 100 }),
      'RETRY_DELAY',
    );
    rejectsCode(
      () =>
        parseContract('ExecutionProfile', {
          ...profile,
          allowedOrigins: ['https://user:secret@example.org'],
        }),
      'INVALID_ORIGIN',
    );
  });
});

describe('计划与跨对象不变量', () => {
  it.each([
    [
      'CROSS_RUN_REFERENCE',
      (bundle: ReturnType<typeof makeBundle>) => {
        bundle.observations[0]!.runId = 'other-run';
      },
    ],
    [
      'MISSING_REFERENCE',
      (bundle: ReturnType<typeof makeBundle>) => {
        bundle.metrics[0]!.observationIds = ['absent'];
      },
    ],
    [
      'METRIC_PROVENANCE',
      (bundle: ReturnType<typeof makeBundle>) => {
        bundle.metrics[0]!.metricVersion = '9.0.0';
      },
    ],
    [
      'INVALID_MEASUREMENT_EVIDENCE',
      (bundle: ReturnType<typeof makeBundle>) => {
        bundle.evidence[0]!.validity = 'DISPUTED';
      },
    ],
    [
      'METRIC_UNIT',
      (bundle: ReturnType<typeof makeBundle>) => {
        if (bundle.metrics[0]!.status === 'MEASURED') bundle.metrics[0]!.unit = 's';
      },
    ],
    [
      'EVENT_SEQUENCE',
      (bundle: ReturnType<typeof makeBundle>) => {
        bundle.events[0]!.sequence = 2;
      },
    ],
    [
      'DUPLICATE_ID',
      (bundle: ReturnType<typeof makeBundle>) => {
        bundle.metrics.push(cloneJson(bundle.metrics[0]!));
      },
    ],
  ])('拒绝 %s', (code, mutate) => {
    const bundle = makeBundle();
    mutate(bundle);
    rejectsCode(() => parseContract('RunBundle', bundle), code);
  });
  it('计划摘要忽略自身 ID 和创建时间，但不忽略策略和输入', () => {
    const plan = makeBundle().plan;
    expect(planDigest({ ...plan, id: 'plan-other', createdAt: later })).toBe(plan.planDigest);
    rejectsCode(
      () =>
        parseContract('EvaluationPlan', {
          ...plan,
          profile: { ...plan.profile, maxConcurrency: 3 },
        }),
      'PLAN_DIGEST',
    );
  });
  it('DAG、生产者引用与共享会话顺序必须合法', () => {
    const definition = makeBundle().definition;
    definition.steps[0]!.dependsOn = ['judge'];
    rejectsCode(() => parseContract('EvaluationDefinition', definition), 'DAG_CYCLE');
    const missing = makeBundle().definition;
    missing.steps[1]!.inputRefs[0]!.contract = 'RuleResult';
    rejectsCode(() => parseContract('EvaluationDefinition', missing), 'OUTPUT_CONTRACT_MISMATCH');
    const race = makeBundle().definition;
    race.steps[1]!.dependsOn = [];
    race.steps[1]!.inputRefs = [];
    race.steps[0]!.sessionId = 'shared';
    race.steps[1]!.sessionId = 'shared';
    rejectsCode(() => parseContract('EvaluationDefinition', race), 'SHARED_SESSION_RACE');
  });
  it('禁止重复计分与缺失维度权重', () => {
    const definition = makeBundle().definition;
    definition.policy.bindings.push(cloneJson(definition.policy.bindings[0]!));
    rejectsCode(() => parseContract('EvaluationDefinition', definition), 'DUPLICATE_ID');
    const noWeight = makeBundle().definition;
    noWeight.policy.dimensions[0]!.dimensionId = 'D01';
    rejectsCode(() => parseContract('EvaluationDefinition', noWeight), 'MISSING_DIMENSION_WEIGHT');
  });
  it('覆盖率、总体结论与结算引用不能靠宽松组合伪造', () => {
    const bundle = makeBundle();
    const snapshot = makeSnapshot(bundle);
    snapshot.evaluation.coverage.ratio = 0;
    rejectsCode(() => validateEvaluation(bundle, snapshot), 'COVERAGE_RATIO');
    const insufficient = makeSnapshot(bundle);
    insufficient.evaluation.evaluationStatus = 'INSUFFICIENT_EVIDENCE';
    rejectsCode(() => validateEvaluation(bundle, insufficient), 'UNPROVEN_PASS');
    const noScores = makeSnapshot(bundle);
    noScores.evaluation.scoreResultIds = [];
    rejectsCode(() => validateEvaluation(bundle, noScores), 'EVALUATION_RESULT_SET');
    const fail = makeSnapshot(bundle);
    fail.evaluation.overallOutcome = 'FAIL';
    expect(validateEvaluation(bundle, fail).snapshot.evaluation.evaluationStatus).toBe('COMPLETE');
  });
});

describe('状态命令与终态保护', () => {
  it('运行开始必须预检，结束必须提交，过期 revision 拒绝', () => {
    const reference = makeBundle().run;
    const { startedAt: _start, endedAt: _end, endReason: _reason, ...rest } = reference;
    const created = { ...rest, status: 'CREATED' as const, revision: 0, executionCommitted: false };
    const preparing = transitionRun(created, {
      to: 'PREPARING',
      expectedRevision: 0,
      at,
      reason: '准备',
    });
    rejectsCode(
      () => transitionRun(preparing, { to: 'RUNNING', expectedRevision: 1, at, reason: '开始' }),
      'PREFLIGHT_REQUIRED',
    );
    const running = transitionRun(preparing, {
      to: 'RUNNING',
      expectedRevision: 1,
      at,
      reason: '预检通过',
      preflightPassed: true,
    });
    rejectsCode(
      () =>
        transitionRun(running, { to: 'COMPLETED', expectedRevision: 1, at: later, reason: '完成' }),
      'REVISION_CONFLICT',
    );
    rejectsCode(
      () =>
        transitionRun(running, { to: 'COMPLETED', expectedRevision: 2, at: later, reason: '完成' }),
      'RUN_NOT_COMMITTED',
    );
    expect(
      transitionRun(running, {
        to: 'COMPLETED',
        expectedRevision: 2,
        at: later,
        reason: '已提交执行清单',
        executionCommitted: true,
      }).status,
    ).toBe('COMPLETED');
    expect(created.status).toBe('CREATED');
  });
  it.each(['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'] as const)('%s 不可重开', (status) => {
    expect(canTransitionRun(status, 'RUNNING')).toBe(false);
    const run = { ...makeBundle().run, status };
    rejectsCode(
      () =>
        transitionRun(run, {
          to: 'RUNNING',
          expectedRevision: run.revision,
          at: later,
          reason: '错误重开',
        }),
      'ILLEGAL_RUN_TRANSITION',
    );
  });
  it('步骤开始登记尝试，跳过与阻塞终态不能重开', () => {
    const pending = {
      ...base('step-exec'),
      runId: 'run-1',
      stepId: 'capture',
      status: 'PENDING' as const,
      revision: 0,
      attemptIds: [],
      outputIds: [],
    };
    const running = transitionStep(pending, {
      to: 'RUNNING',
      expectedRevision: 0,
      at,
      reason: '首次尝试',
      attemptId: 'attempt-1',
    });
    expect(running.attemptIds).toEqual(['attempt-1']);
    expect(canTransitionStep('BLOCKED', 'RUNNING')).toBe(false);
    const blocked = transitionStep(pending, {
      to: 'BLOCKED',
      expectedRevision: 0,
      at: later,
      reason: '依赖失败',
    });
    expect(blocked.startedAt).toBeUndefined();
  });
  it('状态枚举来自 Schema，不能混用评价状态', () => {
    expect(contractEnum('RunStatus')).not.toContain('COMPLETE');
    const status: RunStatus = 'COMPLETED';
    expect(status).toBe('COMPLETED');
  });
});

describe('版本桥接与原件保护', () => {
  const oldRecord = (value: object) =>
    Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        key === 'schemaVersion' ? '0.2.0' : entry,
      ]),
    );
  it('显式转换已声明顶层字段和方向别名，保留 ID 与原件', () => {
    const metric = makeBundle().definition.metrics[0]!;
    const legacy = oldRecord({ ...metric, direction: 'DESCRIPTIVE' });
    const before = digest(legacy);
    const result = migrateLegacy('MetricDefinition', legacy);
    expect(result.value.direction).toBe('DESCRIPTIVE_ONLY');
    expect(result.value.id).toBe(metric.id);
    expect(result.originalDigest).toBe(before);
    expect(digest(legacy)).toBe(before);
  });
  it('拒绝未知版本、未知字段和字段碰撞', () => {
    const legacy = oldRecord(makeBundle().metrics[0]!);
    rejectsCode(
      () => migrateLegacy('MetricResult', { ...legacy, schema_version: '0.9.0' }),
      'UNSUPPORTED_SCHEMA_VERSION',
    );
    rejectsCode(
      () => migrateLegacy('MetricResult', { ...legacy, metricId: 'collision' }),
      'LEGACY_SCHEMA_VALIDATION',
    );
    rejectsCode(
      () => migrateLegacy('MetricResult', { ...legacy, extra: true }),
      'LEGACY_SCHEMA_VALIDATION',
    );
  });
  it('歧义总体结论和 E5 分类不静默转换', () => {
    const bundle = makeBundle();
    rejectsCode(
      () =>
        migrateLegacy('EvaluationResult', {
          ...oldRecord(makeSnapshot(bundle).evaluation),
          overall_outcome: 'CONSTRAINED',
        }),
      'AMBIGUOUS_LEGACY_OUTCOME',
    );
    rejectsCode(
      () =>
        migrateLegacy('Evidence', {
          ...oldRecord(bundle.evidence[0]!),
          source_category: 'E5',
          material_type: 'EXTERNAL_CONSTRAINT',
        }),
      'AMBIGUOUS_LEGACY_EVIDENCE',
    );
  });
});
