import { digest, newId } from '@uxq/core';
import type { ReportDocument, ReportArtifact, RunBundle, EvaluationSnapshot } from '@uxq/contracts';

/**
 * M3.5: 回归报告数据结构
 */
export interface RegressionReport {
  id: string;
  schemaVersion: '1.0.0';
  createdAt: string;
  reportType: 'REGRESSION';
  baselineName: string;
  baselineRunId: string;
  currentRunId: string;
  comparability: string;
  scoreDelta: number | null;
  baselineScore: number | null;
  currentScore: number | null;
  metricDeltas: Array<{
    metricId: string;
    baselineValue: unknown;
    currentValue: unknown;
    delta: number | null;
    deltaPercent: number | null;
  }>;
  ruleDeltas: Array<{
    ruleId: string;
    baselineOutcome: string;
    currentOutcome: string;
    changed: boolean;
  }>;
  findingChanges: {
    new: number;
    resolved: number;
    persisted: number;
    reopened: number;
  };
  verificationStatus: string | null;
  caveats: string[];
  limitations: string[];
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|]/g, (character) => `\\${character}`);
}

function unavailableLabel(value: number | null): string {
  return value === null ? '_不可用_' : String(value);
}

/** 将评价结果投影为 JSON 报告；不重新计算评分，不改变输入。 */
export function projectReport(
  bundle: RunBundle,
  snapshot: EvaluationSnapshot,
  templateVersion: string,
  now: string,
  reportType: ReportDocument['reportType'] = 'FULL',
): ReportDocument {
  const contentDigest = digest({
    evaluation: snapshot.evaluation,
    scores: snapshot.scores,
    dimensions: snapshot.dimensions,
    findings: snapshot.findings,
  });
  return {
    id: newId('report'),
    schemaVersion: '1.0.0',
    createdAt: now,
    reportSchemaVersion: '1.0.0',
    templateVersion,
    reportType,
    generatedAt: now,
    provenance: {
      definitionId: bundle.definition.id,
      definitionVersion: bundle.definition.definitionVersion,
      planId: bundle.plan.id,
      planDigest: bundle.plan.planDigest,
      runId: bundle.run.id,
      evaluationResultId: snapshot.evaluation.id,
      policyId: snapshot.policy.id,
      policyVersion: snapshot.policy.version,
      engineVersion: bundle.context.engineVersion,
      environmentFingerprint: bundle.context.environmentFingerprint,
      metricVersions: bundle.plan.metricVersions,
      ruleVersions: bundle.plan.ruleVersions,
    },
    target: bundle.definition.target,
    scope: bundle.definition.scope,
    methods: bundle.definition.methods,
    runStatus: bundle.run.status,
    evaluation: snapshot.evaluation,
    metrics: bundle.metrics,
    rules: bundle.rules,
    scores: snapshot.scores,
    dimensions: snapshot.dimensions,
    findings: snapshot.findings,
    evidenceIndex: bundle.evidence,
    limitations: bundle.definition.limitations,
    contentDigest,
  };
}

/** 将报告渲染为 Markdown；安全转义，不可用分数显式标注。 */
export function renderMarkdown(report: ReportDocument): string {
  const lines: string[] = [];
  lines.push(`# UXQ 评价报告`);
  lines.push('');
  lines.push(`- 报告 ID：${escapeMarkdown(report.id)}`);
  lines.push(`- 生成时间：${escapeMarkdown(report.generatedAt)}`);
  lines.push(`- 模板版本：${escapeMarkdown(report.templateVersion)}`);
  lines.push(`- 报告类型：${escapeMarkdown(report.reportType)}`);
  lines.push('');
  lines.push(`## 目标`);
  lines.push(`- 名称：${escapeMarkdown(report.target.name)}`);
  lines.push(`- 类型：${escapeMarkdown(report.target.type)}`);
  lines.push(`- 版本：${escapeMarkdown(report.target.version)}`);
  lines.push(`- 环境：${escapeMarkdown(report.target.environment)}`);
  lines.push('');
  lines.push(`## 总体评价`);
  lines.push(`- 状态：${escapeMarkdown(report.evaluation.evaluationStatus)}`);
  lines.push(`- 结论：${escapeMarkdown(report.evaluation.overallOutcome)}`);
  lines.push(`- 总分：${unavailableLabel(report.evaluation.overallScore)}`);
  lines.push(
    `- 覆盖率：${report.evaluation.coverage.ratio === null ? '_不可用_' : `${(report.evaluation.coverage.ratio * 100).toFixed(1)}%`}`,
  );
  lines.push('');
  lines.push(`## 维度结果`);
  for (const dimension of report.dimensions) {
    lines.push(`### ${escapeMarkdown(dimension.dimensionId)}`);
    lines.push(`- 状态：${escapeMarkdown(dimension.status)}`);
    lines.push(
      `- 分数：${dimension.status === 'SCORED' ? unavailableLabel(dimension.value) : '_不可用_'}`,
    );
    lines.push(`- 权重：${dimension.weight}`);
    lines.push(
      `- 覆盖率：${dimension.coverage.ratio === null ? '_不可用_' : `${(dimension.coverage.ratio * 100).toFixed(1)}%`}`,
    );
  }
  lines.push('');
  lines.push(`## 指标结果`);
  for (const metric of report.metrics) {
    lines.push(
      `- **${escapeMarkdown(metric.metricId)}**：${metric.status === 'MEASURED' ? `${escapeMarkdown(String(metric.value))} ${escapeMarkdown(metric.unit ?? '')}` : escapeMarkdown(metric.reason ?? '_不可用_')}`,
    );
  }
  lines.push('');
  lines.push(`## 规则结果`);
  for (const rule of report.rules) {
    lines.push(
      `- **${escapeMarkdown(rule.ruleId)}**：${escapeMarkdown(rule.executionStatus)} / ${escapeMarkdown(rule.outcome)}`,
    );
  }
  lines.push('');
  if (report.findings.length > 0) {
    lines.push(`## 问题`);
    for (const finding of report.findings) {
      lines.push(`### ${escapeMarkdown(finding.title)}`);
      lines.push(`- 类型：${escapeMarkdown(finding.type)}`);
      lines.push(`- 严重性：${escapeMarkdown(finding.severity)}`);
      lines.push(`- 优先级：${escapeMarkdown(finding.priority)}`);
      lines.push(`- 状态：${escapeMarkdown(finding.lifecycle)}`);
      lines.push(`- 描述：${escapeMarkdown(finding.description)}`);
    }
  }
  if (report.limitations.length > 0) {
    lines.push('');
    lines.push(`## 限制`);
    for (const limitation of report.limitations) lines.push(`- ${escapeMarkdown(limitation)}`);
  }
  lines.push('');
  lines.push(`---`);
  lines.push(`_内容摘要：${escapeMarkdown(report.contentDigest)}_`);
  return lines.join('\n');
}

/** 登记报告工件到 manifest；不修改已有产物。 */
export function createReportArtifact(
  runId: string,
  evaluationResultId: string,
  templateVersion: string,
  jsonContent: string,
  markdownContent: string,
): ReportArtifact {
  const now = new Date().toISOString();
  return {
    id: newId('report-artifact'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    evaluationResultId,
    templateVersion,
    contentDigest: digest({ json: jsonContent, markdown: markdownContent }),
    json: {
      path: `reports/${runId}.json`,
      digest: digest(jsonContent),
      bytes: new TextEncoder().encode(jsonContent).length,
      mediaType: 'application/json',
    },
    markdown: {
      path: `reports/${runId}.md`,
      digest: digest(markdownContent),
      bytes: new TextEncoder().encode(markdownContent).length,
      mediaType: 'text/markdown',
    },
  };
}

/**
 * M3.5: 生成回归报告
 * 
 * 从比较结果和 Finding 历史生成回归报告。
 * 不重新计算评分，不修改历史事实。
 */
export function generateRegressionReport(input: {
  baselineName: string;
  baselineRunId: string;
  currentRunId: string;
  comparability: string;
  scoreDelta: number | null;
  baselineScore: number | null;
  currentScore: number | null;
  metricDeltas: Array<{
    metricId: string;
    baselineValue: unknown;
    currentValue: unknown;
    delta: number | null;
    deltaPercent: number | null;
  }>;
  ruleDeltas: Array<{
    ruleId: string;
    baselineOutcome: string;
    currentOutcome: string;
    changed: boolean;
  }>;
  findingChanges?: {
    new: number;
    resolved: number;
    persisted: number;
    reopened: number;
  };
  verificationStatus?: string | null;
  caveats: string[];
  now: string;
}): RegressionReport {
  return {
    id: newId('regression-report'),
    schemaVersion: '1.0.0',
    createdAt: input.now,
    reportType: 'REGRESSION',
    baselineName: input.baselineName,
    baselineRunId: input.baselineRunId,
    currentRunId: input.currentRunId,
    comparability: input.comparability,
    scoreDelta: input.scoreDelta,
    baselineScore: input.baselineScore,
    currentScore: input.currentScore,
    metricDeltas: input.metricDeltas,
    ruleDeltas: input.ruleDeltas,
    findingChanges: input.findingChanges ?? { new: 0, resolved: 0, persisted: 0, reopened: 0 },
    verificationStatus: input.verificationStatus ?? null,
    caveats: input.caveats,
    limitations: [
      '回归比较基于可比运行条件',
      '不可比的比较结果不能直接归因于产品变化',
      '评分差异可能受策略版本、浏览器版本、视口等因素影响',
      '回归报告不重新计算评分，只投影已有结果',
    ],
  };
}

/**
 * M3.5: 渲染回归报告为 Markdown
 */
export function renderRegressionMarkdown(report: RegressionReport): string {
  const lines: string[] = [];
  lines.push('# UXQ 回归报告');
  lines.push('');
  lines.push(`- 报告 ID：${escapeMarkdown(report.id)}`);
  lines.push(`- 生成时间：${escapeMarkdown(report.createdAt)}`);
  lines.push(`- 基线：${escapeMarkdown(report.baselineName)} (${escapeMarkdown(report.baselineRunId)})`);
  lines.push(`- 当前运行：${escapeMarkdown(report.currentRunId)}`);
  lines.push('');
  lines.push('## 可比性');
  lines.push(`- 可比性：${escapeMarkdown(report.comparability)}`);
  lines.push('');
  lines.push('## 总体评分变化');
  lines.push(`- 基线分数：${unavailableLabel(report.baselineScore)}`);
  lines.push(`- 当前分数：${unavailableLabel(report.currentScore)}`);
  lines.push(`- 变化：${unavailableLabel(report.scoreDelta)}`);
  lines.push('');

  if (report.metricDeltas.length > 0) {
    lines.push('## 指标变化');
    lines.push('| 指标 | 基线值 | 当前值 | 变化 | 变化% |');
    lines.push('|---|---|---|---|---|');
    for (const metric of report.metricDeltas) {
      const deltaStr = metric.delta !== null ? String(metric.delta) : '_不可用_';
      const deltaPctStr = metric.deltaPercent !== null ? `${metric.deltaPercent.toFixed(1)}%` : '_不可用_';
      lines.push(`| ${escapeMarkdown(metric.metricId)} | ${escapeMarkdown(String(metric.baselineValue ?? '_不可用_'))} | ${escapeMarkdown(String(metric.currentValue ?? '_不可用_'))} | ${deltaStr} | ${deltaPctStr} |`);
    }
    lines.push('');
  }

  if (report.ruleDeltas.length > 0) {
    lines.push('## 规则变化');
    lines.push('| 规则 | 基线结果 | 当前结果 | 变化 |');
    lines.push('|---|---|---|---|');
    for (const rule of report.ruleDeltas) {
      const changed = rule.changed ? '是' : '否';
      lines.push(`| ${escapeMarkdown(rule.ruleId)} | ${escapeMarkdown(rule.baselineOutcome)} | ${escapeMarkdown(rule.currentOutcome)} | ${changed} |`);
    }
    lines.push('');
  }

  lines.push('## 问题变化');
  lines.push(`- 新问题：${report.findingChanges.new}`);
  lines.push(`- 已解决：${report.findingChanges.resolved}`);
  lines.push(`- 持续存在：${report.findingChanges.persisted}`);
  lines.push(`- 重新打开：${report.findingChanges.reopened}`);
  lines.push('');

  if (report.verificationStatus) {
    lines.push('## 复测状态');
    lines.push(`- 状态：${escapeMarkdown(report.verificationStatus)}`);
    lines.push('');
  }

  if (report.caveats.length > 0) {
    lines.push('## 注意事项');
    for (const caveat of report.caveats) {
      lines.push(`- ${escapeMarkdown(caveat)}`);
    }
    lines.push('');
  }

  lines.push('## 限制');
  for (const limitation of report.limitations) {
    lines.push(`- ${escapeMarkdown(limitation)}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('_回归报告不重新计算评分，只投影已有结果_');

  return lines.join('\n');
}
