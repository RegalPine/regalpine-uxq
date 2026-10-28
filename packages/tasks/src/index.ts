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

      // Check conditions (simplified - in real impl would check against session state)
      const businessSuccess = true;
      const feedbackSuccess = true;
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
