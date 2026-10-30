/** baseline 命令 — 基线管理。 */

import { UxqError } from '@uxq/core';
import { openLocalStore, openLocalBaselineStore } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const [action, name, runId] = ctx.positional;
  const store = await openLocalBaselineStore(ctx.options.root);

  if (action === 'list') {
    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'baseline', {
        status: 'COMPLETED',
        data: { baselines: await store.list() },
      }),
    };
  }

  if (action === 'delete' && name) {
    await store.delete(name);
    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'baseline', {
        status: 'COMPLETED',
        data: { message: `基线 ${name} 已删除` },
      }),
    };
  }

  if ((action === 'create' || action === 'update') && name && runId) {
    if (action === 'update' && !ctx.options.reason?.trim()) {
      throw new UxqError('MISSING_REASON', 'baseline update 需要 --reason', 'INPUT');
    }

    const runStore = await openLocalStore(ctx.options.root);
    const stored = await runStore.loadRun(runId);
    const evaluation = stored.evaluations.at(-1);

    if (!evaluation) {
      throw new UxqError('NO_EVALUATION', '运行尚未产生评价结果', 'EXECUTION');
    }

    const baseline = await store.save(
      name,
      stored,
      evaluation,
      action === 'update' ? ctx.options.reason : undefined,
    );

    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'baseline', {
        status: 'COMPLETED',
        data: { baseline, message: `基线 ${name} 已保存` },
      }),
    };
  }

  throw new UxqError('INVALID_ARGS', '用法：baseline create|update <name> <run-id>；list；delete <name>', 'INPUT');
}
