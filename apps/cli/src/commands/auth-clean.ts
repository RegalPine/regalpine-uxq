/** auth-clean 命令 — 删除认证状态文件，清理敏感数据。 */

import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { UxqError } from '@uxq/core';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { logInfo } from '../io.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const filePath = ctx.positional[0];
  if (!filePath) {
    throw new UxqError('MISSING_FILE', 'auth-clean 需要指定要删除的认证状态文件路径', 'INPUT');
  }

  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    logInfo(ctx.io, `文件不存在：${resolvedPath}`);
    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'auth-clean', {
        status: 'COMPLETED',
        data: { path: resolvedPath, removed: false, hadCookies: 0, hadOrigins: 0 },
      }),
    };
  }

  // 读取文件内容以统计 cookies/origins 数量（用于日志）
  let hadCookies = 0;
  let hadOrigins = 0;
  try {
    const content = await readFile(resolvedPath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (Array.isArray(parsed.cookies)) hadCookies = parsed.cookies.length;
    if (Array.isArray(parsed.origins)) hadOrigins = parsed.origins.length;
  } catch {
    // 无法解析也不阻止删除
  }

  try {
    rmSync(resolvedPath, { force: true });
    logInfo(
      ctx.io,
      `已删除认证状态文件：${resolvedPath}（原含 ${hadCookies} cookies, ${hadOrigins} origins）`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new UxqError('EXECUTION_ERROR', `删除认证状态文件失败：${message}`, 'EXECUTION');
  }

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'auth-clean', {
      status: 'COMPLETED',
      data: { path: resolvedPath, removed: true, hadCookies, hadOrigins },
    }),
  };
}
