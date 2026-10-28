import type {
  EvaluationDefinition,
  EvaluationResult,
  MetricResult,
  RuleResult,
  Finding,
  ReportDocument,
  ScoringPolicy,
  RunBundle,
  EvaluationSnapshot,
} from '@uxq/contracts';

/**
 * @uxq/conformance - UXQ 规范符合性检查
 *
 * 检查评价定义、规则、评分策略、数据契约和报告是否符合 UXQ 规范。
 * 不等同于被测应用的可访问性合规检查。
 */

/** 符合性检查结果 */
export interface ConformanceResult {
  /** 检查项 ID */
  checkId: string;
  /** 检查类别 */
  category: ConformanceCategory;
  /** 检查状态 */
  status: ConformanceStatus;
  /** 检查描述 */
  description: string;
  /** 问题详情（仅失败时有值） */
  details?: string[];
}

/** 符合性检查类别 */
export type ConformanceCategory =
  | 'DEFINITION' // 评价定义完整性
  | 'METRIC' // 指标定义与结果
  | 'RULE' // 规则引用与执行
  | 'POLICY' // 评分策略
  | 'EVALUATION' // 评价结果
  | 'FINDING' // 问题发现
  | 'REPORT' // 报告披露
  | 'EVIDENCE'; // 证据链

/** 检查状态 */
export type ConformanceStatus = 'PASS' | 'FAIL' | 'WARN' | 'SKIP';

/** 符合性检查报告 */
export interface ConformanceReport {
  schemaVersion: '1.0.0';
  createdAt: string;
  runId: string;
  definitionId: string;
  results: ConformanceResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
  };
  overallStatus: ConformanceStatus;
  limitations: string[];
}

/** 检查评价定义的完整性 */
export function checkDefinition(definition: EvaluationDefinition): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  // DEF-001: 定义必须有名称
  results.push({
    checkId: 'DEF-001',
    category: 'DEFINITION',
    status: definition.name.trim().length > 0 ? 'PASS' : 'FAIL',
    description: '评价定义必须有名称',
    ...(definition.name.trim().length === 0 ? { details: ['名称为空'] } : {}),
  });

  // DEF-002: 定义必须有版本
  results.push({
    checkId: 'DEF-002',
    category: 'DEFINITION',
    status: definition.definitionVersion.trim().length > 0 ? 'PASS' : 'FAIL',
    description: '评价定义必须有版本号',
  });

  // DEF-003: 定义必须有目标
  results.push({
    checkId: 'DEF-003',
    category: 'DEFINITION',
    status: definition.target.id.trim().length > 0 ? 'PASS' : 'FAIL',
    description: '评价定义必须有目标实体',
  });

  // DEF-004: 定义必须声明维度
  results.push({
    checkId: 'DEF-004',
    category: 'DEFINITION',
    status: definition.dimensions.length > 0 ? 'PASS' : 'FAIL',
    description: '评价定义必须至少声明一个评价维度',
  });

  // DEF-005: 定义必须声明方法
  results.push({
    checkId: 'DEF-005',
    category: 'DEFINITION',
    status: definition.methods.length > 0 ? 'PASS' : 'WARN',
    description: '评价定义应声明评价方法',
  });

  // DEF-006: 定义必须声明限制
  results.push({
    checkId: 'DEF-006',
    category: 'DEFINITION',
    status: definition.limitations.length > 0 ? 'PASS' : 'WARN',
    description: '评价定义应声明限制条件',
  });

  return results;
}

/** 检查指标定义与结果的符合性 */
export function checkMetrics(
  definition: EvaluationDefinition,
  metrics: readonly MetricResult[],
): ConformanceResult[] {
  const results: ConformanceResult[] = [];
  const definedMetricIds = new Set(definition.metrics.map((m) => m.id));
  const resultMetricIds = new Set(metrics.map((m) => m.metricId));

  // MET-001: 每个定义的指标都应有结果
  const missingResults = [...definedMetricIds].filter((id) => !resultMetricIds.has(id));
  results.push({
    checkId: 'MET-001',
    category: 'METRIC',
    status: missingResults.length === 0 ? 'PASS' : 'WARN',
    description: '定义的指标应有对应结果',
    ...(missingResults.length > 0
      ? { details: missingResults.map((id) => `指标 ${id} 缺少结果`) }
      : {}),
  });

  // MET-002: 结果不应引用未定义的指标
  const extraResults = [...resultMetricIds].filter((id) => !definedMetricIds.has(id));
  results.push({
    checkId: 'MET-002',
    category: 'METRIC',
    status: extraResults.length === 0 ? 'PASS' : 'FAIL',
    description: '结果不应引用未定义的指标',
    ...(extraResults.length > 0
      ? { details: extraResults.map((id) => `结果引用了未定义指标 ${id}`) }
      : {}),
  });

  // MET-003: 测量的指标必须有有效值
  for (const metric of metrics) {
    if (metric.status === 'MEASURED') {
      const defined = definition.metrics.find((m) => m.id === metric.metricId);
      if (defined && defined.minimum !== undefined && defined.maximum !== undefined) {
        const value = typeof metric.value === 'number' ? metric.value : null;
        const inRange = value !== null && value >= defined.minimum && value <= defined.maximum;
        results.push({
          checkId: `MET-003-${metric.metricId}`,
          category: 'METRIC',
          status: inRange ? 'PASS' : 'WARN',
          description: `指标 ${metric.metricId} 的值应在 [${defined.minimum}, ${defined.maximum}] 范围内`,
          ...(inRange ? {} : { details: [`实际值: ${value}`] }),
        });
      }
    }
  }

  return results;
}

/** 检查规则引用与执行的符合性 */
export function checkRules(
  definition: EvaluationDefinition,
  rules: readonly RuleResult[],
): ConformanceResult[] {
  const results: ConformanceResult[] = [];
  const definedRuleIds = new Set(definition.rules.map((r) => r.id));
  const resultRuleIds = new Set(rules.map((r) => r.ruleId));

  // RULE-001: 每个定义的规则都应有执行结果
  const missingResults = [...definedRuleIds].filter((id) => !resultRuleIds.has(id));
  results.push({
    checkId: 'RULE-001',
    category: 'RULE',
    status: missingResults.length === 0 ? 'PASS' : 'WARN',
    description: '定义的规则应有执行结果',
    ...(missingResults.length > 0
      ? { details: missingResults.map((id) => `规则 ${id} 缺少执行结果`) }
      : {}),
  });

  // RULE-002: 规则执行状态必须合法
  for (const rule of rules) {
    const validStatuses = ['COMPLETED', 'ERROR'] as const;
    results.push({
      checkId: `RULE-002-${rule.ruleId}`,
      category: 'RULE',
      status: validStatuses.includes(rule.executionStatus as 'COMPLETED' | 'ERROR')
        ? 'PASS'
        : 'FAIL',
      description: `规则 ${rule.ruleId} 执行状态必须为 COMPLETED 或 ERROR`,
    });
  }

  // RULE-003: COMPLETED 的规则必须有合法 outcome
  for (const rule of rules) {
    if (rule.executionStatus === 'COMPLETED') {
      const validOutcomes = ['PASS', 'FAIL', 'INDETERMINATE', 'NOT_APPLICABLE'] as const;
      const outcome = rule.outcome as string;
      results.push({
        checkId: `RULE-003-${rule.ruleId}`,
        category: 'RULE',
        status: validOutcomes.includes(outcome as 'PASS') ? 'PASS' : 'FAIL',
        description: `规则 ${rule.ruleId} 完成时 outcome 必须合法`,
      });
    }
  }

  return results;
}

/** 检查评分策略的符合性 */
export function checkPolicy(policy: ScoringPolicy): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  // POL-001: 策略必须有名称
  results.push({
    checkId: 'POL-001',
    category: 'POLICY',
    status: policy.name.trim().length > 0 ? 'PASS' : 'FAIL',
    description: '评分策略必须有名称',
  });

  // POL-002: 策略必须声明缺失值处理方式
  results.push({
    checkId: 'POL-002',
    category: 'POLICY',
    status: policy.missingPolicy ? 'PASS' : 'FAIL',
    description: '评分策略必须声明缺失值处理方式',
  });

  // POL-003: 策略必须声明最低覆盖率
  results.push({
    checkId: 'POL-003',
    category: 'POLICY',
    status: policy.minimumCoverage !== undefined ? 'PASS' : 'FAIL',
    description: '评分策略必须声明最低覆盖率',
  });

  // POL-004: 策略必须有维度绑定
  results.push({
    checkId: 'POL-004',
    category: 'POLICY',
    status: policy.dimensions.length > 0 ? 'PASS' : 'FAIL',
    description: '评分策略必须至少声明一个维度',
  });

  // POL-005: 策略应声明限制
  results.push({
    checkId: 'POL-005',
    category: 'POLICY',
    status: policy.limitations.length > 0 ? 'PASS' : 'WARN',
    description: '评分策略应声明限制条件',
  });

  return results;
}

/** 检查评价结果的符合性 */
export function checkEvaluation(
  evaluation: EvaluationResult,
  metrics: readonly MetricResult[],
  rules: readonly RuleResult[],
): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  // EVAL-001: 评价结果必须引用有效策略版本
  results.push({
    checkId: 'EVAL-001',
    category: 'EVALUATION',
    status: evaluation.policyId && evaluation.policyVersion ? 'PASS' : 'FAIL',
    description: '评价结果必须引用策略 ID 和版本',
  });

  // EVAL-002: 评价状态必须合法
  const validStatuses = [
    'COMPLETE',
    'PARTIAL',
    'INSUFFICIENT_EVIDENCE',
    'CONSTRAINED',
    'EXECUTION_FAILED',
  ];
  results.push({
    checkId: 'EVAL-002',
    category: 'EVALUATION',
    status: validStatuses.includes(evaluation.evaluationStatus) ? 'PASS' : 'FAIL',
    description: '评价状态必须合法',
  });

  // EVAL-003: 总体结论必须合法
  const validOutcomes = ['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT_RATED'];
  results.push({
    checkId: 'EVAL-003',
    category: 'EVALUATION',
    status: validOutcomes.includes(evaluation.overallOutcome) ? 'PASS' : 'FAIL',
    description: '总体结论必须合法',
  });

  // EVAL-004: COMPLETE + PASS 不自动绑定（高分不代表通过）
  // 这是一个信息性检查，始终 PASS
  results.push({
    checkId: 'EVAL-004',
    category: 'EVALUATION',
    status: 'PASS',
    description: 'COMPLETE 不自动代表 PASS，已通过独立结论校验',
  });

  // EVAL-005: 覆盖率必须声明
  results.push({
    checkId: 'EVAL-005',
    category: 'EVALUATION',
    status: evaluation.coverage ? 'PASS' : 'FAIL',
    description: '评价结果必须声明覆盖率',
  });

  // EVAL-006: 限制必须声明
  results.push({
    checkId: 'EVAL-006',
    category: 'EVALUATION',
    status: evaluation.limitations.length > 0 ? 'PASS' : 'WARN',
    description: '评价结果应声明限制条件',
  });

  return results;
}

/** 检查 Finding 的符合性 */
export function checkFindings(findings: readonly Finding[]): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  for (const finding of findings) {
    // FIND-001: Finding 必须有标题
    results.push({
      checkId: `FIND-001-${finding.id}`,
      category: 'FINDING',
      status: finding.title.trim().length > 0 ? 'PASS' : 'FAIL',
      description: `Finding ${finding.id} 必须有标题`,
    });

    // FIND-002: Finding 必须有类型
    results.push({
      checkId: `FIND-002-${finding.id}`,
      category: 'FINDING',
      status: finding.type ? 'PASS' : 'FAIL',
      description: `Finding ${finding.id} 必须有分类`,
    });

    // FIND-003: Finding 必须有严重性
    results.push({
      checkId: `FIND-003-${finding.id}`,
      category: 'FINDING',
      status: finding.severity ? 'PASS' : 'FAIL',
      description: `Finding ${finding.id} 必须有严重性`,
    });

    // FIND-004: Finding 必须有生命周期状态
    results.push({
      checkId: `FIND-004-${finding.id}`,
      category: 'FINDING',
      status: finding.lifecycle ? 'PASS' : 'FAIL',
      description: `Finding ${finding.id} 必须有生命周期状态`,
    });
  }

  return results;
}

/** 检查报告的符合性 */
export function checkReport(report: ReportDocument): ConformanceResult[] {
  const results: ConformanceResult[] = [];

  // RPT-001: 报告必须有模板版本
  results.push({
    checkId: 'RPT-001',
    category: 'REPORT',
    status: report.templateVersion.trim().length > 0 ? 'PASS' : 'FAIL',
    description: '报告必须声明模板版本',
  });

  // RPT-002: 报告必须有来源追溯
  results.push({
    checkId: 'RPT-002',
    category: 'REPORT',
    status: report.provenance ? 'PASS' : 'FAIL',
    description: '报告必须有来源追溯信息',
  });

  // RPT-003: 报告必须披露限制
  results.push({
    checkId: 'RPT-003',
    category: 'REPORT',
    status: report.limitations.length > 0 ? 'PASS' : 'WARN',
    description: '报告应披露评价限制',
  });

  // RPT-004: 报告必须有内容摘要
  results.push({
    checkId: 'RPT-004',
    category: 'REPORT',
    status: report.contentDigest.trim().length > 0 ? 'PASS' : 'FAIL',
    description: '报告必须有内容摘要用于完整性校验',
  });

  return results;
}

/** 执行完整符合性检查 */
export function runConformanceCheck(
  bundle: RunBundle,
  snapshot: EvaluationSnapshot,
  report?: ReportDocument,
  now: string = new Date().toISOString(),
): ConformanceReport {
  const allResults: ConformanceResult[] = [
    ...checkDefinition(bundle.definition),
    ...checkMetrics(bundle.definition, bundle.metrics),
    ...checkRules(bundle.definition, bundle.rules),
    ...checkPolicy(bundle.definition.policy),
    ...checkEvaluation(snapshot.evaluation, bundle.metrics, bundle.rules),
    ...checkFindings(snapshot.findings),
    ...(report ? checkReport(report) : []),
  ];

  const summary = {
    total: allResults.length,
    passed: allResults.filter((r) => r.status === 'PASS').length,
    failed: allResults.filter((r) => r.status === 'FAIL').length,
    warned: allResults.filter((r) => r.status === 'WARN').length,
    skipped: allResults.filter((r) => r.status === 'SKIP').length,
  };

  const overallStatus: ConformanceStatus =
    summary.failed > 0 ? 'FAIL' : summary.warned > 0 ? 'WARN' : 'PASS';

  return {
    schemaVersion: '1.0.0',
    createdAt: now,
    runId: bundle.run.id,
    definitionId: bundle.definition.id,
    results: allResults,
    summary,
    overallStatus,
    limitations: [
      '符合性检查基于静态契约校验，不验证运行时行为',
      'PASS 不代表被测应用的质量合格',
      '检查范围限于 UXQ 数据与规范一致性',
    ],
  };
}

/** 渲染符合性报告为 Markdown */
export function renderConformanceMarkdown(report: ConformanceReport): string {
  const lines: string[] = [];
  lines.push('# UXQ 规范符合性检查报告');
  lines.push('');
  lines.push(`- 运行 ID：${report.runId}`);
  lines.push(`- 定义 ID：${report.definitionId}`);
  lines.push(`- 检查时间：${report.createdAt}`);
  lines.push(`- 总体状态：**${report.overallStatus}**`);
  lines.push('');
  lines.push('## 摘要');
  lines.push(`- 总检查数：${report.summary.total}`);
  lines.push(`- 通过：${report.summary.passed}`);
  lines.push(`- 失败：${report.summary.failed}`);
  lines.push(`- 警告：${report.summary.warned}`);
  lines.push(`- 跳过：${report.summary.skipped}`);
  lines.push('');

  // Group by category
  const categories = new Map<string, ConformanceResult[]>();
  for (const result of report.results) {
    const existing = categories.get(result.category) ?? [];
    existing.push(result);
    categories.set(result.category, existing);
  }

  for (const [category, results] of categories) {
    lines.push(`## ${category}`);
    for (const result of results) {
      const icon =
        result.status === 'PASS'
          ? '✅'
          : result.status === 'FAIL'
            ? '❌'
            : result.status === 'WARN'
              ? '⚠️'
              : '⏭️';
      lines.push(`- ${icon} **${result.checkId}**: ${result.description}`);
      if (result.details) {
        for (const detail of result.details) {
          lines.push(`  - ${detail}`);
        }
      }
    }
    lines.push('');
  }

  lines.push('## 限制');
  for (const limitation of report.limitations) {
    lines.push(`- ${limitation}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('_符合性检查仅验证 UXQ 数据与规范一致性，不代表被测应用质量合格_');

  return lines.join('\n');
}
