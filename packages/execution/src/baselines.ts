import { mkdir, readFile, readdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, invariant } from '@uxq/core';
import { createInMemoryBaselineStore } from '@uxq/regression';
import type { Baseline } from '@uxq/regression';
import type { MetricResult, RuleResult, EvaluationResult } from '@uxq/contracts';
import type { StoredRun } from './storage.js';
import { retryRename } from './storage.js';

export interface StoredBaseline {
  baseline: Baseline;
  metrics: MetricResult[];
  rules: RuleResult[];
  evaluation: EvaluationResult;
}

/** 每条基线保存创建时的测量与评价快照，不读取当前运行来冒充历史基线。 */
export async function openLocalBaselineStore(root: string) {
  const dir = join(root, 'baselines');
  await mkdir(dir, { recursive: true });
  const file = (name: string) => join(dir, `${digest(name)}.json`);
  async function get(name: string): Promise<StoredBaseline | undefined> {
    try { return JSON.parse(await readFile(file(name), 'utf8')) as StoredBaseline; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  }
  return {
    get,
    async list(): Promise<Baseline[]> {
      const files = (await readdir(dir)).filter((entry) => entry.endsWith('.json'));
      return Promise.all(files.map(async (entry) => (JSON.parse(await readFile(join(dir, entry), 'utf8')) as StoredBaseline).baseline));
    },
    async save(name: string, stored: StoredRun, evaluation: EvaluationResult, reason?: string): Promise<Baseline> {
      invariant(name.trim().length > 0, 'BASELINE_NAME', '基线名称不能为空');
      invariant(stored.run.status === 'COMPLETED' && evaluation.evaluationStatus === 'COMPLETE' &&
        evaluation.overallScore !== null, 'BASELINE_INCOMPLETE', '基线必须来自已完成且有实测评分的运行');
      const previous = await get(name);
      invariant(reason ? Boolean(previous) : !previous, reason ? 'BASELINE_NOT_FOUND' : 'BASELINE_EXISTS',
        reason ? '待更新的基线不存在' : '基线已存在，请使用 update 并说明原因');
      if (reason !== undefined) invariant(reason.trim().length > 0, 'BASELINE_REASON', '更新基线必须给出原因');
      let baseline = createInMemoryBaselineStore().createBaseline(name, stored.run.id, stored.run, stored.plan, stored.context, evaluation);
      if (previous) baseline = { ...baseline, id: previous.baseline.id, createdAt: previous.baseline.createdAt,
        updateReason: reason!, previousVersion: previous.baseline };
      const record: StoredBaseline = { baseline, evaluation, metrics: stored.metrics, rules: stored.rules };
      const content = JSON.stringify(record, null, 2);
      if (!previous) await writeFile(file(name), content, { encoding: 'utf8', flag: 'wx' });
      else { const temp = `${file(name)}.${process.pid}.tmp`; await writeFile(temp, content, 'utf8'); await retryRename(temp, file(name)); }
      return baseline;
    },
    async delete(name: string): Promise<void> {
      try { await unlink(file(name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    },
  };
}
