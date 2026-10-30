/** report 命令 — 生成报告。 */

import { UxqError, systemClock } from '@uxq/core';
import { openLocalStore, latestSnapshot, runBundle } from '@uxq/execution';
import { projectReport, renderMarkdown } from '@uxq/reporting';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  if (!runId) throw new UxqError('MISSING_RUN_ID', 'report 需要运行 ID', 'INPUT');

  const store = await openLocalStore(ctx.options.root);
  const stored = await store.loadRun(runId);
  const report = projectReport(runBundle(stored), latestSnapshot(stored), VERSION, systemClock.now());
  const markdown = renderMarkdown(report);

  // report 命令特殊处理：非 --json 模式直接输出 markdown 到 stdout
  if (!ctx.options.json) {
    ctx.io.out(markdown + '\n');
  }

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'report', {
      status: 'COMPLETED',
      data: { report, markdown },
    }),
  };
}
