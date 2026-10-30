/** doctor 命令 — 诊断环境。 */

import { PlaywrightBrowserAdapter } from '@uxq/browser';
import { parseContract, defaultProfile } from '@uxq/contracts';
import type { ExecutionProfile } from '@uxq/contracts';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { loadConfig } from '../loader.js';
import { logInfo } from '../io.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  let available = false;
  let browserVersion: string | undefined;
  let error: string | undefined;

  try {
    const profile = parseContract(
      'ExecutionProfile',
      { ...defaultProfile(), ...await loadConfig(ctx.options.config) },
    );
    const session = await new PlaywrightBrowserAdapter().launch(profile);
    try {
      available = true;
      browserVersion = session.browserVersion;
    } finally {
      await session.close();
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : '浏览器不可用';
  }

  const data = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    storage: ctx.options.root,
    browser: 'playwright',
    available,
    browserVersion,
    error,
  };

  if (!available) logInfo(ctx.io, `环境诊断失败：${error}`);

  return {
    code: available ? EXIT_CODES.SUCCESS : EXIT_CODES.ENVIRONMENT_ERROR,
    response: buildResponse(VERSION, 'doctor', {
      status: available ? 'COMPLETED' : 'ERROR',
      data,
      ...(error ? { errors: [{ code: 'ENVIRONMENT_ERROR', message: error }] } : {}),
    }),
  };
}
