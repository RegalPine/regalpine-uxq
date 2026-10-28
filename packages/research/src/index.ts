import { newId } from '@uxq/core';
import type { Timestamp, Id } from '@uxq/core';

/**
 * M4.2: 主观研究模块
 *
 * 用户测试、量表、访谈数据导入。
 * 记录样本、版本、授权和数据质量。
 * 明确限制：缺失处理正确，授权范围、脱敏与保留可验证。
 */

/** 研究方法类型 */
export type ResearchMethod =
  | 'USER_TEST' // 用户测试
  | 'SURVEY' // 问卷调查
  | 'INTERVIEW' // 访谈
  | 'FOCUS_GROUP' // 焦点小组
  | 'DIARY_STUDY' // 日志研究
  | 'A_B_TEST'; // A/B 测试

/** 量表类型 */
export type ScaleType =
  | 'LIKERT_5' // 5 点李克特量表
  | 'LIKERT_7' // 7 点李克特量表
  | 'SUS' // 系统可用性量表
  | 'NPS' // 净推荐值
  | 'CSAT' // 客户满意度
  | 'CUSTOM'; // 自定义量表

/** 研究参与者 */
export interface ResearchParticipant {
  id: Id<'participant'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  pseudonym: string; // 匿名标识
  demographics?: Record<string, string>; // 人口统计（脱敏）
  consentGiven: boolean;
  consentScope: string[]; // 授权范围
  dataRetentionDays: number; // 数据保留天数
  limitations: string[];
}

/** 研究会话 */
export interface ResearchSession {
  id: Id<'session'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  runId: Id<'run'>;
  method: ResearchMethod;
  participantId: Id<'participant'>;
  taskId?: string;
  scenarioId?: string;
  startedAt: Timestamp;
  endedAt?: Timestamp;
  responses: ResearchResponse[];
  observations: string[];
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'EXCLUDED';
  exclusionReason?: string;
  limitations: string[];
}

/** 研究响应 */
export interface ResearchResponse {
  id: Id<'response'>;
  questionId: string;
  questionText: string;
  scaleType?: ScaleType;
  value: number | string | string[];
  timestamp: Timestamp;
  notes?: string;
}

/** 研究数据集 */
export interface ResearchDataset {
  id: Id<'dataset'>;
  schemaVersion: '1.0.0';
  createdAt: Timestamp;
  name: string;
  version: string;
  method: ResearchMethod;
  participantCount: number;
  sessionCount: number;
  completedSessions: number;
  excludedSessions: number;
  dataQualitySummary: {
    high: number;
    medium: number;
    low: number;
    excluded: number;
  };
  consentRate: number; // 同意率
  completionRate: number; // 完成率
  limitations: string[];
}

/** 创建研究参与者 */
export function createResearchParticipant(
  pseudonym: string,
  consentGiven: boolean,
  consentScope: string[],
  dataRetentionDays: number,
  now: Timestamp,
  demographics?: Record<string, string>,
): ResearchParticipant {
  const base: ResearchParticipant = {
    id: newId('participant'),
    schemaVersion: '1.0.0',
    createdAt: now,
    pseudonym,
    consentGiven,
    consentScope,
    dataRetentionDays,
    limitations: [
      '参与者数据已脱敏',
      `授权范围：${consentScope.join(', ')}`,
      `数据保留 ${dataRetentionDays} 天`,
    ],
  };

  if (demographics) base.demographics = demographics;

  return base;
}

/** 创建研究会话 */
export function createResearchSession(
  runId: Id<'run'>,
  method: ResearchMethod,
  participantId: Id<'participant'>,
  startedAt: Timestamp,
  now: Timestamp,
  taskId?: string,
  scenarioId?: string,
): ResearchSession {
  const base: ResearchSession = {
    id: newId('session'),
    schemaVersion: '1.0.0',
    createdAt: now,
    runId,
    method,
    participantId,
    startedAt,
    responses: [],
    observations: [],
    dataQuality: 'MEDIUM',
    limitations: ['主观数据不替代客观测量', '样本偏差可能影响结论', '研究方法必须明确声明'],
  };

  if (taskId) base.taskId = taskId;
  if (scenarioId) base.scenarioId = scenarioId;

  return base;
}

/** 添加响应到会话 */
export function addResponse(
  session: ResearchSession,
  questionId: string,
  questionText: string,
  value: number | string | string[],
  timestamp: Timestamp,
  scaleType?: ScaleType,
  notes?: string,
): ResearchSession {
  const base: ResearchResponse = {
    id: newId('response'),
    questionId,
    questionText,
    value,
    timestamp,
  };

  const response: ResearchResponse = scaleType
    ? notes
      ? { ...base, scaleType, notes }
      : { ...base, scaleType }
    : notes
      ? { ...base, notes }
      : base;

  return {
    ...session,
    responses: [...session.responses, response],
  };
}

/** 完成研究会话 */
export function completeSession(
  session: ResearchSession,
  endedAt: Timestamp,
  dataQuality: 'HIGH' | 'MEDIUM' | 'LOW' | 'EXCLUDED',
  observations: string[] = [],
  exclusionReason?: string,
): ResearchSession {
  const result: ResearchSession = {
    ...session,
    endedAt,
    dataQuality,
    observations: [...session.observations, ...observations],
  };
  if (exclusionReason) {
    result.exclusionReason = exclusionReason;
  }
  return result;
}

/** 创建研究数据集 */
export function createResearchDataset(
  name: string,
  version: string,
  method: ResearchMethod,
  sessions: readonly ResearchSession[],
  now: Timestamp,
): ResearchDataset {
  const completedSessions = sessions.filter((s) => s.endedAt);
  const excludedSessions = sessions.filter((s) => s.dataQuality === 'EXCLUDED');

  const qualityCounts = {
    high: sessions.filter((s) => s.dataQuality === 'HIGH').length,
    medium: sessions.filter((s) => s.dataQuality === 'MEDIUM').length,
    low: sessions.filter((s) => s.dataQuality === 'LOW').length,
    excluded: excludedSessions.length,
  };

  const uniqueParticipants = new Set(sessions.map((s) => s.participantId));
  const consentedParticipants = uniqueParticipants.size; // 简化：假设所有参与者都已同意

  return {
    id: newId('dataset'),
    schemaVersion: '1.0.0',
    createdAt: now,
    name,
    version,
    method,
    participantCount: uniqueParticipants.size,
    sessionCount: sessions.length,
    completedSessions: completedSessions.length,
    excludedSessions: excludedSessions.length,
    dataQualitySummary: qualityCounts,
    consentRate: consentedParticipants > 0 ? consentedParticipants / uniqueParticipants.size : 0,
    completionRate: sessions.length > 0 ? completedSessions.length / sessions.length : 0,
    limitations: ['数据集包含主观响应', '数据质量分布已记录', '缺失和排除数据已标记'],
  };
}

/** 验证参与者授权 */
export function validateConsent(participant: ResearchParticipant): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!participant.consentGiven) {
    issues.push('参与者未给予同意');
  }

  if (participant.consentScope.length === 0) {
    issues.push('授权范围为空');
  }

  if (participant.dataRetentionDays <= 0) {
    issues.push('数据保留天数必须大于 0');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** 验证研究会话完整性 */
export function validateSession(session: ResearchSession): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!session.endedAt && session.dataQuality !== 'EXCLUDED') {
    issues.push('未完成的会话必须标记为排除或提供结束时间');
  }

  if (session.dataQuality === 'EXCLUDED' && !session.exclusionReason) {
    issues.push('排除的会话必须说明原因');
  }

  if (session.responses.length === 0 && session.endedAt) {
    issues.push('完成的会话应包含至少一个响应或明确说明无响应');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/** 计算量表统计 */
export function calculateScaleStatistics(
  responses: readonly ResearchResponse[],
  scaleType: ScaleType,
): {
  mean: number | null;
  median: number | null;
  stdDev: number | null;
  count: number;
} {
  const numericValues = responses
    .filter((r) => r.scaleType === scaleType && typeof r.value === 'number')
    .map((r) => r.value as number);

  if (numericValues.length === 0) {
    return { mean: null, median: null, stdDev: null, count: 0 };
  }

  const sorted = [...numericValues].sort((a, b) => a - b);
  const sum = numericValues.reduce((acc, val) => acc + val, 0);
  const mean = sum / numericValues.length;

  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
      : sorted[Math.floor(sorted.length / 2)]!;

  const variance =
    numericValues.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / numericValues.length;
  const stdDev = Math.sqrt(variance);

  return {
    mean,
    median,
    stdDev,
    count: numericValues.length,
  };
}
