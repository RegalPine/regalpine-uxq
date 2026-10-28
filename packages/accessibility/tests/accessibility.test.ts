import type { Id } from '@uxq/core';
import { newId } from '@uxq/core';
import { describe, expect, it } from 'vitest';
import type { Timestamp } from '@uxq/core';
import {
  createAccessibilityCheck,
  createAccessibilityReport,
  validateAccessibilityCheck,
  generateAccessibilitySummary,
  WCAG_21_AA_CRITERIA,
} from '@uxq/accessibility';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;

describe('可访问性检查', () => {
  it('创建自动化检查', () => {
    const check = createAccessibilityCheck(
      newId('run') as Id<'run'>,
      'page-1',
      '1.1.1',
      'AUTOMATED',
      'PASS',
      'MINOR',
      '所有图片都有替代文本',
      fixedTime,
    );

    expect(check.id).toMatch(/^a11y-check-/);
    expect(check.criterionId).toBe('1.1.1');
    expect(check.checkType).toBe('AUTOMATED');
    expect(check.status).toBe('PASS');
    expect(check.limitations).toContain('自动化检查不能替代人工评估');
  });

  it('创建辅助技术测试', () => {
    const check = createAccessibilityCheck(
      newId('run') as Id<'run'>,
      'form-1',
      '2.1.1',
      'ASSISTIVE_TECH',
      'PASS',
      'MODERATE',
      '表单可以通过屏幕阅读器访问',
      fixedTime,
      '使用 NVDA 测试',
      ['NVDA', 'Firefox'],
      '确保所有表单控件都有标签',
    );

    expect(check.checkType).toBe('ASSISTIVE_TECH');
    expect(check.assistiveTechUsed).toContain('NVDA');
    expect(check.remediation).toBeDefined();
  });

  it('验证检查完整性', () => {
    const check = createAccessibilityCheck(
      newId('run') as Id<'run'>,
      '',
      '',
      'MANUAL',
      'FAIL',
      'CRITICAL',
      '缺少焦点指示器',
      fixedTime,
    );

    const result = validateAccessibilityCheck(check);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('实体 ID 不能为空');
    expect(result.issues).toContain('准则 ID 不能为空');
    expect(result.issues).toContain('失败的检查应提供修复建议');
  });

  it('辅助技术测试需要说明技术', () => {
    const check = createAccessibilityCheck(
      newId('run') as Id<'run'>,
      'page-1',
      '1.3.1',
      'ASSISTIVE_TECH',
      'INCONCLUSIVE',
      'MODERATE',
      '无法确定',
      fixedTime,
    );

    const result = validateAccessibilityCheck(check);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('辅助技术'))).toBe(true);
  });
});

describe('可访问性报告', () => {
  it('创建合规报告', () => {
    const checks = [
      createAccessibilityCheck(newId('run') as Id<'run'>, 'page-1', '1.1.1', 'AUTOMATED', 'PASS', 'MINOR', '通过', fixedTime),
      createAccessibilityCheck(newId('run') as Id<'run'>, 'page-1', '1.3.1', 'MANUAL', 'PASS', 'MINOR', '通过', fixedTime),
      createAccessibilityCheck(newId('run') as Id<'run'>, 'page-1', '2.1.1', 'AUTOMATED', 'PASS', 'MINOR', '通过', fixedTime),
    ];

    const report = createAccessibilityReport(
      newId('run') as Id<'run'>,
      '2.1',
      'AA',
      checks,
      WCAG_21_AA_CRITERIA,
      fixedTime,
    );

    expect(report.id).toMatch(/^a11y-report-/);
    expect(report.wcagVersion).toBe('2.1');
    expect(report.targetLevel).toBe('AA');
    expect(report.summary.total).toBe(3);
    expect(report.summary.passed).toBe(3);
    expect(report.summary.failed).toBe(0);
    expect(report.coverage.criteriaEvaluated).toBe(3);
    expect(report.conformanceClaim.statement).toContain('符合');
  });

  it('创建不合规报告', () => {
    const checks = [
      createAccessibilityCheck(newId('run') as Id<'run'>, 'page-1', '1.1.1', 'AUTOMATED', 'PASS', 'MINOR', '通过', fixedTime),
      createAccessibilityCheck(newId('run') as Id<'run'>, 'page-1', '1.3.1', 'MANUAL', 'FAIL', 'SERIOUS', '失败', fixedTime, undefined, undefined, '添加替代文本'),
    ];

    const report = createAccessibilityReport(
      newId('run') as Id<'run'>,
      '2.1',
      'AA',
      checks,
      WCAG_21_AA_CRITERIA,
      fixedTime,
    );

    expect(report.summary.failed).toBe(1);
    expect(report.conformanceClaim.conforms).toBe(false);
    expect(report.conformanceClaim.statement).toContain('不符合');
  });

  it('生成摘要', () => {
    const checks = [
      createAccessibilityCheck(newId('run') as Id<'run'>, 'page-1', '1.1.1', 'AUTOMATED', 'PASS', 'MINOR', '通过', fixedTime),
    ];

    const report = createAccessibilityReport(
      newId('run') as Id<'run'>,
      '2.1',
      'A',
      checks,
      WCAG_21_AA_CRITERIA,
      fixedTime,
    );

    const summary = generateAccessibilitySummary(report);
    expect(summary).toContain('可访问性评估报告');
    expect(summary).toContain('WCAG 版本');
    expect(summary).toContain('覆盖率');
    expect(summary).toContain('合规声明');
  });
});

describe('WCAG 准则', () => {
  it('WCAG 2.1 AA 准则列表', () => {
    expect(WCAG_21_AA_CRITERIA.length).toBeGreaterThan(0);
    expect(WCAG_21_AA_CRITERIA.every(c => c.id && c.level && c.name)).toBe(true);
    
    const aLevelCriteria = WCAG_21_AA_CRITERIA.filter(c => c.level === 'A');
    const aaLevelCriteria = WCAG_21_AA_CRITERIA.filter(c => c.level === 'AA');
    
    expect(aLevelCriteria.length).toBeGreaterThan(0);
    expect(aaLevelCriteria.length).toBeGreaterThan(0);
  });
});
