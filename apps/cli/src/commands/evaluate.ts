/** evaluate 命令 — 执行评价。 */

import { readFile } from 'node:fs/promises';
import { UxqError, systemClock } from '@uxq/core';
import { parseContract } from '@uxq/contracts';
import type { EvaluationResult, ScoringPolicy } from '@uxq/contracts';
import {
  openLocalStore,
  createRun,
  executeRun,
  createEvaluationExecutor,
  persistEvaluation,
  latestSnapshot,
  runBundle,
} from '@uxq/execution';
import type { StoredRun, RunStore } from '@uxq/execution';
import { projectReport, createReportArtifact, renderMarkdown } from '@uxq/reporting';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { loadDefinition, loadConfig } from '../loader.js';
import { logInfo } from '../io.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const file = ctx.positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'evaluate 需要定义文件路径', 'INPUT');

  const definition = await loadDefinition(file);
  const config = await loadConfig(ctx.options.config);
  // CLI --auth-state 覆盖配置文件中的 authStatePath
  if (ctx.options.authState) {
    config.authStatePath = ctx.options.authState;
  }
  const store = await openLocalStore(ctx.options.root);
  const pipeline = createEvaluationExecutor(definition, store);
  const { run: runRecord } = await createRun(definition, config, { store });
  const release = await store.acquireLock(runRecord.id);

  try {
    logInfo(ctx.io, `运行已创建：${runRecord.id}`);
    const stored = await executeRun(runRecord.id, { store, executeStep: pipeline.executeStep });
    const snapshot = await persistEvaluation(stored, store);
    const report = await persistReport(stored, store);

    const data = {
      runId: runRecord.id,
      status: stored.run.status,
      evaluation: snapshot.evaluation,
      report,
    };

    let code = EXIT_CODES.SUCCESS;
    if (stored.run.status !== 'COMPLETED') {
      code = stored.attempts.some((a) => a.error?.category === 'ENVIRONMENT')
        ? EXIT_CODES.ENVIRONMENT_ERROR
        : EXIT_CODES.EXECUTION_ERROR;
    } else if (ctx.options.gate) {
      const gate = await assessGate(snapshot.evaluation, ctx.options.gate);
      code = gate.code;
    }

    return {
      code,
      response: buildResponse(VERSION, 'evaluate', {
        status: stored.run.status === 'COMPLETED' ? 'COMPLETED' : 'PARTIAL',
        data,
      }),
    };
  } finally {
    await pipeline.close();
    await release();
  }
}

/** 持久化报告到存储。 */
export async function persistReport(stored: StoredRun, store: RunStore) {
  const snapshot = latestSnapshot(stored);
  const report = projectReport(runBundle(stored), snapshot, VERSION, systemClock.now());
  const markdown = renderMarkdown(report);
  const jsonContent = JSON.stringify(report, null, 2);
  const artifact = createReportArtifact(stored.run.id, snapshot.evaluation.id, VERSION, jsonContent, markdown);
  artifact.json = {
    ...await store.appendArtifact(stored.run.id, `reports/${artifact.id}.json`, new TextEncoder().encode(jsonContent)),
    mediaType: 'application/json',
  };
  artifact.markdown = {
    ...await store.appendArtifact(stored.run.id, `reports/${artifact.id}.md`, new TextEncoder().encode(markdown)),
    mediaType: 'text/markdown',
  };
  stored.manifest.reports.push(artifact);
  stored.manifest.revision++;
  await store.saveRun(stored);
  return artifact;
}

/** 评估质量门禁。 */
export async function assessGate(
  evaluation: EvaluationResult | undefined,
  file?: string,
): Promise<{ passed: boolean; code: number; conformance: string; details: string[] }> {
  const gate = file
    ? JSON.parse(await readFile(file, 'utf8')) as { minimumScore?: number; requiredOutcome?: string[] }
    : {};

  if (!gate || typeof gate !== 'object' || Array.isArray(gate)) {
    throw new UxqError('INVALID_GATE', '门禁配置必须是对象', 'INPUT');
  }
  if (gate.minimumScore !== undefined && (!Number.isFinite(gate.minimumScore) || gate.minimumScore < 0 || gate.minimumScore > 100)) {
    throw new UxqError('INVALID_GATE', 'minimumScore 必须是 0–100 的数字', 'INPUT');
  }
  if (gate.requiredOutcome !== undefined && (!Array.isArray(gate.requiredOutcome) || gate.requiredOutcome.some((v) => !['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT_RATED'].includes(v)))) {
    throw new UxqError('INVALID_GATE', 'requiredOutcome 必须是合法结论数组', 'INPUT');
  }

  const conformance = !evaluation ? 'UNKNOWN' : evaluation.overallOutcome;
  const details: string[] = [];

  if (
    !evaluation ||
    evaluation.overallScore === null ||
    !['COMPLETE', 'PARTIAL'].includes(evaluation.evaluationStatus) ||
    ['INCONCLUSIVE', 'NOT_RATED'].includes(evaluation.overallOutcome)
  ) {
    return { passed: false, code: EXIT_CODES.EXECUTION_ERROR, conformance, details: ['无可用于门禁的确定评价或数值评分'] };
  }

  if (evaluation.overallOutcome !== 'PASS') details.push('评价结论未通过');
  if (gate.minimumScore !== undefined && evaluation.overallScore < gate.minimumScore) details.push(`总分低于 ${gate.minimumScore}`);
  if (gate.requiredOutcome?.length && !gate.requiredOutcome.includes(evaluation.overallOutcome)) details.push('评价结论不满足门禁要求');

  return { passed: details.length === 0, code: details.length ? EXIT_CODES.POLICY_FAIL : EXIT_CODES.SUCCESS, conformance, details };
}
