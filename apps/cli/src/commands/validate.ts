/** validate 命令 — 校验定义文件。 */

import { assertDefinition } from '@uxq/contracts';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { loadDefinition } from '../loader.js';
import { UxqError } from '@uxq/core';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const file = ctx.positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'validate 需要文件路径', 'INPUT');

  const definition = await loadDefinition(file);
  assertDefinition(definition);

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'validate', {
      status: 'COMPLETED',
      data: {
        valid: true,
        definitionId: definition.id,
        version: definition.definitionVersion,
      },
    }),
  };
}
