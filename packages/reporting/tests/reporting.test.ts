import { describe, expect, it } from 'vitest';
import {
  generateRegressionReport,
  renderRegressionMarkdown,
} from '@uxq/reporting';
import type { RegressionReport } from '@uxq/reporting';

describe('M3.5: 回归报告生成', () => {
  const baseInput = {
    baselineName: 'v1.0-baseline',
    baselineRunId: 'run-baseline-001',
    currentRunId: 'run-current-002',
    comparability: 'COMPARABLE',
    scoreDelta: -2.5,
    baselineScore: 85.0,
    currentScore: 82.5,
    metricDeltas: [
      { metricId: 'metric-load-time', baselineValue: 1500, currentValue: 1650, delta: 150, deltaPercent: 10.0 },
      { metricId: 'metric-error-rate', baselineValue: 0.05, currentValue: 0.08, delta: 0.03, deltaPercent: 60.0 },
    ],
    ruleDeltas: [
      { ruleId: 'rule-contrast', baselineOutcome: 'PASS', currentOutcome: 'PASS', changed: false },
      { ruleId: 'rule-keyboard', baselineOutcome: 'PASS', currentOutcome: 'FAIL', changed: true },
    ],
    findingChanges: { new: 2, resolved: 1, persisted: 3, reopened: 0 },
    verificationStatus: 'PASSED',
    caveats: ['浏览器版本不同', '视口大小有差异'],
    now: '2025-01-01T00:00:00Z',
  };

  it('生成回归报告结构', () => {
    const report = generateRegressionReport(baseInput);

    expect(report.id).toMatch(/^regression-report-/);
    expect(report.schemaVersion).toBe('1.0.0');
    expect(report.reportType).toBe('REGRESSION');
    expect(report.baselineName).toBe('v1.0-baseline');
    expect(report.baselineRunId).toBe('run-baseline-001');
    expect(report.currentRunId).toBe('run-current-002');
    expect(report.comparability).toBe('COMPARABLE');
    expect(report.scoreDelta).toBe(-2.5);
    expect(report.baselineScore).toBe(85.0);
    expect(report.currentScore).toBe(82.5);
    expect(report.metricDeltas).toHaveLength(2);
    expect(report.ruleDeltas).toHaveLength(2);
    expect(report.findingChanges.new).toBe(2);
    expect(report.findingChanges.resolved).toBe(1);
    expect(report.verificationStatus).toBe('PASSED');
    expect(report.caveats).toHaveLength(2);
    expect(report.limitations.length).toBeGreaterThan(0);
  });

  it('默认 Finding 变化为零', () => {
    const { findingChanges, verificationStatus, ...rest } = baseInput;
    const report = generateRegressionReport(rest);

    expect(report.findingChanges.new).toBe(0);
    expect(report.findingChanges.resolved).toBe(0);
    expect(report.findingChanges.persisted).toBe(0);
    expect(report.findingChanges.reopened).toBe(0);
    expect(report.verificationStatus).toBeNull();
  });

  it('回归报告声明限制', () => {
    const report = generateRegressionReport(baseInput);

    expect(report.limitations).toContain('回归比较基于可比运行条件');
    expect(report.limitations).toContain('不可比的比较结果不能直接归因于产品变化');
    expect(report.limitations).toContain('回归报告不重新计算评分，只投影已有结果');
  });

  it('渲染回归报告 Markdown', () => {
    const report = generateRegressionReport(baseInput);
    const markdown = renderRegressionMarkdown(report);

    expect(markdown).toContain('# UXQ 回归报告');
    expect(markdown).toContain('v1');  // v1.0-baseline (escaped)
    expect(markdown).toContain('baseline');
    expect(markdown).toContain('COMPARABLE');
    expect(markdown).toContain('85');
    expect(markdown).toContain('82.5');
    expect(markdown).toContain('2.5');
    expect(markdown).toContain('metric');
    expect(markdown).toContain('rule');
    expect(markdown).toContain('## 指标变化');
    expect(markdown).toContain('## 规则变化');
    expect(markdown).toContain('## 问题变化');
    expect(markdown).toContain('新问题：2');
    expect(markdown).toContain('已解决：1');
    expect(markdown).toContain('## 复测状态');
    expect(markdown).toContain('PASSED');
    expect(markdown).toContain('## 注意事项');
    expect(markdown).toContain('## 限制');
    expect(markdown).toContain('回归报告不重新计算评分，只投影已有结果');
  });

  it('无验证状态时不渲染复测章节', () => {
    const report = generateRegressionReport({
      ...baseInput,
      verificationStatus: null,
    });
    const markdown = renderRegressionMarkdown(report);

    expect(markdown).not.toContain('## 复测状态');
  });

  it('无可比性注意事项时不渲染注意事项章节', () => {
    const report = generateRegressionReport({
      ...baseInput,
      caveats: [],
    });
    const markdown = renderRegressionMarkdown(report);

    expect(markdown).not.toContain('## 注意事项');
  });
});
