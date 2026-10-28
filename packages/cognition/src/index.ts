import { newId, digest } from '@uxq/core';
import type { Timestamp, Id } from '@uxq/core';

/**
 * M4.1: 认知与信息理解模块
 *
 * 提供认知负荷代理指标和结构化人工评审输入。
 * 明确适用情境与限制：代理指标不冒充真实理解或心理测量。
 */

/** 认知负荷代理指标类型 */
export type CognitiveLoadMetric =
  | 'TASK_TIME' // 任务完成时间
  | 'ERROR_RATE' // 错误率
  | 'NAVIGATION_DEPTH' // 导航深度
  | 'BACK_TRACKS' // 回溯次数
  | 'PAUSE_DURATION' // 暂停时长
  | 'INTERACTION_COUNT'; // 交互次数

/** 认知负荷评估结果 */
export interface CognitiveLoadAssessment {
  id: Id<'cognitive'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  runId: Id<'run'>;
  entityId: string;
  scenarioId: string;
  metrics: Record<CognitiveLoadMetric, number | null>;
  overallLoad: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  limitations: string[];
  notes?: string;
}

/** 结构化人工评审输入 */
export interface HumanReviewInput {
  id: Id<'review'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  runId: Id<'run'>;
  reviewerId: string;
  reviewType: 'EXPERT' | 'PEER' | 'USER';
  findings: ReviewFinding[];
  recommendations: string[];
  approved: boolean;
  limitations: string[];
}

export interface ReviewFinding {
  id: Id<'finding'>;
  category: 'USABILITY' | 'ACCESSIBILITY' | 'CONTENT' | 'VISUAL' | 'INTERACTION';
  severity: 'S1' | 'S2' | 'S3' | 'S4';
  description: string;
  evidence?: string;
  relatedFindingIds: Id<'finding'>[];
}

/** 创建认知负荷评估 */
export function createCognitiveLoadAssessment(
  runId: Id<'run'>,
  entityId: string,
  scenarioId: string,
  metrics: Partial<Record<CognitiveLoadMetric, number | null>>,
  now: Timestamp,
  notes?: string,
): CognitiveLoadAssessment {
  const completeMetrics: Record<CognitiveLoadMetric, number | null> = {
    TASK_TIME: null,
    ERROR_RATE: null,
    NAVIGATION_DEPTH: null,
    BACK_TRACKS: null,
    PAUSE_DURATION: null,
    INTERACTION_COUNT: null,
    ...metrics,
  };

  const overallLoad = calculateOverallLoad(completeMetrics);
  const confidence = calculateConfidence(completeMetrics);

  const base: CognitiveLoadAssessment = {
    id: newId('cognitive'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    entityId,
    scenarioId,
    metrics: completeMetrics,
    overallLoad,
    confidence,
    limitations: [
      '代理指标不冒充真实理解或心理测量',
      '仅基于可观测行为推断',
      '不适用于临床或诊断用途',
    ],
  };

  if (notes) base.notes = notes;

  return base;
}

/** 创建结构化人工评审输入 */
export function createHumanReviewInput(
  runId: Id<'run'>,
  reviewerId: string,
  reviewType: 'EXPERT' | 'PEER' | 'USER',
  findings: ReviewFinding[],
  recommendations: string[],
  approved: boolean,
  now: Timestamp,
): HumanReviewInput {
  return {
    id: newId('review'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    reviewerId,
    reviewType,
    findings,
    recommendations,
    approved,
    limitations: [
      '评审输入为主观判断，不替代客观测量',
      '评审者资质和经验影响结果可靠性',
      '评审范围和方法必须明确声明',
    ],
  };
}

/** 计算总体认知负荷 */
function calculateOverallLoad(
  metrics: Record<CognitiveLoadMetric, number | null>,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN' {
  const values = Object.values(metrics).filter((v): v is number => v !== null);

  if (values.length === 0) return 'UNKNOWN';

  // 简化的启发式规则
  const errorRate = metrics.ERROR_RATE;
  const backTracks = metrics.BACK_TRACKS;
  const taskTime = metrics.TASK_TIME;

  if (errorRate !== null && errorRate > 0.3) return 'HIGH';
  if (backTracks !== null && backTracks > 5) return 'HIGH';
  if (errorRate !== null && errorRate > 0.1) return 'MEDIUM';
  if (backTracks !== null && backTracks > 2) return 'MEDIUM';

  return 'LOW';
}

/** 计算置信度 */
function calculateConfidence(
  metrics: Record<CognitiveLoadMetric, number | null>,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  const measuredCount = Object.values(metrics).filter((v) => v !== null).length;
  const totalCount = Object.keys(metrics).length;
  const ratio = measuredCount / totalCount;

  if (ratio >= 0.8) return 'HIGH';
  if (ratio >= 0.5) return 'MEDIUM';
  return 'LOW';
}

/** 验证认知负荷评估的完整性 */
export function validateCognitiveAssessment(assessment: CognitiveLoadAssessment): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (assessment.entityId.trim().length === 0) {
    issues.push('实体 ID 不能为空');
  }

  if (assessment.scenarioId.trim().length === 0) {
    issues.push('场景 ID 不能为空');
  }

  const measuredCount = Object.values(assessment.metrics).filter((v) => v !== null).length;
  if (measuredCount === 0) {
    issues.push('至少需要一个测量指标');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** 验证人工评审输入的完整性 */
export function validateHumanReview(review: HumanReviewInput): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (review.reviewerId.trim().length === 0) {
    issues.push('评审者 ID 不能为空');
  }

  if (review.findings.length === 0 && review.approved) {
    issues.push('批准的评审必须包含至少一个发现或明确说明无问题');
  }

  for (const finding of review.findings) {
    if (finding.description.trim().length === 0) {
      issues.push(`发现 ${finding.id} 的描述不能为空`);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
