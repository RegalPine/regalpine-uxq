import { cloneJson, digest, invariant } from '@uxq/core';
import type { ContractMap } from './generated.js';
import { assertMigrationSchema, getSchemaSource, parseContract } from './registry.js';

export type LegacyContractName =
  'MetricDefinition' | 'MetricResult' | 'RuleResult' | 'Evidence' | 'EvaluationResult';
const supported: readonly LegacyContractName[] = [
  'MetricDefinition',
  'MetricResult',
  'RuleResult',
  'Evidence',
  'EvaluationResult',
];
const snakeCase = (key: string): string =>
  key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

/** 0.2.0 桥接格式仅支持列出的对象：顶层 snake_case，嵌套值仍遵循当前声明的子契约。 */
export function legacyBridgeSchema(name: LegacyContractName): {
  schema: Record<string, unknown>;
  fields: ReadonlyMap<string, string>;
} {
  invariant(
    supported.includes(name),
    'UNSUPPORTED_LEGACY_CONTRACT',
    '该对象没有已登记的历史适配器',
  );
  const source = getSchemaSource();
  const definitions = source.$defs as Record<string, Record<string, unknown>>;
  const fields = new Map<string, string>();
  const expandRoot = (node: Record<string, unknown>): Record<string, unknown> => {
    if (typeof node.$ref === 'string') {
      invariant(node.$ref.startsWith('#/$defs/'), 'LEGACY_REFERENCE', '桥接格式只支持本地契约引用');
      return expandRoot(definitions[node.$ref.slice('#/$defs/'.length)]!);
    }
    const result = cloneJson(node);
    if (result.properties) {
      result.properties = Object.fromEntries(
        Object.entries(result.properties as Record<string, unknown>).map(([key, value]) => {
          const oldKey = snakeCase(key);
          invariant(
            !fields.has(oldKey) || fields.get(oldKey) === key,
            'LEGACY_FIELD_COLLISION',
            '历史字段映射发生冲突',
          );
          fields.set(oldKey, key);
          const property =
            key === 'schemaVersion'
              ? { const: '0.2.0' }
              : key === 'direction' && name === 'MetricDefinition'
                ? { anyOf: [value, { const: 'DESCRIPTIVE' }] }
                : value;
          return [oldKey, property];
        }),
      );
    }
    if (Array.isArray(result.required))
      result.required = (result.required as string[]).map(snakeCase);
    for (const group of ['allOf', 'oneOf', 'anyOf'])
      if (Array.isArray(result[group]))
        result[group] = (result[group] as Record<string, unknown>[]).map(expandRoot);
    return result;
  };
  return {
    schema: {
      $schema: source.$schema,
      $id: `https://uxq.dev/schemas/legacy-bridge/${name}/0.2.0`,
      $defs: definitions,
      ...expandRoot(definitions[name]!),
    },
    fields,
  };
}

export function migrateLegacy<K extends LegacyContractName>(
  name: K,
  input: unknown,
): {
  original: unknown;
  originalDigest: string;
  value: ContractMap[K];
  fromVersion: '0.2.0';
  toVersion: '1.0.0';
  warnings: string[];
} {
  const original: unknown = cloneJson(input);
  invariant(
    original && typeof original === 'object' && !Array.isArray(original),
    'LEGACY_OBJECT',
    '历史输入必须为对象',
  );
  const record = original as Record<string, unknown>;
  invariant(
    record.schema_version === '0.2.0',
    'UNSUPPORTED_SCHEMA_VERSION',
    '只支持显式登记的 0.2.0 桥接格式',
  );
  invariant(
    record.overall_outcome !== 'CONSTRAINED',
    'AMBIGUOUS_LEGACY_OUTCOME',
    'CONSTRAINED 不能无依据转换为总体结论',
  );
  invariant(
    !(record.source_category === 'E5' && record.material_type === 'EXTERNAL_CONSTRAINT'),
    'AMBIGUOUS_LEGACY_EVIDENCE',
    '外部约束的旧 E5 分类需要人工确认来源',
  );
  const { schema, fields } = legacyBridgeSchema(name);
  assertMigrationSchema(schema, record);
  const converted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    const mapped = fields.get(key);
    invariant(
      mapped && !Object.hasOwn(converted, mapped),
      'LEGACY_FIELD_COLLISION',
      '未知字段或多个字段映射到同一目标',
    );
    converted[mapped] = cloneJson(entry);
  }
  converted.schemaVersion = '1.0.0';
  const warnings = ['仅转换已登记的顶层字段；原件与原始摘要保留，未声称支持所有历史 Draft 示例'];
  if (name === 'MetricDefinition' && converted.direction === 'DESCRIPTIVE') {
    converted.direction = 'DESCRIPTIVE_ONLY';
    warnings.push('DESCRIPTIVE 显式映射为 DESCRIPTIVE_ONLY，未修改指标 ID');
  }
  return {
    original,
    originalDigest: digest(original),
    value: parseContract(name, converted),
    fromVersion: '0.2.0',
    toVersion: '1.0.0',
    warnings,
  };
}
