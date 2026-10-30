/** cancel 命令 — 取消运行。 */

import { UxqError } from '@uxq/core';
import { openLocalStore, cancelRun } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  if (!runId) throw new UxqError('MISSING_RUN_ID', 'cancel 需要运行 ID', 'INPUT');

  const store = await openLocalStore(ctx.options.root);
  await cancelRun(runId, store);

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'cancel', {
      status: 'COMPLETED',
      data: { cancelled: runId },
    }),
  };
}
