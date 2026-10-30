/** verify 命令 — 复测验证。 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { UxqError, systemClock, digest } from '@uxq/core';
import { parseContract, isEvidenceUsable, ruleMetricIds } from '@uxq/contracts';
import { openLocalStore, latestSnapshot } from '@uxq/execution';
import { checkComparability } from '@uxq/regression';
import {
  createVerificationPlan,
  createVerificationResult,
} from '@uxq/diagnostic';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const [action, id] = ctx.positional;

  if (!id) {
    throw new UxqError(
      'MISSING_ID',
      'verify plan <run-id> --finding-id <id>；verify result <plan-id> --source-run <new-run-id>',
      'INPUT',
    );
  }

  parseContract('Id', id);
  const dir = join(ctx.options.root, 'verifications');
  const store = await openLocalStore(ctx.options.root);

  if (action === 'plan') {
    if (!ctx.options.findingId) {
      throw new UxqError('MISSING_FINDING', 'verify plan 需要 --finding-id', 'INPUT');
    }

    const stored = await store.loadRun(id);
    const snapshot = latestSnapshot(stored);
    const finding = snapshot.findings.find((f) => f.id === ctx.options.findingId);

    if (!finding) {
      throw new UxqError('FINDING_NOT_FOUND', '该运行中不存在指定 Finding', 'INPUT');
    }

    const signals = snapshot.signals.filter((s) => finding.diagnosticSignalIds.includes(s.id));
    const sourceIds = new Set(signals.flatMap((s) => s.sourceResultIds));
    const rules = stored.rules.filter((r) => sourceIds.has(r.id)).map((r) => r.ruleId);
    const metrics = [
      ...new Set([
        ...stored.metrics.filter((m) => sourceIds.has(m.id)).map((m) => m.metricId),
        ...stored.definition.rules.filter((r) => rules.includes(r.id)).flatMap((r) => ruleMetricIds(r.expression)),
      ]),
    ];

    const plan = createVerificationPlan(
      [finding.id],
      [],
      id,
      stored.definition,
      rules,
      metrics,
      ['关联指标完成实测、关联规则全部通过且运行成功；使用相同定义与执行配置'],
      false,
      systemClock.now(),
    );

    parseContract('VerificationPlan', plan);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${plan.id}.json`), JSON.stringify(plan, null, 2), { encoding: 'utf8', flag: 'wx' });

    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'verify', {
        status: 'COMPLETED',
        data: {
          verificationPlan: plan,
          message: '验证计划已保存；请重新 evaluate 后使用新运行生成 result',
        },
      }),
    };
  }

  if (action === 'result') {
    if (!ctx.options.sourceRun) {
      throw new UxqError('MISSING_RUN', 'verify result 需要 --source-run 指向新的实际运行', 'INPUT');
    }

    const plan = parseContract(
      'VerificationPlan',
      JSON.parse(await readFile(join(dir, `${id}.json`), 'utf8')) as unknown,
    );

    const baseline = await store.loadRun(plan.baselineRunId);
    const current = await store.loadRun(ctx.options.sourceRun);

    const shape = (stored: typeof baseline) => ({
      planDigest: stored.plan.planDigest,
      definitionId: stored.definition.id,
      definitionVersion: stored.definition.definitionVersion,
      policyId: latestSnapshot(stored).policy.id,
      policyVersion: latestSnapshot(stored).policy.version,
      viewport: stored.context.profile.viewport,
      ...(stored.context.browserVersion ? { browserVersion: stored.context.browserVersion } : {}),
    });

    const comparison = checkComparability(shape(baseline), shape(current));
    const sameDefinition = digest(current.definition) === digest(plan.definition);
    const fresh = current.run.id !== baseline.run.id && Date.parse(current.run.createdAt) >= Date.parse(plan.createdAt);
    const samePolicy = latestSnapshot(baseline).evaluation.policyDigest === latestSnapshot(current).evaluation.policyDigest;
    const comparable = sameDefinition && fresh && samePolicy && comparison.comparability === 'COMPARABLE';

    const now = systemClock.now();
    const metrics = plan.requiredMetricIds.map((mid) => current.metrics.find((m) => m.metricId === mid));
    const rules = plan.requiredRuleIds.map((rid) => current.rules.find((r) => r.ruleId === rid));
    const evidenceIds = [
      ...new Set([
        ...metrics.flatMap((m) => m?.evidenceIds ?? []),
        ...rules.flatMap((r) => r?.evidenceIds ?? []),
      ]),
    ];

    const validEvidence = evidenceIds.length > 0 && evidenceIds.every((eid) =>
      current.evidence.some((e) => e.id === eid && isEvidenceUsable(e, now, 'VERIFICATION')),
    );

    for (const evidence of current.evidence.filter((e) => evidenceIds.includes(e.id))) {
      if (evidence.artifact) await store.readArtifact(current.run.id, evidence.artifact);
    }

    const result = createVerificationResult(
      plan.id,
      plan.criteriaDigest,
      plan.findingIds,
      comparable ? 'COMPARABLE' : 'NOT_COMPARABLE',
      now,
      current.run.id,
      evidenceIds,
    );

    result.startedAt = now;
    result.endedAt = now;
    result.status = !comparable
      ? 'BLOCKED'
      : current.run.status !== 'COMPLETED' || rules.some((r) => r?.outcome === 'FAIL')
        ? 'FAILED'
        : metrics.every((m) => m?.status === 'MEASURED') &&
            rules.every((r) => r?.executionStatus === 'COMPLETED' && r.outcome === 'PASS') &&
            validEvidence
          ? 'PASSED'
          : 'INCONCLUSIVE';

    result.reason = result.status === 'PASSED'
      ? '新运行中的关联指标、规则和证据满足验证条件'
      : '复测失败、条件不可比或证据不足';

    parseContract('VerificationResult', result);
    await writeFile(join(dir, `${result.id}.json`), JSON.stringify(result, null, 2), { encoding: 'utf8', flag: 'wx' });

    const code = result.status === 'PASSED'
      ? EXIT_CODES.SUCCESS
      : result.status === 'FAILED'
        ? EXIT_CODES.POLICY_FAIL
        : EXIT_CODES.EXECUTION_ERROR;

    return {
      code,
      response: buildResponse(VERSION, 'verify', {
        status: 'COMPLETED',
        data: { verificationResult: result },
      }),
    };
  }

  throw new UxqError('INVALID_ACTION', 'verify 仅支持 plan|result', 'INPUT');
}
