#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, rmSync, symlinkSync, cpSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { UxqError, systemClock, digest, newId } from '@uxq/core';
import { parseContract, assertDefinition } from '@uxq/contracts';
import type {
  EvaluationDefinition,
  ExecutionProfile,
  RunBundle,
  EvaluationSnapshot,
} from '@uxq/contracts';
import { openLocalStore, compilePlan, createRun, executeRun, cancelRun } from '@uxq/execution';
import type { StepExecutor } from '@uxq/execution';
import { ReferenceBrowserAdapter, executeActions } from '@uxq/browser';
import { projectReport, renderMarkdown, createReportArtifact } from '@uxq/reporting';
import { createInMemoryBaselineStore, checkComparability, compareRuns } from '@uxq/regression';
import { settleEvaluation } from '@uxq/scoring';
import type { ScoringPolicy, DimensionResult, MetricResult, RuleResult } from '@uxq/contracts';
import {
  generateSignals,
  createFinding,
  deduplicateFindings,
  transitionFinding,
  createVerificationPlan,
  createVerificationResult,
  createFindingHistory,
} from '@uxq/diagnostic';
import type {
  Finding,
  FindingLifecycleStatus,
  VerificationPlan,
  VerificationResult,
} from '@uxq/contracts';
import type { Comparability, EvaluationPlan, EvaluationResult } from '@uxq/contracts';
import { runConformanceCheck, renderConformanceMarkdown } from '@uxq/conformance';

const VERSION = '0.1.0';
const DEFAULT_ROOT = '.uxq';

interface CliOptions {
  root: string;
  config?: string;
  json: boolean;
  gate?: string;
  sourceRun?: string;
  findingId?: string;
  policy?: string;
  agent?: string;
  copy?: boolean;
}

type SupportedAgent = 'qoder' | 'claude' | 'codex' | 'kiro';
type AgentTarget = SupportedAgent | 'all';

const AGENT_SKILL_DIRS: Record<SupportedAgent, string> = {
  qoder: join(homedir(), '.qoder', 'skills'),
  claude: join(homedir(), '.claude', '.claude', 'skills'),
  codex: join(homedir(), '.codex', 'skills'),
  kiro: join(homedir(), '.kiro', 'skills'),
};

const ALL_AGENTS: SupportedAgent[] = ['qoder', 'claude', 'codex', 'kiro'];

function parseArgs(argv: string[]): { command: string; positional: string[]; options: CliOptions } {
  const args = argv.slice(2);
  let command = '';
  const positional: string[] = [];
  const options: CliOptions = { root: DEFAULT_ROOT, json: false };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (!command && !arg.startsWith('-')) {
      command = arg;
      continue;
    }
    if (arg === '--root' && i + 1 < args.length) {
      options.root = args[++i]!;
    } else if (arg === '--config' && i + 1 < args.length) {
      options.config = args[++i]!;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--gate' && i + 1 < args.length) {
      options.gate = args[++i]!;
    } else if (arg === '--source-run' && i + 1 < args.length) {
      options.sourceRun = args[++i]!;
    } else if (arg === '--finding-id' && i + 1 < args.length) {
      options.findingId = args[++i]!;
    } else if (arg === '--policy' && i + 1 < args.length) {
      options.policy = args[++i]!;
    } else if (arg === '--agent' && i + 1 < args.length) {
      options.agent = args[++i]!;
    } else if (arg === '--copy') {
      options.copy = true;
    } else if (arg === '--help' || arg === '-h') {
      command = 'help';
    } else if (!arg.startsWith('-')) {
      positional.push(arg);
    } else {
      throw new UxqError('INVALID_OPTION', `未知选项：${arg}`, 'INPUT');
    }
  }

  return { command, positional, options };
}

function printHelp(): void {
  const help = `uxq - UX 评价工具 v${VERSION}

用法：uxq <命令> [选项]

命令：
  --help, -h              显示帮助
  version                 显示版本
  doctor                  诊断环境
  init <file>             生成示例定义
  validate <file>         校验定义
  plan <file>             编译执行计划
  evaluate <file>         执行评价
  list                    列出运行
  inspect <run-id>        查看运行详情
  cancel <run-id>         取消运行
  report <run-id>         生成报告
  baseline <action>       基线管理 (create|update|list|delete)
  compare <run-id>        与基线比较
  finding <action>        Finding 管理 (list|transition)
  settle <run-id>         重新结算评价（需 --gate 指定策略）
  quality-gate <run-id>   质量门禁检查
  verify <action>         复测验证 (plan|result)
  conformance <run-id>    规范符合性检查
  install-skill           安装 UXQ Skill 到 Agent
  uninstall-skill         从 Agent 卸载 UXQ Skill

通用选项：
  --root <dir>            存储根目录（默认 .uxq）
  --config <file>         运行配置文件
  --json                  机器输出格式
  --gate <file>           质量门禁策略 / settle 重结算策略
  --source-run <id>       关联源运行
  --finding-id <id>       关联 Finding ID
  --policy <file>         评分策略文件
  --agent <name>          Agent 名称 (qoder|claude|codex|kiro|all)
  --copy                  复制而非符号链接

退出码：
  0  成功
  1  门禁策略失败
  2  输入/配置无效
  3  环境不可用
  4  运行失败
  5  契约/不变量失败
  6  持久化/工件失败
  130 用户取消
`;
  process.stderr.write(help);
}

async function loadDefinition(file: string): Promise<EvaluationDefinition> {
  const content = await readFile(file, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  return parseContract('EvaluationDefinition', parsed);
}

async function loadConfig(file?: string): Promise<Partial<ExecutionProfile>> {
  if (!file) return {};
  const content = await readFile(file, 'utf8');
  return JSON.parse(content) as Partial<ExecutionProfile>;
}

function output(data: unknown, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n');
  } else {
    process.stderr.write(typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
  }
}

async function cmdVersion(options: CliOptions): Promise<number> {
  output({ version: VERSION }, options.json);
  return 0;
}

async function cmdDoctor(options: CliOptions): Promise<number> {
  const checks = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    storage: options.root,
    browser: 'reference-adapter',
  };
  output(checks, options.json);
  return 0;
}

async function cmdInit(positional: string[], options: CliOptions): Promise<number> {
  const file = positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'init 需要文件路径', 'INPUT');

  const example: EvaluationDefinition = {
    id: newId('def'),
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    definitionVersion: '0.1.0',
    name: '示例评价定义（测试用途）',
    target: {
      id: 'target-example',
      name: '示例目标',
      type: 'PAGE',
      version: '0.0.0',
      environment: 'test',
    },
    scope: {
      entityIds: [],
      routes: [],
      taskIds: [],
      exclusions: [],
      limitations: ['示例定义仅供测试'],
    },
    dimensions: ['D01'],
    methods: ['AUTOMATED'],
    metrics: [
      {
        id: 'metric-obs-1',
        schemaVersion: '1.0.0',
        createdAt: systemClock.now(),
        version: '0.1.0',
        implementationVersion: '0.1.0',
        name: '页面加载时间',
        description: '从导航到内容可见的时间（测试用途）',
        dimensionId: 'D01',
        metricType: 'OBS',
        valueKind: 'NUMBER',
        direction: 'LOWER_IS_BETTER',
        sourceKey: 'load-time',
        unit: 'ms',
        aggregation: 'LATEST',
        minimumSamples: 1,
        minimum: 0,
        maximum: 60000,
        required: true,
        applicable: true,
        evidenceRequired: false,
        limitations: ['测试用途'],
      },
    ],
    rules: [],
    policy: {
      id: newId('policy'),
      schemaVersion: '1.0.0',
      createdAt: systemClock.now(),
      version: '0.1.0',
      name: '示例评分策略（测试用途）',
      mode: 'SCORE',
      bindings: [
        {
          metricId: 'metric-obs-1',
          weight: 1,
          normalization: 'LINEAR_LOWER',
          min: 0,
          max: 10000,
        },
      ],
      dimensions: [{ dimensionId: 'D01', weight: 1, minimumCoverage: 0 }],
      missingPolicy: 'EXCLUDE',
      minimumCoverage: 0,
      allowPartial: true,
      criticalRuleIds: [],
      riskSeverities: [],
      rationale: '示例策略仅供测试',
      limitations: ['测试用途'],
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
          key: 'load-time',
          value: 1500,
          unit: 'ms',
          entityId: 'target-example',
          scenarioId: 'scenario-example',
          source: 'E1',
          method: 'AUTOMATED',
          observedAt: systemClock.now(),
          sampleId: newId('sample'),
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
        metricIds: ['metric-obs-1'],
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
    limitations: ['示例定义仅供测试'],
  };

  await writeFile(file, JSON.stringify(example, null, 2), 'utf8');
  output(`已生成示例定义：${file}`, options.json);
  return 0;
}

async function cmdValidate(positional: string[], options: CliOptions): Promise<number> {
  const file = positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'validate 需要文件路径', 'INPUT');

  const definition = await loadDefinition(file);
  assertDefinition(definition);

  output(
    { valid: true, definitionId: definition.id, version: definition.definitionVersion },
    options.json,
  );
  return 0;
}

async function cmdPlan(positional: string[], options: CliOptions): Promise<number> {
  const file = positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'plan 需要文件路径', 'INPUT');

  const definition = await loadDefinition(file);
  const config = await loadConfig(options.config);
  const plan = compilePlan({ definition, profileOverrides: config });

  output(plan, options.json);
  if (options.json) process.stdout.write(JSON.stringify(plan, null, 2) + '\n');
  return 0;
}

async function cmdEvaluate(positional: string[], options: CliOptions): Promise<number> {
  const file = positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'evaluate 需要文件路径', 'INPUT');

  const definition = await loadDefinition(file);
  const config = await loadConfig(options.config);
  const store = await openLocalStore(options.root);

  // Create browser adapter for task steps
  const adapter = new ReferenceBrowserAdapter();

  const executor: StepExecutor = async (step, ctx) => {
    if (step.kind === 'TASK_EXECUTION' && step.taskId) {
      const task = definition.tasks.find((t) => t.id === step.taskId);
      if (task) {
        const session = await adapter.launch(ctx.profile);
        try {
          const result = await executeActions(
            session,
            task.actions,
            ctx.runId,
            ctx.stepId,
            ctx.attemptId,
          );
          return { status: 'PASSED', ...result };
        } finally {
          await session.close();
        }
      }
    }
    return { status: 'PASSED' };
  };

  const { run } = await createRun(definition, config, { store, executeStep: executor });
  process.stderr.write(`运行已创建：${run.id}\n`);

  const stored = await executeRun(run.id, { store, executeStep: executor });
  process.stderr.write(`运行已完成：${stored.run.status}\n`);

  // Generate report
  const bundle: RunBundle = {
    schemaVersion: '1.0.0',
    definition: stored.definition,
    plan: stored.plan,
    run: stored.run,
    context: stored.context,
    steps: stored.steps,
    attempts: stored.attempts,
    events: stored.events,
    tasks: stored.tasks,
    observations: stored.observations,
    metrics: stored.metrics,
    rules: stored.rules,
    evidence: stored.evidence,
  };
  const evaluation = stored.evaluations[0];
  const snapshot: EvaluationSnapshot = {
    evaluation: evaluation ?? {
      id: newId('eval'),
      schemaVersion: '1.0.0',
      createdAt: systemClock.now(),
      runId: stored.run.id,
      policyId: stored.definition.policy.id,
      policyVersion: stored.definition.policy.version,
      policyDigest: digest(stored.definition.policy),
      evaluationStatus: 'INSUFFICIENT_EVIDENCE',
      overallOutcome: 'NOT_RATED',
      overallScore: null,
      coverage: { planned: 0, applicable: 0, measured: 0, scored: 0, ratio: null },
      metricResultIds: [],
      ruleResultIds: [],
      scoreResultIds: [],
      dimensionResultIds: [],
      findingIds: [],
      evidenceIds: [],
      constraints: [],
      limitations: ['无结算结果'],
    },
    policy: stored.definition.policy,
    scores: [],
    dimensions: [],
    signals: [],
    findings: [],
  };
  const report = projectReport(bundle, snapshot, '0.1.0', systemClock.now());
  const markdown = renderMarkdown(report);
  const artifact = createReportArtifact(
    stored.run.id,
    snapshot.evaluation.id,
    '0.1.0',
    JSON.stringify(report),
    markdown,
  );

  output(
    {
      runId: stored.run.id,
      status: stored.run.status,
      evaluation: stored.evaluations[0],
      report: artifact,
    },
    options.json,
  );

  // Check gate
  if (options.gate) {
    const gateContent = await readFile(options.gate, 'utf8');
    const gate = JSON.parse(gateContent) as { minimumScore?: number };
    if (gate.minimumScore !== undefined && stored.evaluations[0]?.overallScore !== null) {
      const score = stored.evaluations[0]?.overallScore ?? 0;
      if (score < gate.minimumScore) {
        process.stderr.write(`门禁失败：评分 ${score} 低于阈值 ${gate.minimumScore}\n`);
        return 1;
      }
    }
  }

  return 0;
}

async function cmdList(options: CliOptions): Promise<number> {
  const store = await openLocalStore(options.root);
  const runs = await store.listRuns();
  const results = [];
  for (const runId of runs) {
    try {
      const stored = await store.loadRun(runId);
      results.push({
        runId: stored.run.id,
        status: stored.run.status,
        definitionId: stored.run.definitionId,
        createdAt: stored.run.createdAt,
      });
    } catch {
      results.push({ runId, status: 'ERROR' });
    }
  }
  output(results, options.json);
  return 0;
}

async function cmdInspect(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId) throw new UxqError('MISSING_RUN_ID', 'inspect 需要运行 ID', 'INPUT');

  const store = await openLocalStore(options.root);
  const stored = await store.loadRun(runId);
  const subCommand = positional[1];

  if (!subCommand) {
    // Overview
    output(
      {
        run: stored.run,
        context: stored.context,
        steps: stored.steps.map((s) => ({ stepId: s.stepId, status: s.status })),
        attempts: stored.attempts.length,
        events: stored.events.length,
        metrics: stored.metrics.length,
        rules: stored.rules.length,
        evidence: stored.evidence.length,
        evaluations: stored.evaluations,
        manifest: stored.manifest,
        hint: '使用 inspect <run-id> <evidence|metrics|rules|steps|evaluation> 查看详情',
      },
      options.json,
    );
    return 0;
  }

  if (subCommand === 'evidence') {
    output(
      {
        runId,
        evidence: stored.evidence.map((e) => ({
          id: e.id,
          sourceCategory: e.sourceCategory,
          materialType: e.materialType,
          sourceMethod: e.sourceMethod,
          lifecycle: e.lifecycle,
          validity: e.validity,
          summary: e.summary,
          observedAt: e.observedAt,
          privacy: e.privacy,
          limitations: e.limitations,
        })),
        count: stored.evidence.length,
      },
      options.json,
    );
    return 0;
  }

  if (subCommand === 'metrics') {
    output(
      {
        runId,
        metrics: stored.metrics.map((m) => ({
          id: m.id,
          metricId: m.metricId,
          status: m.status,
          ...(m.status === 'MEASURED' ? { value: m.value } : { reason: m.reason }),
          sampleCount: m.sampleCount,
          excludedSampleIds: m.excludedSampleIds,
          evidenceIds: m.evidenceIds,
          limitations: m.limitations,
        })),
        count: stored.metrics.length,
      },
      options.json,
    );
    return 0;
  }

  if (subCommand === 'rules') {
    output(
      {
        runId,
        rules: stored.rules.map((r) => ({
          id: r.id,
          ruleId: r.ruleId,
          executionStatus: r.executionStatus,
          outcome: r.outcome,
          evidenceIds: r.evidenceIds,
          reason: r.reason,
        })),
        count: stored.rules.length,
      },
      options.json,
    );
    return 0;
  }

  if (subCommand === 'steps') {
    output(
      {
        runId,
        steps: stored.steps.map((s) => ({
          stepId: s.stepId,
          status: s.status,
          attemptIds: s.attemptIds,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          outputIds: s.outputIds,
        })),
        attempts: stored.attempts.map((a) => ({
          stepId: a.stepId,
          number: a.number,
          status: a.status,
          startedAt: a.startedAt,
          endedAt: a.endedAt,
          durationMs: a.durationMs,
        })),
        count: stored.steps.length,
      },
      options.json,
    );
    return 0;
  }

  if (subCommand === 'evaluation') {
    output(
      {
        runId,
        evaluations: stored.evaluations,
        definition: {
          id: stored.definition.id,
          name: stored.definition.name,
          version: stored.definition.definitionVersion,
          dimensions: stored.definition.dimensions,
          methods: stored.definition.methods,
          metricCount: stored.definition.metrics.length,
          ruleCount: stored.definition.rules.length,
        },
        policy: {
          id: stored.definition.policy.id,
          name: stored.definition.policy.name,
          version: stored.definition.policy.version,
          mode: stored.definition.policy.mode,
        },
      },
      options.json,
    );
    return 0;
  }

  throw new UxqError(
    'INVALID_SUBCOMMAND',
    `未知检查子命令：${subCommand}，可用：evidence|metrics|rules|steps|evaluation`,
    'INPUT',
  );
}

async function cmdCancel(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId) throw new UxqError('MISSING_RUN_ID', 'cancel 需要运行 ID', 'INPUT');

  const store = await openLocalStore(options.root);
  await cancelRun(runId, store);
  output({ cancelled: runId }, options.json);
  return 0;
}

async function cmdReport(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId) throw new UxqError('MISSING_RUN_ID', 'report 需要运行 ID', 'INPUT');

  const store = await openLocalStore(options.root);
  const stored = await store.loadRun(runId);
  const bundle: RunBundle = {
    schemaVersion: '1.0.0',
    definition: stored.definition,
    plan: stored.plan,
    run: stored.run,
    context: stored.context,
    steps: stored.steps,
    attempts: stored.attempts,
    events: stored.events,
    tasks: stored.tasks,
    observations: stored.observations,
    metrics: stored.metrics,
    rules: stored.rules,
    evidence: stored.evidence,
  };
  const evaluation = stored.evaluations[0];
  const snapshot: EvaluationSnapshot = {
    evaluation: evaluation ?? {
      id: newId('eval'),
      schemaVersion: '1.0.0',
      createdAt: systemClock.now(),
      runId: stored.run.id,
      policyId: stored.definition.policy.id,
      policyVersion: stored.definition.policy.version,
      policyDigest: digest(stored.definition.policy),
      evaluationStatus: 'INSUFFICIENT_EVIDENCE',
      overallOutcome: 'NOT_RATED',
      overallScore: null,
      coverage: { planned: 0, applicable: 0, measured: 0, scored: 0, ratio: null },
      metricResultIds: [],
      ruleResultIds: [],
      scoreResultIds: [],
      dimensionResultIds: [],
      findingIds: [],
      evidenceIds: [],
      constraints: [],
      limitations: ['无结算结果'],
    },
    policy: stored.definition.policy,
    scores: [],
    dimensions: [],
    signals: [],
    findings: [],
  };
  const report = projectReport(bundle, snapshot, '0.1.0', systemClock.now());
  const markdown = renderMarkdown(report);

  output({ report, markdown }, options.json);
  return 0;
}

async function cmdBaseline(positional: string[], options: CliOptions): Promise<number> {
  const action = positional[0];
  if (!action)
    throw new UxqError('MISSING_ACTION', '请指定基线操作：create|update|list|delete', 'INPUT');

  const store = createInMemoryBaselineStore(systemClock);

  if (action === 'list') {
    const baselines = store.listBaselines();
    output({ baselines }, options.json);
    return 0;
  }

  if (action === 'create') {
    const name = positional[1];
    const runId = positional[2];
    if (!name || !runId)
      throw new UxqError('MISSING_ARGS', '用法：baseline create <name> <run-id>', 'INPUT');

    const runStore = await openLocalStore(options.root, systemClock);
    const stored = await runStore.loadRun(runId);
    const plan = compilePlan({ definition: stored.definition });
    const evaluation = stored.evaluations[0];
    if (!evaluation) throw new UxqError('NO_EVALUATION', '运行尚未产生评价结果', 'EXECUTION');
    const baseline = store.createBaseline(
      name,
      runId,
      stored.run,
      plan,
      stored.context,
      evaluation,
    );

    output({ baseline, message: `基线 ${name} 已创建` }, options.json);
    return 0;
  }

  if (action === 'delete') {
    const name = positional[1];
    if (!name) throw new UxqError('MISSING_NAME', '用法：baseline delete <name>', 'INPUT');

    store.deleteBaseline(name);
    output({ message: `基线 ${name} 已删除` }, options.json);
    return 0;
  }

  throw new UxqError('INVALID_ACTION', `未知基线操作：${action}`, 'INPUT');
}

async function cmdCompare(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  const baselineName = positional[1] ?? 'default';

  if (!runId) throw new UxqError('MISSING_RUN', '用法：compare <run-id> [baseline-name]', 'INPUT');

  const store = createInMemoryBaselineStore(systemClock);
  const baseline = store.getBaseline(baselineName);

  if (!baseline) {
    output(
      {
        error: `基线 ${baselineName} 不存在`,
        message: '请先创建基线：uxq baseline create <name> <run-id>',
      },
      options.json,
    );
    return 2;
  }

  const runStore = await openLocalStore(options.root, systemClock);
  const stored = await runStore.loadRun(runId);
  const currentEvaluation = stored.evaluations[0];
  if (!currentEvaluation) throw new UxqError('NO_EVALUATION', '运行尚未产生评价结果', 'EXECUTION');

  const baselineInput = {
    planDigest: baseline.planDigest,
    definitionId: baseline.definitionId,
    definitionVersion: baseline.definitionVersion,
    policyId: baseline.policyId,
    policyVersion: baseline.policyVersion,
    metrics: [] as import('@uxq/contracts').MetricResult[],
    rules: [] as import('@uxq/contracts').RuleResult[],
    evaluation: currentEvaluation,
    ...(baseline.browserVersion ? { browserVersion: baseline.browserVersion } : {}),
    ...(baseline.viewport ? { viewport: baseline.viewport } : {}),
  };
  const currentInput = {
    planDigest: stored.run.planDigest,
    definitionId: stored.run.definitionId,
    definitionVersion: stored.definition.definitionVersion,
    policyId: currentEvaluation.policyId,
    policyVersion: currentEvaluation.policyVersion,
    metrics: [] as import('@uxq/contracts').MetricResult[],
    rules: [] as import('@uxq/contracts').RuleResult[],
    evaluation: currentEvaluation,
  };
  const comparison = compareRuns(baselineInput, currentInput);

  output(
    {
      baseline: baselineName,
      currentRun: runId,
      comparability: comparison.comparability,
      dimensions: comparison.dimensions,
      scoreDelta: comparison.scoreDelta,
      caveats: comparison.caveats,
    },
    options.json,
  );

  return 0;
}

async function cmdFinding(positional: string[], options: CliOptions): Promise<number> {
  const action = positional[0];
  if (!action)
    throw new UxqError('MISSING_ACTION', '请指定 Finding 操作：list|transition', 'INPUT');

  if (action === 'list') {
    const runId = positional[1];
    if (!runId) throw new UxqError('MISSING_RUN', '用法：finding list <run-id>', 'INPUT');

    const runStore = await openLocalStore(options.root, systemClock);
    const stored = await runStore.loadRun(runId);

    const findingIds = stored.evaluations.flatMap((e) => e.findingIds);
    output(
      {
        runId,
        findingIds,
        count: findingIds.length,
      },
      options.json,
    );
    return 0;
  }

  throw new UxqError('INVALID_ACTION', `未知 Finding 操作：${action}`, 'INPUT');
}

async function cmdSettle(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId)
    throw new UxqError('MISSING_RUN', '用法：settle <run-id> --policy <policy-file>', 'INPUT');
  if (!options.policy)
    throw new UxqError('MISSING_POLICY', 'settle 需要 --policy 指定评分策略文件', 'INPUT');

  const runStore = await openLocalStore(options.root, systemClock);
  const stored = await runStore.loadRun(runId);

  const policyContent = await readFile(options.policy, 'utf8');
  const policy = JSON.parse(policyContent) as ScoringPolicy;

  // Use existing metrics and rules from the run
  const metricResults = stored.metrics;
  const ruleResults = stored.rules;

  // Aggregate dimensions from existing scores
  const dimensions: DimensionResult[] =
    stored.evaluations.length > 0
      ? policy.dimensions.map((dim) => ({
          id: newId('dim') as import('@uxq/contracts').Id,
          schemaVersion: '1.0.0' as const,
          createdAt: systemClock.now(),
          status: 'SCORED' as const,
          value: 75,
          runId: runId as import('@uxq/contracts').Id,
          dimensionId: dim.dimensionId,
          scoreResultIds: [] as import('@uxq/contracts').IdList,
          excludedMetricIds: [] as import('@uxq/contracts').IdList,
          coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
          weight: dim.weight,
          limitations: ['重结算近似值'] as import('@uxq/contracts').TextList,
        }))
      : [];

  const evaluation = settleEvaluation(
    policy,
    dimensions,
    ruleResults,
    metricResults,
    runId,
    systemClock.now(),
  );

  output(
    {
      runId,
      evaluation: {
        id: evaluation.id,
        evaluationStatus: evaluation.evaluationStatus,
        overallOutcome: evaluation.overallOutcome,
        overallScore: evaluation.overallScore,
        coverage: evaluation.coverage,
        constraints: evaluation.constraints,
        limitations: evaluation.limitations,
      },
      message: '重新结算完成，新评价结果已生成（未写入存储）',
    },
    options.json,
  );

  return 0;
}

async function cmdQualityGate(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId)
    throw new UxqError('MISSING_RUN', '用法：quality-gate <run-id> [--gate <file>]', 'INPUT');

  const runStore = await openLocalStore(options.root, systemClock);
  const stored = await runStore.loadRun(runId);
  const evaluation = stored.evaluations[0];

  if (!evaluation) {
    output({ runId, conformance: 'UNKNOWN', message: '运行尚未产生评价结果' }, options.json);
    return 4;
  }

  let gateResult: { passed: boolean; details: string[] } = { passed: true, details: [] };

  if (options.gate) {
    const gateContent = await readFile(options.gate, 'utf8');
    const gate = JSON.parse(gateContent) as { minimumScore?: number; requiredOutcome?: string[] };
    const details: string[] = [];

    if (gate.minimumScore !== undefined && evaluation.overallScore !== null) {
      const passed = evaluation.overallScore >= gate.minimumScore;
      details.push(
        `最低分数：${evaluation.overallScore} >= ${gate.minimumScore} → ${passed ? '通过' : '失败'}`,
      );
      if (!passed) gateResult.passed = false;
    }

    if (gate.requiredOutcome && gate.requiredOutcome.length > 0) {
      const passed = gate.requiredOutcome.includes(evaluation.overallOutcome);
      details.push(
        `总体结论：${evaluation.overallOutcome} ∈ [${gate.requiredOutcome.join(', ')}] → ${passed ? '通过' : '失败'}`,
      );
      if (!passed) gateResult.passed = false;
    }

    gateResult = { passed: gateResult.passed, details };
  }

  const conformance =
    evaluation.overallOutcome === 'PASS' && evaluation.evaluationStatus === 'COMPLETE'
      ? 'PASS'
      : evaluation.overallOutcome === 'FAIL'
        ? 'FAIL'
        : evaluation.evaluationStatus === 'INSUFFICIENT_EVIDENCE'
          ? 'INSUFFICIENT_EVIDENCE'
          : 'INCONCLUSIVE';

  output(
    {
      runId,
      conformance,
      evaluationStatus: evaluation.evaluationStatus,
      overallOutcome: evaluation.overallOutcome,
      overallScore: evaluation.overallScore,
      coverage: evaluation.coverage,
      constraints: evaluation.constraints,
      gate: gateResult,
      limitations: evaluation.limitations,
    },
    options.json,
  );

  return gateResult.passed ? 0 : 1;
}

async function cmdVerify(positional: string[], options: CliOptions): Promise<number> {
  const action = positional[0];
  if (!action) throw new UxqError('MISSING_ACTION', '请指定验证操作：plan|result', 'INPUT');

  if (action === 'plan') {
    const runId = positional[1];
    if (!runId)
      throw new UxqError(
        'MISSING_RUN',
        '用法：verify plan <run-id> --finding-id <id> [--gate <definition-file>]',
        'INPUT',
      );
    if (!options.findingId)
      throw new UxqError('MISSING_FINDING', 'verify plan 需要 --finding-id', 'INPUT');

    const runStore = await openLocalStore(options.root, systemClock);
    const stored = await runStore.loadRun(runId);

    const definition = options.gate ? await loadDefinition(options.gate) : stored.definition;

    const plan = createVerificationPlan(
      [options.findingId] as import('@uxq/contracts').IdList,
      [],
      runId,
      definition,
      stored.rules.map((r) => r.ruleId) as import('@uxq/contracts').IdList,
      stored.metrics.map((m) => m.metricId) as import('@uxq/contracts').IdList,
      ['复测验证通过条件'],
      true,
      systemClock.now(),
    );

    output(
      {
        verificationPlan: plan,
        message: `验证计划已创建，关联 Finding: ${options.findingId}`,
      },
      options.json,
    );
    return 0;
  }

  if (action === 'result') {
    const planId = positional[1];
    if (!planId)
      throw new UxqError(
        'MISSING_PLAN_ID',
        '用法：verify result <plan-id> --source-run <run-id>',
        'INPUT',
      );

    const comparability: Comparability = options.sourceRun ? 'COMPARABLE' : 'NOT_COMPARABLE';

    const result = createVerificationResult(
      planId,
      '',
      [],
      comparability,
      systemClock.now(),
      options.sourceRun,
    );

    output(
      {
        verificationResult: result,
        message: '验证结果已创建',
      },
      options.json,
    );
    return 0;
  }

  throw new UxqError('INVALID_ACTION', `未知验证操作：${action}`, 'INPUT');
}

async function cmdConformanceSpec(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId) throw new UxqError('MISSING_RUN', '用法：conformance <run-id>', 'INPUT');

  const runStore = await openLocalStore(options.root, systemClock);
  const stored = await runStore.loadRun(runId);

  const bundle: RunBundle = {
    schemaVersion: '1.0.0',
    definition: stored.definition,
    plan: stored.plan,
    run: stored.run,
    context: stored.context,
    steps: stored.steps,
    attempts: stored.attempts,
    events: stored.events,
    tasks: stored.tasks,
    observations: stored.observations,
    metrics: stored.metrics,
    rules: stored.rules,
    evidence: stored.evidence,
  };

  const evaluation = stored.evaluations[0];
  const snapshot: EvaluationSnapshot = {
    evaluation: evaluation ?? {
      id: newId('eval'),
      schemaVersion: '1.0.0',
      createdAt: systemClock.now(),
      runId: stored.run.id,
      policyId: stored.definition.policy.id,
      policyVersion: stored.definition.policy.version,
      policyDigest: digest(stored.definition.policy),
      evaluationStatus: 'INSUFFICIENT_EVIDENCE',
      overallOutcome: 'NOT_RATED',
      overallScore: null,
      coverage: { planned: 0, applicable: 0, measured: 0, scored: 0, ratio: null },
      metricResultIds: [],
      ruleResultIds: [],
      scoreResultIds: [],
      dimensionResultIds: [],
      findingIds: [],
      evidenceIds: [],
      constraints: [],
      limitations: ['无评价结果'],
    },
    policy: stored.definition.policy,
    scores: [],
    dimensions: [],
    signals: [],
    findings: [],
  };

  const report = runConformanceCheck(bundle, snapshot, undefined, systemClock.now());
  const markdown = renderConformanceMarkdown(report);

  output(
    {
      runId,
      overallStatus: report.overallStatus,
      summary: report.summary,
      results: report.results,
      markdown,
    },
    options.json,
  );

  return report.overallStatus === 'FAIL' ? 5 : 0;
}

// ============================================================================
// Skill 安装/卸载
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findSkillSource(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i += 1) {
    const candidate = join(dir, 'skills', 'uxq-ux-evaluation');
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new UxqError(
    'SKILL_NOT_FOUND',
    `Skill 源目录不存在（从 ${__dirname} 向上查找失败）`,
    'EXECUTION',
  );
}

async function cmdInstallSkill(options: CliOptions): Promise<number> {
  const agent = (options.agent ?? 'qoder') as AgentTarget;
  const copy = options.copy ?? false;
  const agents = agent === 'all' ? ALL_AGENTS : [agent as SupportedAgent];
  const skillSource = findSkillSource();

  interface InstallResult {
    agent: string;
    targetPath: string;
    mode: 'symlink' | 'copy' | 'skipped';
    error?: string;
  }

  const results: InstallResult[] = [];

  for (const a of agents) {
    const targetDir = AGENT_SKILL_DIRS[a];
    if (!targetDir) {
      process.stderr.write(`[skip] ${a} — 未知 agent\n`);
      results.push({ agent: a, targetPath: '', mode: 'skipped', error: '未知 agent' });
      continue;
    }

    const dest = join(targetDir, 'uxq-ux-evaluation');

    if (!existsSync(targetDir)) {
      process.stderr.write(`[skip] ${a} — 目录不存在：${targetDir}\n`);
      results.push({ agent: a, targetPath: dest, mode: 'skipped', error: 'Agent 目录不存在' });
      continue;
    }

    if (existsSync(dest)) {
      try {
        rmSync(dest, { recursive: true, force: true });
      } catch {
        // 忽略清理失败
      }
    }

    try {
      if (copy) {
        cpSync(skillSource, dest, { recursive: true });
        process.stderr.write(`[ok] ${a} — 已复制 skill → ${dest}\n`);
        results.push({ agent: a, targetPath: dest, mode: 'copy' });
      } else {
        try {
          symlinkSync(skillSource, dest, 'dir');
          process.stderr.write(`[ok] ${a} — 已链接 skill → ${dest}\n`);
          results.push({ agent: a, targetPath: dest, mode: 'symlink' });
        } catch (symlinkError) {
          if (platform() === 'win32') {
            cpSync(skillSource, dest, { recursive: true });
            process.stderr.write(`[ok] ${a} — 已复制 skill（符号链接失败）→ ${dest}\n`);
            results.push({ agent: a, targetPath: dest, mode: 'copy' });
          } else {
            throw symlinkError;
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[error] ${a} — 安装失败：${message}\n`);
      results.push({ agent: a, targetPath: dest, mode: 'skipped', error: message });
    }
  }

  const successCount = results.filter((r) => r.mode !== 'skipped').length;
  process.stderr.write(`\n完成（${successCount}/${agents.length}）。重启 Agent 后 skill 生效。\n`);

  output({ command: 'install-skill', results }, options.json);
  return successCount === 0 ? 4 : 0;
}

async function cmdUninstallSkill(options: CliOptions): Promise<number> {
  const agent = (options.agent ?? 'qoder') as SupportedAgent;
  const targetDir = AGENT_SKILL_DIRS[agent];

  if (!targetDir) {
    throw new UxqError(
      'INVALID_CONFIGURATION',
      `未知 agent：${agent}。支持：qoder、claude、codex、kiro`,
      'INPUT',
    );
  }

  const dest = join(targetDir, 'uxq-ux-evaluation');

  if (!existsSync(dest)) {
    process.stderr.write(`[uxq] Skill 未安装：${dest}\n`);
    output({ command: 'uninstall-skill', agent, removed: false, wasSymlink: false }, options.json);
    return 0;
  }

  let wasSymlink = false;
  try {
    const stats = lstatSync(dest);
    wasSymlink = stats.isSymbolicLink();
  } catch {
    // 忽略
  }

  try {
    rmSync(dest, { recursive: true, force: true });
    process.stderr.write(`[uxq] 已卸载 skill ← ${dest}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UxqError('EXECUTION_ERROR', `卸载失败：${message}`, 'EXECUTION');
  }

  output({ command: 'uninstall-skill', agent, removed: true, wasSymlink }, options.json);
  return 0;
}

async function main(): Promise<void> {
  let exitCode = 0;
  try {
    const { command, positional, options } = parseArgs(process.argv);

    switch (command) {
      case '':
      case 'help':
        printHelp();
        break;
      case 'version':
        exitCode = await cmdVersion(options);
        break;
      case 'doctor':
        exitCode = await cmdDoctor(options);
        break;
      case 'init':
        exitCode = await cmdInit(positional, options);
        break;
      case 'validate':
        exitCode = await cmdValidate(positional, options);
        break;
      case 'plan':
        exitCode = await cmdPlan(positional, options);
        break;
      case 'evaluate':
        exitCode = await cmdEvaluate(positional, options);
        break;
      case 'list':
        exitCode = await cmdList(options);
        break;
      case 'inspect':
        exitCode = await cmdInspect(positional, options);
        break;
      case 'cancel':
        exitCode = await cmdCancel(positional, options);
        break;
      case 'report':
        exitCode = await cmdReport(positional, options);
        break;
      case 'baseline':
        exitCode = await cmdBaseline(positional, options);
        break;
      case 'compare':
        exitCode = await cmdCompare(positional, options);
        break;
      case 'finding':
        exitCode = await cmdFinding(positional, options);
        break;
      case 'settle':
        exitCode = await cmdSettle(positional, options);
        break;
      case 'quality-gate':
        exitCode = await cmdQualityGate(positional, options);
        break;
      case 'verify':
        exitCode = await cmdVerify(positional, options);
        break;
      case 'conformance':
        exitCode = await cmdConformanceSpec(positional, options);
        break;
      case 'install-skill':
        exitCode = await cmdInstallSkill(options);
        break;
      case 'uninstall-skill':
        exitCode = await cmdUninstallSkill(options);
        break;
      default:
        process.stderr.write(`未知命令：${command}\n`);
        printHelp();
        exitCode = 2;
    }
  } catch (error) {
    if (error instanceof UxqError) {
      process.stderr.write(`错误 [${error.code}]：${error.message}\n`);
      exitCode =
        error.category === 'INPUT'
          ? 2
          : error.category === 'ENVIRONMENT'
            ? 3
            : error.category === 'EXECUTION'
              ? 4
              : error.category === 'CONTRACT'
                ? 5
                : error.category === 'ARTIFACT'
                  ? 6
                  : error.category === 'CANCELLED'
                    ? 130
                    : 1;
    } else {
      process.stderr.write(`未知错误：${error instanceof Error ? error.message : String(error)}\n`);
      exitCode = 1;
    }
  }
  process.exit(exitCode);
}

main();
