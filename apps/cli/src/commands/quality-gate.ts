/** quality-gate 命令 — 质量门禁检查。 */

import { UxqError } from '@uxq/core';
import { openLocalStore } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { assessGate } from './evaluate.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  if (!runId) throw new UxqError('MISSING_RUN', 'quality-gate 需要运行 ID', 'INPUT');

  const store = await openLocalStore(ctx.options.root);
  const stored = await store.loadRun(runId);
  const evaluation = stored.evaluations.at(-1);
  const gate = await assessGate(evaluation, ctx.options.gate);

  return {
    code: gate.code,
    response: buildResponse(VERSION, 'quality-gate', {
      status: gate.passed ? 'COMPLETED' : 'ERROR',
      data: {
        runId,
        conformance: gate.conformance,
        evaluationStatus: evaluation?.evaluationStatus ?? null,
        overallOutcome: evaluation?.overallOutcome ?? null,
        overallScore: evaluation?.overallScore ?? null,
        coverage: evaluation?.coverage ?? null,
        constraints: evaluation?.constraints ?? [],
        gate,
        limitations: evaluation?.limitations ?? ['运行没有评价结果'],
      },
      ...(!gate.passed ? { errors: gate.details.map((d) => ({ code: 'GATE_FAIL', message: d })) } : {}),
    }),
  };
}
