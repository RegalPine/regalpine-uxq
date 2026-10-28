/**
 * GAP-08: 历史数据迁移与版本兼容测试
 *
 * 依据 UXQ-GOV-001 和 UXQ-ARCH-002 §15：
 * - 为每个已登记的迁移契约类型建立完整的 v0.2.0 → v1.0.0 夹具测试
 * - 验证迁移后数据完整性、字段映射正确性和版本标记
 * - 确保原始数据不被修改（原件保护）
 */

import { describe, expect, it } from 'vitest';
import { digest } from '../../packages/core/src/index';
import { migrateLegacy } from '../../packages/contracts/src/migrations';
import { makeBundle, at } from '../../packages/contracts/tests/fixtures';
import type { MetricResult } from '../../packages/contracts/src/generated';

/** 将 camelCase 对象转换为 snake_case（模拟 v0.2.0 格式） */
function toLegacy(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const oldKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[oldKey] = key === 'schemaVersion' ? '0.2.0' : entry;
  }
  return result;
}

const bundle = makeBundle();

// ─── MetricDefinition 迁移 ────────────────────────────────

describe('Legacy Fixture: MetricDefinition', () => {
  it('v0.2.0 MetricDefinition 完整迁移到 v1.0.0', () => {
    const original = bundle.definition.metrics[0]!;
    const legacy = toLegacy({ ...original, direction: 'HIGHER_IS_BETTER' } as unknown as Record<
      string,
      unknown
    >);
    const originalDigest = digest(legacy);

    const result = migrateLegacy('MetricDefinition', legacy);

    expect(result.fromVersion).toBe('0.2.0');
    expect(result.toVersion).toBe('1.0.0');
    expect(result.value.id).toBe(original.id);
    expect(result.value.name).toBe(original.name);
    expect(result.value.direction).toBe('HIGHER_IS_BETTER');
    expect(result.value.schemaVersion).toBe('1.0.0');
    expect(result.originalDigest).toBe(originalDigest);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('DESCRIPTIVE 方向正确映射为 DESCRIPTIVE_ONLY', () => {
    const original = bundle.definition.metrics[0]!;
    const legacy = toLegacy({ ...original, direction: 'DESCRIPTIVE' } as unknown as Record<
      string,
      unknown
    >);

    const result = migrateLegacy('MetricDefinition', legacy);

    expect(result.value.direction).toBe('DESCRIPTIVE_ONLY');
    expect(result.warnings.some((w) => w.includes('DESCRIPTIVE_ONLY'))).toBe(true);
  });

  it('原始数据不被修改', () => {
    const original = bundle.definition.metrics[0]!;
    const legacy = toLegacy({ ...original, direction: 'DESCRIPTIVE' } as unknown as Record<
      string,
      unknown
    >);
    const before = digest(legacy);

    migrateLegacy('MetricDefinition', legacy);

    expect(digest(legacy)).toBe(before);
  });
});

// ─── MetricResult 迁移 ────────────────────────────────────

describe('Legacy Fixture: MetricResult', () => {
  it('v0.2.0 MetricResult 完整迁移到 v1.0.0', () => {
    const original = bundle.metrics[0]!;
    const legacy = toLegacy(original as unknown as Record<string, unknown>);
    const originalDigest = digest(legacy);

    const result = migrateLegacy('MetricResult', legacy);

    expect(result.fromVersion).toBe('0.2.0');
    expect(result.toVersion).toBe('1.0.0');
    expect(result.value.id).toBe(original.id);
    expect(result.value.metricId).toBe(original.metricId);
    expect(result.value.status).toBe(original.status);
    expect(result.value.schemaVersion).toBe('1.0.0');
    expect(result.originalDigest).toBe(originalDigest);
  });

  it('保留测量值和单位', () => {
    const original = bundle.metrics[0]! as Extract<MetricResult, { status: 'MEASURED' }>;
    const legacy = toLegacy(original as unknown as Record<string, unknown>);

    const result = migrateLegacy('MetricResult', legacy);
    const measured = result.value as Extract<MetricResult, { status: 'MEASURED' }>;

    expect(measured.value).toBe(original.value);
    expect(measured.unit).toBe(original.unit);
    expect(measured.sampleCount).toBe(original.sampleCount);
  });
});

// ─── RuleResult 迁移 ──────────────────────────────────────

describe('Legacy Fixture: RuleResult', () => {
  it('v0.2.0 RuleResult 完整迁移到 v1.0.0', () => {
    const original = bundle.rules[0]!;
    const legacy = toLegacy(original as unknown as Record<string, unknown>);
    const originalDigest = digest(legacy);

    const result = migrateLegacy('RuleResult', legacy);

    expect(result.fromVersion).toBe('0.2.0');
    expect(result.toVersion).toBe('1.0.0');
    expect(result.value.id).toBe(original.id);
    expect(result.value.ruleId).toBe(original.ruleId);
    expect(result.value.executionStatus).toBe('COMPLETED');
    expect(result.value.outcome).toBe('PASS');
    expect(result.value.schemaVersion).toBe('1.0.0');
    expect(result.originalDigest).toBe(originalDigest);
  });

  it('保留规则失败原因', () => {
    const original = bundle.rules[0]!;
    const legacy = toLegacy({
      ...original,
      outcome: 'FAIL',
      reason: '超出阈值',
    } as unknown as Record<string, unknown>);

    const result = migrateLegacy('RuleResult', legacy);

    expect(result.value.outcome).toBe('FAIL');
    expect((result.value as typeof original).reason).toBe('超出阈值');
  });
});

// ─── Evidence 迁移 ────────────────────────────────────────

describe('Legacy Fixture: Evidence', () => {
  it('v0.2.0 Evidence 完整迁移到 v1.0.0', () => {
    const original = bundle.evidence[0]!;
    const legacy = toLegacy(original as unknown as Record<string, unknown>);
    const originalDigest = digest(legacy);

    const result = migrateLegacy('Evidence', legacy);

    expect(result.fromVersion).toBe('0.2.0');
    expect(result.toVersion).toBe('1.0.0');
    expect(result.value.id).toBe(original.id);
    expect(result.value.sourceCategory).toBe(original.sourceCategory);
    expect(result.value.materialType).toBe(original.materialType);
    expect(result.value.schemaVersion).toBe('1.0.0');
    expect(result.originalDigest).toBe(originalDigest);
  });

  it('保留隐私分类和脱敏状态', () => {
    const original = bundle.evidence[0]!;
    const legacy = toLegacy(original as unknown as Record<string, unknown>);

    const result = migrateLegacy('Evidence', legacy);

    expect(result.value.privacy.classification).toBe(original.privacy.classification);
    expect(result.value.privacy.redacted).toBe(original.privacy.redacted);
    expect(result.value.privacy.allowedPurposes).toEqual(original.privacy.allowedPurposes);
  });
});

// ─── 跨类型迁移完整性 ─────────────────────────────────────

describe('Legacy: 跨类型迁移完整性', () => {
  it('所有已登记类型均可成功迁移', () => {
    const fixtures: Array<{
      name: 'MetricDefinition' | 'MetricResult' | 'RuleResult' | 'Evidence';
      fixture: Record<string, unknown>;
    }> = [
      {
        name: 'MetricDefinition',
        fixture: {
          ...toLegacy({
            ...bundle.definition.metrics[0],
            direction: 'LOWER_IS_BETTER',
          } as unknown as Record<string, unknown>),
          schema_version: '0.2.0',
        },
      },
      {
        name: 'MetricResult',
        fixture: {
          ...toLegacy(bundle.metrics[0] as unknown as Record<string, unknown>),
          schema_version: '0.2.0',
        },
      },
      {
        name: 'RuleResult',
        fixture: {
          ...toLegacy(bundle.rules[0] as unknown as Record<string, unknown>),
          schema_version: '0.2.0',
        },
      },
      {
        name: 'Evidence',
        fixture: {
          ...toLegacy(bundle.evidence[0] as unknown as Record<string, unknown>),
          schema_version: '0.2.0',
        },
      },
    ];

    for (const { name, fixture } of fixtures) {
      const result = migrateLegacy(name, fixture);
      expect(result.value.schemaVersion).toBe('1.0.0');
      expect(result.fromVersion).toBe('0.2.0');
      expect(result.toVersion).toBe('1.0.0');
    }
  });

  it('迁移后的摘要与原始摘要一致', () => {
    const original = bundle.metrics[0]!;
    const legacy = toLegacy(original as unknown as Record<string, unknown>);
    const expectedDigest = digest(legacy);

    const result = migrateLegacy('MetricResult', legacy);

    expect(result.originalDigest).toBe(expectedDigest);
  });

  it('迁移警告包含已知限制说明', () => {
    const legacy = toLegacy(bundle.metrics[0] as unknown as Record<string, unknown>);
    const result = migrateLegacy('MetricResult', legacy);

    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0]).toContain('已登记');
  });
});
