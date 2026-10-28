import { invariant, newId, parseTimestamp } from '@uxq/core';
import type {
  Evidence,
  EvidenceSource,
  EvidencePrivacy,
  ArtifactReference,
  JsonValue,
  IdList,
} from '@uxq/contracts';
import { isRelativeArtifactPath } from '@uxq/contracts';

/** 创建证据记录；校验来源类别、生命周期和隐私边界。 */
export function createEvidence(params: {
  runId: string;
  sourceCategory: EvidenceSource;
  materialType: Evidence['materialType'];
  sourceMethod: string;
  summary: string;
  content?: JsonValue;
  artifact?: ArtifactReference;
  derivedFromIds?: IdList;
  observedAt: string;
  privacy: EvidencePrivacy;
  limitations?: string[];
  stepId?: string;
  attemptId?: string;
}): Evidence {
  parseTimestamp(params.observedAt);
  if (params.artifact)
    invariant(
      isRelativeArtifactPath(params.artifact.path),
      'ARTIFACT_PATH',
      '工件路径必须为相对路径',
    );
  if (params.sourceCategory === 'E4')
    invariant(params.privacy.consentRef, 'CONSENT_REQUIRED', '用户研究证据必须有授权引用');
  const base: Record<string, unknown> = {
    id: newId('evidence'),
    schemaVersion: '1.0.0',
    createdAt: params.observedAt,
    runId: params.runId,
    sourceCategory: params.sourceCategory,
    materialType: params.materialType,
    sourceMethod: params.sourceMethod,
    lifecycle: 'CAPTURED',
    validity: 'UNVERIFIED',
    summary: params.summary,
    derivedFromIds: params.derivedFromIds ?? [],
    observedAt: params.observedAt,
    privacy: params.privacy,
    limitations: params.limitations ?? [],
  };
  if (params.stepId) base.stepId = params.stepId;
  if (params.attemptId) base.attemptId = params.attemptId;
  if (params.artifact) base.artifact = params.artifact;
  if (params.content !== undefined) base.content = params.content;
  return base as unknown as Evidence;
}

/** 验证证据：将生命周期推进到 VALIDATED，有效性标记为 VALID。 */
export function validateEvidence(evidence: Evidence, now: string): Evidence {
  parseTimestamp(now);
  invariant(evidence.lifecycle === 'CAPTURED', 'EVIDENCE_LIFECYCLE', '只有已采集证据可以验证');
  invariant(evidence.artifact || evidence.content, 'EVIDENCE_CONTENT', '验证需要工件或内联内容');
  return { ...evidence, lifecycle: 'VALIDATED', validity: 'VALID' };
}

/** 标记证据为争议状态；不删除原始记录。 */
export function disputeEvidence(evidence: Evidence, reason: string): Evidence {
  return {
    ...evidence,
    validity: 'DISPUTED',
    limitations: [...evidence.limitations, `争议：${reason}`],
  };
}

/** 退役证据；保留审计信息，不再用于新评价。 */
export function retireEvidence(evidence: Evidence): Evidence {
  return { ...evidence, lifecycle: 'RETIRED' };
}

// ─── GAP-07: 敏感数据脱敏运行时能力 ─────────────────────

/** 敏感字段名模式（归一化后匹配：去除 _、-、空格并小写） */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'secretkey',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'auth',
  'cookie',
  'session',
  'sessionid',
  'csrf',
  'xsrf',
  'apikey',
  'credential',
  'credentials',
  'privatekey',
  'ssn',
  'creditcard',
]);

/** 敏感值正则模式 */
const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, // Bearer token
  /[A-Za-z0-9]{32,}/g, // 长随机字符串（API key 等）
  /(?:password|passwd|secret|token)\s*[:=]\s*\S+/gi, // key=value 形式
];

/** 脱敏占位符 */
const REDACTED = '[REDACTED]';

/** 判断键名是否敏感 */
function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_\-\s]/g, ''));
}

/** 判断字符串值是否匹配敏感模式 */
function isSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

/** 递归脱敏 JSON 值 */
export function redactJsonValue(value: JsonValue, parentKey?: string): JsonValue {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (parentKey && isSensitiveKey(parentKey)) return REDACTED;
    if (isSensitiveValue(value)) return REDACTED;
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactJsonValue(item, parentKey));
  }
  const result: Record<string, JsonValue> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = redactJsonValue(val, key);
  }
  return result;
}

/** 对证据内容进行脱敏，返回新的证据副本 */
export function redactEvidence(evidence: Evidence): Evidence {
  const redacted: Evidence = { ...evidence };
  if (redacted.content !== undefined) {
    redacted.content = redactJsonValue(redacted.content);
  }
  redacted.privacy = { ...evidence.privacy, redacted: true };
  redacted.limitations = [...evidence.limitations, '内容已脱敏'];
  return redacted;
}

/** 分享合规性检查结果 */
export interface SharingComplianceResult {
  compliant: boolean;
  issues: string[];
}

/** 检查证据是否满足分享合规要求 */
export function checkSharingCompliance(evidence: Evidence, at: string): SharingComplianceResult {
  parseTimestamp(at);
  const issues: string[] = [];

  if (!evidence.privacy.allowedPurposes.includes('SHARING')) {
    issues.push('证据未授权分享用途');
  }

  if (evidence.privacy.classification === 'SENSITIVE' && !evidence.privacy.redacted) {
    issues.push('敏感证据未脱敏，不得直接分享');
  }

  if (Date.parse(evidence.privacy.retentionUntil) < Date.parse(at)) {
    issues.push('证据已超过保留期限');
  }

  if (evidence.validity !== 'VALID') {
    issues.push(`证据有效性状态为 ${evidence.validity}，不可分享`);
  }

  if (evidence.lifecycle === 'RETIRED') {
    issues.push('已退役证据不可分享');
  }

  if (evidence.sourceCategory === 'E4' && !evidence.privacy.consentRef) {
    issues.push('用户研究证据缺少授权引用');
  }

  return { compliant: issues.length === 0, issues };
}
