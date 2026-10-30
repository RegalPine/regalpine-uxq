import { newId, systemClock } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type { TaskDefinition, TaskExecution, ExecutionProfile, ErrorRecord } from '@uxq/contracts';
import type { BrowserAdapter } from '@uxq/browser';
import { executeActions } from '@uxq/browser';

export interface TaskRunner {
  runTask(
    task: TaskDefinition,
    profile: ExecutionProfile,
    runId: string,
    stepId: string,
    attemptId: string,
  ): Promise<TaskExecution>;
}

export class BrowserTaskRunner implements TaskRunner {
  constructor(
    private readonly adapter: BrowserAdapter,
    private readonly clock: Clock = systemClock,
  ) {}

  async runTask(
    task: TaskDefinition,
    profile: ExecutionProfile,
    runId: string,
    stepId: string,
    attemptId: string,
  ): Promise<TaskExecution> {
    const startedAt = this.clock.now();
    const session = await this.adapter.launch(profile);

    try {
      if (task.sideEffect === 'WRITE' && (!task.authorized || !profile.allowSideEffects)) {
        throw new Error('写入任务同时需要任务授权与 allowSideEffects');
      }
      const { observations: _observations, evidence } = await executeActions(
        session,
        task.actions,
        runId,
        stepId,
        attemptId,
        this.clock,
      );

      const endedAt = this.clock.now();
      const durationMs = Date.parse(endedAt) - Date.parse(startedAt);

      if (!session.checkCondition) throw new Error('浏览器适配器不支持任务条件核验');
      const businessSuccess = (await Promise.all(task.businessConditions.map((condition) => session.checkCondition!(condition)))).every(Boolean);
      const feedbackSuccess = (await Promise.all(task.feedbackConditions.map((condition) => session.checkCondition!(condition)))).every(Boolean);
      session.assertHealthy?.();
      const outcome: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILURE' | 'ABORTED' | 'TIMEOUT' | 'INVALID' =
        businessSuccess && feedbackSuccess ? 'SUCCESS' : 'FAILURE';

      const execution: TaskExecution = {
        id: newId('task'),
        schemaVersion: '1.0.0',
        createdAt: this.clock.now(),
        runId,
        stepId,
        attemptId,
        taskId: task.id,
        taskVersion: task.version,
        outcome,
        businessSuccess,
        feedbackSuccess,
        startedAt,
        endedAt,
        durationMs,
        method: 'AUTOMATED',
        evidenceIds: evidence.map((e: { id: string }) => e.id),
        errors: [],
        limitations: ['自动化任务不能代表真实用户成功'],
      };

      return execution;
    } catch (error) {
      const endedAt = this.clock.now();
      const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
      const errRecord: ErrorRecord = {
        code: 'TASK_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : '任务执行失败',
        category: 'EXECUTION',
      };

      return {
        id: newId('task'),
        schemaVersion: '1.0.0',
        createdAt: this.clock.now(),
        runId,
        stepId,
        attemptId,
        taskId: task.id,
        taskVersion: task.version,
        outcome: 'FAILURE',
        businessSuccess: false,
        feedbackSuccess: false,
        startedAt,
        endedAt,
        durationMs,
        method: 'AUTOMATED',
        evidenceIds: [],
        errors: [errRecord],
        limitations: ['自动化任务不能代表真实用户成功'],
      };
    } finally {
      await session.close();
    }
  }
}

/** 简单任务执行器，不需要浏览器。 */
export class SimpleTaskRunner implements TaskRunner {
  constructor(private readonly clock: Clock = systemClock) {}

  async runTask(
    task: TaskDefinition,
    _profile: ExecutionProfile,
    runId: string,
    stepId: string,
    attemptId: string,
  ): Promise<TaskExecution> {
    const startedAt = this.clock.now();
    const endedAt = this.clock.now();
    return {
      id: newId('task'),
      schemaVersion: '1.0.0',
      createdAt: this.clock.now(),
      runId,
      stepId,
      attemptId,
      taskId: task.id,
      taskVersion: task.version,
      outcome: 'SUCCESS',
      businessSuccess: true,
      feedbackSuccess: true,
      startedAt,
      endedAt,
      durationMs: Date.parse(endedAt) - Date.parse(startedAt),
      method: 'AUTOMATED',
      evidenceIds: [],
      errors: [],
      limitations: ['自动化任务不能代表真实用户成功'],
    };
  }
}
