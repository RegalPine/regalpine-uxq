import { describe, expect, it } from 'vitest';
import {
  SUPPORTED_ACTIONS,
  SUPPORTED_STEP_KINDS,
  SUPPORTED_EXTRACTORS,
  SUPPORTED_CONDITIONS,
  UNSUPPORTED_CONDITIONS,
  SUPPORTED_AGGREGATIONS,
  KNOWN_LIMITATIONS,
  buildCapabilityCatalog,
} from '@uxq/contracts';
import type { StepKind } from '@uxq/contracts';

/**
 * 能力清单自验证测试。
 *
 * 确保 capabilities 命令输出的能力列表与实际类型定义和实现一致，
 * 防止文档声明与代码实现脱节。
 */

describe('capabilities 自验证', () => {
  it('actions 列表包含所有浏览器动作（8 种）', () => {
    expect(SUPPORTED_ACTIONS).toContain('NAVIGATE');
    expect(SUPPORTED_ACTIONS).toContain('CLICK');
    expect(SUPPORTED_ACTIONS).toContain('FILL');
    expect(SUPPORTED_ACTIONS).toContain('FILL_SECRET');
    expect(SUPPORTED_ACTIONS).toContain('PRESS');
    expect(SUPPORTED_ACTIONS).toContain('WAIT_FOR');
    expect(SUPPORTED_ACTIONS).toContain('CAPTURE');
    expect(SUPPORTED_ACTIONS).toContain('SCREENSHOT');
    expect(SUPPORTED_ACTIONS).toHaveLength(8);
  });

  it('stepKinds 列表与 contracts StepKind 类型完全一致', () => {
    // StepKind 类型定义在 generated.ts 中，这里验证运行时数组覆盖所有值
    const expectedStepKinds: StepKind[] = [
      'ENVIRONMENT_CHECK',
      'BROWSER_SETUP',
      'PAGE_NAVIGATION',
      'TASK_EXECUTION',
      'OBSERVATION_CAPTURE',
      'METRIC_CALCULATION',
      'RULE_EVALUATION',
      'SCORING',
      'EVIDENCE_VALIDATION',
      'RESULT_FINALIZATION',
    ];
    for (const kind of expectedStepKinds) {
      expect(SUPPORTED_STEP_KINDS).toContain(kind);
    }
    expect(SUPPORTED_STEP_KINDS).toHaveLength(expectedStepKinds.length);
  });

  it('extractors 列表包含所有数据提取器（5 种）', () => {
    expect(SUPPORTED_EXTRACTORS).toContain('COUNT');
    expect(SUPPORTED_EXTRACTORS).toContain('VISIBLE');
    expect(SUPPORTED_EXTRACTORS).toContain('TEXT');
    expect(SUPPORTED_EXTRACTORS).toContain('VALUE');
    expect(SUPPORTED_EXTRACTORS).toContain('ACCESSIBLE_NAME');
    expect(SUPPORTED_EXTRACTORS).toHaveLength(5);
  });

  it('conditions 列表区分已支持和未支持类型', () => {
    expect(SUPPORTED_CONDITIONS).toContain('TEXT');
    expect(SUPPORTED_CONDITIONS).toContain('VISIBLE');
    expect(SUPPORTED_CONDITIONS).toContain('URL');
    expect(SUPPORTED_CONDITIONS).toContain('ATTRIBUTE');
    expect(SUPPORTED_CONDITIONS).toHaveLength(4);

    // BUSINESS_JSON 在 invariants.ts 中有校验逻辑但运行时不推荐使用
    expect(UNSUPPORTED_CONDITIONS).toContain('BUSINESS_JSON');
  });

  it('aggregations 列表包含所有聚合方式（8 种）', () => {
    expect(SUPPORTED_AGGREGATIONS).toContain('LATEST');
    expect(SUPPORTED_AGGREGATIONS).toContain('MEAN');
    expect(SUPPORTED_AGGREGATIONS).toContain('MEDIAN');
    expect(SUPPORTED_AGGREGATIONS).toContain('P95');
    expect(SUPPORTED_AGGREGATIONS).toContain('SUM');
    expect(SUPPORTED_AGGREGATIONS).toContain('COUNT');
    expect(SUPPORTED_AGGREGATIONS).toContain('RATIO');
    expect(SUPPORTED_AGGREGATIONS).toContain('SUCCESS_RATE');
    expect(SUPPORTED_AGGREGATIONS).toHaveLength(8);
  });

  it('knownLimitations 非空且每条为有效非空字符串', () => {
    expect(KNOWN_LIMITATIONS.length).toBeGreaterThan(0);
    for (const limitation of KNOWN_LIMITATIONS) {
      expect(typeof limitation).toBe('string');
      expect(limitation.trim().length).toBeGreaterThan(0);
    }
  });

  it('buildCapabilityCatalog 生成完整且一致的能力清单', () => {
    const catalog = buildCapabilityCatalog('0.1.0');
    expect(catalog.version).toBe('0.1.0');
    expect(catalog.actions.supported).toEqual(SUPPORTED_ACTIONS);
    expect(catalog.stepKinds.supported).toEqual(SUPPORTED_STEP_KINDS);
    expect(catalog.extractors.supported).toEqual(SUPPORTED_EXTRACTORS);
    expect(catalog.conditions.supported).toEqual(SUPPORTED_CONDITIONS);
    expect(catalog.conditions.unsupported).toEqual([...UNSUPPORTED_CONDITIONS]);
    expect(catalog.aggregations.supported).toEqual(SUPPORTED_AGGREGATIONS);
    expect(catalog.knownLimitations).toEqual([...KNOWN_LIMITATIONS]);
  });

  it('能力清单数组均为只读冻结对象', () => {
    // 确保常量数组不会被意外修改
    expect(Object.isFrozen(SUPPORTED_ACTIONS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_STEP_KINDS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_EXTRACTORS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_CONDITIONS)).toBe(true);
    expect(Object.isFrozen(SUPPORTED_AGGREGATIONS)).toBe(true);
    expect(Object.isFrozen(KNOWN_LIMITATIONS)).toBe(true);
  });
});
