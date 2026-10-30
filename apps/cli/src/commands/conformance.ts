/** conformance 命令 — 规范符合性检查。 */

import { UxqError, systemClock } from '@uxq/core';
import { openLocalStore, latestSnapshot, runBundle } from '@uxq/execution';
import { runConformanceCheck, renderConformanceMarkdown } from '@uxq/conformance';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  if (!runId) throw new UxqError('MISSING_RUN', 'conformance 需要运行 ID', 'INPUT');

  const store = await openLocalStore(ctx.options.root);
  const stored = await store.loadRun(runId);
  const report = runConformanceCheck(runBundle(stored), latestSnapshot(stored), undefined, systemClock.now());

  return {
    code: report.overallStatus === 'FAIL' ? EXIT_CODES.CONTRACT_ERROR : EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'conformance', {
      status: 'COMPLETED',
      data: {
        runId,
        overallStatus: report.overallStatus,
        summary: report.summary,
        results: report.results,
        markdown: renderConformanceMarkdown(report),
      },
    }),
  };
}
