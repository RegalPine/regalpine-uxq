import { newId } from '@uxq/core';
import type { Timestamp, Id } from '@uxq/core';

/**
 * M4.3: 可访问性与辅助技术模块
 *
 * 扩展自动化、人工检查及辅助技术测试矩阵。
 * 声明 WCAG 版本、覆盖、方法和未覆盖项。
 * 明确限制：不夸大全面合规。
 */

/** WCAG 版本 */
export type WCAGVersion = '2.0' | '2.1' | '2.2';

/** 合规级别 */
export type ConformanceLevel = 'A' | 'AA' | 'AAA';

/** 检查类型 */
export type CheckType =
  | 'AUTOMATED' // 自动化检查
  | 'MANUAL' // 人工检查
  | 'ASSISTIVE_TECH' // 辅助技术测试
  | 'USER_TEST'; // 用户测试

/** WCAG 准则 */
export interface WCAGCriterion {
  id: string; // e.g., "1.1.1"
  level: ConformanceLevel;
  name: string;
  description: string;
  techniques: string[]; // 推荐技术
}

/** 可访问性检查结果 */
export interface AccessibilityCheckResult {
  id: Id<'a11y-check'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  runId: Id<'run'>;
  entityId: string;
  criterionId: string;
  checkType: CheckType;
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_APPLICABLE';
  severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR';
  description: string;
  evidence?: string;
  assistiveTechUsed?: string[];
  remediation?: string;
  limitations: string[];
}

/** 可访问性评估报告 */
export interface AccessibilityReport {
  id: Id<'a11y-report'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  runId: Id<'run'>;
  wcagVersion: WCAGVersion;
  targetLevel: ConformanceLevel;
  checks: AccessibilityCheckResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    inconclusive: number;
    notApplicable: number;
  };
  conformanceClaim: ConformanceClaim;
  coverage: {
    criteriaEvaluated: number;
    criteriaTotal: number;
    coveragePercent: number;
  };
  limitations: string[];
}

/** 合规声明 */
export interface ConformanceClaim {
  conforms: boolean;
  level: ConformanceLevel | null;
  criteria: {
    passed: string[];
    failed: string[];
    notEvaluated: string[];
  };
  statement: string;
}

/** 创建可访问性检查结果 */
export function createAccessibilityCheck(
  runId: Id<'run'>,
  entityId: string,
  criterionId: string,
  checkType: CheckType,
  status: 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_APPLICABLE',
  severity: 'CRITICAL' | 'SERIOUS' | 'MODERATE' | 'MINOR',
  description: string,
  now: Timestamp,
  evidence?: string,
  assistiveTechUsed?: string[],
  remediation?: string,
): AccessibilityCheckResult {
  const base: AccessibilityCheckResult = {
    id: newId('a11y-check'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    entityId,
    criterionId,
    checkType,
    status,
    severity,
    description,
    limitations: [
      '检查结果基于特定测试环境',
      '自动化检查不能替代人工评估',
      '辅助技术测试结果依赖具体配置',
    ],
  };

  if (evidence) base.evidence = evidence;
  if (assistiveTechUsed) base.assistiveTechUsed = assistiveTechUsed;
  if (remediation) base.remediation = remediation;

  return base;
}

/** 创建可访问性评估报告 */
export function createAccessibilityReport(
  runId: Id<'run'>,
  wcagVersion: WCAGVersion,
  targetLevel: ConformanceLevel,
  checks: readonly AccessibilityCheckResult[],
  allCriteria: readonly WCAGCriterion[],
  now: Timestamp,
): AccessibilityReport {
  const summary = {
    total: checks.length,
    passed: checks.filter((c) => c.status === 'PASS').length,
    failed: checks.filter((c) => c.status === 'FAIL').length,
    inconclusive: checks.filter((c) => c.status === 'INCONCLUSIVE').length,
    notApplicable: checks.filter((c) => c.status === 'NOT_APPLICABLE').length,
  };

  const criteriaEvaluated = new Set(checks.map((c) => c.criterionId));
  const passedCriteria = checks.filter((c) => c.status === 'PASS').map((c) => c.criterionId);
  const failedCriteria = checks.filter((c) => c.status === 'FAIL').map((c) => c.criterionId);
  const notEvaluatedCriteria = allCriteria
    .filter((c) => !criteriaEvaluated.has(c.id))
    .map((c) => c.id);

  const targetCriteria = allCriteria.filter((c) => {
    if (targetLevel === 'A') return c.level === 'A';
    if (targetLevel === 'AA') return c.level === 'A' || c.level === 'AA';
    return true; // AAA includes all
  });

  const conforms =
    failedCriteria.length === 0 &&
    targetCriteria.every(
      (c) => passedCriteria.includes(c.id) || notEvaluatedCriteria.includes(c.id),
    );

  const conformanceClaim: ConformanceClaim = {
    conforms,
    level: conforms ? targetLevel : null,
    criteria: {
      passed: passedCriteria,
      failed: failedCriteria,
      notEvaluated: notEvaluatedCriteria,
    },
    statement: generateConformanceStatement(wcagVersion, targetLevel, conforms, summary),
  };

  const coveragePercent =
    targetCriteria.length > 0 ? (criteriaEvaluated.size / targetCriteria.length) * 100 : 0;

  return {
    id: newId('a11y-report'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    wcagVersion,
    targetLevel,
    checks: [...checks],
    summary,
    conformanceClaim,
    coverage: {
      criteriaEvaluated: criteriaEvaluated.size,
      criteriaTotal: targetCriteria.length,
      coveragePercent,
    },
    limitations: [
      `基于 WCAG ${wcagVersion} 评估`,
      `目标合规级别：${targetLevel}`,
      `覆盖率：${coveragePercent.toFixed(1)}%`,
      '未评估的准则不能声明合规',
      '自动化检查覆盖率有限',
      '辅助技术测试不代表完整用户测试',
    ],
  };
}

/** 生成合规声明 */
function generateConformanceStatement(
  wcagVersion: WCAGVersion,
  level: ConformanceLevel,
  conforms: boolean,
  summary: { passed: number; failed: number; inconclusive: number },
): string {
  if (!conforms) {
    return `不符合 WCAG ${wcagVersion} ${level} 级别要求（${summary.failed} 项失败）`;
  }

  return `符合 WCAG ${wcagVersion} ${level} 级别要求（${summary.passed} 项通过）`;
}

/** WCAG 2.1 AA 级别核心准则 */
export const WCAG_21_AA_CRITERIA: WCAGCriterion[] = [
  // 1.1 文本替代
  {
    id: '1.1.1',
    level: 'A',
    name: '非文本内容',
    description: '所有非文本内容都有替代文本',
    techniques: ['H37', 'H24'],
  },

  // 1.3 可适应
  {
    id: '1.3.1',
    level: 'A',
    name: '信息和关系',
    description: '可以通过程序确定信息和关系',
    techniques: ['H49', 'H51'],
  },
  {
    id: '1.3.2',
    level: 'A',
    name: '有意义的顺序',
    description: '顺序不影响理解',
    techniques: ['H56', 'G57'],
  },

  // 1.4 可辨别
  {
    id: '1.4.1',
    level: 'A',
    name: '颜色的使用',
    description: '颜色不作为传达信息的唯一手段',
    techniques: ['G14', 'G182'],
  },
  {
    id: '1.4.3',
    level: 'AA',
    name: '对比度（最低）',
    description: '文本对比度至少 4.5:1',
    techniques: ['G18', 'G145'],
  },
  {
    id: '1.4.4',
    level: 'AA',
    name: '调整文本大小',
    description: '可以放大到 200% 而不丢失内容',
    techniques: ['G142', 'G179'],
  },

  // 2.1 可键盘访问
  {
    id: '2.1.1',
    level: 'A',
    name: '键盘',
    description: '所有功能可以通过键盘访问',
    techniques: ['G90', 'G202'],
  },
  {
    id: '2.1.2',
    level: 'A',
    name: '无键盘陷阱',
    description: '焦点不会被困在某个区域',
    techniques: ['G21', 'H91'],
  },

  // 2.4 可导航
  {
    id: '2.4.1',
    level: 'A',
    name: '跳过块',
    description: '提供跳过重复内容的方式',
    techniques: ['G1', 'H69'],
  },
  {
    id: '2.4.2',
    level: 'A',
    name: '页面标题',
    description: '页面有描述性标题',
    techniques: ['G88', 'H25'],
  },
  {
    id: '2.4.3',
    level: 'A',
    name: '焦点顺序',
    description: '焦点顺序保持有意义的顺序',
    techniques: ['H4', 'G59'],
  },

  // 3.1 可读
  {
    id: '3.1.1',
    level: 'A',
    name: '页面语言',
    description: '页面语言可以程序确定',
    techniques: ['H57', 'G15'],
  },

  // 3.2 可预测
  {
    id: '3.2.1',
    level: 'A',
    name: '焦点触发',
    description: '获得焦点不触发变化',
    techniques: ['G107', 'G80'],
  },

  // 4.1 兼容
  {
    id: '4.1.2',
    level: 'A',
    name: '名称、角色、值',
    description: '组件的名称和角色可以程序确定',
    techniques: ['H91', 'ARIA16'],
  },
];

/** 验证可访问性检查完整性 */
export function validateAccessibilityCheck(check: AccessibilityCheckResult): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (check.entityId.trim().length === 0) {
    issues.push('实体 ID 不能为空');
  }

  if (check.criterionId.trim().length === 0) {
    issues.push('准则 ID 不能为空');
  }

  if (check.status === 'FAIL' && !check.remediation) {
    issues.push('失败的检查应提供修复建议');
  }

  if (
    check.checkType === 'ASSISTIVE_TECH' &&
    (!check.assistiveTechUsed || check.assistiveTechUsed.length === 0)
  ) {
    issues.push('辅助技术测试应说明使用的技术');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** 生成可访问性评估摘要 */
export function generateAccessibilitySummary(report: AccessibilityReport): string {
  const lines: string[] = [
    `# 可访问性评估报告`,
    ``,
    `**WCAG 版本**: ${report.wcagVersion}`,
    `**目标级别**: ${report.targetLevel}`,
    `**评估时间**: ${report.createdAt}`,
    ``,
    `## 摘要`,
    `- 总检查数: ${report.summary.total}`,
    `- 通过: ${report.summary.passed}`,
    `- 失败: ${report.summary.failed}`,
    `- 不确定: ${report.summary.inconclusive}`,
    `- 不适用: ${report.summary.notApplicable}`,
    ``,
    `## 覆盖率`,
    `- 已评估准则: ${report.coverage.criteriaEvaluated}/${report.coverage.criteriaTotal}`,
    `- 覆盖率: ${report.coverage.coveragePercent.toFixed(1)}%`,
    ``,
    `## 合规声明`,
    report.conformanceClaim.statement,
    ``,
    `## 限制`,
    ...report.limitations.map((l) => `- ${l}`),
  ];

  return lines.join('\n');
}
