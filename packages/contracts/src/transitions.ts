import { cloneJson, invariant, parseTimestamp } from '@uxq/core';
import type {
  EvaluationRun,
  ExecutionStep,
  RunStatus,
  StepStatus,
  VerificationStatus,
} from './generated.js';
import { parseContract } from './registry.js';

const runTransitions: Record<RunStatus, readonly RunStatus[]> = {
  CREATED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'],
  COMPLETED: [],
  PARTIAL: [],
  FAILED: [],
  CANCELLED: [],
};
const stepTransitions: Record<StepStatus, readonly StepStatus[]> = {
  PENDING: ['RUNNING', 'SKIPPED', 'BLOCKED'],
  RUNNING: ['PASSED', 'FAILED', 'ERROR'],
  PASSED: [],
  FAILED: [],
  SKIPPED: [],
  BLOCKED: [],
  ERROR: [],
};
const verificationTransitions: Record<VerificationStatus, readonly VerificationStatus[]> = {
  PENDING: ['RUNNING', 'BLOCKED', 'CANCELLED'],
  RUNNING: ['PASSED', 'FAILED', 'INCONCLUSIVE', 'BLOCKED', 'CANCELLED'],
  PASSED: [],
  FAILED: [],
  INCONCLUSIVE: [],
  BLOCKED: [],
  CANCELLED: [],
};

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return runTransitions[from].includes(to);
}
export function canTransitionStep(from: StepStatus, to: StepStatus): boolean {
  return stepTransitions[from].includes(to);
}
export function canTransitionVerification(
  from: VerificationStatus,
  to: VerificationStatus,
): boolean {
  return verificationTransitions[from].includes(to);
}

export interface RunCommand {
  to: RunStatus;
  expectedRevision: number;
  at: string;
  reason: string;
  preflightPassed?: boolean;
  executionCommitted?: boolean;
}

export function transitionRun(input: EvaluationRun, command: RunCommand): EvaluationRun {
  const run = parseContract('EvaluationRun', input);
  parseTimestamp(command.at);
  invariant(
    run.revision === command.expectedRevision,
    'REVISION_CONFLICT',
    '运行版本已变化，拒绝过期回调',
  );
  invariant(
    canTransitionRun(run.status, command.to),
    'ILLEGAL_RUN_TRANSITION',
    '不允许该运行状态转换；终态重跑须创建新 Run',
  );
  invariant(command.reason.trim().length > 0, 'TRANSITION_REASON', '状态转换必须有原因');
  if (command.to === 'RUNNING')
    invariant(
      command.preflightPassed === true,
      'PREFLIGHT_REQUIRED',
      '运行开始前必须完成配置与环境预检',
    );
  const result = { ...run, status: command.to, revision: run.revision + 1 };
  if (command.to === 'RUNNING') result.startedAt = command.at;
  if (['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(command.to)) {
    result.endedAt = command.at;
    result.endReason = command.reason;
    result.executionCommitted = command.executionCommitted ?? false;
  }
  return parseContract('EvaluationRun', result);
}

export interface StepCommand {
  to: StepStatus;
  expectedRevision: number;
  at: string;
  reason: string;
  attemptId?: string;
  outputIds?: string[];
}

export function transitionStep(input: ExecutionStep, command: StepCommand): ExecutionStep {
  const step = parseContract('ExecutionStep', input);
  parseTimestamp(command.at);
  invariant(step.revision === command.expectedRevision, 'REVISION_CONFLICT', '步骤版本已变化');
  invariant(
    canTransitionStep(step.status, command.to),
    'ILLEGAL_STEP_TRANSITION',
    '不允许该步骤状态转换；重试必须在活动步骤内追加尝试',
  );
  invariant(command.reason.trim().length > 0, 'TRANSITION_REASON', '状态转换必须有原因');
  const result = {
    ...cloneJson(step),
    status: command.to,
    revision: step.revision + 1,
    reason: command.reason,
  };
  if (command.to === 'RUNNING') {
    invariant(command.attemptId, 'ATTEMPT_REQUIRED', '开始步骤必须登记首次尝试');
    result.startedAt = command.at;
    result.attemptIds.push(command.attemptId);
  } else result.endedAt = command.at;
  if (command.outputIds) result.outputIds = [...command.outputIds];
  return parseContract('ExecutionStep', result);
}
