import { digest, invariant, newId } from '@uxq/core';
import type { RuleDefinition, RuleExpression, RuleResult, MetricResult } from '@uxq/contracts';

/** 从指标结果中查找数值；非 MEASURED 状态返回 undefined。 */
function numericValue(result: MetricResult): number | undefined {
  return result.status === 'MEASURED' && typeof result.value === 'number'
    ? result.value
    : undefined;
}

/** 评估单个规则表达式；返回 PASS/FAIL/INDETERMINATE/NOT_APPLICABLE。不执行规则本身，只消费指标结果。 */
export function evaluateExpression(
  expression: RuleExpression,
  metrics: ReadonlyMap<string, MetricResult>,
): 'PASS' | 'FAIL' | 'INDETERMINATE' | 'NOT_APPLICABLE' {
  if ('children' in expression) {
    const outcomes = expression.children.map((child) => evaluateExpression(child, metrics));
    if (expression.op === 'ALL') {
      if (outcomes.some((outcome) => outcome === 'FAIL')) return 'FAIL';
      if (outcomes.some((outcome) => outcome === 'INDETERMINATE')) return 'INDETERMINATE';
      if (outcomes.some((outcome) => outcome === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
      return 'PASS';
    }
    if (expression.op === 'ANY') {
      if (outcomes.some((outcome) => outcome === 'PASS')) return 'PASS';
      if (outcomes.some((outcome) => outcome === 'INDETERMINATE')) return 'INDETERMINATE';
      if (outcomes.every((outcome) => outcome === 'NOT_APPLICABLE')) return 'NOT_APPLICABLE';
      return 'FAIL';
    }
  }
  if ('child' in expression) {
    const outcome = evaluateExpression(expression.child, metrics);
    if (outcome === 'PASS') return 'FAIL';
    if (outcome === 'FAIL') return 'PASS';
    return outcome;
  }
  if (!('metricId' in expression)) return 'INDETERMINATE';
  const metric = metrics.get(expression.metricId);
  if (!metric) return 'INDETERMINATE';
  if (metric.status === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (metric.status !== 'MEASURED') return 'INDETERMINATE';
  const value = numericValue(metric);
  if (value === undefined) return 'INDETERMINATE';
  switch (expression.op) {
    case 'LT':
      return value < expression.expected ? 'PASS' : 'FAIL';
    case 'LTE':
      return value <= expression.expected ? 'PASS' : 'FAIL';
    case 'GT':
      return value > expression.expected ? 'PASS' : 'FAIL';
    case 'GTE':
      return value >= expression.expected ? 'PASS' : 'FAIL';
    case 'EQ':
      return value === expression.expected ? 'PASS' : 'FAIL';
    case 'NE':
      return value !== expression.expected ? 'PASS' : 'FAIL';
    case 'BETWEEN':
      return value >= expression.lower && value <= expression.upper ? 'PASS' : 'FAIL';
    case 'IN':
      return expression.expected.includes(value) ? 'PASS' : 'FAIL';
    default:
      return 'INDETERMINATE';
  }
}

/** 注册表：按版本管理规则定义，拒绝重复注册。 */
export class RuleRegistry {
  readonly #rules = new Map<string, Map<string, RuleDefinition>>();

  register(rule: RuleDefinition): void {
    let versions = this.#rules.get(rule.id);
    if (!versions) {
      versions = new Map();
      this.#rules.set(rule.id, versions);
    }
    invariant(
      !versions.has(rule.version),
      'DUPLICATE_RULE_VERSION',
      `规则 ${rule.id}@${rule.version} 已注册`,
    );
    versions.set(rule.version, rule);
  }

  resolve(ruleId: string, version: string): RuleDefinition {
    const rule = this.#rules.get(ruleId)?.get(version);
    invariant(rule, 'UNKNOWN_RULE_VERSION', `规则 ${ruleId}@${version} 未注册`);
    return rule;
  }

  catalog(): ReadonlyMap<string, ReadonlyMap<string, RuleDefinition>> {
    return this.#rules;
  }
}

/** 执行单个规则，返回标准化 RuleResult。 */
export function evaluateRule(
  rule: RuleDefinition,
  metrics: ReadonlyMap<string, MetricResult>,
  runId: string,
  now: string,
): RuleResult {
  const outcome = evaluateExpression(rule.expression, metrics);
  const inputMetricResultIds = [...metrics.keys()];
  return {
    id: newId('rule'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    ruleId: rule.id,
    ruleVersion: rule.version,
    configurationDigest: digest(rule.expression),
    inputMetricResultIds,
    evidenceIds: [],
    evaluatedAt: now,
    reason: `表达式 ${rule.expression.op} 结果 ${outcome}`,
    executionStatus: 'COMPLETED',
    outcome,
  };
}

/** 安全执行规则，捕获异常并转换为 EXECUTION_ERROR。 */
export function safeEvaluateRule(
  rule: RuleDefinition,
  metrics: ReadonlyMap<string, MetricResult>,
  runId: string,
  now: string,
): RuleResult {
  let configurationDigest: string;
  try {
    configurationDigest = digest(rule.expression);
  } catch {
    configurationDigest = 'error-digest';
  }
  try {
    return evaluateRule(rule, metrics, runId, now);
  } catch (error) {
    return {
      id: newId('rule'),
      schemaVersion: '1.0.0',
      createdAt: now,
      runId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      configurationDigest,
      inputMetricResultIds: [],
      evidenceIds: [],
      evaluatedAt: now,
      reason: error instanceof Error ? error.message : '未知执行错误',
      executionStatus: 'ERROR',
      outcome: 'EXECUTION_ERROR',
      error: {
        code: 'RULE_EXECUTION',
        message: error instanceof Error ? error.message : '规则执行异常',
        category: 'EXECUTION',
      },
    };
  }
}
