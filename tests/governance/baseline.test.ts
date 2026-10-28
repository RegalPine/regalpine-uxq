import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const specDir = 'docs/spec';
async function spec(prefix: string): Promise<string> {
  const files = (await readdir(specDir)).filter((file) => file.startsWith(prefix));
  expect(files, `来源必须由完整前缀唯一定位：${prefix}`).toHaveLength(1);
  return readFile(path.join(specDir, files[0]!), 'utf8');
}

// 只验证 M0 原文与索引收敛；不将文本测试冒充状态机、CLI 或结算的行为验证。
describe('M0 工作基线的原文收敛', () => {
  it('保留 35 份来源并用文件身份消除 ARCH-001 重号歧义', async () => {
    const files = (await readdir(specDir)).filter((file) => file.endsWith('.md'));
    expect(files).toHaveLength(35);
    expect(new Set(files).size).toBe(35);
    expect(files.filter((file) => file.startsWith('UXQ-ARCH-001-'))).toHaveLength(2);
    for (const file of files) {
      expect(file).toMatch(/-v\d+\.\d+\.\d+\.md$/);
      expect(await readFile(path.join(specDir, file), 'utf8')).toMatch(/^# /);
    }
    const general = await spec('UXQ-001-');
    expect(general).toContain('UXQ-010：问题分类与优先级规范');
    expect(general).toContain('UXQ-011：评价执行与运行上下文规范');
    expect(general).not.toContain('UXQ-010：自动化执行规范');
    expect(general).not.toContain('UXQ-011：评价报告规范');
  });
  it('PARTIAL 无出向业务状态边，取消保留独立终态', async () => {
    for (const prefix of ['UXQ-011-', 'UXQ-R02-']) {
      const text = await spec(prefix);
      expect(text).not.toMatch(/PARTIAL --> (RUNNING|COMPLETED|FAILED|CANCELLED)/);
      expect(text).toContain('PARTIAL --> [*]');
      expect(text).toContain('sourceRunId');
    }
    const state = await spec('UXQ-ARCH-004-');
    expect(state).toContain('此处不要求最终 EvaluationResult 或报告已存在');
  });
  it('来源、方向与总体结论不再混用', async () => {
    const evidence = await spec('UXQ-009-证据管理与追溯规范-v0.2.0');
    expect(evidence).toContain('| E5 | 间接推断 |');
    expect(evidence).not.toContain('| E5 | 外部或业务约束证据 |');
    const metrics = await spec('UXQ-ARCH-007-');
    expect(metrics).toContain('| "CONTEXT_DEPENDENT"');
    expect(metrics).toContain('| "DESCRIPTIVE_ONLY"');
    const scoring = await spec('UXQ-008-评分、标准化与综合评价规范-v0.2.0');
    expect(scoring).not.toContain('overall_outcome: "CONSTRAINED"');
    expect(scoring).toContain('`NOT_RATED`');
  });
  it('规则独立执行字段与验证多对象关联已写回原文', async () => {
    for (const prefix of ['UXQ-ARCH-005-', 'UXQ-ARCH-008-']) {
      const text = await spec(prefix);
      expect(text).toContain('executionStatus: "ERROR";');
      expect(text).toContain('executionStatus: "COMPLETED";');
    }
    expect(await spec('UXQ-ARCH-010-')).toContain('verificationPlanIds: string[]');
    expect(await spec('UXQ-ARCH-012-')).toContain(
      '公共领域状态枚举、判别联合和 DTO 的唯一权威定义',
    );
  });
  it('架构与实施文档的本地引用可解析', async () => {
    for (const file of (await readdir('docs/architecture')).filter((file) =>
      file.endsWith('.md'),
    )) {
      const filename = path.join('docs/architecture', file);
      const text = await readFile(filename, 'utf8');
      for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
        const target = match[1]!;
        if (/^(?:https?:|file:|#)/.test(target)) continue;
        await expect(
          access(path.resolve(path.dirname(filename), target.split('#')[0]!)),
        ).resolves.toBeUndefined();
      }
    }
  });
});
