/** settle 命令 — 重新结算并保存。 */

import { readFile } from 'node:fs/promises';
import { UxqError } from '@uxq/core';
import { parseContract } from '@uxq/contracts';
import { openLocalStore, persistEvaluation } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { persistReport } from './evaluate.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  if (!runId || !ctx.options.policy) {
    throw new UxqError('INVALID_ARGS', '用法：settle <run-id> --policy <file>', 'INPUT');
  }

  const policy = parseContract(
    'ScoringPolicy',
    JSON.parse(await readFile(ctx.options.policy, 'utf8')) as unknown,
  );

  const store = await openLocalStore(ctx.options.root);
  const release = await store.acquireLock(runId);

  try {
    const stored = await store.loadRun(runId);

    if (!['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(stored.run.status)) {
      throw new UxqError('RUN_ACTIVE', '活动运行不能重新结算', 'EXECUTION');
    }

    const snapshot = await persistEvaluation(stored, store, policy);
    const report = await persistReport(stored, store);

    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'settle', {
        status: 'COMPLETED',
        data: {
          runId,
          evaluation: snapshot.evaluation,
          scores: snapshot.scores,
          dimensions: snapshot.dimensions,
          report,
          message: '重新结算完成，评价快照与报告已存储',
        },
      }),
    };
  } finally {
    await release();
  }
}
