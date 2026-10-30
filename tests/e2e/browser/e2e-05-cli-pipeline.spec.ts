import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseContract, validateEvaluation } from '@uxq/contracts';
import type { EvaluationDefinition, EvaluationResult, Evidence, ReportArtifact, ReportDocument, ScoringPolicy, TaskDefinition, VerificationPlan, VerificationResult } from '@uxq/contracts';
import { openLocalStore, runBundle } from '@uxq/execution';
import { sha256 } from '@uxq/core';

const exec = promisify(execFile);
const cliPath = resolve('apps/cli/dist/index.js');
let server: Server;
let url: string;
let headings = 1;
let root: string;
let redirectTarget: string | undefined;
let redirectHits = 0;

/** 各 CLI 子命令的测试投影；每次解析后由对应断言验证实际字段。 */
interface CliResponse {
  runId: string;
  status: string;
  evaluation: EvaluationResult;
  report: ReportDocument & ReportArtifact;
  gate: { passed: boolean };
  overallScore: number | null;
  baselines: Array<{ runId: string }>;
  comparability: string;
  metricDeltas: Array<{ baselineValue: number | null; currentValue: number | null; delta: number | null }>;
  scoreDelta: number | null;
  count: number;
  findingIds: string[];
  verificationPlan: VerificationPlan;
  verificationResult: VerificationResult;
  policy: ScoringPolicy;
  valid: boolean;
  steps: unknown[];
}

async function cli(args: string[], code = 0): Promise<CliResponse> {
  let stdout = '';
  let stderr = '';
  let actual = 0;
  try {
    ({ stdout, stderr } = await exec(process.execPath, [cliPath, ...args, '--root', root, '--json'], {
      timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    }));
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    actual = result.code; stdout = result.stdout; stderr = result.stderr;
  }
  expect(actual, `${args.join(' ')}\n${stderr}\n${stdout}`).toBe(code);
  return JSON.parse(stdout) as CliResponse;
}

async function jsonFile(name: string, value: unknown): Promise<string> {
  const file = join(root, name);
  await writeFile(file, JSON.stringify(value, null, 2));
  return file;
}

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function pageDefinition(): Promise<{ file: string; definition: EvaluationDefinition }> {
  const file = join(root, 'nested', 'page.json');
  await cli(['init', file, '--url', url]);
  return { file, definition: parseContract('EvaluationDefinition', await readJson(file)) };
}

test.beforeEach(async ({ browserName: _browserName }, testInfo) => {
  test.setTimeout(120000);
  await mkdir(testInfo.outputDir, { recursive: true });
  root = await mkdtemp(join(testInfo.outputDir, 'store-'));
  headings = 1;
  redirectTarget = undefined;
  redirectHits = 0;
  server = createServer((request, response) => {
    if (request.url === '/redirect' && redirectTarget) {
      response.writeHead(302, { location: redirectTarget });
      response.end();
      return;
    }
    if (request.url === '/target') redirectHits++;
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><html><head><title>CLI 测试</title></head><body>${'<h1>真实标题</h1>'.repeat(headings)}<button id="done">完成</button></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败');
  url = `http://127.0.0.1:${address.port}/`;
});

test.afterEach(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('真实页面闭环、关键规则、跨进程基线、复测与重结算', async ({ browserName: _browserName }, testInfo) => {
  const { file, definition } = await pageDefinition();
  const config = await jsonFile('config.json', { colorScheme: testInfo.project.use.colorScheme });
  const evaluate = () => cli(['evaluate', file, '--config', config]);
  const first = await evaluate();
  expect(first.status).toBe('COMPLETED');
  expect(first.evaluation).toMatchObject({ overallScore: 100, overallOutcome: 'PASS', coverage: { measured: 1, scored: 1 } });
  const report = (await cli(['report', first.runId])).report as ReportDocument;
  expect(report.metrics[0]).toMatchObject({ status: 'MEASURED', value: 1 });
  expect(report.rules[0]?.inputMetricResultIds).toEqual([report.metrics[0]?.id]);
  expect(report.provenance.runId).toBe(first.runId);
  const image = report.evidenceIndex.find((evidence: Evidence) => evidence.materialType === 'SCREENSHOT')!;
  expect(image.artifact).toBeDefined();
  const store = await openLocalStore(root);
  const png = await store.readArtifact(first.runId, image.artifact!);
  expect(Buffer.from(png).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.byteLength).toBeGreaterThan(1000);
  await testInfo.attach('真实采集截图', { body: Buffer.from(png), contentType: 'image/png' });
  const stored = await store.loadRun(first.runId);
  expect(() => validateEvaluation(runBundle(stored), stored.snapshots!.at(-1))).not.toThrow();
  const events = await readFile(join(root, 'runs', first.runId, 'events.jsonl'));
  expect(stored.manifest.files[0]).toMatchObject({ bytes: events.byteLength, digest: sha256(events) });
  expect((await store.readArtifact(first.runId, first.report.json)).byteLength).toBe(first.report.json.bytes);
  expect((await cli(['quality-gate', first.runId])).gate.passed).toBe(true);
  await cli(['baseline', 'create', 'main', first.runId]);
  expect((await cli(['baseline', 'list'])).baselines).toHaveLength(1);

  headings = 2;
  const failedRule = await evaluate();
  expect(failedRule.evaluation.overallOutcome).toBe('FAIL');
  expect((await cli(['quality-gate', failedRule.runId], 1)).gate.passed).toBe(false);
  const comparison = await cli(['compare', failedRule.runId, 'main']);
  expect(comparison.comparability).toBe('COMPARABLE');
  expect(comparison.metricDeltas[0]).toMatchObject({ baselineValue: 1, currentValue: 2, delta: 1 });
  const findings = await cli(['finding', 'list', failedRule.runId]);
  expect(findings.count).toBeGreaterThan(0);
  const plan = (await cli(['verify', 'plan', failedRule.runId, '--finding-id', findings.findingIds[0]!])).verificationPlan;
  expect((await cli(['verify', 'result', plan.id, '--source-run', failedRule.runId], 4)).verificationResult.status).toBe('BLOCKED');
  headings = 1;
  const fixed = await evaluate();
  expect((await cli(['verify', 'result', plan.id, '--source-run', fixed.runId])).verificationResult.status).toBe('PASSED');

  const policy = structuredClone(definition.policy);
  policy.version = '0.2.0'; policy.bindings[0]!.max = 2;
  policy.overallThreshold = 80;
  const policyFile = await jsonFile('policy.json', policy);
  const settled = await cli(['settle', fixed.runId, '--policy', policyFile]);
  expect(settled.evaluation.overallScore).toBe(50);
  expect((await cli(['report', fixed.runId])).report.evaluation.overallScore).toBe(50);
  expect((await cli(['inspect', fixed.runId, 'evaluation'])).policy.version).toBe('0.2.0');
  expect((await cli(['quality-gate', fixed.runId], 1)).overallScore).toBe(50);
  const different = await cli(['compare', fixed.runId, 'main'], 4);
  expect(different.scoreDelta).toBeNull();
  expect(different.metricDeltas[0]?.delta).toBeNull();
  const baseline = (await cli(['baseline', 'list'])).baselines[0];
  expect(baseline?.runId).toBe(first.runId);
  expect((await store.loadRun(fixed.runId)).snapshots).toHaveLength(2);
});

test('嵌套 YAML、单文档 JSON、离线数据、空证据和合法 false', async () => {
  const yamlFile = join(root, 'nested', 'offline.yaml');
  await cli(['init', yamlFile]);
  expect(await readFile(yamlFile, 'utf8')).not.toMatch(/^\{/);
  expect((await cli(['validate', yamlFile])).valid).toBe(true);
  expect((await cli(['plan', yamlFile])).steps.length).toBeGreaterThan(0);
  const original = await cli(['evaluate', yamlFile]);
  expect(original.evaluation.overallScore).not.toBeNull();

  const definition = parseContract('EvaluationDefinition', await readJson(resolve('tests/fixtures/offline-definition.json')));
  definition.steps[0]!.observation!.excluded = true;
  definition.steps[0]!.observation!.exclusionReason = '测试缺样本';
  const emptyFile = await jsonFile('empty.json', definition);
  const empty = await cli(['evaluate', emptyFile]);
  expect(empty.evaluation.overallScore).toBeNull();
  expect(empty.evaluation.coverage.measured).toBe(0);
  expect((await cli(['quality-gate', empty.runId], 4)).gate.passed).toBe(false);

  const { definition: booleanDefinition } = await pageDefinition();
  const metric = booleanDefinition.metrics[0]!;
  metric.valueKind = 'BOOLEAN'; delete metric.unit; delete metric.minimum; delete metric.maximum;
  metric.direction = 'HIGHER_IS_BETTER';
  booleanDefinition.policy.bindings = [{ metricId: metric.id, normalization: 'BOOLEAN', weight: 1 }];
  booleanDefinition.rules[0]!.expression = { op: 'EQ', metricId: metric.id, expected: false };
  booleanDefinition.steps.find((step) => step.stepId === 'capture')!.action = {
    action: 'CAPTURE', extractor: 'VISIBLE', selector: '#missing', key: metric.sourceKey,
  };
  const booleanFile = await jsonFile('boolean.json', booleanDefinition);
  const bool = await cli(['evaluate', booleanFile]);
  const report = (await cli(['report', bool.runId])).report;
  expect(report.metrics[0]).toMatchObject({ status: 'MEASURED', value: false });
  expect(report.rules[0]?.outcome).toBe('PASS');
  expect(bool.evaluation.overallScore).toBe(0);
});

test('HTTP 重定向不能请求未授权目标，失败报告仍可读取', async () => {
  const { definition } = await pageDefinition();
  const navigation = definition.steps.find((step) => step.stepId === 'navigate')!;
  navigation.action = { action: 'NAVIGATE', url: new URL('redirect', url).href };
  // localhost 与 127.0.0.1 是不同 origin，后者才在授权列表中。
  redirectTarget = new URL('target', url.replace('127.0.0.1', 'localhost')).href;
  const failed = await cli(['evaluate', await jsonFile('redirect.json', definition)], 4);
  expect(failed.status).toBe('FAILED');
  expect(redirectHits).toBe(0);
  const store = await openLocalStore(root);
  expect((await store.loadRun(failed.runId)).attempts.some((attempt) => attempt.error?.code === 'REDIRECT_UNSUPPORTED')).toBe(true);
  expect((await cli(['report', failed.runId])).report.evaluation.overallScore).toBeNull();
});

test('真实任务连续采样可配对计算比率', async () => {
  const { definition } = await pageDefinition();
  const metric = definition.metrics[0]!;
  metric.aggregation = 'RATIO'; metric.numeratorKey = 'n'; metric.denominatorKey = 'd'; metric.unit = 'ratio';
  const capture = definition.steps.find((step) => step.stepId === 'capture')!;
  const task: TaskDefinition = {
    id: 'task-ratio', schemaVersion: '1.0.0', createdAt: definition.createdAt, version: '1.0.0', name: '配对采集',
    scenarioId: 'ratio', sideEffect: 'NONE', authorized: false,
    actions: [
      { action: 'CAPTURE', extractor: 'COUNT', selector: 'h1', key: 'n', unit: 'count' },
      { action: 'CAPTURE', extractor: 'COUNT', selector: 'h1,button', key: 'd', unit: 'count' },
    ],
    businessConditions: [{ kind: 'VISIBLE', selector: '#done', equals: true }],
    feedbackConditions: [{ kind: 'VISIBLE', selector: 'h1', equals: true }], limitations: ['结构代理指标'],
  };
  definition.tasks = [task]; definition.scope.taskIds = [task.id];
  delete capture.action; capture.kind = 'TASK_EXECUTION'; capture.taskId = task.id;
  capture.outputContracts.push('TaskExecution');
  definition.rules[0]!.expression = { op: 'EQ', metricId: metric.id, expected: 0.5 };
  const run = await cli(['evaluate', await jsonFile('ratio.json', definition)]);
  const report = (await cli(['report', run.runId])).report;
  expect(report.metrics[0]).toMatchObject({ status: 'MEASURED', value: 0.5, sampleCount: 1 });
  expect(report.metrics[0]?.observationIds).toHaveLength(2);
  expect(run.evaluation.overallScore).toBe(50);
  const stored = await (await openLocalStore(root)).loadRun(run.runId);
  expect(stored.observations[0]!.sampleId).toBe(stored.observations[1]!.sampleId);
});

test('任务条件失败与未授权私网不能伪装成成功', async () => {
  const { definition } = await pageDefinition();
  const capture = definition.steps.find((step) => step.stepId === 'capture')!;
  const task: TaskDefinition = {
    id: 'task-check', schemaVersion: '1.0.0', createdAt: definition.createdAt, version: '1.0.0', name: '条件核验',
    scenarioId: 'scenario-check', actions: [capture.action!], sideEffect: 'NONE', authorized: false,
    businessConditions: [{ kind: 'VISIBLE', selector: '#missing', equals: true }],
    feedbackConditions: [{ kind: 'VISIBLE', selector: '#done', equals: true }], limitations: ['自动化测试'],
  };
  definition.tasks = [task];
  definition.scope.taskIds = [task.id];
  delete capture.action; capture.kind = 'TASK_EXECUTION'; capture.taskId = task.id;
  capture.outputContracts.push('TaskExecution');
  const file = await jsonFile('task.json', definition);
  const failed = await cli(['evaluate', file], 4);
  expect(failed.evaluation).toMatchObject({ evaluationStatus: 'EXECUTION_FAILED', overallScore: null });
  const store = await openLocalStore(root);
  expect((await store.loadRun(failed.runId)).tasks[0]).toMatchObject({ outcome: 'FAILURE', businessSuccess: false, feedbackSuccess: true });

  definition.profile!.allowPrivateNetwork = false;
  const denied = await cli(['evaluate', await jsonFile('denied.json', definition)], 4);
  expect(denied.status).toBe('FAILED');
  expect((await store.loadRun(denied.runId)).attempts.some((attempt) => attempt.error?.code === 'PRIVATE_NETWORK_DENIED')).toBe(true);
});
