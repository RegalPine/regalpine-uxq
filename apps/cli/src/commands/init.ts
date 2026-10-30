/** init 命令 — 生成示例定义文件。 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { UxqError, systemClock, newId } from '@uxq/core';
import { parseContract } from '@uxq/contracts';
import type { EvaluationDefinition } from '@uxq/contracts';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { logInfo } from '../io.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const file = ctx.positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'init 需要文件路径', 'INPUT');

  const example = buildOfflineExample();

  if (ctx.options.url) {
    applyPageTemplate(example, ctx.options.url);
  }

  parseContract('EvaluationDefinition', example);
  await mkdir(dirname(resolve(file)), { recursive: true });
  const content = /\.ya?ml$/i.test(file)
    ? stringifyYaml(example)
    : JSON.stringify(example, null, 2);
  await writeFile(file, content, 'utf8');
  logInfo(ctx.io, `已生成示例定义：${file}`);

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'init', {
      status: 'COMPLETED',
      data: { file, definitionId: example.id },
    }),
  };
}

function buildOfflineExample(): EvaluationDefinition {
  return {
    id: newId('def'),
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    definitionVersion: '0.1.0',
    name: '示例评价定义（测试用途）',
    target: {
      id: 'target-example',
      name: '示例目标',
      type: 'OFFLINE',
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
}

function applyPageTemplate(example: EvaluationDefinition, urlStr: string): void {
  const url = new URL(urlStr);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UxqError('INVALID_URL', 'init --url 仅接受不含凭据的 HTTP(S) URL', 'INPUT');
  }

  example.name = '页面标题结构采集示例';
  example.target = {
    ...example.target,
    type: 'PAGE',
    url: url.href,
  };
  example.profile = {
    allowedOrigins: [url.origin],
    allowPrivateNetwork: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
    allowSideEffects: false,
  };
  example.dimensions = ['D03'];

  const metric = example.metrics[0]!;
  Object.assign(metric, {
    id: 'metric-heading-count',
    name: '一级标题数量',
    description: '实测 h1 数量；仅作为结构代理指标',
    dimensionId: 'D03',
    metricType: 'PROXY',
    sourceKey: 'heading-count',
    unit: 'count',
    minimum: 0,
    maximum: 10000,
    aggregation: 'LATEST',
    direction: 'HIGHER_IS_BETTER',
    evidenceRequired: true,
    limitations: ['标题数量不能代表页面可用性或整体 UX'],
  });

  example.policy.bindings = [{
    metricId: metric.id,
    weight: 1,
    normalization: 'LINEAR_HIGHER',
    min: 0,
    max: 1,
  }];
  example.policy.dimensions = [{ dimensionId: 'D03', weight: 1, minimumCoverage: 1 }];
  example.policy.minimumCoverage = 1;
  example.policy.missingPolicy = 'BLOCK';
  example.policy.allowPartial = false;
  example.policy.criticalRuleIds = ['rule-heading'];

  example.rules = [{
    id: 'rule-heading',
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    version: '0.1.0',
    name: '示例：存在且仅有一个一级标题',
    expression: { op: 'EQ', metricId: metric.id, expected: 1 },
    required: true,
    critical: true,
  }];

  const base = { required: true, inputRefs: [], requiredCapabilities: [] };
  example.steps = [
    { ...base, stepId: 'navigate', kind: 'PAGE_NAVIGATION', dependsOn: [], outputContracts: [], sessionId: 'page', action: { action: 'NAVIGATE', url: url.href } },
    { ...base, stepId: 'capture', kind: 'OBSERVATION_CAPTURE', dependsOn: ['navigate'], outputContracts: ['RawObservation', 'Evidence'], sessionId: 'page', action: { action: 'CAPTURE', selector: 'h1', key: 'heading-count', extractor: 'COUNT', unit: 'count' } },
    { ...base, stepId: 'screenshot', kind: 'OBSERVATION_CAPTURE', dependsOn: ['capture'], outputContracts: ['Evidence'], sessionId: 'page', action: { action: 'SCREENSHOT', name: 'page' } },
    { ...base, stepId: 'measure', kind: 'METRIC_CALCULATION', dependsOn: ['capture'], outputContracts: ['MetricResult'], metricIds: [metric.id], inputRefs: [{ stepId: 'capture', contract: 'RawObservation' }] },
    { ...base, stepId: 'rules', kind: 'RULE_EVALUATION', dependsOn: ['measure'], outputContracts: ['RuleResult'], ruleIds: ['rule-heading'], inputRefs: [{ stepId: 'measure', contract: 'MetricResult' }] },
    { ...base, stepId: 'score', kind: 'SCORING', dependsOn: ['measure', 'rules', 'screenshot'], outputContracts: ['ScoreResult'], inputRefs: [{ stepId: 'measure', contract: 'MetricResult' }] },
  ];

  example.scope.entityIds = [example.target.id];
  example.scope.routes = [url.pathname];
  example.limitations = ['本模板只评估标题结构；不是完整 UX、WCAG 或真实用户体验评价。权重与规则需按项目确认。'];
  example.scope.limitations = [...example.limitations];
  example.policy.limitations = [...example.limitations];
}
