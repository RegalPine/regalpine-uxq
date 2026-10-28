import { describe, expect, it } from 'vitest';
import type { RuleExpression, MetricResult, RuleDefinition } from '@uxq/contracts';
import { evaluateExpression, RuleRegistry, evaluateRule, safeEvaluateRule } from '../src/index.js';

function metricResult(
  metricId: string,
  value: number,
  status: MetricResult['status'] = 'MEASURED',
): MetricResult {
  const base = {
    id: `result-${metricId}`,
    schemaVersion: '1.0.0' as const,
    createdAt: '2026-01-01T00:00:00Z',
    runId: 'run-1',
    metricId,
    metricVersion: '1.0.0',
    implementationVersion: '1.0.0',
    dimensionId: 'D02' as const,
    measuredAt: '2026-01-01T00:00:00Z',
    evidenceIds: [],
    observationIds: [],
    excludedSampleIds: [],
    sampleCount: 1,
    inputDigest: 'abc',
    limitations: [],
  };
  if (status === 'MEASURED') return { ...base, status, value, unit: 'ms' };
  return { ...base, status, reason: '测试原因' };
}

describe('规则表达式', () => {
  it('LTE 通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    expect(evaluateExpression({ op: 'LTE', metricId: 'metric-1', expected: 80 }, metrics)).toBe(
      'PASS',
    );
  });
  it('LTE 失败', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 90)]]);
    expect(evaluateExpression({ op: 'LTE', metricId: 'metric-1', expected: 80 }, metrics)).toBe(
      'FAIL',
    );
  });
  it('GT 通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 90)]]);
    expect(evaluateExpression({ op: 'GT', metricId: 'metric-1', expected: 80 }, metrics)).toBe(
      'PASS',
    );
  });
  it('EQ 通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 42)]]);
    expect(evaluateExpression({ op: 'EQ', metricId: 'metric-1', expected: 42 }, metrics)).toBe(
      'PASS',
    );
  });
  it('NE 通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 42)]]);
    expect(evaluateExpression({ op: 'NE', metricId: 'metric-1', expected: 0 }, metrics)).toBe(
      'PASS',
    );
  });
  it('BETWEEN 通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    expect(
      evaluateExpression({ op: 'BETWEEN', metricId: 'metric-1', lower: 10, upper: 90 }, metrics),
    ).toBe('PASS');
  });
  it('IN 通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 42)]]);
    expect(
      evaluateExpression(
        { op: 'IN', metricId: 'metric-1', expected: [42, 43] as [number, ...number[]] },
        metrics,
      ),
    ).toBe('PASS');
  });
  it('ALL 全部通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const expression: RuleExpression = {
      op: 'ALL',
      children: [
        { op: 'LTE', metricId: 'metric-1', expected: 80 },
        { op: 'GT', metricId: 'metric-1', expected: 10 },
      ],
    };
    expect(evaluateExpression(expression, metrics)).toBe('PASS');
  });
  it('ALL 一个失败则失败', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const expression: RuleExpression = {
      op: 'ALL',
      children: [
        { op: 'LTE', metricId: 'metric-1', expected: 80 },
        { op: 'GT', metricId: 'metric-1', expected: 90 },
      ],
    };
    expect(evaluateExpression(expression, metrics)).toBe('FAIL');
  });
  it('ANY 一个通过则通过', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const expression: RuleExpression = {
      op: 'ANY',
      children: [
        { op: 'GT', metricId: 'metric-1', expected: 90 },
        { op: 'LTE', metricId: 'metric-1', expected: 80 },
      ],
    };
    expect(evaluateExpression(expression, metrics)).toBe('PASS');
  });
  it('NOT 取反', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const expression: RuleExpression = {
      op: 'NOT',
      child: { op: 'GT', metricId: 'metric-1', expected: 80 },
    };
    expect(evaluateExpression(expression, metrics)).toBe('PASS');
  });
  it('NOT 取反 PASS 变 FAIL', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const expression: RuleExpression = {
      op: 'NOT',
      child: { op: 'LTE', metricId: 'metric-1', expected: 80 },
    };
    expect(evaluateExpression(expression, metrics)).toBe('FAIL');
  });
  it('缺失指标返回 INDETERMINATE', () => {
    const metrics = new Map<string, MetricResult>();
    expect(evaluateExpression({ op: 'LTE', metricId: 'missing', expected: 80 }, metrics)).toBe(
      'INDETERMINATE',
    );
  });
  it('非 MEASURED 指标返回 INDETERMINATE', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 0, 'INSUFFICIENT_EVIDENCE')]]);
    expect(evaluateExpression({ op: 'LTE', metricId: 'metric-1', expected: 80 }, metrics)).toBe(
      'INDETERMINATE',
    );
  });
  it('NOT_APPLICABLE 指标传播', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 0, 'NOT_APPLICABLE')]]);
    expect(evaluateExpression({ op: 'LTE', metricId: 'metric-1', expected: 80 }, metrics)).toBe(
      'NOT_APPLICABLE',
    );
  });
});

describe('规则注册表', () => {
  function ruleDef(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
    return {
      id: 'rule-1',
      schemaVersion: '1.0.0',
      createdAt: '2026-01-01T00:00:00Z',
      version: '1.0.0',
      name: '测试规则',
      expression: { op: 'LTE', metricId: 'metric-1', expected: 80 },
      required: true,
      critical: false,
      ...overrides,
    };
  }
  it('注册和解析规则', () => {
    const registry = new RuleRegistry();
    const rule = ruleDef();
    registry.register(rule);
    expect(registry.resolve('rule-1', '1.0.0')).toBe(rule);
  });
  it('重复版本拒绝', () => {
    const registry = new RuleRegistry();
    registry.register(ruleDef());
    expect(() => registry.register(ruleDef())).toThrow();
  });
  it('未注册版本拒绝', () => {
    const registry = new RuleRegistry();
    expect(() => registry.resolve('rule-1', '9.9.9')).toThrow();
  });
});

describe('规则执行', () => {
  const rule: RuleDefinition = {
    id: 'rule-1',
    schemaVersion: '1.0.0',
    createdAt: '2026-01-01T00:00:00Z',
    version: '1.0.0',
    name: '测试规则',
    expression: { op: 'LTE', metricId: 'metric-1', expected: 80 },
    required: true,
    critical: true,
  };
  it('正常执行返回 PASS', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const result = evaluateRule(rule, metrics, 'run-1', '2026-01-01T00:00:00Z');
    expect(result.executionStatus).toBe('COMPLETED');
    expect(result.outcome).toBe('PASS');
  });
  it('正常执行返回 FAIL', () => {
    const metrics = new Map([['metric-1', metricResult('metric-1', 90)]]);
    const result = evaluateRule(rule, metrics, 'run-1', '2026-01-01T00:00:00Z');
    expect(result.outcome).toBe('FAIL');
  });
  it('安全执行捕获异常', () => {
    const badRule: RuleDefinition = {
      ...rule,
      expression: { op: 'LTE', metricId: 'metric-1', expected: NaN },
    };
    const metrics = new Map([['metric-1', metricResult('metric-1', 50)]]);
    const result = safeEvaluateRule(badRule, metrics, 'run-1', '2026-01-01T00:00:00Z');
    expect(result.executionStatus).toBe('ERROR');
    expect(result.outcome).toBe('EXECUTION_ERROR');
  });
});
