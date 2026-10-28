/**
 * Golden 测试基线
 *
 * 依据 UXQ-ARCH-012 §9.5：
 * - 固定关键输入与预期结果
 * - 适用于评分结算、回归报告、Finding 去重
 * - 更新基线必须解释变化原因、确认差异不是错误掩盖
 *
 * 本文件保存已知正确输入的稳定输出快照。
 * 如果测试失败，必须审查差异后才能更新快照。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MetricResult, RuleResult, ScoringPolicy } from '../../packages/contracts/src/index';
import {
  normalize,
  scoreMetric,
  aggregateDimension,
  settleEvaluation,
} from '../../packages/scoring/src/index';
import {
  generateRegressionReport,
  renderRegressionMarkdown,
} from '../../packages/reporting/src/index';
import {
  deduplicateFindings,
  generateSignals,
  createFinding,
} from '../../packages/diagnostic/src/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = resolve(__dirname, '__snapshots__');

async function readSnapshot(name: string): Promise<string | null> {
  try {
    const content = await readFile(resolve(SNAPSHOT_DIR, name), 'utf8');
    return content.replace(/\n$/, '');
  } catch {
    return null;
  }
}

async function writeSnapshot(name: string, content: string): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  await writeFile(resolve(SNAPSHOT_DIR, name), content + '\n', 'utf8');
}

/** 将对象中的随机 ID 规范化为稳定占位符，以便 Golden 快照比对 */
function stabilizeIds(obj: unknown): unknown {
  const json = JSON.stringify(obj);
  const stabilized = json.replace(
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/g,
    '<UUID>',
  );
  return JSON.parse(stabilized);
}

// ─── 固定输入 ────────────────────────────────────────────

function goldenMetricResult(id: string, value: number): MetricResult {
  return {
    id,
    schemaVersion: '1.0.0',
    createdAt: '2026-01-15T10:00:00Z',
    runId: 'run-golden-001',
    metricId: `metric-${id}`,
    metricVersion: '1.0.0',
    implementationVersion: '1.0.0',
    dimensionId: 'D02',
    measuredAt: '2026-01-15T10:00:00Z',
    evidenceIds: ['ev-001'],
    observationIds: ['obs-001'],
    excludedSampleIds: [],
    sampleCount: 10,
    inputDigest: 'golden-digest',
    status: 'MEASURED',
    value,
    unit: 'ms',
    limitations: [],
  };
}

function goldenRuleResult(
  id: string,
  outcome: 'PASS' | 'FAIL' | 'INDETERMINATE' | 'NOT_APPLICABLE',
): RuleResult {
  return {
    id,
    schemaVersion: '1.0.0',
    createdAt: '2026-01-15T10:00:00Z',
    runId: 'run-golden-001',
    ruleId: `rule-${id}`,
    ruleVersion: '1.0.0',
    configurationDigest: 'golden-digest',
    inputMetricResultIds: ['mr-001'],
    evidenceIds: ['ev-001'],
    evaluatedAt: '2026-01-15T10:00:00Z',
    reason: outcome === 'FAIL' ? '阈值超出' : '',
    executionStatus: 'COMPLETED',
    outcome,
  };
}

function goldenPolicy(): ScoringPolicy {
  return {
    id: 'policy-golden',
    schemaVersion: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    version: '1.0.0',
    name: 'Golden 标准策略',
    mode: 'SCORE',
    bindings: [
      { metricId: 'metric-mr-001', weight: 0.6, normalization: 'LINEAR_LOWER', min: 0, max: 1000 },
      { metricId: 'metric-mr-002', weight: 0.4, normalization: 'LINEAR_HIGHER', min: 0, max: 100 },
    ],
    dimensions: [{ dimensionId: 'D02', weight: 1, minimumCoverage: 0 }],
    missingPolicy: 'EXCLUDE',
    minimumCoverage: 0,
    allowPartial: true,
    overallThreshold: 60,
    criticalRuleIds: [],
    riskSeverities: ['S1', 'S2'],
    rationale: 'Golden 测试策略',
    limitations: [],
  };
}

const NOW = '2026-01-15T10:00:00Z';
const RUN_ID = 'run-golden-001';

// ─── 测试 ────────────────────────────────────────────

describe('Golden: 评分结算', () => {
  it('固定输入产生稳定的评分结果', async () => {
    const policy = goldenPolicy();
    const results: MetricResult[] = [
      goldenMetricResult('mr-001', 250),
      goldenMetricResult('mr-002', 80),
    ];
    const rules: RuleResult[] = [goldenRuleResult('rr-001', 'PASS')];

    // 完整评分链路: metric → score → dimension → settlement
    const scores = policy.bindings
      .map((binding) => {
        const metricResult = results.find((r) => r.metricId === binding.metricId);
        return metricResult ? scoreMetric(policy, binding, metricResult, RUN_ID, NOW) : null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const dimension = aggregateDimension(policy, 'D02', scores, RUN_ID, NOW);
    const settlement = settleEvaluation(policy, [dimension], rules, results, RUN_ID, NOW);

    const snapshot = JSON.stringify(stabilizeIds(settlement), null, 2);
    const existing = await readSnapshot('scoring-settlement.json');

    if (existing === null) {
      await writeSnapshot('scoring-settlement.json', snapshot);
      expect(settlement.overallScore).toBeTypeOf('number');
    } else {
      expect(snapshot).toBe(existing);
    }
  });

  it('标准化函数在边界值稳定', () => {
    expect(
      normalize(0, { metricId: 'm', weight: 1, normalization: 'LINEAR_LOWER', min: 0, max: 1000 }),
    ).toBe(100);
    expect(
      normalize(1000, {
        metricId: 'm',
        weight: 1,
        normalization: 'LINEAR_LOWER',
        min: 0,
        max: 1000,
      }),
    ).toBe(0);
    expect(
      normalize(500, {
        metricId: 'm',
        weight: 1,
        normalization: 'LINEAR_LOWER',
        min: 0,
        max: 1000,
      }),
    ).toBe(50);
    expect(
      normalize(0, { metricId: 'm', weight: 1, normalization: 'LINEAR_HIGHER', min: 0, max: 100 }),
    ).toBe(0);
    expect(
      normalize(100, {
        metricId: 'm',
        weight: 1,
        normalization: 'LINEAR_HIGHER',
        min: 0,
        max: 100,
      }),
    ).toBe(100);
    expect(
      normalize(50, { metricId: 'm', weight: 1, normalization: 'LINEAR_HIGHER', min: 0, max: 100 }),
    ).toBe(50);
  });
});

describe('Golden: 回归报告', () => {
  const goldenRegressionInput = {
    baselineName: 'v1.0-golden',
    baselineRunId: 'run-golden-baseline',
    currentRunId: 'run-golden-current',
    comparability: 'COMPARABLE',
    scoreDelta: -5.0,
    baselineScore: 80.0,
    currentScore: 75.0,
    metricDeltas: [
      {
        metricId: 'metric-load-time',
        baselineValue: 1200,
        currentValue: 1500,
        delta: 300,
        deltaPercent: 25.0,
      },
      {
        metricId: 'metric-error-rate',
        baselineValue: 0.02,
        currentValue: 0.05,
        delta: 0.03,
        deltaPercent: 150.0,
      },
    ],
    ruleDeltas: [
      { ruleId: 'rule-contrast', baselineOutcome: 'PASS', currentOutcome: 'PASS', changed: false },
      { ruleId: 'rule-keyboard', baselineOutcome: 'PASS', currentOutcome: 'FAIL', changed: true },
    ],
    findingChanges: { new: 3, resolved: 1, persisted: 2, reopened: 0 },
    verificationStatus: 'PASSED',
    caveats: ['浏览器版本不同'],
    now: NOW,
  };

  it('回归报告结构快照稳定', async () => {
    const report = generateRegressionReport(goldenRegressionInput);
    const snapshot = JSON.stringify(stabilizeIds(report), null, 2);
    const existing = await readSnapshot('regression-report.json');

    if (existing === null) {
      await writeSnapshot('regression-report.json', snapshot);
      expect(report.reportType).toBe('REGRESSION');
    } else {
      expect(snapshot).toBe(existing);
    }
  });

  it('回归报告 Markdown 包含关键信息', () => {
    const report = generateRegressionReport(goldenRegressionInput);
    const markdown = renderRegressionMarkdown(report);
    // Markdown 包含随机 ID，不比对完整快照，只验证关键内容
    expect(markdown).toContain('UXQ');
    expect(markdown).toContain('COMPARABLE');
    expect(markdown).toContain('80');
    expect(markdown).toContain('75');
  });
});

describe('Golden: Finding 去重', () => {
  it('重复 Finding 被合并，保留合并关系', () => {
    const rules: RuleResult[] = [
      goldenRuleResult('rr-dup-1', 'FAIL'),
      goldenRuleResult('rr-dup-1', 'FAIL'),
      goldenRuleResult('rr-dup-2', 'FAIL'),
    ];

    const signals = generateSignals(rules, [], RUN_ID, NOW);
    expect(signals.length).toBe(3);

    const findings = signals.map((signal) => createFinding(signal, RUN_ID, NOW));
    expect(findings.length).toBe(3);

    const deduplicated = deduplicateFindings(findings);
    expect(deduplicated.length).toBeLessThan(findings.length);
    expect(deduplicated.length).toBeGreaterThanOrEqual(1);

    const ids = new Set(deduplicated.map((f) => f.id));
    expect(ids.size).toBe(deduplicated.length);
  });

  it('去重快照稳定', async () => {
    const rules: RuleResult[] = [
      goldenRuleResult('rr-snap-1', 'FAIL'),
      goldenRuleResult('rr-snap-1', 'FAIL'),
      goldenRuleResult('rr-snap-2', 'FAIL'),
    ];

    const signals = generateSignals(rules, [], RUN_ID, NOW);
    const findings = signals.map((signal) => createFinding(signal, RUN_ID, NOW));
    const deduplicated = deduplicateFindings(findings);

    const snapshot = JSON.stringify(
      stabilizeIds(
        deduplicated.map((f) => ({
          title: f.title,
          type: f.type,
          deduplicationKey: f.deduplicationKey,
          signalCount: f.diagnosticSignalIds.length,
        })),
      ),
      null,
      2,
    );

    const existing = await readSnapshot('finding-dedup.json');
    if (existing === null) {
      await writeSnapshot('finding-dedup.json', snapshot);
    } else {
      expect(snapshot).toBe(existing);
    }
  });
});

describe('Golden: 诊断信号生成', () => {
  it('规则失败产生诊断信号', () => {
    const rules: RuleResult[] = [goldenRuleResult('rr-fail', 'FAIL')];
    const signals = generateSignals(rules, [], RUN_ID, NOW);
    expect(signals.length).toBe(1);
    expect(signals[0]).toHaveProperty('severity');
    expect(signals[0]).toHaveProperty('type');
    expect(signals[0]!.type).toBe('CONFIRMED_DEFECT');
  });

  it('规则通过不产生信号', () => {
    const rules: RuleResult[] = [goldenRuleResult('rr-pass', 'PASS')];
    const signals = generateSignals(rules, [], RUN_ID, NOW);
    expect(signals.length).toBe(0);
  });
});
