/** 命令模块公共类型。 */

import type { CliIO } from '../io.js';
import type { CliOptions } from '../options.js';
import type { CliResponse } from '../response.js';
import type { ExitCode } from '../errors.js';

export interface CommandContext {
  readonly io: CliIO;
  readonly options: CliOptions;
  readonly positional: string[];
}

export interface CommandResult {
  readonly code: ExitCode;
  readonly response: CliResponse<unknown>;
}
