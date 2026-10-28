import { describe, expect, it } from 'vitest';
import type { Timestamp, Id } from '@uxq/core';
import { newId } from '@uxq/core';
import {
  createResearchParticipant,
  createResearchSession,
  addResponse,
  completeSession,
  createResearchDataset,
  validateConsent,
  validateSession,
  calculateScaleStatistics,
} from '@uxq/research';

const fixedTime = '2025-01-01T00:00:00Z' as Timestamp;
const runId = newId('run') as Id<'run'>;

describe('研究参与者', () => {
  it('创建参与者', () => {
    const participant = createResearchParticipant(
      'P001',
      true,
      ['数据收集', '分析'],
      90,
      fixedTime,
      { age: '25-34', experience: '5年' },
    );

    expect(participant.id).toMatch(/^participant-/);
    expect(participant.pseudonym).toBe('P001');
    expect(participant.consentGiven).toBe(true);
    expect(participant.consentScope).toContain('数据收集');
    expect(participant.dataRetentionDays).toBe(90);
    expect(participant.limitations.some(l => l.includes('脱敏'))).toBe(true);
  });

  it('验证授权', () => {
    const participant = createResearchParticipant(
      'P002',
      false,
      [],
      0,
      fixedTime,
    );

    const result = validateConsent(participant);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('参与者未给予同意');
    expect(result.issues).toContain('授权范围为空');
    expect(result.issues).toContain('数据保留天数必须大于 0');
  });
});

describe('研究会话', () => {
  it('创建和完成会话', () => {
    const participant = createResearchParticipant('P001', true, ['测试'], 30, fixedTime);
    let session = createResearchSession(runId, 'USER_TEST', participant.id, fixedTime, fixedTime, 'task-1');
    
    session = addResponse(session, 'q1', '您觉得这个功能有用吗？', 4, fixedTime, 'LIKERT_5');
    session = addResponse(session, 'q2', '您会推荐这个产品吗？', 8, fixedTime, 'NPS');
    
    session = completeSession(session, fixedTime, 'HIGH', ['参与者表现积极']);

    expect(session.id).toMatch(/^session-/);
    expect(session.method).toBe('USER_TEST');
    expect(session.responses).toHaveLength(2);
    expect(session.dataQuality).toBe('HIGH');
    expect(session.observations).toContain('参与者表现积极');
  });

  it('验证会话完整性', () => {
    const participant = createResearchParticipant('P001', true, ['测试'], 30, fixedTime);
    const session = createResearchSession(runId, 'SURVEY', participant.id, fixedTime, fixedTime);
    
    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('未完成'))).toBe(true);
  });

  it('排除会话需要原因', () => {
    const participant = createResearchParticipant('P001', true, ['测试'], 30, fixedTime);
    let session = createResearchSession(runId, 'INTERVIEW', participant.id, fixedTime, fixedTime);
    session = completeSession(session, fixedTime, 'EXCLUDED');
    
    const result = validateSession(session);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain('排除的会话必须说明原因');
  });
});

describe('研究数据集', () => {
  it('创建数据集', () => {
    const p1 = createResearchParticipant('P001', true, ['测试'], 30, fixedTime);
    const p2 = createResearchParticipant('P002', true, ['测试'], 30, fixedTime);
    
    let s1 = createResearchSession(runId, 'USER_TEST', p1.id, fixedTime, fixedTime);
    s1 = addResponse(s1, 'q1', '问题 1', 5, fixedTime, 'LIKERT_5');
    s1 = completeSession(s1, fixedTime, 'HIGH');
    
    let s2 = createResearchSession(runId, 'USER_TEST', p2.id, fixedTime, fixedTime);
    s2 = addResponse(s2, 'q1', '问题 1', 3, fixedTime, 'LIKERT_5');
    s2 = completeSession(s2, fixedTime, 'MEDIUM');
    
    const dataset = createResearchDataset('可用性测试', '1.0.0', 'USER_TEST', [s1, s2], fixedTime);

    expect(dataset.id).toMatch(/^dataset-/);
    expect(dataset.participantCount).toBe(2);
    expect(dataset.sessionCount).toBe(2);
    expect(dataset.completedSessions).toBe(2);
    expect(dataset.dataQualitySummary.high).toBe(1);
    expect(dataset.dataQualitySummary.medium).toBe(1);
    expect(dataset.completionRate).toBe(1);
  });
});

describe('量表统计', () => {
  it('计算李克特量表统计', () => {
    const responses = [
      { id: newId('response') as Id<'response'>, questionId: 'q1', questionText: 'Q1', value: 4, timestamp: fixedTime, scaleType: 'LIKERT_5' as const },
      { id: newId('response') as Id<'response'>, questionId: 'q1', questionText: 'Q1', value: 5, timestamp: fixedTime, scaleType: 'LIKERT_5' as const },
      { id: newId('response') as Id<'response'>, questionId: 'q1', questionText: 'Q1', value: 3, timestamp: fixedTime, scaleType: 'LIKERT_5' as const },
      { id: newId('response') as Id<'response'>, questionId: 'q1', questionText: 'Q1', value: 4, timestamp: fixedTime, scaleType: 'LIKERT_5' as const },
    ];

    const stats = calculateScaleStatistics(responses, 'LIKERT_5');
    
    expect(stats.count).toBe(4);
    expect(stats.mean).toBe(4);
    expect(stats.median).toBe(4);
    expect(stats.stdDev).toBeCloseTo(0.707, 2);
  });

  it('空响应返回 null', () => {
    const stats = calculateScaleStatistics([], 'SUS');
    
    expect(stats.count).toBe(0);
    expect(stats.mean).toBeNull();
    expect(stats.median).toBeNull();
    expect(stats.stdDev).toBeNull();
  });
});
