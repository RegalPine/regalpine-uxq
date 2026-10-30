#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { existsSync, rmSync, symlinkSync, cpSync, lstatSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import { UxqError, systemClock, digest, newId } from '@uxq/core';
import { parseContract, assertDefinition, defaultProfile, ruleMetricIds, isEvidenceUsable } from '@uxq/contracts';
import type {
  EvaluationDefinition,
  ExecutionProfile,
  RunBundle,
  EvaluationSnapshot,
} from '@uxq/contracts';
import { openLocalStore, compilePlan, createRun, executeRun, cancelRun, openLocalBaselineStore, createEvaluationExecutor, persistEvaluation, latestSnapshot, runBundle } from '@uxq/execution';
import type { RunStore, StoredRun } from '@uxq/execution';
import type { StepExecutor } from '@uxq/execution';
import { PlaywrightBrowserAdapter } from '@uxq/browser';
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
  url?: string;
  reason?: string;
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
    } else if (arg === '--url' && i + 1 < args.length) {
      options.url = args[++i]!;
    } else if (arg === '--reason' && i + 1 < args.length) {
      options.reason = args[++i]!;
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
  compare <run-id> [baseline-name]  与基线比较（默认基线名：default）
  finding <action>        Finding 查询 (list)
  settle <run-id>         重新结算并保存（需 --policy 指定策略）
  quality-gate <run-id>   质量门禁检查
  verify <action>         复测验证 (plan|result)
  conformance <run-id>    规范符合性检查
  install-skill           安装 UXQ Skill 到 Agent
  uninstall-skill         从 Agent 卸载 UXQ Skill

通用选项：
  --root <dir>            存储根目录（默认 .uxq）
  --config <file>         运行配置文件
  --json                  机器输出格式
  --gate <file>           质量门禁配置
  --source-run <id>       关联源运行
  --finding-id <id>       关联 Finding ID
  --policy <file>         评分策略文件
  --url <url>             init 生成真实页面采集模板
  --reason <text>         baseline update 的更新原因
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
  const parsed = /\.ya?ml$/i.test(file) ? parseYaml(content, { maxAliasCount: 50 }) as unknown : JSON.parse(content) as unknown;
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
  let available = false;
  let browserVersion: string | undefined;
  let error: string | undefined;
  try {
    const profile = parseContract('ExecutionProfile', { ...defaultProfile(), ...await loadConfig(options.config) });
    const session = await new PlaywrightBrowserAdapter().launch(profile);
    try { available = true; browserVersion = session.browserVersion; } finally { await session.close(); }
  } catch (cause) { error = cause instanceof Error ? cause.message : '浏览器不可用'; }
  output({ node: process.version, platform: process.platform, arch: process.arch, storage: options.root,
    browser: 'playwright', available, browserVersion, error }, options.json);
  return available ? 0 : 3;
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


  example.target.type = 'OFFLINE';
  example.name = '离线合成观测示例（非产品评价）';
  if (options.url) {
    const url = new URL(options.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      throw new UxqError('INVALID_URL', 'init --url 仅接受不含凭据的 HTTP(S) URL', 'INPUT');
    example.name = '页面标题结构采集示例';
    example.target = { ...example.target, type: 'PAGE', url: url.href };
    example.profile = { allowedOrigins: [url.origin], allowPrivateNetwork: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), allowSideEffects: false };
    example.dimensions = ['D03'];
    const metric = example.metrics[0]!;
    Object.assign(metric, { id: 'metric-heading-count', name: '一级标题数量', description: '实测 h1 数量；仅作为结构代理指标',
      dimensionId: 'D03', metricType: 'PROXY', sourceKey: 'heading-count', unit: 'count', minimum: 0, maximum: 10000,
      aggregation: 'LATEST', direction: 'HIGHER_IS_BETTER', evidenceRequired: true,
      limitations: ['标题数量不能代表页面可用性或整体 UX'] });
    example.policy.bindings = [{ metricId: metric.id, weight: 1, normalization: 'LINEAR_HIGHER', min: 0, max: 1 }];
    example.policy.dimensions = [{ dimensionId: 'D03', weight: 1, minimumCoverage: 1 }];
    example.policy.minimumCoverage = 1; example.policy.missingPolicy = 'BLOCK'; example.policy.allowPartial = false;
    example.policy.criticalRuleIds = ['rule-heading'];
    example.rules = [{ id: 'rule-heading', schemaVersion: '1.0.0', createdAt: systemClock.now(), version: '0.1.0',
      name: '示例：存在且仅有一个一级标题', expression: { op: 'EQ', metricId: metric.id, expected: 1 }, required: true, critical: true }];
    const base = { required: true, inputRefs: [], requiredCapabilities: [] };
    example.steps = [
      { ...base, stepId: 'navigate', kind: 'PAGE_NAVIGATION', dependsOn: [], outputContracts: [], sessionId: 'page', action: { action: 'NAVIGATE', url: url.href } },
      { ...base, stepId: 'capture', kind: 'OBSERVATION_CAPTURE', dependsOn: ['navigate'], outputContracts: ['RawObservation', 'Evidence'], sessionId: 'page',
        action: { action: 'CAPTURE', selector: 'h1', key: 'heading-count', extractor: 'COUNT', unit: 'count' } },
      { ...base, stepId: 'screenshot', kind: 'OBSERVATION_CAPTURE', dependsOn: ['capture'], outputContracts: ['Evidence'], sessionId: 'page', action: { action: 'SCREENSHOT', name: 'page' } },
      { ...base, stepId: 'measure', kind: 'METRIC_CALCULATION', dependsOn: ['capture'], outputContracts: ['MetricResult'], metricIds: [metric.id], inputRefs: [{ stepId: 'capture', contract: 'RawObservation' }] },
      { ...base, stepId: 'rules', kind: 'RULE_EVALUATION', dependsOn: ['measure'], outputContracts: ['RuleResult'], ruleIds: ['rule-heading'], inputRefs: [{ stepId: 'measure', contract: 'MetricResult' }] },
      { ...base, stepId: 'score', kind: 'SCORING', dependsOn: ['measure', 'rules', 'screenshot'], outputContracts: ['ScoreResult'], inputRefs: [{ stepId: 'measure', contract: 'MetricResult' }] },
    ];
    example.scope.entityIds = [example.target.id]; example.scope.routes = [url.pathname];
    example.limitations = ['本模板只评估标题结构；不是完整 UX、WCAG 或真实用户体验评价。权重与规则需按项目确认。'];
    example.scope.limitations = [...example.limitations]; example.policy.limitations = [...example.limitations];
  }
  parseContract('EvaluationDefinition', example);
  await mkdir(dirname(resolve(file)), { recursive: true });
  await writeFile(file, /\.ya?ml$/i.test(file) ? stringifyYaml(example) : JSON.stringify(example, null, 2), 'utf8');
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
  return 0;
}

async function cmdEvaluate(positional: string[], options: CliOptions): Promise<number> {
  const file = positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'evaluate 需要定义文件路径', 'INPUT');
  const definition = await loadDefinition(file);
  const config = await loadConfig(options.config);
  const store = await openLocalStore(options.root);
  const pipeline = createEvaluationExecutor(definition, store);
  const { run } = await createRun(definition, config, { store });
  const release = await store.acquireLock(run.id);
  try {
    process.stderr.write(`运行已创建：${run.id}\n`);
    const stored = await executeRun(run.id, { store, executeStep: pipeline.executeStep });
    const snapshot = await persistEvaluation(stored, store);
    const report = await persistReport(stored, store);
    output({ runId: run.id, status: stored.run.status, evaluation: snapshot.evaluation, report }, options.json);
    if (stored.run.status !== 'COMPLETED') return stored.attempts.some((attempt) => attempt.error?.category === 'ENVIRONMENT') ? 3 : 4;
    if (options.gate) return (await assessGate(snapshot.evaluation, options.gate)).code;
    return 0;
  } finally { await pipeline.close(); await release(); }
}

async function persistReport(stored: StoredRun, store: RunStore) {
  const snapshot = latestSnapshot(stored);
  const report = projectReport(runBundle(stored), snapshot, VERSION, systemClock.now());
  const markdown = renderMarkdown(report);
  const jsonContent = JSON.stringify(report, null, 2);
  const artifact = createReportArtifact(stored.run.id, snapshot.evaluation.id, VERSION, jsonContent, markdown);
  artifact.json = { ...await store.appendArtifact(stored.run.id, `reports/${artifact.id}.json`, new TextEncoder().encode(jsonContent)), mediaType: 'application/json' };
  artifact.markdown = { ...await store.appendArtifact(stored.run.id, `reports/${artifact.id}.md`, new TextEncoder().encode(markdown)), mediaType: 'text/markdown' };
  stored.manifest.reports.push(artifact); stored.manifest.revision++;
  await store.saveRun(stored);
  return artifact;
}

async function assessGate(evaluation: EvaluationResult | undefined, file?: string) {
  const gate = file ? JSON.parse(await readFile(file, 'utf8')) as { minimumScore?: number; requiredOutcome?: string[] } : {};
  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) throw new UxqError('INVALID_GATE', '门禁配置必须是对象', 'INPUT');
  if (gate.minimumScore !== undefined && (!Number.isFinite(gate.minimumScore) || gate.minimumScore < 0 || gate.minimumScore > 100))
    throw new UxqError('INVALID_GATE', 'minimumScore 必须是 0–100 的数字', 'INPUT');
  if (gate.requiredOutcome !== undefined && (!Array.isArray(gate.requiredOutcome) || gate.requiredOutcome.some((value) => !['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT_RATED'].includes(value))))
    throw new UxqError('INVALID_GATE', 'requiredOutcome 必须是合法结论数组', 'INPUT');
  const conformance = !evaluation ? 'UNKNOWN' : evaluation.overallOutcome;
  const details: string[] = [];
  if (!evaluation || evaluation.overallScore === null || !['COMPLETE', 'PARTIAL'].includes(evaluation.evaluationStatus) || ['INCONCLUSIVE', 'NOT_RATED'].includes(evaluation.overallOutcome))
    return { passed: false, code: 4, conformance, details: ['无可用于门禁的确定评价或数值评分'] };
  if (evaluation.overallOutcome !== 'PASS') details.push('评价结论未通过');
  if (gate.minimumScore !== undefined && evaluation.overallScore < gate.minimumScore) details.push(`总分低于 ${gate.minimumScore}`);
  if (gate.requiredOutcome?.length && !gate.requiredOutcome.includes(evaluation.overallOutcome)) details.push('评价结论不满足门禁要求');
  return { passed: details.length === 0, code: details.length ? 1 : 0, conformance, details };
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
        policy: latestSnapshot(stored).policy,
        snapshot: latestSnapshot(stored),
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
  const stored = await (await openLocalStore(options.root)).loadRun(runId);
  const report = projectReport(runBundle(stored), latestSnapshot(stored), VERSION, systemClock.now());
  const markdown = renderMarkdown(report);
  if (options.json) output({ report, markdown }, true);
  else process.stdout.write(markdown + '\n');
  return 0;
}

async function cmdBaseline(positional: string[], options: CliOptions): Promise<number> {
  const [action, name, runId] = positional;
  const store = await openLocalBaselineStore(options.root);
  if (action === 'list') { output({ baselines: await store.list() }, options.json); return 0; }
  if (action === 'delete' && name) { await store.delete(name); output({ message: `基线 ${name} 已删除` }, options.json); return 0; }
  if ((action === 'create' || action === 'update') && name && runId) {
    if (action === 'update' && !options.reason?.trim()) throw new UxqError('MISSING_REASON', 'baseline update 需要 --reason', 'INPUT');
    const stored = await (await openLocalStore(options.root)).loadRun(runId);
    const evaluation = stored.evaluations.at(-1);
    if (!evaluation) throw new UxqError('NO_EVALUATION', '运行尚未产生评价结果', 'EXECUTION');
    const baseline = await store.save(name, stored, evaluation, action === 'update' ? options.reason : undefined);
    output({ baseline, message: `基线 ${name} 已保存` }, options.json); return 0;
  }
  throw new UxqError('INVALID_ARGS', '用法：baseline create|update <name> <run-id>；list；delete <name>', 'INPUT');
}

async function cmdCompare(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0]; const name = positional[1] ?? 'default';
  if (!runId) throw new UxqError('MISSING_RUN', 'compare 需要运行 ID', 'INPUT');
  const baseline = await (await openLocalBaselineStore(options.root)).get(name);
  if (!baseline) throw new UxqError('BASELINE_NOT_FOUND', `基线 ${name} 不存在`, 'INPUT');
  const stored = await (await openLocalStore(options.root)).loadRun(runId);
  const evaluation = stored.evaluations.at(-1);
  if (!evaluation) throw new UxqError('NO_EVALUATION', '运行尚未产生评价结果', 'EXECUTION');
  const comparison = compareRuns({ ...baseline.baseline, metrics: baseline.metrics, rules: baseline.rules, evaluation: baseline.evaluation },
    { planDigest: stored.plan.planDigest, definitionId: stored.definition.id, definitionVersion: stored.definition.definitionVersion,
      policyId: evaluation.policyId, policyVersion: evaluation.policyVersion, viewport: stored.context.profile.viewport,
      ...(stored.context.browserVersion ? { browserVersion: stored.context.browserVersion } : {}), metrics: stored.metrics, rules: stored.rules, evaluation });
  if (baseline.evaluation.policyDigest !== evaluation.policyDigest) {
    comparison.comparability = 'NOT_COMPARABLE'; comparison.caveats.push('评分策略内容摘要不同');
  }
  if (comparison.comparability === 'NOT_COMPARABLE') {
    comparison.scoreDelta = null;
    comparison.metricDeltas = comparison.metricDeltas.map((metric) => ({ ...metric, delta: null, deltaPercent: null }));
  }
  output({ baseline: name, currentRun: runId, ...comparison }, options.json);
  return comparison.comparability === 'NOT_COMPARABLE' ? 4 : 0;
}

async function cmdFinding(positional: string[], options: CliOptions): Promise<number> {
  if (positional[0] !== 'list' || !positional[1]) throw new UxqError('INVALID_ARGS', '用法：finding list <run-id>', 'INPUT');
  const runId = positional[1];
  const stored = await (await openLocalStore(options.root)).loadRun(runId);
  const findings = latestSnapshot(stored).findings;
  output({ runId, findings, findingIds: findings.map((finding) => finding.id), count: findings.length }, options.json);
  return 0;
}

async function cmdSettle(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId || !options.policy) throw new UxqError('INVALID_ARGS', '用法：settle <run-id> --policy <file>', 'INPUT');
  const policy = parseContract('ScoringPolicy', JSON.parse(await readFile(options.policy, 'utf8')) as unknown);
  const store = await openLocalStore(options.root);
  const release = await store.acquireLock(runId);
  try {
    const stored = await store.loadRun(runId);
    if (!['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(stored.run.status))
      throw new UxqError('RUN_ACTIVE', '活动运行不能重新结算', 'EXECUTION');
    const snapshot = await persistEvaluation(stored, store, policy);
    const report = await persistReport(stored, store);
    output({ runId, evaluation: snapshot.evaluation, scores: snapshot.scores, dimensions: snapshot.dimensions, report,
      message: '重新结算完成，评价快照与报告已写入存储' }, options.json);
    return 0;
  } finally { await release(); }
}

async function cmdQualityGate(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId) throw new UxqError('MISSING_RUN', 'quality-gate 需要运行 ID', 'INPUT');
  const stored = await (await openLocalStore(options.root)).loadRun(runId);
  const evaluation = stored.evaluations.at(-1);
  const gate = await assessGate(evaluation, options.gate);
  output({ runId, conformance: gate.conformance, evaluationStatus: evaluation?.evaluationStatus ?? null,
    overallOutcome: evaluation?.overallOutcome ?? null, overallScore: evaluation?.overallScore ?? null,
    coverage: evaluation?.coverage ?? null, constraints: evaluation?.constraints ?? [], gate,
    limitations: evaluation?.limitations ?? ['运行没有评价结果'] }, options.json);
  return gate.code;
}

async function cmdVerify(positional: string[], options: CliOptions): Promise<number> {
  const [action, id] = positional;
  if (!id) throw new UxqError('MISSING_ID', 'verify plan <run-id> --finding-id <id>；verify result <plan-id> --source-run <new-run-id>', 'INPUT');
  parseContract('Id', id);
  const dir = join(options.root, 'verifications');
  const store = await openLocalStore(options.root);
  if (action === 'plan') {
    if (!options.findingId) throw new UxqError('MISSING_FINDING', 'verify plan 需要 --finding-id', 'INPUT');
    const stored = await store.loadRun(id);
    const snapshot = latestSnapshot(stored);
    const finding = snapshot.findings.find((item) => item.id === options.findingId);
    if (!finding) throw new UxqError('FINDING_NOT_FOUND', '该运行中不存在指定 Finding', 'INPUT');
    const signals = snapshot.signals.filter((signal) => finding.diagnosticSignalIds.includes(signal.id));
    const sourceIds = new Set(signals.flatMap((signal) => signal.sourceResultIds));
    const rules = stored.rules.filter((rule) => sourceIds.has(rule.id)).map((rule) => rule.ruleId);
    const metrics = [...new Set([...stored.metrics.filter((metric) => sourceIds.has(metric.id)).map((metric) => metric.metricId),
      ...stored.definition.rules.filter((rule) => rules.includes(rule.id)).flatMap((rule) => ruleMetricIds(rule.expression))])];
    const plan = createVerificationPlan([finding.id], [], id, stored.definition, rules, metrics,
      ['关联指标完成实测、关联规则全部通过且运行成功；使用相同定义与执行配置'], false, systemClock.now());
    parseContract('VerificationPlan', plan);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${plan.id}.json`), JSON.stringify(plan, null, 2), { encoding: 'utf8', flag: 'wx' });
    output({ verificationPlan: plan, message: '验证计划已保存；请重新 evaluate 后使用新运行生成 result' }, options.json);
    return 0;
  }
  if (action === 'result') {
    if (!options.sourceRun) throw new UxqError('MISSING_RUN', 'verify result 需要 --source-run 指向新的实际运行', 'INPUT');
    const plan = parseContract('VerificationPlan', JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')) as unknown);
    const baseline = await store.loadRun(plan.baselineRunId);
    const current = await store.loadRun(options.sourceRun);
    const shape = (stored: StoredRun) => ({ planDigest: stored.plan.planDigest, definitionId: stored.definition.id,
      definitionVersion: stored.definition.definitionVersion, policyId: latestSnapshot(stored).policy.id,
      policyVersion: latestSnapshot(stored).policy.version, viewport: stored.context.profile.viewport,
      ...(stored.context.browserVersion ? { browserVersion: stored.context.browserVersion } : {}) });
    const comparison = checkComparability(shape(baseline), shape(current));
    const sameDefinition = digest(current.definition) === digest(plan.definition);
    const fresh = current.run.id !== baseline.run.id && Date.parse(current.run.createdAt) >= Date.parse(plan.createdAt);
    const samePolicy = latestSnapshot(baseline).evaluation.policyDigest === latestSnapshot(current).evaluation.policyDigest;
    const comparable = sameDefinition && fresh && samePolicy && comparison.comparability === 'COMPARABLE';
    const now = systemClock.now();
    const metrics = plan.requiredMetricIds.map((metricId) => current.metrics.find((metric) => metric.metricId === metricId));
    const rules = plan.requiredRuleIds.map((ruleId) => current.rules.find((rule) => rule.ruleId === ruleId));
    const evidenceIds = [...new Set([...metrics.flatMap((metric) => metric?.evidenceIds ?? []), ...rules.flatMap((rule) => rule?.evidenceIds ?? [])])];
    const validEvidence = evidenceIds.length > 0 && evidenceIds.every((evidenceId) => current.evidence.some((evidence) =>
      evidence.id === evidenceId && isEvidenceUsable(evidence, now, 'VERIFICATION')));
    for (const evidence of current.evidence.filter((evidence) => evidenceIds.includes(evidence.id))) {
      if (evidence.artifact) await store.readArtifact(current.run.id, evidence.artifact);
    }
    const result = createVerificationResult(plan.id, plan.criteriaDigest, plan.findingIds,
      comparable ? 'COMPARABLE' : 'NOT_COMPARABLE', now, current.run.id, evidenceIds);
    result.startedAt = now; result.endedAt = now;
    result.status = !comparable ? 'BLOCKED' : current.run.status !== 'COMPLETED' || rules.some((rule) => rule?.outcome === 'FAIL') ? 'FAILED'
      : metrics.every((metric) => metric?.status === 'MEASURED') && rules.every((rule) => rule?.executionStatus === 'COMPLETED' && rule.outcome === 'PASS') && validEvidence ? 'PASSED' : 'INCONCLUSIVE';
    result.reason = result.status === 'PASSED' ? '新运行中的关联指标、规则和证据满足验证条件' : '复测失败、条件不可比或证据不足';
    parseContract('VerificationResult', result);
    await writeFile(join(dir, `${result.id}.json`), JSON.stringify(result, null, 2), { encoding: 'utf8', flag: 'wx' });
    output({ verificationResult: result }, options.json);
    return result.status === 'PASSED' ? 0 : result.status === 'FAILED' ? 1 : 4;
  }
  throw new UxqError('INVALID_ACTION', 'verify 仅支持 plan|result', 'INPUT');
}


async function cmdConformanceSpec(positional: string[], options: CliOptions): Promise<number> {
  const runId = positional[0];
  if (!runId) throw new UxqError('MISSING_RUN', 'conformance 需要运行 ID', 'INPUT');
  const stored = await (await openLocalStore(options.root)).loadRun(runId);
  const report = runConformanceCheck(runBundle(stored), latestSnapshot(stored), undefined, systemClock.now());
  output({ runId, overallStatus: report.overallStatus, summary: report.summary, results: report.results,
    markdown: renderConformanceMarkdown(report) }, options.json);
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
