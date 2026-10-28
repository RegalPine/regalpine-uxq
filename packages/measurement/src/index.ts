import { digest, invariant, newId, parseTimestamp } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type {
  MetricDefinition,
  MetricResult,
  ObservationInput,
  RawObservation,
} from '@uxq/contracts';

/** 观测输入校验：确认来源与指标定义的 sourceKey 对齐，单位匹配，值可序列化。 */
export function validateObservationInput(
  observation: ObservationInput,
  metric: MetricDefinition,
): void {
  invariant(
    observation.key === metric.sourceKey,
    'OBSERVATION_KEY',
    '观测键名必须匹配指标 sourceKey',
  );
  if (metric.valueKind === 'NUMBER')
    invariant(
      typeof observation.value === 'number' && Number.isFinite(observation.value),
      'OBSERVATION_VALUE',
      '数值指标需要有限数字观测',
    );
  else if (metric.valueKind === 'BOOLEAN')
    invariant(typeof observation.value === 'boolean', 'OBSERVATION_VALUE', '布尔指标需要布尔观测');
  else if (metric.valueKind === 'CATEGORY')
    invariant(typeof observation.value === 'string', 'OBSERVATION_VALUE', '分类指标需要字符串观测');
  if (observation.unit && metric.unit)
    invariant(observation.unit === metric.unit, 'OBSERVATION_UNIT', '观测单位与指标声明不一致');
  parseTimestamp(observation.observedAt);
}

/** 将原始观测转换为指标可消费的结构化样本；不做聚合，不做评分。 */
export function normalizeObservation(observation: ObservationInput): RawObservation {
  const base: Record<string, unknown> = {
    id: newId('obs'),
    schemaVersion: '1.0.0',
    createdAt: observation.observedAt,
    key: observation.key,
    value: observation.value,
    entityId: observation.entityId,
    scenarioId: observation.scenarioId,
    source: observation.source,
    method: observation.method,
    observedAt: observation.observedAt,
    sampleId: observation.sampleId,
    excluded: observation.excluded,
    runId: newId('run'),
    stepId: newId('step'),
    attemptId: newId('attempt'),
    evidenceIds: [],
  };
  if (observation.unit) base.unit = observation.unit;
  if (observation.exclusionReason) base.exclusionReason = observation.exclusionReason;
  return base as unknown as RawObservation;
}

/** 聚合前检查：分母为零、样本不足、单位不一致、排除样本。 */
export interface AggregationInput {
  readonly values: readonly number[];
  readonly unit: string;
  readonly expectedUnit: string;
  readonly excludedCount: number;
  readonly minimumSamples: number;
}

export interface AggregationResult {
  readonly status: 'MEASURED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_APPLICABLE' | 'INVALID';
  readonly value?: number;
  readonly sampleCount: number;
  readonly reason?: string;
}

export function aggregateSamples(
  input: AggregationInput,
  method: MetricDefinition['aggregation'],
): AggregationResult {
  invariant(
    input.expectedUnit === input.unit,
    'UNIT_MISMATCH',
    `聚合单位不匹配：期望 ${input.expectedUnit}，实际 ${input.unit}`,
  );
  const valid = input.values.filter((value) => Number.isFinite(value));
  if (valid.length < input.minimumSamples) {
    return {
      status: 'INSUFFICIENT_EVIDENCE',
      sampleCount: valid.length,
      reason: `有效样本 ${valid.length} 低于最低要求 ${input.minimumSamples}`,
    };
  }
  switch (method) {
    case 'LATEST':
      return {
        status: 'MEASURED',
        value: valid[valid.length - 1] as number,
        sampleCount: valid.length,
      };
    case 'MEAN':
      return {
        status: 'MEASURED',
        value: valid.reduce((sum, value) => sum + value, 0) / valid.length,
        sampleCount: valid.length,
      };
    case 'MEDIAN': {
      const sorted = [...valid].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const medianValue =
        sorted.length % 2
          ? (sorted[mid] as number)
          : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
      return { status: 'MEASURED', value: medianValue, sampleCount: valid.length };
    }
    case 'P95': {
      const sorted = [...valid].sort((a, b) => a - b);
      const index = Math.ceil(sorted.length * 0.95) - 1;
      return {
        status: 'MEASURED',
        value: sorted[Math.max(0, index)] as number,
        sampleCount: valid.length,
      };
    }
    case 'SUM':
      return {
        status: 'MEASURED',
        value: valid.reduce((sum, value) => sum + value, 0),
        sampleCount: valid.length,
      };
    case 'COUNT':
      return { status: 'MEASURED', value: valid.length, sampleCount: valid.length };
    case 'SUCCESS_RATE': {
      const successes = valid.filter((value) => value > 0);
      return {
        status: 'MEASURED',
        value: (successes.length / valid.length) * 100,
        sampleCount: valid.length,
      };
    }
    case 'RATIO': {
      if (valid.length < 2)
        return {
          status: 'INSUFFICIENT_EVIDENCE',
          sampleCount: valid.length,
          reason: '比率至少需要分子和分母两个值',
        };
      const denominator = valid[valid.length - 1] as number;
      if (denominator === 0)
        return {
          status: 'NOT_APPLICABLE',
          sampleCount: valid.length,
          reason: '分母为零，无法计算比率',
        };
      return {
        status: 'MEASURED',
        value: (valid[0] as number) / denominator,
        sampleCount: valid.length,
      };
    }
    default:
      return { status: 'INVALID', sampleCount: 0, reason: `未支持的聚合方法` };
  }
}

/** 缓存键计算：基于指标 ID、版本、输入摘要和配置摘要；不使用运行时标识。 */
export function cacheKey(
  metricId: string,
  definitionVersion: string,
  implementationVersion: string,
  inputDigest: string,
  configDigest: string,
): string {
  return digest({ metricId, definitionVersion, implementationVersion, inputDigest, configDigest });
}

/** 缓存资格判断：输入、版本、配置和证据均无变化时可复用。 */
export function isCacheEligible(result: MetricResult): boolean {
  return result.status === 'MEASURED' && result.sampleCount > 0;
}

/** 指标执行上下文；不携带浏览器或文件系统引用。 */
export interface MetricExecutionContext {
  readonly runId: string;
  readonly clock: Clock;
  readonly signal: AbortSignal;
}

/** 指标实现接口：纯计算，不访问外部资源。 */
export interface MetricImplementation {
  readonly metricId: string;
  readonly implementationVersion: string;
  calculate(
    observations: readonly ObservationInput[],
    context: MetricExecutionContext,
  ): MetricResult;
}

/** 指标注册表：维护定义与实现的版本对应，拒绝重复注册和静默回退。 */
export class MetricRegistry {
  readonly #definitions = new Map<string, Map<string, MetricDefinition>>();
  readonly #implementations = new Map<string, Map<string, MetricImplementation>>();

  registerDefinition(definition: MetricDefinition): void {
    let versions = this.#definitions.get(definition.id);
    if (!versions) {
      versions = new Map();
      this.#definitions.set(definition.id, versions);
    }
    invariant(
      !versions.has(definition.version),
      'DUPLICATE_METRIC_VERSION',
      `指标 ${definition.id} 版本 ${definition.version} 已注册`,
    );
    versions.set(definition.version, definition);
  }

  registerImplementation(implementation: MetricImplementation, definitionVersion: string): void {
    const definition = this.resolveDefinition(implementation.metricId, definitionVersion);
    invariant(
      definition.implementationVersion === implementation.implementationVersion,
      'IMPLEMENTATION_VERSION',
      `实现版本 ${implementation.implementationVersion} 与定义声明 ${definition.implementationVersion} 不一致`,
    );
    let versions = this.#implementations.get(implementation.metricId);
    if (!versions) {
      versions = new Map();
      this.#implementations.set(implementation.metricId, versions);
    }
    invariant(
      !versions.has(implementation.implementationVersion),
      'DUPLICATE_IMPLEMENTATION',
      `实现 ${implementation.metricId}@${implementation.implementationVersion} 已注册`,
    );
    versions.set(implementation.implementationVersion, implementation);
  }

  resolveDefinition(metricId: string, version: string): MetricDefinition {
    const definition = this.#definitions.get(metricId)?.get(version);
    invariant(definition, 'UNKNOWN_METRIC_VERSION', `指标 ${metricId}@${version} 未注册`);
    return definition;
  }

  resolveImplementation(metricId: string, implementationVersion: string): MetricImplementation {
    const implementation = this.#implementations.get(metricId)?.get(implementationVersion);
    invariant(
      implementation,
      'UNKNOWN_IMPLEMENTATION',
      `实现 ${metricId}@${implementationVersion} 未注册`,
    );
    return implementation;
  }

  catalog(): ReadonlyMap<string, ReadonlyMap<string, MetricDefinition>> {
    return this.#definitions;
  }
}

/** 执行单个指标：校验输入 → 检查缓存 → 调用实现 → 校验输出。 */
export function executeMetric(
  registry: MetricRegistry,
  definition: MetricDefinition,
  observations: readonly ObservationInput[],
  context: MetricExecutionContext,
): MetricResult {
  const validObservations = observations.filter((observation) => !observation.excluded);
  const excludedCount = observations.length - validObservations.length;
  for (const observation of validObservations) validateObservationInput(observation, definition);
  if (!definition.applicable) {
    return {
      id: newId('metric'),
      schemaVersion: '1.0.0',
      createdAt: context.clock.now(),
      runId: context.runId,
      metricId: definition.id,
      metricVersion: definition.version,
      implementationVersion: definition.implementationVersion,
      dimensionId: definition.dimensionId,
      measuredAt: context.clock.now(),
      evidenceIds: [],
      observationIds: validObservations.map((observation) => observation.sampleId),
      excludedSampleIds: observations
        .filter((observation) => observation.excluded)
        .map((observation) => observation.sampleId),
      sampleCount: 0,
      inputDigest: digest(validObservations),
      limitations: definition.limitations,
      status: 'NOT_APPLICABLE',
      reason: '指标声明为不适用',
    };
  }
  if (definition.evidenceRequired && validObservations.length === 0) {
    return {
      id: newId('metric'),
      schemaVersion: '1.0.0',
      createdAt: context.clock.now(),
      runId: context.runId,
      metricId: definition.id,
      metricVersion: definition.version,
      implementationVersion: definition.implementationVersion,
      dimensionId: definition.dimensionId,
      measuredAt: context.clock.now(),
      evidenceIds: [],
      observationIds: [],
      excludedSampleIds: [],
      sampleCount: 0,
      inputDigest: digest(validObservations),
      limitations: definition.limitations,
      status: 'INSUFFICIENT_EVIDENCE',
      reason: `需要证据但无有效观测（排除 ${excludedCount} 个样本）`,
    };
  }
  const implementation = registry.resolveImplementation(
    definition.id,
    definition.implementationVersion,
  );
  return implementation.calculate(validObservations, context);
}
