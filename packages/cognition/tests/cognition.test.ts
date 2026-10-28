import { describe, expect, it } from 'vitest';
import type { Timestamp, Id } from '@uxq/core';
import { newId } from '@uxq/core';
import {
  createCognitiveLoadAssessment,
  createHumanReviewInput,
  validateCognitiveAssessment,
  validateHumanReview,
} from '@uxq/cognition';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;
const runId = newId('run') as Id<'run'>;

describe('认知负荷评估', () => {
  it('创建基础评估', () => {
    const assessment = createCognitiveLoadAssessment(
      runId,
      'entity-1',
      'scenario-1',
      {
        TASK_TIME: 120,
        ERROR_RATE: 0.1,
        BACK_TRACKS: 2,
      },
      fixedTime,
    );

    expect(assessment.id).toMatch(/^cognitive-/);
    expect(assessment.runId).toBe(runId);
    expect(assessment.entityId).toBe('entity-1');
    expect(assessment.scenarioId).toBe('scenario-1');
    expect(assessment.metrics.TASK_TIME).toBe(120);
    expect(assessment.metrics.ERROR_RATE).toBe(0.1);
    expect(assessment.metrics.BACK_TRACKS).toBe(2);
    expect(assessment.overallLoad).toBe('LOW');  // 0.1 和 2 都不超过 MEDIUM 阈值
    expect(assessment.confidence).toBe('MEDIUM');  // 3/6 = 0.5
    expect(assessment.limitations).toContain('代理指标不冒充真实理解或心理测量');
  });

  it('高错误率判定为高认知负荷', () => {
    const assessment = createCognitiveLoadAssessment(
      runId,
      'entity-1',
      'scenario-1',
      {
        ERROR_RATE: 0.4,
      },
      fixedTime,
    );

    expect(assessment.overallLoad).toBe('HIGH');
  });

  it('多次回溯判定为高认知负荷', () => {
    const assessment = createCognitiveLoadAssessment(
      runId,
      'entity-1',
      'scenario-1',
      {
        BACK_TRACKS: 8,
      },
      fixedTime,
    );

    expect(assessment.overallLoad).toBe('HIGH');
  });

  it('完整测量提高置信度', () => {
    const assessment = createCognitiveLoadAssessment(
      runId,
      'entity-1',
      'scenario-1',
      {
        TASK_TIME: 120,
        ERROR_RATE: 0.1,
        NAVIGATION_DEPTH: 3,
        BACK_TRACKS: 2,
        PAUSE_DURATION: 5,
        INTERACTION_COUNT: 20,
      },
      fixedTime,
    );

    expect(assessment.confidence).toBe('HIGH');
  });

  it('验证完整性检查', () => {
    const assessment = createCognitiveLoadAssessment(
      runId,
      '',
      'scenario-1',
      {},
      fixedTime,
    );

    const result = validateCognitiveAssessment(assessment);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('实体 ID 不能为空');
    expect(result.issues).toContain('至少需要一个测量指标');
  });
});

describe('人工评审输入', () => {
  it('创建专家评审', () => {
    const review = createHumanReviewInput(
      runId,
      'reviewer-1',
      'EXPERT',
      [
        {
          id: newId('finding') as Id<'finding'>,
          category: 'USABILITY',
          severity: 'S2',
          description: '按钮位置不够明显',
          relatedFindingIds: [],
        },
      ],
      ['将按钮移至更显眼的位置'],
      true,
      fixedTime,
    );

    expect(review.id).toMatch(/^review-/);
    expect(review.reviewerId).toBe('reviewer-1');
    expect(review.reviewType).toBe('EXPERT');
    expect(review.findings).toHaveLength(1);
    expect(review.recommendations).toHaveLength(1);
    expect(review.approved).toBe(true);
    expect(review.limitations).toContain('评审输入为主观判断，不替代客观测量');
  });

  it('验证评审完整性', () => {
    const review = createHumanReviewInput(
      runId,
      '',
      'PEER',
      [
        {
          id: newId('finding') as Id<'finding'>,
          category: 'USABILITY',
          severity: 'S2',
          description: '',
          relatedFindingIds: [],
        },
      ],
      [],
      true,
      fixedTime,
    );

    const result = validateHumanReview(review);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('评审者 ID 不能为空');
    expect(result.issues.some(i => i.includes('描述不能为空'))).toBe(true);
  });

  it('批准的评审必须有发现', () => {
    const review = createHumanReviewInput(
      runId,
      'reviewer-1',
      'USER',
      [],
      [],
      true,
      fixedTime,
    );

    const result = validateHumanReview(review);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('批准的评审'))).toBe(true);
  });
});
