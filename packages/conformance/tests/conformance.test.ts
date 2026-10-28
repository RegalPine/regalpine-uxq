import { describe, expect, it } from 'vitest';
import { newId } from '@uxq/core';
import type { Id, Timestamp, IdList, Digest } from '@uxq/contracts';
import {
  checkDefinition,
  checkMetrics,
  checkRules,
  checkPolicy,
  checkEvaluation,
  checkFindings,
  checkReport,
  runConformanceCheck,
  renderConformanceMarkdown,
} from '@uxq/conformance';
import type {
  EvaluationDefinition,
  MetricResult,
  RuleResult,
  ScoringPolicy,
  EvaluationResult,
  Finding,
  ReportDocument,
  RunBundle,
  EvaluationSnapshot,
} from '@uxq/contracts';

const now = '2025-01-01T00:00:00Z' as Timestamp;
const rid = newId('run') as Id;

function makeDefinition(overrides?: Partial<EvaluationDefinition>): EvaluationDefinition {
  return {
    id: newId('def') as Id,
    schemaVersion: '1.0.0',
    createdAt: now,
    definitionVersion: '0.1.0',
    name: '测试评价定义',
    target: { id: 'target-1', name: '测试目标', type: 'PAGE', version: '1.0', environment: 'test' },
    scope: { entityIds: [], routes: [], taskIds: [], exclusions: [], limitations: [] },
    dimensions: ['D01'],
    methods: ['AUTOMATED'],
    metrics: [
      {
        id: 'metric-1',
        schemaVersion: '1.0.0',
        createdAt: now,
        version: '0.1.0',
        implementationVersion: '0.1.0',
        name: '加载时间',
        description: '页面加载时间',
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
        limitations: [],
      },
    ],
    rules: [
      {
        id: 'rule-1',
        schemaVersion: '1.0.0',
        createdAt: now,
        version: '0.1.0',
        name: '对比度检查',
        description: '文本对比度必须达标',
        combination: 'ALL',
        operators: [],
        inputMetricIds: ['metric-1'],
        limitations: [],
      },
    ],
    policy: {
      id: newId('policy') as Id,
      schemaVersion: '1.0.0',
      createdAt: now,
      version: '0.1.0',
      name: '测试评分策略',
      mode: 'SCORE',
      bindings: [
        { metricId: 'metric-1', weight: 1, normalization: 'LINEAR_LOWER', min: 0, max: 60000 },
      ],
      dimensions: [{ dimensionId: 'D01', weight: 1, minimumCoverage: 0 }],
      missingPolicy: 'EXCLUDE',
      minimumCoverage: 0,
      allowPartial: true,
      criticalRuleIds: [],
      riskSeverities: [],
      rationale: '测试策略',
      limitations: ['测试用途'],
    },
    tasks: [],
    steps: [],
    limitations: ['测试限制'],
    ...overrides,
  } as EvaluationDefinition;
}

describe('M4: 符合性检查', () => {
  describe('checkDefinition', () => {
    it('完整定义全部通过', () => {
      const results = checkDefinition(makeDefinition());
      expect(results.every((r) => r.status === 'PASS')).toBe(true);
    });

    it('空名称失败', () => {
      const results = checkDefinition(makeDefinition({ name: '' }));
      const nameCheck = results.find((r) => r.checkId === 'DEF-001');
      expect(nameCheck?.status).toBe('FAIL');
    });

    it('无维度失败', () => {
      const results = checkDefinition(makeDefinition({ dimensions: [] as any }));
      const dimCheck = results.find((r) => r.checkId === 'DEF-004');
      expect(dimCheck?.status).toBe('FAIL');
    });
  });

  describe('checkMetrics', () => {
    it('定义的指标有对应结果', () => {
      const def = makeDefinition();
      const metrics: MetricResult[] = [
        {
          id: newId('mr') as Id,
          schemaVersion: '1.0.0',
          createdAt: now,
          runId: rid,
          metricId: 'metric-1',
          metricVersion: '0.1.0',
          implementationVersion: '0.1.0',
          dimensionId: 'D01',
          measuredAt: now,
          evidenceIds: [] as IdList,
          observationIds: [] as IdList,
          excludedSampleIds: [] as IdList,
          sampleCount: 1,
          inputDigest: 'abc' as Digest,
          limitations: [],
          status: 'MEASURED',
          value: { kind: 'NUMBER', value: 1500 },
        } as unknown as MetricResult,
      ];
      const results = checkMetrics(def, metrics);
      const missingCheck = results.find((r) => r.checkId === 'MET-001');
      expect(missingCheck?.status).toBe('PASS');
    });

    it('结果引用未定义指标失败', () => {
      const def = makeDefinition();
      const metrics: MetricResult[] = [
        {
          id: newId('mr') as Id,
          schemaVersion: '1.0.0',
          createdAt: now,
          runId: rid,
          metricId: 'nonexistent-metric',
          metricVersion: '0.1.0',
          implementationVersion: '0.1.0',
          dimensionId: 'D01',
          measuredAt: now,
          evidenceIds: [] as IdList,
          observationIds: [] as IdList,
          excludedSampleIds: [] as IdList,
          sampleCount: 0,
          inputDigest: 'abc' as Digest,
          limitations: [],
          status: 'NOT_EVALUATED',
          reason: '无数据',
        } as unknown as MetricResult,
      ];
      const results = checkMetrics(def, metrics);
      const extraCheck = results.find((r) => r.checkId === 'MET-002');
      expect(extraCheck?.status).toBe('FAIL');
    });
  });

  describe('checkPolicy', () => {
    it('完整策略全部通过', () => {
      const def = makeDefinition();
      const results = checkPolicy(def.policy);
      expect(results.every((r) => r.status === 'PASS')).toBe(true);
    });
  });

  describe('checkEvaluation', () => {
    it('合法评价结果通过', () => {
      const evaluation: EvaluationResult = {
        id: newId('eval') as Id,
        schemaVersion: '1.0.0',
        createdAt: now,
        runId: rid,
        policyId: newId('policy') as Id,
        policyVersion: '0.1.0',
        policyDigest: 'abc' as Digest,
        evaluationStatus: 'COMPLETE',
        overallOutcome: 'PASS',
        overallScore: 85,
        coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
        metricResultIds: [] as IdList,
        ruleResultIds: [] as IdList,
        scoreResultIds: [] as IdList,
        dimensionResultIds: [] as IdList,
        findingIds: [] as IdList,
        evidenceIds: [] as IdList,
        constraints: [],
        limitations: ['测试限制'],
      };
      const results = checkEvaluation(evaluation, [], []);
      expect(results.every((r) => r.status === 'PASS')).toBe(true);
    });

    it('非法评价状态失败', () => {
      const evaluation = {
        id: newId('eval') as Id,
        schemaVersion: '1.0.0',
        createdAt: now,
        runId: rid,
        policyId: newId('policy') as Id,
        policyVersion: '0.1.0',
        policyDigest: 'abc' as Digest,
        evaluationStatus: 'INVALID_STATUS',
        overallOutcome: 'PASS',
        overallScore: 85,
        coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
        metricResultIds: [] as IdList,
        ruleResultIds: [] as IdList,
        scoreResultIds: [] as IdList,
        dimensionResultIds: [] as IdList,
        findingIds: [] as IdList,
        evidenceIds: [] as IdList,
        constraints: [],
        limitations: [],
      } as unknown as EvaluationResult;
      const results = checkEvaluation(evaluation, [], []);
      const statusCheck = results.find((r) => r.checkId === 'EVAL-002');
      expect(statusCheck?.status).toBe('FAIL');
    });
  });

  describe('checkFindings', () => {
    it('完整 Finding 通过', () => {
      const findings: Finding[] = [
        {
          id: newId('finding') as Id,
          schemaVersion: '1.0.0',
          createdAt: now,
          problemKey: newId('pk') as Id,
          title: '按钮对比度不足',
          description: '文本对比度低于 4.5:1',
          type: 'CONFIRMED_DEFECT',
          severity: 'S2',
          priority: 'P1',
          confidence: 'HIGH',
          entityId: newId('entity') as Id,
          scenarioId: newId('scenario') as Id,
          lifecycle: 'NEW',
          revision: 0,
          evaluationRunIds: [] as IdList,
          diagnosticSignalIds: [] as IdList,
          evidenceLinks: [],
          affectedEntityIds: [] as IdList,
          rootCauseHypothesisIds: [] as IdList,
          recommendationIds: [] as IdList,
          verificationResultIds: [] as IdList,
          firstObservedAt: now,
          lastObservedAt: now,
          deduplicationKey: 'abc' as Digest,
          limitations: [],
        },
      ];
      const results = checkFindings(findings);
      expect(results.every((r) => r.status === 'PASS')).toBe(true);
    });

    it('空标题失败', () => {
      const findings: Finding[] = [
        {
          id: newId('finding') as Id,
          schemaVersion: '1.0.0',
          createdAt: now,
          problemKey: newId('pk') as Id,
          title: '',
          description: '描述',
          type: 'CONFIRMED_DEFECT',
          severity: 'S2',
          priority: 'P1',
          confidence: 'HIGH',
          entityId: newId('entity') as Id,
          scenarioId: newId('scenario') as Id,
          lifecycle: 'NEW',
          revision: 0,
          evaluationRunIds: [] as IdList,
          diagnosticSignalIds: [] as IdList,
          evidenceLinks: [],
          affectedEntityIds: [] as IdList,
          rootCauseHypothesisIds: [] as IdList,
          recommendationIds: [] as IdList,
          verificationResultIds: [] as IdList,
          firstObservedAt: now,
          lastObservedAt: now,
          deduplicationKey: 'abc' as Digest,
          limitations: [],
        },
      ];
      const results = checkFindings(findings);
      const titleCheck = results.find((r) => r.checkId.startsWith('FIND-001'));
      expect(titleCheck?.status).toBe('FAIL');
    });
  });

  describe('runConformanceCheck + renderConformanceMarkdown', () => {
    it('完整检查生成报告', () => {
      const def = makeDefinition();
      const bundle = {
        schemaVersion: '1.0.0',
        definition: def,
        plan: {
          id: newId('plan') as Id,
          schemaVersion: '1.0.0',
          createdAt: now,
          definitionId: def.id,
          definitionVersion: def.definitionVersion,
          definitionDigest: 'abc' as Digest,
          compilerVersion: '0.1.0',
          steps: [],
          profile: {} as any,
          metricVersions: [],
          ruleVersions: [],
          policyVersion: { id: def.policy.id, version: def.policy.version },
          requiredCapabilities: [],
          planDigest: 'xyz' as Digest,
        },
        run: {
          id: rid,
          schemaVersion: '1.0.0',
          createdAt: now,
          planId: newId('plan') as Id,
          planDigest: 'xyz' as Digest,
          definitionId: def.id,
          status: 'FINISHED',
          startedAt: now,
          endedAt: now,
          configSources: {},
          environmentFingerprint: 'fp' as Digest,
          sampleDescription: '测试',
          limitations: [],
        } as any,
        context: {
          profile: {} as any,
          configSources: {},
          environmentFingerprint: 'fp' as Digest,
          sampleDescription: '测试',
          engineVersion: '0.1.0',
          limitations: [],
        } as any,
        steps: [],
        attempts: [],
        events: [],
        tasks: [],
        observations: [],
        metrics: [],
        rules: [],
        evidence: [],
      } as unknown as RunBundle;

      const evaluation: EvaluationResult = {
        id: newId('eval') as Id,
        schemaVersion: '1.0.0',
        createdAt: now,
        runId: rid,
        policyId: def.policy.id,
        policyVersion: def.policy.version,
        policyDigest: 'abc' as Digest,
        evaluationStatus: 'COMPLETE',
        overallOutcome: 'PASS',
        overallScore: 85,
        coverage: { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 },
        metricResultIds: [] as IdList,
        ruleResultIds: [] as IdList,
        scoreResultIds: [] as IdList,
        dimensionResultIds: [] as IdList,
        findingIds: [] as IdList,
        evidenceIds: [] as IdList,
        constraints: [],
        limitations: ['测试限制'],
      };

      const snapshot: EvaluationSnapshot = {
        evaluation,
        policy: def.policy,
        scores: [],
        dimensions: [],
        signals: [],
        findings: [],
      };

      const report = runConformanceCheck(bundle, snapshot);

      expect(report.schemaVersion).toBe('1.0.0');
      expect(report.overallStatus).toBe('WARN');  // 缺少指标/规则结果导致 WARN
      expect(report.summary.total).toBeGreaterThan(0);
      expect(report.summary.passed).toBeGreaterThan(0);
      expect(report.limitations.length).toBeGreaterThan(0);

      const markdown = renderConformanceMarkdown(report);
      expect(markdown).toContain('# UXQ 规范符合性检查报告');
      expect(markdown).toContain('DEF');
      expect(markdown).toContain('MET');
      expect(markdown).toContain('POL');
      expect(markdown).toContain('EVAL');
      expect(markdown).toContain('符合性检查仅验证 UXQ 数据与规范一致性');
    });
  });
});
