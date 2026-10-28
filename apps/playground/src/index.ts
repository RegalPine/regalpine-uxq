#!/usr/bin/env node
/**
 * UXQ Playground - 评价策略演示环境
 *
 * 提供交互式演示评分策略、标准化方法、规则引擎和维度聚合的能力。
 * 用于教学、培训和策略实验。
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { normalize } from '@uxq/scoring';
import { evaluateExpression } from '@uxq/rules';
import type {
  ScoreBinding,
  ScoringPolicy,
  MetricResult,
  RuleExpression,
  RuleDefinition,
  DimensionId,
} from '@uxq/contracts';

const program = new Command();

program
  .name('uxq-playground')
  .description('UXQ 评价策略交互式演示环境')
  .version('0.1.0');

// ─── 工具函数 ───────────────────────────────────────────

function header(title: string): void {
  const line = '═'.repeat(50);
  console.log(chalk.cyan(`\n${line}`));
  console.log(chalk.cyan.bold(`  ${title}`));
  console.log(chalk.cyan(`${line}\n`));
}

function subheader(title: string): void {
  console.log(chalk.yellow.bold(`\n▸ ${title}`));
}

function separator(): void {
  console.log(chalk.gray('─'.repeat(50)));
}

function bar(value: number, width = 30): string {
  const filled = Math.round((value / 100) * width);
  const empty = width - filled;
  const color = value >= 80 ? 'green' : value >= 60 ? 'yellow' : 'red';
  return chalk[color]('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

// ─── normalize 演示 ─────────────────────────────────────

program
  .command('normalize')
  .description('演示指标值标准化为 0-100 分的过程')
  .option('-m, --method <method>', '标准化方法: LINEAR_HIGHER|LINEAR_LOWER|TARGET_RANGE|BOOLEAN', 'LINEAR_HIGHER')
  .option('--min <number>', '最小值', '0')
  .option('--max <number>', '最大值', '100')
  .option('--target-min <number>', '目标最小值（TARGET_RANGE 用）', '40')
  .option('--target-max <number>', '目标最大值（TARGET_RANGE 用）', '80')
  .option('--values <numbers>', '要演示的指标值（逗号分隔）', '0,25,50,75,100')
  .action((opts) => {
    header('指标标准化演示');

    const method = opts.method as ScoreBinding['normalization'];
    const binding: ScoreBinding = {
      metricId: 'demo-metric',
      weight: 1.0,
      normalization: method,
      min: Number(opts.min),
      max: Number(opts.max),
      targetMin: Number(opts.targetMin),
      targetMax: Number(opts.targetMax),
    };

    const values = opts.values.split(',').map(Number);

    subheader('配置参数');
    console.log(`  标准化方法: ${chalk.bold(method)}`);
    console.log(`  最小值:     ${chalk.bold(binding.min)}`);
    console.log(`  最大值:     ${chalk.bold(binding.max)}`);
    if (method === 'TARGET_RANGE') {
      console.log(`  目标最小值: ${chalk.bold(binding.targetMin)}`);
      console.log(`  目标最大值: ${chalk.bold(binding.targetMax)}`);
    }

    subheader('标准化结果');
    console.log(chalk.gray('  原始值    →  标准化分数    可视化'));
    separator();

    for (const value of values) {
      const score = normalize(value, binding);
      const scoreStr = score.toFixed(1).padStart(6);
      const valueStr = String(value).padStart(8);
      console.log(`  ${valueStr}  →  ${chalk.bold(scoreStr)}      ${bar(score)}`);
    }

    subheader('方法说明');
    const descriptions: Record<string, string> = {
      LINEAR_HIGHER: '值越大分越高（如：任务完成率、可用性得分）',
      LINEAR_LOWER: '值越小分越高（如：错误数、响应时间）',
      TARGET_RANGE: '在目标范围内满分，偏离则递减（如：加载时间目标 2-4s）',
      BOOLEAN: '满足条件即满分，否则零分（如：是否有隐私政策）',
    };
    console.log(`  ${chalk.italic(descriptions[method] ?? '未知方法')}`);
  });

// ─── rule 演示 ──────────────────────────────────────────

program
  .command('rule')
  .description('演示规则引擎的表达式求值')
  .option('--preset <preset>', '预设场景: accessibility|performance|completeness', 'accessibility')
  .action((opts) => {
    header('规则引擎演示');

    const scenarios = buildScenarios();
    const scenario = scenarios[opts.preset as string];

    if (!scenario) {
      console.log(chalk.red(`未知预设: ${opts.preset}`));
      console.log(`可用预设: ${Object.keys(scenarios).join(', ')}`);
      return;
    }

    subheader(`场景: ${scenario.name}`);
    console.log(chalk.gray(`  ${scenario.description}\n`));

    subheader('指标输入');
    for (const metric of scenario.metrics) {
      const statusColor = metric.status === 'MEASURED' ? 'green' : 'yellow';
      const valueStr = metric.status === 'MEASURED' ? ` = ${metric.value}` : ` (${(metric as any).reason ?? 'N/A'})`;
      console.log(`  ${chalk[statusColor]('●')} ${metric.metricId}${valueStr}`);
    }

    const metricsMap = new Map(scenario.metrics.map((m) => [m.metricId, m]));

    subheader('规则评估');
    for (const rule of scenario.rules) {
      const outcome = evaluateExpression(rule.expression, metricsMap);
      const outcomeColor =
        outcome === 'PASS' ? 'green' : outcome === 'FAIL' ? 'red' : outcome === 'INDETERMINATE' ? 'yellow' : 'gray';
      const icon = outcome === 'PASS' ? '✓' : outcome === 'FAIL' ? '✗' : outcome === 'INDETERMINATE' ? '?' : '○';

      console.log(`\n  ${chalk[outcomeColor].bold(`${icon} ${rule.name}`)} → ${chalk[outcomeColor].bold(outcome)}`);
      console.log(chalk.gray(`    表达式: ${formatExpression(rule.expression)}`));
      if (rule.critical) {
        console.log(chalk.red(`    ⚠ 关键规则 — 失败将导致整体评价不合格`));
      }
    }
  });

// ─── scoring 演示 ───────────────────────────────────────

program
  .command('scoring')
  .description('演示完整的评分流程：指标 → 维度 → 总体')
  .option('--scenario <scenario>', '演示场景: good|mixed|poor', 'mixed')
  .action((opts) => {
    header('完整评分流程演示');

    const scenarioData = buildScoringScenarios()[opts.scenario as string];
    if (!scenarioData) {
      console.log(chalk.red(`未知场景: ${opts.scenario}`));
      console.log(`可用场景: ${Object.keys(buildScoringScenarios()).join(', ')}`);
      return;
    }

    subheader(`场景: ${scenarioData.name}`);
    console.log(chalk.gray(`  ${scenarioData.description}\n`));

    // 展示各维度评分
    subheader('维度评分');
    for (const dim of scenarioData.dimensions) {
      const dimColor = dim.score >= 80 ? 'green' : dim.score >= 60 ? 'yellow' : 'red';
      console.log(`\n  ${chalk[dimColor].bold(`${dim.dimensionId} — ${dim.name}`)}`);
      console.log(`  权重: ${dim.weight.toFixed(2)}  得分: ${chalk[dimColor].bold(dim.score.toFixed(1))}`);
      console.log(`  ${bar(dim.score)}`);

      if (dim.metrics.length > 0) {
        console.log(chalk.gray('    指标明细:'));
        for (const m of dim.metrics) {
          const mColor = m.score >= 80 ? 'green' : m.score >= 60 ? 'yellow' : 'red';
          console.log(`      ${m.metricId.padEnd(12)} 权重=${m.weight.toFixed(1)}  原始=${String(m.rawValue).padEnd(6)}  →  ${chalk[mColor].bold(m.score.toFixed(1))}`);
        }
      }
    }

    // 总体评分
    const totalWeight = scenarioData.dimensions.reduce((s, d) => s + d.weight, 0);
    const overallScore = scenarioData.dimensions.reduce((s, d) => s + d.score * d.weight, 0) / totalWeight;
    const outcome = overallScore >= 70 ? 'PASS' : overallScore >= 50 ? 'INCONCLUSIVE' : 'FAIL';
    const outcomeColor = outcome === 'PASS' ? 'green' : outcome === 'FAIL' ? 'red' : 'yellow';
    const outcomeIcon = outcome === 'PASS' ? '✓' : outcome === 'FAIL' ? '✗' : '?';

    separator();
    subheader('总体评价');
    console.log(`  总体得分: ${chalk.bold(overallScore.toFixed(1))}`);
    console.log(`  总体结论: ${chalk[outcomeColor].bold(`${outcomeIcon} ${outcome}`)}`);
    console.log(`  ${bar(overallScore, 40)}`);
  });

// ─── compare 演示 ───────────────────────────────────────

program
  .command('compare')
  .description('对比不同评分策略的效果')
  .action(() => {
    header('评分策略对比');

    const policies = [
      { name: '严格策略', threshold: 80, weights: { D01: 0.25, D02: 0.20, D03: 0.20, D04: 0.15, D05: 0.10, D06: 0.10 } },
      { name: '均衡策略', threshold: 70, weights: { D01: 0.17, D02: 0.17, D03: 0.17, D04: 0.17, D05: 0.16, D06: 0.16 } },
      { name: '体验优先', threshold: 65, weights: { D01: 0.30, D02: 0.25, D03: 0.15, D04: 0.10, D05: 0.10, D06: 0.10 } },
    ];

    const dimScores = { D01: 85, D02: 72, D03: 68, D04: 90, D05: 55, D06: 78 };

    subheader('维度得分输入');
    for (const [dimId, score] of Object.entries(dimScores)) {
      console.log(`  ${dimId}: ${score.toFixed(1)}  ${bar(score, 20)}`);
    }

    subheader('策略对比结果');
    console.log(chalk.gray('  策略名称       合格线   加权得分   结论'));
    separator();

    for (const policy of policies) {
      const weighted = Object.entries(policy.weights).reduce(
        (sum, [dimId, weight]) => sum + (dimScores[dimId as DimensionId] ?? 0) * weight,
        0,
      );
      const outcome = weighted >= policy.threshold ? 'PASS' : 'FAIL';
      const outcomeColor = outcome === 'PASS' ? 'green' : 'red';
      const outcomeIcon = outcome === 'PASS' ? '✓' : '✗';

      console.log(
        `  ${policy.name.padEnd(12)} ${String(policy.threshold).padStart(5)}     ${weighted.toFixed(1).padStart(6)}     ${chalk[outcomeColor].bold(`${outcomeIcon} ${outcome}`)}`,
      );
    }

    subheader('维度权重分布');
    for (const policy of policies) {
      console.log(`\n  ${chalk.bold(policy.name)}:`);
      for (const [dimId, weight] of Object.entries(policy.weights)) {
        const barWidth = Math.round(weight * 40);
        console.log(`    ${dimId} ${chalk.cyan('█'.repeat(barWidth))} ${(weight * 100).toFixed(0)}%`);
      }
    }
  });

// ─── interactive 命令 ───────────────────────────────────

program
  .command('interactive')
  .description('进入交互式演示模式')
  .action(() => {
    header('UXQ Playground 交互式演示');
    console.log(chalk.bold('欢迎使用 UXQ 评价策略演示环境！\n'));
    console.log('可用演示命令：');
    console.log(`  ${chalk.cyan('normalize')}  — 指标标准化方法演示`);
    console.log(`    示例: ${chalk.gray('uxq-playground normalize --method LINEAR_HIGHER --values 0,30,60,90')}`);
    console.log(`  ${chalk.cyan('rule')}       — 规则引擎表达式求值`);
    console.log(`    示例: ${chalk.gray('uxq-playground rule --preset accessibility')}`);
    console.log(`  ${chalk.cyan('scoring')}    — 完整评分流程演示`);
    console.log(`    示例: ${chalk.gray('uxq-playground scoring --scenario mixed')}`);
    console.log(`  ${chalk.cyan('compare')}    — 评分策略对比`);
    console.log('');
    console.log(chalk.italic('提示：每个命令都支持 --help 查看详细参数'));
  });

// ─── 预设数据构建 ───────────────────────────────────────

interface DemoScenario {
  name: string;
  description: string;
  metrics: MetricResult[];
  rules: { name: string; expression: RuleExpression; critical: boolean }[];
}

function buildScenarios(): Record<string, DemoScenario> {
  return {
    accessibility: {
      name: '可访问性检查',
      description: '验证页面是否满足 WCAG 2.1 AA 级要求',
      metrics: [
        {
          id: 'mr-001', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'img-alt-missing', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D05', status: 'MEASURED',
          value: 3, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
        {
          id: 'mr-002', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'color-contrast-ratio', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D05', status: 'MEASURED',
          value: 4.8, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
        {
          id: 'mr-003', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'keyboard-trap-count', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D05', status: 'MEASURED',
          value: 0, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
      ],
      rules: [
        {
          name: '图片缺失 alt 数量为零',
          expression: { op: 'EQ', metricId: 'img-alt-missing', expected: 0 },
          critical: true,
        },
        {
          name: '颜色对比度达标（≥4.5）',
          expression: { op: 'GTE', metricId: 'color-contrast-ratio', expected: 4.5 },
          critical: false,
        },
        {
          name: '无键盘陷阱',
          expression: { op: 'EQ', metricId: 'keyboard-trap-count', expected: 0 },
          critical: true,
        },
        {
          name: '综合可访问性规则',
          expression: {
            op: 'ALL',
            children: [
              { op: 'LTE', metricId: 'img-alt-missing', expected: 2 },
              { op: 'GTE', metricId: 'color-contrast-ratio', expected: 4.5 },
              { op: 'EQ', metricId: 'keyboard-trap-count', expected: 0 },
            ],
          },
          critical: false,
        },
      ],
    },
    performance: {
      name: '性能指标检查',
      description: '验证页面加载性能是否满足 Core Web Vitals 标准',
      metrics: [
        {
          id: 'mr-010', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'lcp', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D01', status: 'MEASURED',
          value: 2200, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
        {
          id: 'mr-011', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'fid', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D01', status: 'MEASURED',
          value: 80, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
        {
          id: 'mr-012', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'cls', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D01', status: 'MEASURED',
          value: 0.15, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
      ],
      rules: [
        {
          name: 'LCP 达标（≤2500ms）',
          expression: { op: 'LTE', metricId: 'lcp', expected: 2500 },
          critical: false,
        },
        {
          name: 'FID 达标（≤100ms）',
          expression: { op: 'LTE', metricId: 'fid', expected: 100 },
          critical: false,
        },
        {
          name: 'CLS 达标（≤0.1）',
          expression: { op: 'LTE', metricId: 'cls', expected: 0.1 },
          critical: false,
        },
        {
          name: '全部 Core Web Vitals 达标',
          expression: {
            op: 'ALL',
            children: [
              { op: 'LTE', metricId: 'lcp', expected: 2500 },
              { op: 'LTE', metricId: 'fid', expected: 100 },
              { op: 'LTE', metricId: 'cls', expected: 0.1 },
            ],
          },
          critical: true,
        },
      ],
    },
    completeness: {
      name: '评价完整性检查',
      description: '验证评价覆盖率和证据充分性',
      metrics: [
        {
          id: 'mr-020', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'coverage-ratio', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D06', status: 'MEASURED',
          value: 0.85, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
        {
          id: 'mr-021', schemaVersion: '1.0.0', createdAt: '2026-10-28T00:00:00Z',
          runId: 'run-demo', metricId: 'evidence-count', metricVersion: '1.0.0',
          implementationVersion: '1.0.0', dimensionId: 'D06', status: 'MEASURED',
          value: 12, measuredAt: '2026-10-28T00:00:00Z', evidenceIds: [], observationIds: [],
          excludedSampleIds: [], sampleCount: 1, inputDigest: 'demo', limitations: [],
        },
      ],
      rules: [
        {
          name: '覆盖率达标（≥80%）',
          expression: { op: 'GTE', metricId: 'coverage-ratio', expected: 0.8 },
          critical: true,
        },
        {
          name: '证据数量充分（≥10）',
          expression: { op: 'GTE', metricId: 'evidence-count', expected: 10 },
          critical: false,
        },
      ],
    },
  };
}

interface DimDemo {
  dimensionId: string;
  name: string;
  weight: number;
  score: number;
  metrics: { metricId: string; weight: number; rawValue: number; score: number }[];
}

function buildScoringScenarios(): Record<string, { name: string; description: string; dimensions: DimDemo[] }> {
  return {
    good: {
      name: '优秀产品',
      description: '各维度表现优异的产品评价',
      dimensions: [
        { dimensionId: 'D01', name: '任务效率', weight: 0.25, score: 92, metrics: [
          { metricId: 'task-completion', weight: 1.5, rawValue: 95, score: 95 },
          { metricId: 'task-time', weight: 1.0, rawValue: 88, score: 88 },
        ]},
        { dimensionId: 'D02', name: '交互质量', weight: 0.20, score: 88, metrics: [
          { metricId: 'error-rate', weight: 1.2, rawValue: 90, score: 90 },
          { metricId: 'learnability', weight: 0.8, rawValue: 85, score: 85 },
        ]},
        { dimensionId: 'D03', name: '认知负担', weight: 0.15, score: 85, metrics: [
          { metricId: 'info-density', weight: 1.0, rawValue: 82, score: 82 },
          { metricId: 'nav-depth', weight: 1.0, rawValue: 88, score: 88 },
        ]},
        { dimensionId: 'D04', name: '可访问性', weight: 0.15, score: 90, metrics: [
          { metricId: 'a11y-score', weight: 1.0, rawValue: 90, score: 90 },
        ]},
        { dimensionId: 'D05', name: '包容性', weight: 0.15, score: 86, metrics: [
          { metricId: 'i18n-coverage', weight: 1.0, rawValue: 86, score: 86 },
        ]},
        { dimensionId: 'D06', name: '主观体验', weight: 0.10, score: 91, metrics: [
          { metricId: 'sus-score', weight: 1.0, rawValue: 91, score: 91 },
        ]},
      ],
    },
    mixed: {
      name: '中等产品',
      description: '部分维度表现良好，部分存在改进空间',
      dimensions: [
        { dimensionId: 'D01', name: '任务效率', weight: 0.25, score: 78, metrics: [
          { metricId: 'task-completion', weight: 1.5, rawValue: 82, score: 82 },
          { metricId: 'task-time', weight: 1.0, rawValue: 72, score: 72 },
        ]},
        { dimensionId: 'D02', name: '交互质量', weight: 0.20, score: 65, metrics: [
          { metricId: 'error-rate', weight: 1.2, rawValue: 60, score: 60 },
          { metricId: 'learnability', weight: 0.8, rawValue: 72, score: 72 },
        ]},
        { dimensionId: 'D03', name: '认知负担', weight: 0.15, score: 70, metrics: [
          { metricId: 'info-density', weight: 1.0, rawValue: 68, score: 68 },
          { metricId: 'nav-depth', weight: 1.0, rawValue: 73, score: 73 },
        ]},
        { dimensionId: 'D04', name: '可访问性', weight: 0.15, score: 55, metrics: [
          { metricId: 'a11y-score', weight: 1.0, rawValue: 55, score: 55 },
        ]},
        { dimensionId: 'D05', name: '包容性', weight: 0.15, score: 72, metrics: [
          { metricId: 'i18n-coverage', weight: 1.0, rawValue: 72, score: 72 },
        ]},
        { dimensionId: 'D06', name: '主观体验', weight: 0.10, score: 68, metrics: [
          { metricId: 'sus-score', weight: 1.0, rawValue: 68, score: 68 },
        ]},
      ],
    },
    poor: {
      name: '待改进产品',
      description: '多个维度存在严重问题，需要重点改进',
      dimensions: [
        { dimensionId: 'D01', name: '任务效率', weight: 0.25, score: 45, metrics: [
          { metricId: 'task-completion', weight: 1.5, rawValue: 50, score: 50 },
          { metricId: 'task-time', weight: 1.0, rawValue: 38, score: 38 },
        ]},
        { dimensionId: 'D02', name: '交互质量', weight: 0.20, score: 40, metrics: [
          { metricId: 'error-rate', weight: 1.2, rawValue: 35, score: 35 },
          { metricId: 'learnability', weight: 0.8, rawValue: 48, score: 48 },
        ]},
        { dimensionId: 'D03', name: '认知负担', weight: 0.15, score: 50, metrics: [
          { metricId: 'info-density', weight: 1.0, rawValue: 45, score: 45 },
          { metricId: 'nav-depth', weight: 1.0, rawValue: 56, score: 56 },
        ]},
        { dimensionId: 'D04', name: '可访问性', weight: 0.15, score: 30, metrics: [
          { metricId: 'a11y-score', weight: 1.0, rawValue: 30, score: 30 },
        ]},
        { dimensionId: 'D05', name: '包容性', weight: 0.15, score: 55, metrics: [
          { metricId: 'i18n-coverage', weight: 1.0, rawValue: 55, score: 55 },
        ]},
        { dimensionId: 'D06', name: '主观体验', weight: 0.10, score: 35, metrics: [
          { metricId: 'sus-score', weight: 1.0, rawValue: 35, score: 35 },
        ]},
      ],
    },
  };
}

function formatExpression(expr: RuleExpression): string {
  if ('children' in expr) {
    const children = expr.children.map(formatExpression).join(' AND ');
    return `(${expr.op}: ${children})`;
  }
  if ('child' in expr) {
    return `NOT(${formatExpression(expr.child)})`;
  }
  const opSymbols: Record<string, string> = {
    LT: '<', LTE: '≤', GT: '>', GTE: '≥', EQ: '=', NE: '≠',
    BETWEEN: '∈', IN: '∈',
  };
  const sym = opSymbols[expr.op] ?? expr.op;
  if (expr.op === 'BETWEEN') {
    return `${expr.metricId} ${sym} [${expr.lower}, ${expr.upper}]`;
  }
  return `${expr.metricId} ${sym} ${expr.expected}`;
}

program.parse();
