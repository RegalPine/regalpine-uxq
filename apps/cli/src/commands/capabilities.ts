/** capabilities 命令 — 输出当前版本支持的能力清单。 */

import { buildCapabilityCatalog } from '@uxq/contracts';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const catalog = buildCapabilityCatalog(VERSION);

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'capabilities', {
      status: 'COMPLETED',
      data: catalog,
    }),
  };
}
