/**
 * UXQ 能力清单 — 单一事实来源。
 *
 * CLI 的 capabilities 命令和自验证测试均引用此数据，
 * 确保对外声明的能力与实际实现一致。
 */

/** 浏览器动作类型。 */
export const SUPPORTED_ACTIONS = Object.freeze([
  'NAVIGATE',
  'CLICK',
  'FILL',
  'FILL_SECRET',
  'PRESS',
  'WAIT_FOR',
  'CAPTURE',
  'SCREENSHOT',
] as const);

export type SupportedAction = (typeof SUPPORTED_ACTIONS)[number];

/** 步骤类型。 */
export const SUPPORTED_STEP_KINDS = Object.freeze([
  'ENVIRONMENT_CHECK',
  'BROWSER_SETUP',
  'PAGE_NAVIGATION',
  'TASK_EXECUTION',
  'OBSERVATION_CAPTURE',
  'METRIC_CALCULATION',
  'RULE_EVALUATION',
  'SCORING',
  'EVIDENCE_VALIDATION',
  'RESULT_FINALIZATION',
] as const);

export type SupportedStepKind = (typeof SUPPORTED_STEP_KINDS)[number];

/** 数据提取器。 */
export const SUPPORTED_EXTRACTORS = Object.freeze([
  'COUNT',
  'VISIBLE',
  'TEXT',
  'VALUE',
  'ACCESSIBLE_NAME',
] as const);

export type SupportedExtractor = (typeof SUPPORTED_EXTRACTORS)[number];

/** 提取器局限性说明。 */
export const EXTRACTOR_LIMITATIONS: Readonly<Record<SupportedExtractor, string>> = Object.freeze({
  COUNT: '仅做 DOM 计数（querySelectorAll.length），不验证内容、位置或可见性',
  VISIBLE: '检查元素是否可见',
  TEXT: '提取元素文本内容',
  VALUE: '提取表单元素值',
  ACCESSIBLE_NAME: '提取元素可访问名称',
});

/** 任务条件核验类型。 */
export const SUPPORTED_CONDITIONS = Object.freeze(['TEXT', 'VISIBLE', 'URL', 'ATTRIBUTE'] as const);
export const UNSUPPORTED_CONDITIONS = Object.freeze(['BUSINESS_JSON'] as const);

export type SupportedCondition = (typeof SUPPORTED_CONDITIONS)[number];

/** 指标聚合方式。 */
export const SUPPORTED_AGGREGATIONS = Object.freeze([
  'LATEST',
  'MEAN',
  'MEDIAN',
  'P95',
  'SUM',
  'COUNT',
  'RATIO',
  'SUCCESS_RATE',
] as const);

export type SupportedAggregation = (typeof SUPPORTED_AGGREGATIONS)[number];

/** 已知局限。 */
export const KNOWN_LIMITATIONS = Object.freeze([
  'COUNT 提取器不验证语义正确性或可见性，<h1 class="sr-only"> 与可见 <h1> 同等计数',
  '纯静态采集（无交互动作）时 D02/D05/D06 维度为 OOS（不适用）',
  '默认不支持 WebSocket（allowWebSocket: false），dev server 的 HMR 会导致 evaluate 失败',
  'HTTP 重定向默认拒绝（maxRedirects: 0），需提供最终 URL 或显式配置',
] as const);

/** 完整能力清单。 */
export interface CapabilityCatalog {
  readonly version: string;
  readonly actions: {
    readonly supported: readonly SupportedAction[];
    readonly description: string;
  };
  readonly stepKinds: {
    readonly supported: readonly SupportedStepKind[];
    readonly description: string;
  };
  readonly extractors: {
    readonly supported: readonly SupportedExtractor[];
    readonly description: string;
    readonly limitations: Readonly<Record<SupportedExtractor, string>>;
  };
  readonly conditions: {
    readonly supported: readonly SupportedCondition[];
    readonly unsupported: readonly string[];
    readonly description: string;
  };
  readonly aggregations: {
    readonly supported: readonly SupportedAggregation[];
    readonly description: string;
    readonly notes: Record<string, string>;
  };
  readonly knownLimitations: readonly string[];
}

/** 构建能力清单对象（version 由调用方注入）。 */
export function buildCapabilityCatalog(version: string): CapabilityCatalog {
  return {
    version,
    actions: {
      supported: SUPPORTED_ACTIONS,
      description: '浏览器动作类型，用于 steps[].action.action 字段',
    },
    stepKinds: {
      supported: SUPPORTED_STEP_KINDS,
      description: '步骤类型，用于 steps[].kind 字段',
    },
    extractors: {
      supported: SUPPORTED_EXTRACTORS,
      description: 'CAPTURE 动作的数据提取方式，用于 steps[].action.extractor 字段',
      limitations: EXTRACTOR_LIMITATIONS,
    },
    conditions: {
      supported: SUPPORTED_CONDITIONS,
      unsupported: [...UNSUPPORTED_CONDITIONS],
      description: '任务条件核验类型，用于 tasks[].businessConditions/feedbackConditions[].kind 字段',
    },
    aggregations: {
      supported: SUPPORTED_AGGREGATIONS,
      description: '指标聚合方式，用于 metrics[].aggregation 字段',
      notes: {
        RATIO: '需要配对采样（同 sampleId），连续 CAPTURE 共享 sampleId，操作或导航后开启新采样组',
      },
    },
    knownLimitations: [...KNOWN_LIMITATIONS],
  };
}
