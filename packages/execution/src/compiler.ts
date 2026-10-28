import { digest, invariant, newId, systemClock } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type {
  EvaluationDefinition,
  EvaluationPlan,
  ExecutionProfile,
  PlannedStep,
  Capability,
  VersionRef,
} from '@uxq/contracts';
import {
  assertDefinition,
  assertPlanSteps,
  planDigest as computePlanDigest,
  defaultProfile,
} from '@uxq/contracts';

const ENGINE_VERSION = '0.1.0';

export interface PlanInput {
  definition: EvaluationDefinition;
  profileOverrides?: Partial<ExecutionProfile>;
}

export function compilePlan(input: PlanInput, clock: Clock = systemClock): EvaluationPlan {
  const { definition } = input;
  assertDefinition(definition);

  const profile = mergeProfile(defaultProfile(), definition.profile, input.profileOverrides);

  const steps = definition.steps.map((step) => ({ ...step }));

  const metricVersions: VersionRef[] = definition.metrics.map((m) => ({
    id: m.id,
    version: m.version,
    implementationVersion: m.implementationVersion,
  }));
  const ruleVersions: VersionRef[] = definition.rules.map((r) => ({
    id: r.id,
    version: r.version,
  }));
  const policyVersion: VersionRef = {
    id: definition.policy.id,
    version: definition.policy.version,
  };

  const requiredCapabilities = collectCapabilities(steps);

  const base: Omit<EvaluationPlan, 'planDigest'> = {
    id: newId('plan'),
    schemaVersion: '1.0.0',
    createdAt: clock.now(),
    definitionId: definition.id,
    definitionVersion: definition.definitionVersion,
    definitionDigest: digest(definition),
    compilerVersion: ENGINE_VERSION,
    steps: steps as [PlannedStep, ...PlannedStep[]],
    profile,
    metricVersions,
    ruleVersions,
    policyVersion,
    requiredCapabilities,
  };

  const planDigest = computePlanDigest(base);
  const plan: EvaluationPlan = { ...base, planDigest };

  assertPlanSteps(plan.steps);
  return plan;
}

function mergeProfile(
  base: ExecutionProfile,
  definitionOverride?: EvaluationDefinition['profile'],
  cliOverride?: Partial<ExecutionProfile>,
): ExecutionProfile {
  const fromDefinition = definitionOverride ? applyOverrides(base, definitionOverride) : base;
  return cliOverride ? applyOverrides(fromDefinition, cliOverride) : fromDefinition;
}

function applyOverrides(
  base: ExecutionProfile,
  overrides: Partial<ExecutionProfile>,
): ExecutionProfile {
  const result = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

function collectCapabilities(steps: readonly PlannedStep[]): Capability[] {
  const caps = new Set<Capability>();
  for (const step of steps) {
    for (const cap of step.requiredCapabilities) caps.add(cap);
  }
  return [...caps];
}

export function validatePlan(plan: EvaluationPlan): void {
  assertPlanSteps(plan.steps);
  const computed = computePlanDigest(plan);
  invariant(computed === plan.planDigest, 'PLAN_DIGEST', '计划摘要不匹配');
}
