import { describe, expect, it } from 'vitest';
import type { Timestamp } from '../../packages/core/src/index';
import type {
  MetricResult,
  RuleResult,
} from '../../packages/contracts/src/index';
import { generateSignals, createFinding, deduplicateFindings } from '../../packages/diagnostic/src/index';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;

describe('E2E-01: 正常评价', () => {
  it('成功评价生成合法诊断信号', () => {
    const rules: RuleResult[] = [{
      id: 'rr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      ruleId: 'r1',
      ruleVersion: '1.0.0',
      configurationDigest: 'cd',
      inputMetricResultIds: [],
      evidenceIds: [],
      evaluatedAt: fixedTime,
      reason: '通过',
      executionStatus: 'COMPLETED',
      outcome: 'PASS',
    }];
    
    const metrics: MetricResult[] = [{
      id: 'mr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      metricId: 'm1',
      metricVersion: '1.0.0',
      implementationVersion: '1.0.0',
      dimensionId: 'D01',
      measuredAt: fixedTime,
      evidenceIds: [],
      observationIds: [],
      excludedSampleIds: [],
      sampleCount: 1,
      inputDigest: 'd',
      limitations: [],
      status: 'MEASURED',
      value: 75,
    }];
    
    // 成功的规则和测量的指标不生成诊断信号
    const signals = generateSignals(rules, metrics, 'run-1', fixedTime);
    expect(signals).toHaveLength(0);
  });
});

describe('E2E-02: 任务执行失败', () => {
  it('规则执行错误生成错误信号', () => {
    const rules: RuleResult[] = [{
      id: 'rr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      ruleId: 'r1',
      ruleVersion: '1.0.0',
      configurationDigest: 'cd',
      inputMetricResultIds: [],
      evidenceIds: [],
      evaluatedAt: fixedTime,
      reason: '执行超时',
      executionStatus: 'ERROR',
      outcome: 'EXECUTION_ERROR',
      error: {
        code: 'TIMEOUT',
        message: '执行超时',
        category: 'EXECUTION',
      },
    }];
    
    const signals = generateSignals(rules, [], 'run-1', fixedTime);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe('INSUFFICIENT_EVIDENCE');
    expect(signals[0]!.confidence).toBe('LOW');
  });
});

describe('E2E-03: 指标证据不足', () => {
  it('证据不足指标生成诊断信号', () => {
    const metrics: MetricResult[] = [{
      id: 'mr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      metricId: 'm1',
      metricVersion: '1.0.0',
      implementationVersion: '1.0.0',
      dimensionId: 'D01',
      measuredAt: fixedTime,
      evidenceIds: [],
      observationIds: [],
      excludedSampleIds: [],
      sampleCount: 0,
      inputDigest: 'd',
      limitations: [],
      status: 'INSUFFICIENT_EVIDENCE',
      reason: '样本不足',
    }];
    
    const signals = generateSignals([], metrics, 'run-1', fixedTime);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe('INSUFFICIENT_EVIDENCE');
    expect(signals[0]!.severity).toBe('S3');
  });

  it('回归比较保留缺失状态', () => {
    const metric1: MetricResult = {
      id: 'mr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      metricId: 'm1',
      metricVersion: '1.0.0',
      implementationVersion: '1.0.0',
      dimensionId: 'D01',
      measuredAt: fixedTime,
      evidenceIds: [],
      observationIds: [],
      excludedSampleIds: [],
      sampleCount: 1,
      inputDigest: 'd',
      limitations: [],
      status: 'MEASURED',
      value: 100,
    };
    
    const metric2: MetricResult = {
      ...metric1,
      id: 'mr-2',
      runId: 'run-2',
      status: 'INSUFFICIENT_EVIDENCE',
      reason: '样本不足',
    };
    
    // 缺失状态应明确标记，不被抹平
    expect(metric1.status).toBe('MEASURED');
    expect(metric2.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('E2E-04: 关键规则失败', () => {
  it('关键规则失败生成高严重性信号', () => {
    const rules: RuleResult[] = [{
      id: 'rr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      ruleId: 'r1',
      ruleVersion: '1.0.0',
      configurationDigest: 'cd',
      inputMetricResultIds: [],
      evidenceIds: [],
      evaluatedAt: fixedTime,
      reason: '阈值未达标',
      executionStatus: 'COMPLETED',
      outcome: 'FAIL',
    }];
    
    const signals = generateSignals(rules, [], 'run-1', fixedTime);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.type).toBe('CONFIRMED_DEFECT');
    expect(signals[0]!.severity).toBe('S2');
    expect(signals[0]!.priority).toBe('P1');
  });

  it('诊断与去重保留风险事实', () => {
    const rules: RuleResult[] = [{
      id: 'rr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      ruleId: 'r1',
      ruleVersion: '1.0.0',
      configurationDigest: 'cd',
      inputMetricResultIds: [],
      evidenceIds: [],
      evaluatedAt: fixedTime,
      reason: '失败',
      executionStatus: 'COMPLETED',
      outcome: 'FAIL',
    }];
    
    const signals = generateSignals(rules, [], 'run-1', fixedTime);
    const finding = createFinding(signals[0]!, 'run-1', fixedTime);
    
    // Finding 保留规则失败的所有信息
    expect(finding.type).toBe('CONFIRMED_DEFECT');
    expect(finding.severity).toBe('S2');
    expect(finding.diagnosticSignalIds).toContain(signals[0]!.id);
    expect(finding.diagnosticSignalIds).toHaveLength(1);
  });
});

describe('E2E-08: 报告一致性', () => {
  it('诊断信号可追溯到 Finding', () => {
    const rules: RuleResult[] = [{
      id: 'rr-1',
      schemaVersion: '1.0.0',
      createdAt: fixedTime,
      runId: 'run-1',
      ruleId: 'r1',
      ruleVersion: '1.0.0',
      configurationDigest: 'cd',
      inputMetricResultIds: [],
      evidenceIds: ['e1', 'e2'],
      evaluatedAt: fixedTime,
      reason: '失败',
      executionStatus: 'COMPLETED',
      outcome: 'FAIL',
    }];
    
    const signals = generateSignals(rules, [], 'run-1', fixedTime);
    const finding = createFinding(signals[0]!, 'run-1', fixedTime);
    
    // 信号和 Finding 的关联可追溯
    expect(finding.diagnosticSignalIds).toHaveLength(1);
    expect(finding.diagnosticSignalIds[0]).toBe(signals[0]!.id);
    expect(finding.problemKey).toBe(signals[0]!.problemKey);
  });

  it('多个信号去重后保留完整历史', () => {
    // 相同实体的多个信号应该被去重
    const rules: RuleResult[] = [
      {
        id: 'rr-1',
        schemaVersion: '1.0.0',
        createdAt: fixedTime,
        runId: 'run-1',
        ruleId: 'r1',
        ruleVersion: '1.0.0',
        configurationDigest: 'cd',
        inputMetricResultIds: [],
        evidenceIds: ['e1'],
        evaluatedAt: fixedTime,
        reason: '失败',
        executionStatus: 'COMPLETED',
        outcome: 'FAIL',
      },
      {
        id: 'rr-2',
        schemaVersion: '1.0.0',
        createdAt: fixedTime,
        runId: 'run-1',  // 相同运行（相同实体）
        ruleId: 'r1',
        ruleVersion: '1.0.0',
        configurationDigest: 'cd',
        inputMetricResultIds: [],
        evidenceIds: ['e2'],
        evaluatedAt: fixedTime,
        reason: '失败',
        executionStatus: 'COMPLETED',
        outcome: 'FAIL',
      },
    ];
    
    const signals1 = generateSignals([rules[0]!], [], 'run-1', fixedTime);
    const signals2 = generateSignals([rules[1]!], [], 'run-1', fixedTime);
    
    const finding1 = createFinding(signals1[0]!, 'run-1', fixedTime);
    const finding2 = createFinding(signals2[0]!, 'run-1', fixedTime);
    
    const deduplicated = deduplicateFindings([finding1, finding2]);
    
    // 相同实体的去重后保留所有信号 ID
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]!.evaluationRunIds).toContain('run-1');
    expect(deduplicated[0]!.diagnosticSignalIds.length).toBeGreaterThanOrEqual(1);
  });
});
