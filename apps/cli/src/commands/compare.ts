/** compare 命令 — 与基线比较。 */

import { UxqError } from '@uxq/core';
import { openLocalStore, openLocalBaselineStore } from '@uxq/execution';
import { compareRuns } from '@uxq/regression';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  const name = ctx.positional[1] ?? 'default';

  if (!runId) throw new UxqError('MISSING_RUN', 'compare 需要运行 ID', 'INPUT');

  const baselineStore = await openLocalBaselineStore(ctx.options.root);
  const baseline = await baselineStore.get(name);
  if (!baseline) throw new UxqError('BASELINE_NOT_FOUND', `基线 ${name} 不存在`, 'INPUT');

  const store = await openLocalStore(ctx.options.root);
  const stored = await store.loadRun(runId);
  const evaluation = stored.evaluations.at(-1);
  if (!evaluation) throw new UxqError('NO_EVALUATION', '运行尚未产生评价结果', 'EXECUTION');

  const comparison = compareRuns(
    {
      ...baseline.baseline,
      metrics: baseline.metrics,
      rules: baseline.rules,
      evaluation: baseline.evaluation,
    },
    {
      planDigest: stored.plan.planDigest,
      definitionId: stored.definition.id,
      definitionVersion: stored.definition.definitionVersion,
      policyId: evaluation.policyId,
      policyVersion: evaluation.policyVersion,
      viewport: stored.context.profile.viewport,
      ...(stored.context.browserVersion ? { browserVersion: stored.context.browserVersion } : {}),
      metrics: stored.metrics,
      rules: stored.rules,
      evaluation,
    },
  );

  if (baseline.evaluation.policyDigest !== evaluation.policyDigest) {
    comparison.comparability = 'NOT_COMPARABLE';
    comparison.caveats.push('评分策略内容摘要不同');
  }

  if (comparison.comparability === 'NOT_COMPARABLE') {
    comparison.scoreDelta = null;
    comparison.metricDeltas = comparison.metricDeltas.map((m) => ({ ...m, delta: null, deltaPercent: null }));
  }

  const code = comparison.comparability === 'NOT_COMPARABLE' ? EXIT_CODES.CONTRACT_ERROR : EXIT_CODES.SUCCESS;

  return {
    code,
    response: buildResponse(VERSION, 'compare', {
      status: 'COMPLETED',
      data: { baseline: name, currentRun: runId, ...comparison },
    }),
  };
}
