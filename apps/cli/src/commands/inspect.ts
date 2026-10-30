/** inspect 命令 — 查看运行详情。 */

import { UxqError } from '@uxq/core';
import { openLocalStore, latestSnapshot } from '@uxq/execution';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import type { CommandContext, CommandResult } from './types.js';

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const runId = ctx.positional[0];
  if (!runId) throw new UxqError('MISSING_RUN_ID', 'inspect 需要运行 ID', 'INPUT');

  const store = await openLocalStore(ctx.options.root);
  const stored = await store.loadRun(runId);
  const subCommand = ctx.positional[1];

  if (!subCommand) {
    return {
      code: EXIT_CODES.SUCCESS,
      response: buildResponse(VERSION, 'inspect', {
        status: 'COMPLETED',
        data: {
          run: stored.run,
          context: stored.context,
          steps: stored.steps.map((s) => ({ stepId: s.stepId, status: s.status })),
          attempts: stored.attempts.length,
          events: stored.events.length,
          metrics: stored.metrics.length,
          rules: stored.rules.length,
          evidence: stored.evidence.length,
          evaluations: stored.evaluations,
          manifest: stored.manifest,
          hint: '使用 inspect <run-id> <evidence|metrics|rules|steps|evaluation> 查看详情',
        },
      }),
    };
  }

  switch (subCommand) {
    case 'evidence':
      return {
        code: EXIT_CODES.SUCCESS,
        response: buildResponse(VERSION, 'inspect', {
          status: 'COMPLETED',
          data: {
            runId,
            evidence: stored.evidence.map((e) => ({
              id: e.id,
              sourceCategory: e.sourceCategory,
              materialType: e.materialType,
              sourceMethod: e.sourceMethod,
              lifecycle: e.lifecycle,
              validity: e.validity,
              summary: e.summary,
              observedAt: e.observedAt,
              privacy: e.privacy,
              limitations: e.limitations,
            })),
            count: stored.evidence.length,
          },
        }),
      };

    case 'metrics':
      return {
        code: EXIT_CODES.SUCCESS,
        response: buildResponse(VERSION, 'inspect', {
          status: 'COMPLETED',
          data: {
            runId,
            metrics: stored.metrics.map((m) => ({
              id: m.id,
              metricId: m.metricId,
              status: m.status,
              ...(m.status === 'MEASURED' ? { value: m.value } : { reason: m.reason }),
              sampleCount: m.sampleCount,
              excludedSampleIds: m.excludedSampleIds,
              evidenceIds: m.evidenceIds,
              limitations: m.limitations,
            })),
            count: stored.metrics.length,
          },
        }),
      };

    case 'rules':
      return {
        code: EXIT_CODES.SUCCESS,
        response: buildResponse(VERSION, 'inspect', {
          status: 'COMPLETED',
          data: {
            runId,
            rules: stored.rules.map((r) => ({
              id: r.id,
              ruleId: r.ruleId,
              executionStatus: r.executionStatus,
              outcome: r.outcome,
              evidenceIds: r.evidenceIds,
              reason: r.reason,
            })),
            count: stored.rules.length,
          },
        }),
      };

    case 'steps':
      return {
        code: EXIT_CODES.SUCCESS,
        response: buildResponse(VERSION, 'inspect', {
          status: 'COMPLETED',
          data: {
            runId,
            steps: stored.steps.map((s) => ({
              stepId: s.stepId,
              status: s.status,
              attemptIds: s.attemptIds,
              startedAt: s.startedAt,
              endedAt: s.endedAt,
              outputIds: s.outputIds,
            })),
            attempts: stored.attempts.map((a) => ({
              stepId: a.stepId,
              number: a.number,
              status: a.status,
              startedAt: a.startedAt,
              endedAt: a.endedAt,
              durationMs: a.durationMs,
            })),
            count: stored.steps.length,
          },
        }),
      };

    case 'evaluation':
      return {
        code: EXIT_CODES.SUCCESS,
        response: buildResponse(VERSION, 'inspect', {
          status: 'COMPLETED',
          data: {
            runId,
            evaluations: stored.evaluations,
            definition: {
              id: stored.definition.id,
              name: stored.definition.name,
              version: stored.definition.definitionVersion,
              dimensions: stored.definition.dimensions,
              methods: stored.definition.methods,
              metricCount: stored.definition.metrics.length,
              ruleCount: stored.definition.rules.length,
            },
            policy: latestSnapshot(stored).policy,
            snapshot: latestSnapshot(stored),
          },
        }),
      };

    default:
      throw new UxqError(
        'INVALID_SUBCOMMAND',
        `未知检查子命令：${subCommand}，可用：evidence|metrics|rules|steps|evaluation`,
        'INPUT',
      );
  }
}
