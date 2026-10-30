import type { DimensionId } from './generated.js';

/** 六维名称的统一来源；代码与展示文档共用。 */
export const DIMENSION_NAMES: Readonly<Record<DimensionId, string>> = Object.freeze({
  D01: '任务有效性', D02: '操作效率', D03: '可理解性与认知支持',
  D04: '可访问性与包容性', D05: '交互可靠性与错误恢复', D06: '主观体验',
});
export function dimensionName(id: string): string {
  return Object.hasOwn(DIMENSION_NAMES, id) ? DIMENSION_NAMES[id as DimensionId] : id;
}
export type * from './generated.js';
export type { ContractName } from './registry.js';
export {
  SCHEMA_VERSION,
  contractNames,
  contractEnum,
  defaultProfile,
  getSchemaSource,
  getContractSchema,
  isRelativeArtifactPath,
  parseContract,
  validateSchemaRegistry,
  validateEvaluation,
} from './registry.js';
export {
  planDigest,
  verificationDigest,
  ruleMetricIds,
  assertPlanSteps,
  assertMetricValue,
  isEvidenceUsable,
  assertLocalInvariants,
} from './invariants.js';
export {
  assertPolicy,
  assertCoverage,
  assertMetricDefinition,
  assertDefinition,
  assertProfile,
} from './invariants.js';
export {
  canTransitionRun,
  canTransitionStep,
  canTransitionVerification,
  transitionRun,
  transitionStep,
} from './transitions.js';
export type { RunCommand, StepCommand } from './transitions.js';
export { migrateLegacy, legacyBridgeSchema } from './migrations.js';
export type { LegacyContractName } from './migrations.js';
