/** list 命令 — 列出运行记录。 */

import { openLocalStore } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const store = await openLocalStore(ctx.options.root);
  const runs = await store.listRuns();
  const results = [];

  for (const runId of runs) {
    try {
      const stored = await store.loadRun(runId);
      results.push({
        runId: stored.run.id,
        status: stored.run.status,
        definitionId: stored.run.definitionId,
        createdAt: stored.run.createdAt,
      });
    } catch {
      results.push({ runId, status: 'ERROR' });
    }
  }

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'list', {
      status: 'COMPLETED',
      data: results,
    }),
  };
}
