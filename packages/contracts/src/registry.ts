import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { cloneJson, invariant, parseId, parseTimestamp, UxqError } from '@uxq/core';
import type {
  ContractMap,
  EvaluationSnapshot,
  ExecutionProfile,
  RunBundle,
  ReportDocument,
} from './generated.js';
import { schemaData } from './schema-bundle.generated.js';
import { assertLocalInvariants } from './invariants.js';
import {
  assertEvaluationIntegrity,
  assertReportIntegrity,
  assertRunIntegrity,
} from './integrity.js';

export type ContractName = keyof ContractMap;
export const SCHEMA_VERSION = '1.0.0' as const;
const schemaId = schemaData.$id as string;
const definitions = schemaData.$defs as Record<string, Record<string, unknown>>;
export const contractNames = Object.freeze(Object.keys(definitions) as ContractName[]);

export function isRelativeArtifactPath(input: string): boolean {
  return (
    input.length <= 1024 &&
    input
      .split('/')
      .every((part) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(part) && part !== '.' && part !== '..')
  );
}

const ajv = new Ajv2020({
  strict: true,
  allErrors: true,
  allowUnionTypes: true,
  validateFormats: true,
});
addFormats(ajv);
ajv.addFormat('uxq-id', (value: string) => {
  try {
    parseId(value);
    return true;
  } catch {
    return false;
  }
});
ajv.addFormat('uxq-timestamp', (value: string) => {
  try {
    parseTimestamp(value);
    return true;
  } catch {
    return false;
  }
});
ajv.addFormat('uxq-relative-path', isRelativeArtifactPath);
ajv.addSchema(schemaData);
const validators = new Map<ContractName, ValidateFunction>();

export function getSchemaSource(): Record<string, unknown> {
  return cloneJson(schemaData);
}

export function getContractSchema(name: ContractName): Record<string, unknown> {
  invariant(Object.hasOwn(definitions, name), 'UNKNOWN_CONTRACT', '未知公共契约');
  return { ...getSchemaSource(), $ref: `#/$defs/${name}` };
}

export function contractEnum(name: ContractName): readonly string[] {
  const values = definitions[name]?.enum;
  invariant(
    Array.isArray(values) && values.every((value) => typeof value === 'string'),
    'NOT_ENUM_CONTRACT',
    '请求的契约不是字符串枚举',
  );
  return Object.freeze([...values] as string[]);
}

export function validateSchemaRegistry(): void {
  for (const name of contractNames) validatorFor(name);
}

function validatorFor(name: ContractName): ValidateFunction {
  invariant(Object.hasOwn(definitions, name), 'UNKNOWN_CONTRACT', '未知公共契约');
  let validator = validators.get(name);
  if (!validator) {
    validator = ajv.getSchema(`${schemaId}#/$defs/${name}`);
    invariant(validator, 'SCHEMA_REGISTRATION', '公共契约未注册');
    validators.set(name, validator);
  }
  return validator;
}

/** 外部边界只经此入口：先拒绝非 JSON，再复制、校验 Schema 与领域不变量。 */
export function parseContract<K extends ContractName>(name: K, input: unknown): ContractMap[K] {
  const value: unknown = cloneJson(input);
  if (value && typeof value === 'object' && 'schemaVersion' in value) {
    invariant(
      value.schemaVersion === SCHEMA_VERSION,
      'UNSUPPORTED_SCHEMA_VERSION',
      '不支持该 Schema 版本，请使用显式迁移适配器',
    );
  }
  const validate = validatorFor(name);
  if (!validate(value)) {
    throw new UxqError(
      'SCHEMA_VALIDATION',
      `${name} 不符合公共契约`,
      'CONTRACT',
      (validate.errors ?? []).map((error) => ({
        path: error.instancePath,
        code: error.keyword,
        message: error.message ?? '契约无效',
      })),
    );
  }
  assertLocalInvariants(name, value);
  if (name === 'RunBundle') assertRunIntegrity(value as RunBundle);
  if (name === 'ReportDocument') assertReportIntegrity(value as ReportDocument);
  return value as ContractMap[K];
}

export function assertMigrationSchema(schema: Record<string, unknown>, input: unknown): void {
  const validate = ajv.getSchema(schema.$id as string) ?? ajv.compile(schema);
  if (!validate(input))
    throw new UxqError(
      'LEGACY_SCHEMA_VALIDATION',
      '历史输入不符合声明的桥接格式',
      'CONTRACT',
      (validate.errors ?? []).map((error) => ({
        path: error.instancePath,
        code: error.keyword,
        message: error.message ?? '契约无效',
      })),
    );
}

export function defaultProfile(): ExecutionProfile {
  const properties = definitions.ExecutionProfile!.properties as Record<
    string,
    { default: unknown }
  >;
  return parseContract(
    'ExecutionProfile',
    Object.fromEntries(
      Object.entries(properties).map(([key, property]) => [key, cloneJson(property.default)]),
    ),
  );
}

export function validateEvaluation(
  bundleInput: unknown,
  snapshotInput: unknown,
): { bundle: RunBundle; snapshot: EvaluationSnapshot } {
  const bundle = parseContract('RunBundle', bundleInput);
  const snapshot = parseContract('EvaluationSnapshot', snapshotInput);
  assertEvaluationIntegrity(bundle, snapshot);
  return { bundle, snapshot };
}
