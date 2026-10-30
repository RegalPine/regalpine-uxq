/** plan 命令 — 编译执行计划。 */

import { compilePlan } from '@uxq/execution';
import { UxqError } from '@uxq/core';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { loadDefinition, loadConfig } from '../loader.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const file = ctx.positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'plan 需要文件路径', 'INPUT');

  const definition = await loadDefinition(file);
  const config = await loadConfig(ctx.options.config);
  const plan = compilePlan({ definition, profileOverrides: config });

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'plan', {
      status: 'COMPLETED',
      data: plan,
    }),
  };
}
