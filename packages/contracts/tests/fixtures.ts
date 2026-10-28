import { digest } from '@uxq/core';
import definitionJson from '../../../tests/fixtures/offline-definition.json';
import { defaultProfile, parseContract, planDigest } from '../src/index.js';
import type { EvaluationPlan, EvaluationSnapshot, RunBundle } from '../src/index.js';

export const at = '2026-01-01T00:00:00Z';
export const later = '2026-01-01T00:00:01Z';
export const base = (id: string) => ({ id, schemaVersion: '1.0.0' as const, createdAt: at });

export function makeBundle(): RunBundle {
  const definition = parseContract('EvaluationDefinition', definitionJson);
  const profile = defaultProfile();
  const input: Omit<EvaluationPlan, 'planDigest'> = {
    ...base('plan-1'),
    definitionId: definition.id,
    definitionVersion: definition.definitionVersion,
    definitionDigest: digest(definition),
    compilerVersion: '0.1.0',
    steps: definition.steps,
    profile,
    metricVersions: definition.metrics.map((metric) => ({
      id: metric.id,
      version: metric.version,
      implementationVersion: metric.implementationVersion,
    })),
    ruleVersions: definition.rules.map((rule) => ({ id: rule.id, version: rule.version })),
    policyVersion: { id: definition.policy.id, version: definition.policy.version },
    requiredCapabilities: ['METRIC_CALCULATION', 'RULE_EVALUATION'],
  };
  const plan = { ...input, planDigest: planDigest(input) };
  const bundle: RunBundle = {
    schemaVersion: '1.0.0',
    definition,
    plan,
    run: {
      ...base('run-1'),
      planId: plan.id,
      planDigest: plan.planDigest,
      definitionId: definition.id,
      status: 'COMPLETED',
      revision: 3,
      startedAt: at,
      endedAt: later,
      endReason: '固定夹具完成',
      contextId: 'context-1',
      executionCommitted: true,
      limitations: [],
    },
    context: {
      ...base('context-1'),
      runId: 'run-1',
      engineVersion: '0.1.0',
      nodeVersion: '24.13.0',
      platform: 'fixture',
      profile,
      configSources: {},
      environmentFingerprint: digest(profile),
      sampleDescription: '一个合成零值样本',
      limitations: ['仅测试'],
    },
    steps: definition.steps.map((step) => ({
      ...base(`execution-${step.stepId}`),
      runId: 'run-1',
      stepId: step.stepId,
      status: 'PASSED',
      revision: 2,
      attemptIds: [`attempt-${step.stepId}`],
      startedAt: at,
      endedAt: later,
      outputIds: [],
    })),
    attempts: definition.steps.map((step) => ({
      ...base(`attempt-${step.stepId}`),
      runId: 'run-1',
      stepId: step.stepId,
      number: 1,
      status: 'PASSED',
      startedAt: at,
      endedAt: later,
      durationMs: 1,
      evidenceIds: [],
      outputIds: [],
    })),
    events: [
      ...definition.steps.map((step, index) => ({
        ...base(`event-${index}`),
        runId: 'run-1',
        stepId: step.stepId,
        sequence: index + 1,
        type: 'StepStarted' as const,
        occurredAt: at,
        recordedAt: at,
        outputIds: [],
      })),
      {
        ...base('event-end'),
        runId: 'run-1',
        sequence: 4,
        type: 'RunCompleted',
        occurredAt: later,
        recordedAt: later,
        outputIds: [],
      },
    ],
    tasks: [],
    observations: [
      {
        ...base('observation-1'),
        ...definition.steps[0]!.observation!,
        runId: 'run-1',
        stepId: 'capture',
        attemptId: 'attempt-capture',
        evidenceIds: ['evidence-1'],
      },
    ],
    metrics: [
      {
        ...base('metric-result-1'),
        runId: 'run-1',
        metricId: 'metric-duration',
        metricVersion: '1.0.0',
        implementationVersion: '1.0.0',
        dimensionId: 'D02',
        measuredAt: at,
        evidenceIds: ['evidence-1'],
        observationIds: ['observation-1'],
        excludedSampleIds: [],
        sampleCount: 1,
        inputDigest: digest({ sample: 0 }),
        limitations: [],
        status: 'MEASURED',
        value: 0,
        unit: 'ms',
      },
    ],
    rules: [
      {
        ...base('rule-result-1'),
        runId: 'run-1',
        ruleId: 'rule-duration',
        ruleVersion: '1.0.0',
        configurationDigest: digest(definition.rules[0]),
        inputMetricResultIds: ['metric-result-1'],
        evidenceIds: ['evidence-1'],
        evaluatedAt: at,
        reason: '0 ≤ 80（测试策略）',
        executionStatus: 'COMPLETED',
        outcome: 'PASS',
      },
    ],
    evidence: [
      {
        ...base('evidence-1'),
        runId: 'run-1',
        stepId: 'capture',
        attemptId: 'attempt-capture',
        sourceCategory: 'E1',
        materialType: 'OBSERVATION',
        sourceMethod: '固定夹具',
        lifecycle: 'VALIDATED',
        validity: 'VALID',
        summary: '零值观测',
        content: { value: 0 },
        derivedFromIds: [],
        observedAt: at,
        privacy: {
          classification: 'PUBLIC',
          redacted: true,
          allowedPurposes: ['EVALUATION', 'VERIFICATION', 'SHARING'],
          retentionUntil: '2027-01-01T00:00:00Z',
        },
        limitations: ['合成样本'],
      },
    ],
  };
  return bundle;
}

export function makeSnapshot(bundle: RunBundle): EvaluationSnapshot {
  const policy = bundle.definition.policy;
  const coverage = { planned: 1, applicable: 1, measured: 1, scored: 1, ratio: 1 };
  return {
    policy,
    scores: [
      {
        ...base('score-1'),
        runId: bundle.run.id,
        metricResultId: 'metric-result-1',
        metricId: 'metric-duration',
        policyId: policy.id,
        policyVersion: policy.version,
        weight: 1,
        calculatedAt: later,
        status: 'SCORED',
        value: 100,
      },
    ],
    dimensions: [
      {
        ...base('dimension-1'),
        runId: bundle.run.id,
        dimensionId: 'D02',
        scoreResultIds: ['score-1'],
        excludedMetricIds: [],
        coverage,
        weight: 1,
        limitations: [],
        status: 'SCORED',
        value: 100,
      },
    ],
    signals: [],
    findings: [],
    evaluation: {
      ...base('evaluation-1'),
      createdAt: later,
      runId: bundle.run.id,
      policyId: policy.id,
      policyVersion: policy.version,
      policyDigest: digest(policy),
      evaluationStatus: 'COMPLETE',
      overallOutcome: 'PASS',
      overallScore: 100,
      coverage,
      metricResultIds: ['metric-result-1'],
      ruleResultIds: ['rule-result-1'],
      scoreResultIds: ['score-1'],
      dimensionResultIds: ['dimension-1'],
      findingIds: [],
      evidenceIds: ['evidence-1'],
      constraints: [],
      limitations: ['仅用于契约测试'],
    },
  };
}
