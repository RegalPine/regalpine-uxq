import { describe, expect, it } from 'vitest';
import type { Evidence, EvidencePrivacy } from '@uxq/contracts';
import {
  createEvidence,
  redactJsonValue,
  redactEvidence,
  checkSharingCompliance,
} from '@uxq/evidence';

const NOW = '2026-01-15T10:00:00Z';

function privacy(overrides: Partial<EvidencePrivacy> = {}): EvidencePrivacy {
  return {
    classification: 'PUBLIC',
    redacted: false,
    allowedPurposes: ['EVALUATION', 'VERIFICATION', 'SHARING'],
    retentionUntil: '2027-01-01T00:00:00Z',
    ...overrides,
  };
}

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return createEvidence({
    runId: 'run-1',
    sourceCategory: 'E1',
    materialType: 'OBSERVATION',
    sourceMethod: 'test',
    summary: 'test evidence',
    content: { url: 'https://example.com', title: 'Test Page' },
    observedAt: NOW,
    privacy: privacy(),
    ...overrides,
  }) as Evidence;
}

/** 创建已验证的有效证据（用于合规测试） */
function validEvidence(overrides: Partial<Evidence> = {}): Evidence {
  const ev = evidence();
  return { ...ev, validity: 'VALID', lifecycle: 'VALIDATED', ...overrides } as Evidence;
}

// ─── redactJsonValue ──────────────────────────────────────

describe('redactJsonValue', () => {
  it('保留非敏感字符串', () => {
    expect(redactJsonValue('hello')).toBe('hello');
    expect(redactJsonValue(42)).toBe(42);
    expect(redactJsonValue(true)).toBe(true);
    expect(redactJsonValue(null)).toBe(null);
  });

  it('脱敏敏感键名对应的值', () => {
    const input = { username: 'alice', password: 'secret123', token: 'abc-def' };
    const result = redactJsonValue(input) as Record<string, unknown>;
    expect(result['username']).toBe('alice');
    expect(result['password']).toBe('[REDACTED]');
    expect(result['token']).toBe('[REDACTED]');
  });

  it('脱敏含敏感模式的字符串值', () => {
    const result = redactJsonValue('Bearer eyJhbGciOiJIUzI1NiJ9.test.sig');
    expect(result).toBe('[REDACTED]');
  });

  it('递归脱敏嵌套对象', () => {
    const input = {
      page: { url: 'https://example.com' },
      credentials: { apiKey: 'sk-1234567890abcdef' },
    };
    const result = redactJsonValue(input) as Record<string, unknown>;
    const creds = result['credentials'] as Record<string, unknown>;
    expect(creds['apiKey']).toBe('[REDACTED]');
  });

  it('递归脱敏数组', () => {
    const input = [{ password: 'abc' }, { name: 'visible' }];
    const result = redactJsonValue(input) as Array<Record<string, unknown>>;
    expect(result[0]!['password']).toBe('[REDACTED]');
    expect(result[1]!['name']).toBe('visible');
  });

  it('识别多种敏感键名变体', () => {
    const input = {
      secret_key: 'value1',
      access_token: 'value2',
      cookie: 'value3',
      session_id: 'value4',
      private_key: 'value5',
    };
    const result = redactJsonValue(input) as Record<string, unknown>;
    expect(result['secret_key']).toBe('[REDACTED]');
    expect(result['access_token']).toBe('[REDACTED]');
    expect(result['cookie']).toBe('[REDACTED]');
    expect(result['session_id']).toBe('[REDACTED]');
    expect(result['private_key']).toBe('[REDACTED]');
  });
});

// ─── redactEvidence ───────────────────────────────────────

describe('redactEvidence', () => {
  it('脱敏证据内容并标记隐私状态', () => {
    const ev = evidence({
      content: { url: 'https://example.com', password: 'secret', data: 'normal' },
      privacy: privacy(),
    });
    const redacted = redactEvidence(ev);

    expect(redacted.privacy.redacted).toBe(true);
    const content = redacted.content as Record<string, unknown>;
    expect(content['password']).toBe('[REDACTED]');
    expect(content['data']).toBe('normal');
    expect(content['url']).toBe('https://example.com');
  });

  it('保留原始证据不变', () => {
    const ev = evidence({ content: { token: 'abc123' } });
    const redacted = redactEvidence(ev);
    expect(redacted.privacy.redacted).toBe(true);
    expect((ev.content as Record<string, unknown>)['token']).toBe('abc123');
    expect(ev.privacy.redacted).toBe(false);
  });

  it('添加脱敏限制说明', () => {
    const ev = evidence();
    const redacted = redactEvidence(ev);
    expect(redacted.limitations).toContain('内容已脱敏');
  });

  it('无内容证据仍可脱敏', () => {
    const ev = createEvidence({
      runId: 'run-1',
      sourceCategory: 'E1',
      materialType: 'OBSERVATION',
      sourceMethod: 'test',
      summary: 'artifact only',
      artifact: { path: 'report.pdf', digest: 'abc', bytes: 100, mediaType: 'application/pdf' },
      observedAt: NOW,
      privacy: privacy(),
    });
    const redacted = redactEvidence(ev);
    expect(redacted.privacy.redacted).toBe(true);
  });
});

// ─── checkSharingCompliance ───────────────────────────────

describe('checkSharingCompliance', () => {
  it('合规证据通过检查', () => {
    const ev = validEvidence();
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('未授权分享用途不合规', () => {
    const ev = validEvidence({ privacy: privacy({ allowedPurposes: ['EVALUATION'] }) });
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues).toContain('证据未授权分享用途');
  });

  it('敏感证据未脱敏不合规', () => {
    const ev = validEvidence({ privacy: privacy({ classification: 'SENSITIVE', redacted: false }) });
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues).toContain('敏感证据未脱敏，不得直接分享');
  });

  it('敏感证据已脱敏可合规', () => {
    const ev = validEvidence({ privacy: privacy({ classification: 'SENSITIVE', redacted: true }) });
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(true);
  });

  it('超过保留期限不合规', () => {
    const ev = validEvidence({ privacy: privacy({ retentionUntil: '2025-01-01T00:00:00Z' }) });
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues).toContain('证据已超过保留期限');
  });

  it('有效性非 VALID 不合规', () => {
    const ev = validEvidence({ validity: 'UNVERIFIED' });
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues.some((i) => i.includes('UNVERIFIED'))).toBe(true);
  });

  it('已退役证据不合规', () => {
    const ev = validEvidence({ lifecycle: 'RETIRED' });
    const result = checkSharingCompliance(ev, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues).toContain('已退役证据不可分享');
  });

  it('用户研究证据缺少授权引用不合规', () => {
    const ev = createEvidence({
      runId: 'run-1',
      sourceCategory: 'E4',
      materialType: 'OBSERVATION',
      sourceMethod: 'test',
      summary: 'user research',
      content: { response: 'ok' },
      observedAt: NOW,
      privacy: privacy({ consentRef: 'consent-001' }),
    });
    // 删除 consentRef 模拟未授权
    const evNoConsent = { ...ev, privacy: { ...ev.privacy, consentRef: undefined } } as unknown as Evidence;
    const result = checkSharingCompliance(evNoConsent, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues).toContain('用户研究证据缺少授权引用');
  });

  it('用户研究证据有授权引用可合规', () => {
    const ev = createEvidence({
      runId: 'run-1',
      sourceCategory: 'E4',
      materialType: 'OBSERVATION',
      sourceMethod: 'test',
      summary: 'user research',
      content: { response: 'ok' },
      observedAt: NOW,
      privacy: privacy({ consentRef: 'consent-001' }),
    });
    const validEv = { ...ev, validity: 'VALID', lifecycle: 'VALIDATED' } as Evidence;
    const result = checkSharingCompliance(validEv, NOW);
    expect(result.compliant).toBe(true);
  });

  it('多个问题同时报告', () => {
    const ev = createEvidence({
      runId: 'run-1',
      sourceCategory: 'E1',
      materialType: 'OBSERVATION',
      sourceMethod: 'test',
      summary: 'problem evidence',
      content: { data: 'test' },
      observedAt: NOW,
      privacy: privacy({
        classification: 'SENSITIVE',
        redacted: false,
        allowedPurposes: ['EVALUATION'],
        retentionUntil: '2025-01-01T00:00:00Z',
      }),
    });
    const evMulti = { ...ev, validity: 'DISPUTED', lifecycle: 'RETIRED' } as Evidence;
    const result = checkSharingCompliance(evMulti, NOW);
    expect(result.compliant).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});
