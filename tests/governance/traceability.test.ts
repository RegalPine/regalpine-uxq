import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import traceability from '../../docs/implementation/traceability.json';

// 此测试只检查追溯记录完整性；最终验收仍须人工核对每条条件与实际行为证据。
describe('全目标追溯清单', () => {
  it('覆盖原计划全部工作包，不能用已实现子集替换完整目标', async () => {
    const plan = await readFile(traceability.sourcePlan, 'utf8');
    const expected = [...plan.matchAll(/^\| (M[0-4]\.\d+) \|/gm)].map((match) => match[1]);
    const actual = traceability.items.map((item) => item.requirementId);
    expect(expected).toHaveLength(27);
    expect(new Set(actual).size).toBe(actual.length);
    expect(actual.sort()).toEqual(expected.sort());
  });
  it('每项具有可执行验收条件，已实现项的目标和测试必须存在', async () => {
    const statuses = [
      'UNVERIFIED',
      'NOT_IMPLEMENTED',
      'IN_PROGRESS',
      'IMPLEMENTED_UNVERIFIED',
      'VERIFIED',
      'DEFERRED',
      'REJECTED',
    ];
    await access(traceability.decisionFile);
    for (const item of traceability.items) {
      expect(statuses).toContain(item.status);
      expect(item.ownerRole.length).toBeGreaterThan(0);
      expect(item.sourceSection.length).toBeGreaterThan(0);
      expect(item.implementationTargets.length).toBeGreaterThan(0);
      expect(item.acceptanceCriteria.length).toBeGreaterThan(0);
      if (['IMPLEMENTED_UNVERIFIED', 'VERIFIED'].includes(item.status)) {
        expect(item.testTargets.length, item.requirementId).toBeGreaterThan(0);
        for (const target of [
          ...item.implementationTargets,
          ...item.schemaTargets,
          ...item.testTargets,
        ]) {
          await expect(access(target), `${item.requirementId}: ${target}`).resolves.toBeUndefined();
        }
      }
      if (item.status === 'VERIFIED') {
        expect(item.evidenceRefs.length, '完成状态不得只有文字声明').toBeGreaterThan(0);
        for (const evidence of item.evidenceRefs) await access(evidence);
      }
    }
  });
});
