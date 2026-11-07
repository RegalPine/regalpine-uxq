/** auth-save 命令 — 打开有头浏览器，用户手动登录后保存 storageState。 */

import { writeFile, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { UxqError } from '@uxq/core';
import { chromium } from 'playwright';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { logInfo } from '../io.js';
import type { CommandContext, CommandResult } from './types.js';

/** 等待用户在终端按回车确认。 */
function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolvePromise) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    rl.question(prompt, () => {
      rl.close();
      resolvePromise();
    });
  });
}

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const target = ctx.options.url;
  if (!target) {
    throw new UxqError('MISSING_URL', 'auth-save 需要 --url 指定目标页面', 'INPUT');
  }

  const outputPath = ctx.positional[0];
  if (!outputPath) {
    throw new UxqError('MISSING_FILE', 'auth-save 需要指定输出文件路径', 'INPUT');
  }

  const resolvedOutput = resolve(outputPath);
  const url = new URL(target);

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new UxqError('INVALID_URL', 'auth-save 仅支持 HTTP(S) URL', 'INPUT');
  }

  logInfo(ctx.io, `启动浏览器：${url.href}`);

  const browser = await chromium.launch({ headless: false });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await page.goto(url.href, { waitUntil: 'load', timeout: 60_000 });

    logInfo(ctx.io, '浏览器已打开，请在浏览器中完成登录');
    await waitForEnter('[uxq] 登录完成？按回车保存认证状态...');

    const storageState = await context.storageState();
    await context.close();

    await writeFile(resolvedOutput, `${JSON.stringify(storageState, null, 2)}\n`, 'utf-8');

    // 设置文件权限为 600（仅所有者可读写），保护敏感认证数据
    try {
      await chmod(resolvedOutput, 0o600);
    } catch {
      // Windows 上 chmod 可能失败，忽略
    }

    const cookiesCount = storageState.cookies?.length ?? 0;
    const originsCount = storageState.origins?.length ?? 0;

    logInfo(
      ctx.io,
      `认证状态已保存：${resolvedOutput}（${cookiesCount} cookies, ${originsCount} origins）`,
    );

    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'auth-save', {
        status: 'COMPLETED',
        data: {
          path: resolvedOutput,
          target: url.href,
          cookiesCount,
          originsCount,
        },
      }),
    };
  } catch (error) {
    if (error instanceof UxqError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new UxqError('EXECUTION_ERROR', `保存认证状态失败：${message}`, 'EXECUTION');
  } finally {
    await browser.close();
  }
}
