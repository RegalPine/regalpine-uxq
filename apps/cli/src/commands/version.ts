/** version 命令。 */

import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'version', {
      status: 'COMPLETED',
      data: { version: VERSION },
    }),
  };
}
