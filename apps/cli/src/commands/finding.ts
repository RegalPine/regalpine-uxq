/** finding 命令 — Finding 查询。 */

import { UxqError } from '@uxq/core';
import { openLocalStore, latestSnapshot } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  if (ctx.positional[0] !== 'list' || !ctx.positional[1]) {
    throw new UxqError('INVALID_ARGS', '用法：finding list <run-id>', 'INPUT');
  }

  const runId = ctx.positional[1];
  const store = await openLocalStore(ctx.options.root);
  const stored = await store.loadRun(runId);
  const findings = latestSnapshot(stored).findings;

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'finding', {
      status: 'COMPLETED',
      data: {
        runId,
        findings,
        findingIds: findings.map((f) => f.id),
        count: findings.length,
      },
    }),
  };
}
