/** init 命令 — 生成示例定义文件。支持 --profile 按页面类型自动生成。 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
import { UxqError, systemClock, newId } from '@uxq/core';
import { parseContract } from '@uxq/contracts';
import type { EvaluationDefinition } from '@uxq/contracts';
import { VERSION } from '../version.js';
import { buildResponse } from '../response.js';
import { EXIT_CODES } from '../errors.js';
import { logInfo } from '../io.js';
import type { CommandContext, CommandResult } from './types.js';

/** 支持的页面类型。 */
export type PageProfile = 'content' | 'tool' | 'dashboard' | 'form' | 'landing' | 'settings';
export const PAGE_PROFILES: PageProfile[] = ['content', 'tool', 'dashboard', 'form', 'landing', 'settings'];

/** 页面类型描述。 */
const PROFILE_DESCRIPTIONS: Record<PageProfile, { name: string; description: string; dimensions: string[] }> = {
  content: {
    name: '内容页面',
    description: '文档、博客、文章等以阅读为主的页面',
    dimensions: ['D01', 'D03', 'D04', 'D05'],
  },
  tool: {
    name: '交互式工具',
    description: '编辑器、IDE、画布等以操作为主的的页面',
    dimensions: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06'],
  },
  dashboard: {
    name: '仪表盘/数据大屏',
    description: '数据展示、监控面板、BI 大屏等',
    dimensions: ['D01', 'D03', 'D04', 'D05', 'D06'],
  },
  form: {
    name: '表单/流程页',
    description: '注册、结账、多步骤表单等',
    dimensions: ['D01', 'D03', 'D04', 'D05'],
  },
  landing: {
    name: '落地页/营销页',
    description: '产品介绍、营销着陆页、首页等',
    dimensions: ['D01', 'D03', 'D04', 'D05'],
  },
  settings: {
    name: '设置/配置页',
    description: '系统设置、用户偏好、账户管理等配置类页面',
    dimensions: ['D01', 'D03', 'D04', 'D05'],
  },
};

export async function run(ctx: CommandContext): Promise<CommandResult> {
  const file = ctx.positional[0];
  if (!file) throw new UxqError('MISSING_FILE', 'init 需要文件路径', 'INPUT');

  const profileName = ctx.options.profile as PageProfile | undefined;

  let example: EvaluationDefinition;
  let resolvedProfile: string;
  if (ctx.options.url) {
    example = buildPageExample(ctx.options.url, profileName);
    resolvedProfile = profileName ?? detectProfileFromUrl(new URL(ctx.options.url));
  } else {
    example = buildOfflineExample();
    resolvedProfile = 'offline';
  }

  parseContract('EvaluationDefinition', example);
  await mkdir(dirname(resolve(file)), { recursive: true });
  const content = /\.ya?ml$/i.test(file)
    ? stringifyYaml(example)
    : JSON.stringify(example, null, 2);
  await writeFile(file, content, 'utf8');

  const profileInfo = resolvedProfile !== 'offline' ? ` (profile: ${resolvedProfile})` : '';
  logInfo(ctx.io, `已生成定义文件：${file}${profileInfo}`);

  return {
    code: EXIT_CODES.SUCCESS,
    response: buildResponse(VERSION, 'init', {
      status: 'COMPLETED',
      data: { file, definitionId: example.id, profile: resolvedProfile },
    }),
  };
}

/** 构建页面评估定义（按 profile 生成不同指标和规则）。 */
function buildPageExample(urlStr: string, profileName?: PageProfile): EvaluationDefinition {
  const url = new URL(urlStr);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new UxqError('INVALID_URL', 'init --url 仅接受不含凭据的 HTTP(S) URL', 'INPUT');
  }

  const profile = profileName ?? detectProfileFromUrl(url);
  const desc = PROFILE_DESCRIPTIONS[profile];

  const base: EvaluationDefinition = {
    id: newId('def'),
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    definitionVersion: '0.1.0',
    name: `${desc.name} UX 评估`,
    target: {
      id: newId('target'),
      name: `${desc.name} — ${url.hostname}${url.pathname}`,
      type: 'PAGE',
      version: '0.1.0',
      environment: 'test',
      url: url.href,
    },
    scope: {
      entityIds: [],
      routes: [url.pathname],
      taskIds: [],
      exclusions: [],
      limitations: [],
    },
    dimensions: [...desc.dimensions],
    methods: ['AUTOMATED'],
    metrics: [],
    rules: [],
    policy: {
      id: newId('policy'),
      schemaVersion: '1.0.0',
      createdAt: systemClock.now(),
      version: '0.1.0',
      name: `${desc.name}评分策略`,
      mode: 'SCORE',
      bindings: [],
      dimensions: desc.dimensions.map((d) => ({ dimensionId: d, weight: 1, minimumCoverage: 0 })),
      missingPolicy: 'EXCLUDE_WITH_DISCLOSURE',
      minimumCoverage: 0,
      allowPartial: true,
      criticalRuleIds: [],
      riskSeverities: [],
      rationale: `基于 ${desc.name} 页面类型自动生成`,
      limitations: ['自动生成的定义需根据实际页面功能审查后使用'],
    },
    tasks: [],
    steps: [],
    limitations: [`此为 ${profile} 类型页面的初始定义，请根据实际需求调整指标和规则`],
    profile: {
      allowedOrigins: [url.origin],
      allowPrivateNetwork: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
      allowSideEffects: false,
    },
  };

  base.scope.entityIds = [base.target.id];

  // 按 profile 填充指标、规则和步骤
  switch (profile) {
    case 'content': applyContentProfile(base, url); break;
    case 'tool': applyToolProfile(base, url); break;
    case 'dashboard': applyDashboardProfile(base, url); break;
    case 'form': applyFormProfile(base, url); break;
    case 'landing': applyLandingProfile(base, url); break;
    case 'settings': applySettingsProfile(base, url); break;
  }

  // 修补 finding 模板的 entityId/scenarioId
  patchFindingRefs(base);

  return base;
}

/** 为规则 finding 模板填充 entityId 和 scenarioId。 */
function patchFindingRefs(def: EvaluationDefinition): void {
  for (const rule of def.rules) {
    if (rule.finding) {
      (rule.finding as Record<string, unknown>).entityId = def.target.id;
      (rule.finding as Record<string, unknown>).scenarioId = `scenario-${rule.id}`;
    }
  }
}

/** 从 URL 推断页面类型（简单启发式）。 */
function detectProfileFromUrl(url: URL): PageProfile {
  const path = url.pathname.toLowerCase();
  if (/editor|canvas|ide|design|studio/.test(path)) return 'tool';
  if (/dashboard|admin|panel|monitor|bi/.test(path)) return 'dashboard';
  if (/settings|preferences|account|profile|config/.test(path)) return 'settings';
  if (/form|checkout|register|signup|login|wizard/.test(path)) return 'form';
  if (/landing|home|promo|marketing|product|pricing|about/.test(path)) return 'landing';
  if (/article|blog|post|help|doc|guide|faq|wiki|kb/.test(path)) return 'content';
  return 'content';
}

// ─── Profile: content ─────────────────────────────────────

function applyContentProfile(def: EvaluationDefinition, url: URL): void {
  const metricIds: string[] = [];
  const ruleIds: string[] = [];

  // h1 数量
  def.metrics.push(makeMetric('m-h1', '一级标题数量', 'D03', 'h1-count', {
    description: '页面 h1 元素数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-h1');
  def.rules.push(makeRule('r-h1-exists', '存在一级标题', 'm-h1', 'GTE', 1, { required: true }));
  ruleIds.push('r-h1-exists');

  // 标题层级总数
  def.metrics.push(makeMetric('m-headings', '标题总数 (h1-h6)', 'D03', 'heading-total', {
    description: '页面所有标题元素总数',
  }));
  metricIds.push('m-headings');

  // 带标签输入框 (D04 可访问性)
  def.metrics.push(makeMetric('m-labeled-inputs', '带标签输入框', 'D04', 'labeled-inputs', {
    description: '有 aria-label/placeholder/label 关联的输入框数量',
  }));
  metricIds.push('m-labeled-inputs');

  // ARIA 角色数
  def.metrics.push(makeMetric('m-aria-roles', 'ARIA 角色数', 'D04', 'aria-roles', {
    description: '带 role 属性的元素数量',
  }));
  metricIds.push('m-aria-roles');

  // 图片 alt 缺失数
  def.metrics.push(makeMetric('m-img-alt-missing', '图片缺失 alt 数量', 'D04', 'img-alt-missing', {
    description: '缺少 alt 属性的 img 元素数量',
    direction: 'LOWER_IS_BETTER',
  }));
  metricIds.push('m-img-alt-missing');
  def.rules.push(makeRule('r-alt-missing-zero', '图片 alt 完整', 'm-img-alt-missing', 'EQ', 0, {
    required: true,
    critical: true,
    finding: {
      problemKey: 'a11y-img-no-alt',
      title: '图片缺少 alt 属性',
      description: '存在未提供替代文本的图片元素，影响视障用户理解内容',
      type: 'CONFIRMED_DEFECT',
      severity: 'S1',
      priority: 'P0',
      confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-alt-missing-zero');

  // 页面加载
  def.rules.push(makeRule('r-page-loaded', '页面已加载', 'm-interactive', 'GTE', 1, {
    required: true,
    critical: true,
  }));

  // ── 通用可访问性指标 ──
  def.metrics.push(makeMetric('m-skip-nav', '跳过导航链接', 'D04', 'skip-nav', {
    description: '指向主内容区域的跳过导航链接数量',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-skip-nav');
  def.rules.push(makeRule('r-has-skip-nav', '存在跳过导航链接', 'm-skip-nav', 'GTE', 1, {
    required: false,
    finding: {
      problemKey: 'a11y-no-skip-nav',
      title: '缺少跳过导航链接',
      description: '页面未提供跳过重复导航内容的链接，影响键盘用户效率',
      type: 'IMPROVEMENT_OPPORTUNITY',
      severity: 'S2',
      priority: 'P2',
      confidence: 'MEDIUM',
    },
  }));
  ruleIds.push('r-has-skip-nav');

  def.metrics.push(makeMetric('m-lang-attr', 'HTML lang 属性', 'D04', 'lang-attr', {
    description: 'html 元素是否设置了 lang 属性（0=无，1=有）',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-lang-attr');
  def.rules.push(makeRule('r-has-lang', '页面设置了 lang 属性', 'm-lang-attr', 'EQ', 1, {
    required: true,
    finding: {
      problemKey: 'a11y-no-lang',
      title: 'HTML 缺少 lang 属性',
      description: 'html 元素未设置 lang 属性，影响屏幕阅读器的语言识别',
      type: 'CONFIRMED_DEFECT',
      severity: 'S2',
      priority: 'P1',
      confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-has-lang');

  def.metrics.push(makeMetric('m-focus-visible', 'focus-visible 元素数', 'D05', 'focus-visible', {
    description: '使用 :focus-visible 或:focus-within 样式的可交互元素数量',
  }));
  metricIds.push('m-focus-visible');

  // ── 内容页面特定指标 ──
  def.metrics.push(makeMetric('m-landmarks', '地标区域数', 'D03', 'landmark-regions', {
    description: '语义化地标元素数量（main/nav/header/footer/section/aside）',
  }));
  metricIds.push('m-landmarks');

  // 可交互元素
  def.metrics.push(makeMetric('m-interactive', '可交互元素数', 'D01', 'interactive-count', {
    description: 'button/input/select/a[href]/textarea/[tabindex] 总数',
  }));
  metricIds.push('m-interactive');

  // 步骤
  def.steps = buildCaptureSteps(url, [
    { key: 'h1-count', selector: 'h1' },
    { key: 'heading-total', selector: 'h1, h2, h3, h4, h5, h6' },
    { key: 'labeled-inputs', selector: 'input[aria-label], input[placeholder], input[id]' },
    { key: 'aria-roles', selector: '[role]' },
    { key: 'img-alt-missing', selector: 'img:not([alt])' },
    { key: 'skip-nav', selector: 'a[href^="#main"], a[href^="#content"], .skip-link, .skip-nav' },
    { key: 'lang-attr', selector: 'html[lang]' },
    { key: 'focus-visible', selector: ':focus-visible, [tabindex]:not([tabindex="-1"])' },
    { key: 'landmark-regions', selector: 'main, nav, header, footer, section, aside, [role=main], [role=navigation]' },
    { key: 'interactive-count', selector: 'button, input, select, a[href], textarea, [tabindex]' },
  ], metricIds, ruleIds);

  // 策略绑定
  def.policy.bindings = [
    { metricId: 'm-h1', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-headings', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
    { metricId: 'm-labeled-inputs', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
    { metricId: 'm-aria-roles', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-img-alt-missing', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 100}, {x: 10, y: 0}] },
    { metricId: 'm-skip-nav', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-lang-attr', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-focus-visible', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-landmarks', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
  ];
  def.policy.criticalRuleIds = ['r-alt-missing-zero', 'r-page-loaded', 'r-has-lang'];
}

// ─── Profile: tool ─────────────────────────────────────

function applyToolProfile(def: EvaluationDefinition, url: URL): void {
  const metricIds: string[] = [];
  const ruleIds: string[] = [];

  // 带 title/aria-label 的元素数
  def.metrics.push(makeMetric('m-labeled-elements', '带标签交互元素数', 'D03', 'labeled-elements', {
    description: '有 title 或 aria-label 属性的可交互元素数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-labeled-elements');

  // 可交互元素总数
  def.metrics.push(makeMetric('m-interactive', '可交互元素数', 'D01', 'interactive-count', {
    description: 'button/input/select/a[href]/textarea/[tabindex]/[role=button] 总数',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-interactive');

  // 带标签输入框比例 (通过两个指标计算)
  def.metrics.push(makeMetric('m-inputs', '输入框总数', 'D03', 'input-count', {
    description: '所有 input/textarea/select 元素数量',
  }));
  metricIds.push('m-inputs');
  def.metrics.push(makeMetric('m-labeled-inputs', '带标签输入框数', 'D03', 'labeled-inputs', {
    description: '有 aria-label 或 label 关联的输入框数量',
  }));
  metricIds.push('m-labeled-inputs');

  // ARIA 角色数
  def.metrics.push(makeMetric('m-aria-roles', 'ARIA 角色数', 'D04', 'aria-roles', {
    description: '带 role 属性的元素数量',
  }));
  metricIds.push('m-aria-roles');

  // 可聚焦元素数
  def.metrics.push(makeMetric('m-focusable', '可聚焦元素数', 'D04', 'focusable-count', {
    description: '可通过 Tab 键到达的元素数量',
  }));
  metricIds.push('m-focusable');

  // DOM 总量
  def.metrics.push(makeMetric('m-dom-total', 'DOM 总元素数', 'D06', 'dom-total', {
    description: '页面所有 DOM 元素总数',
    direction: 'TARGET_RANGE',
    minimum: 0,
    maximum: 100000,
  }));
  metricIds.push('m-dom-total');

  // ── 通用可访问性指标 ──
  def.metrics.push(makeMetric('m-skip-nav', '跳过导航链接', 'D04', 'skip-nav', {
    description: '指向主内容区域的跳过导航链接数量',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-skip-nav');
  def.rules.push(makeRule('r-has-skip-nav', '存在跳过导航链接', 'm-skip-nav', 'GTE', 1, {
    required: false,
    finding: {
      problemKey: 'a11y-no-skip-nav', title: '缺少跳过导航链接',
      description: '页面未提供跳过重复导航内容的链接', type: 'IMPROVEMENT_OPPORTUNITY',
      severity: 'S2', priority: 'P2', confidence: 'MEDIUM',
    },
  }));
  ruleIds.push('r-has-skip-nav');

  def.metrics.push(makeMetric('m-lang-attr', 'HTML lang 属性', 'D04', 'lang-attr', {
    description: 'html 元素是否设置了 lang 属性（0=无，1=有）',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-lang-attr');
  def.rules.push(makeRule('r-has-lang', '页面设置了 lang 属性', 'm-lang-attr', 'EQ', 1, {
    required: true,
    finding: {
      problemKey: 'a11y-no-lang', title: 'HTML 缺少 lang 属性',
      description: 'html 元素未设置 lang 属性，影响屏幕阅读器的语言识别',
      type: 'CONFIRMED_DEFECT', severity: 'S2', priority: 'P1', confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-has-lang');

  def.metrics.push(makeMetric('m-focus-visible', 'focus-visible 元素数', 'D05', 'focus-visible', {
    description: '使用 :focus-visible 或:focus-within 样式的可交互元素数量',
  }));
  metricIds.push('m-focus-visible');

  // ── 工具页面特定指标 ──
  def.metrics.push(makeMetric('m-panel-regions', '面板/工具栏区域数', 'D03', 'panel-regions', {
    description: '带 role=toolbar/role=tabpanel/role=group 的面板区域数量',
  }));
  metricIds.push('m-panel-regions');

  // 规则：页面已加载
  def.rules.push(makeRule('r-page-loaded', '页面已加载', 'm-interactive', 'GTE', 1, {
    required: true,
    critical: true,
  }));
  ruleIds.push('r-page-loaded');

  // 规则：交互元素充足
  def.rules.push(makeRule('r-has-interactive', '交互元素充足', 'm-interactive', 'GTE', 5, {
    required: true,
  }));
  ruleIds.push('r-has-interactive');

  // 步骤
  def.steps = buildCaptureSteps(url, [
    { key: 'labeled-elements', selector: '[title], [aria-label]' },
    { key: 'interactive-count', selector: 'button, input, select, a[href], textarea, [tabindex], [role=button]' },
    { key: 'input-count', selector: 'input, textarea, select' },
    { key: 'labeled-inputs', selector: 'input[aria-label], input[id], textarea[aria-label], select[aria-label]' },
    { key: 'aria-roles', selector: '[role]' },
    { key: 'focusable-count', selector: 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])' },
    { key: 'dom-total', selector: '*' },
    { key: 'skip-nav', selector: 'a[href^="#main"], a[href^="#content"], .skip-link, .skip-nav' },
    { key: 'lang-attr', selector: 'html[lang]' },
    { key: 'focus-visible', selector: ':focus-visible, [tabindex]:not([tabindex="-1"])' },
    { key: 'panel-regions', selector: '[role=toolbar], [role=tabpanel], [role=group], [class*=panel], [class*=toolbar]' },
  ], metricIds, ruleIds);

  // 策略绑定
  def.policy.bindings = [
    { metricId: 'm-labeled-elements', weight: 2, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-interactive', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 200, controlPoints: [{x: 0, y: 0}, {x: 200, y: 100}] },
    { metricId: 'm-inputs', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-labeled-inputs', weight: 2, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-aria-roles', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 30, controlPoints: [{x: 0, y: 0}, {x: 30, y: 100}] },
    { metricId: 'm-focusable', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 200, controlPoints: [{x: 0, y: 0}, {x: 200, y: 100}] },
    { metricId: 'm-dom-total', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 5000, controlPoints: [{x: 0, y: 0}, {x: 5000, y: 100}] },
    { metricId: 'm-skip-nav', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-lang-attr', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-focus-visible', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-panel-regions', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
  ];
  def.policy.criticalRuleIds = ['r-page-loaded', 'r-has-lang'];

  def.scope.limitations = [
    '交互式工具页面的 D02 操作效率为结构代理指标，非真实用户任务耗时测量',
    'D06 主观体验为 DOM 总量代理，非用户满意度测量',
  ];
}

// ─── Profile: dashboard ─────────────────────────────────────

function applyDashboardProfile(def: EvaluationDefinition, url: URL): void {
  const metricIds: string[] = [];
  const ruleIds: string[] = [];

  // 数据区块数
  def.metrics.push(makeMetric('m-data-blocks', '数据区块数', 'D01', 'data-blocks', {
    description: '带 data- 属性或 role=region 的数据展示区块数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-data-blocks');

  // 图表/可视化元素数
  def.metrics.push(makeMetric('m-charts', '图表元素数', 'D01', 'chart-count', {
    description: 'canvas/svg/chart 等可视化元素数量',
  }));
  metricIds.push('m-charts');

  // 带 aria-label 的区块数
  def.metrics.push(makeMetric('m-labeled-regions', '带标签区域数', 'D03', 'labeled-regions', {
    description: '有 aria-label/aria-labelledby 的 region/section 数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-labeled-regions');

  // 可交互元素数
  def.metrics.push(makeMetric('m-interactive', '可交互元素数', 'D03', 'interactive-count', {
    description: 'button/input/select/a[href]/[tabindex] 总数',
  }));
  metricIds.push('m-interactive');

  // ARIA 角色数
  def.metrics.push(makeMetric('m-aria-roles', 'ARIA 角色数', 'D04', 'aria-roles', {
    description: '带 role 属性的元素数量',
  }));
  metricIds.push('m-aria-roles');

  // DOM 总量
  def.metrics.push(makeMetric('m-dom-total', 'DOM 总元素数', 'D06', 'dom-total', {
    description: '页面所有 DOM 元素总数',
    direction: 'TARGET_RANGE',
    minimum: 0,
    maximum: 100000,
  }));
  metricIds.push('m-dom-total');

  // ── 通用可访问性指标 ──
  def.metrics.push(makeMetric('m-skip-nav', '跳过导航链接', 'D04', 'skip-nav', {
    description: '指向主内容区域的跳过导航链接数量',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-skip-nav');
  def.rules.push(makeRule('r-has-skip-nav', '存在跳过导航链接', 'm-skip-nav', 'GTE', 1, {
    required: false,
    finding: {
      problemKey: 'a11y-no-skip-nav', title: '缺少跳过导航链接',
      description: '页面未提供跳过重复导航内容的链接', type: 'IMPROVEMENT_OPPORTUNITY',
      severity: 'S2', priority: 'P2', confidence: 'MEDIUM',
    },
  }));
  ruleIds.push('r-has-skip-nav');

  def.metrics.push(makeMetric('m-lang-attr', 'HTML lang 属性', 'D04', 'lang-attr', {
    description: 'html 元素是否设置了 lang 属性（0=无，1=有）',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-lang-attr');
  def.rules.push(makeRule('r-has-lang', '页面设置了 lang 属性', 'm-lang-attr', 'EQ', 1, {
    required: true,
    finding: {
      problemKey: 'a11y-no-lang', title: 'HTML 缺少 lang 属性',
      description: 'html 元素未设置 lang 属性，影响屏幕阅读器的语言识别',
      type: 'CONFIRMED_DEFECT', severity: 'S2', priority: 'P1', confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-has-lang');

  def.metrics.push(makeMetric('m-focus-visible', 'focus-visible 元素数', 'D05', 'focus-visible', {
    description: '使用 :focus-visible 或:focus-within 样式的可交互元素数量',
  }));
  metricIds.push('m-focus-visible');

  // ── 仪表盘特定指标 ──
  def.metrics.push(makeMetric('m-table-grid', '表格/网格元素数', 'D01', 'table-grid', {
    description: 'table/grid/role=grid/role=table 等数据表格元素数量',
  }));
  metricIds.push('m-table-grid');

  def.metrics.push(makeMetric('m-live-regions', '动态更新区域数', 'D05', 'live-regions', {
    description: '带 aria-live/role=status/role=alert 的动态内容区域数量',
  }));
  metricIds.push('m-live-regions');

  // 规则
  def.rules.push(makeRule('r-page-loaded', '页面已加载', 'm-interactive', 'GTE', 1, {
    required: true,
    critical: true,
  }));
  ruleIds.push('r-page-loaded');

  def.rules.push(makeRule('r-has-data-blocks', '存在数据区块', 'm-data-blocks', 'GTE', 1, {
    required: true,
  }));
  ruleIds.push('r-has-data-blocks');

  // 步骤
  def.steps = buildCaptureSteps(url, [
    { key: 'data-blocks', selector: '[data-block], [data-widget], [role=region], section' },
    { key: 'chart-count', selector: 'canvas, svg, [class*=chart], [class*=graph]' },
    { key: 'labeled-regions', selector: '[role=region][aria-label], [role=region][aria-labelledby], section[aria-label], section[aria-labelledby]' },
    { key: 'interactive-count', selector: 'button, input, select, a[href], [tabindex]' },
    { key: 'aria-roles', selector: '[role]' },
    { key: 'dom-total', selector: '*' },
    { key: 'skip-nav', selector: 'a[href^="#main"], a[href^="#content"], .skip-link, .skip-nav' },
    { key: 'lang-attr', selector: 'html[lang]' },
    { key: 'focus-visible', selector: ':focus-visible, [tabindex]:not([tabindex="-1"])' },
    { key: 'table-grid', selector: 'table, [role=grid], [role=table], [class*=table], [class*=grid]' },
    { key: 'live-regions', selector: '[aria-live], [role=status], [role=alert], [role=log]' },
  ], metricIds, ruleIds);

  // 策略绑定
  def.policy.bindings = [
    { metricId: 'm-data-blocks', weight: 2, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-charts', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 30, controlPoints: [{x: 0, y: 0}, {x: 30, y: 100}] },
    { metricId: 'm-labeled-regions', weight: 2, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-interactive', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 100, controlPoints: [{x: 0, y: 0}, {x: 100, y: 100}] },
    { metricId: 'm-aria-roles', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 30, controlPoints: [{x: 0, y: 0}, {x: 30, y: 100}] },
    { metricId: 'm-dom-total', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 5000, controlPoints: [{x: 0, y: 0}, {x: 5000, y: 100}] },
    { metricId: 'm-skip-nav', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-lang-attr', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-focus-visible', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-table-grid', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-live-regions', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
  ];
  def.policy.criticalRuleIds = ['r-page-loaded', 'r-has-lang'];
}

// ─── Profile: form ─────────────────────────────────────

function applyFormProfile(def: EvaluationDefinition, url: URL): void {
  const metricIds: string[] = [];
  const ruleIds: string[] = [];

  // 表单元素数
  def.metrics.push(makeMetric('m-form-elements', '表单元素数', 'D01', 'form-elements', {
    description: 'input/select/textarea/button[type=submit] 总数',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-form-elements');

  // 带标签输入框数
  def.metrics.push(makeMetric('m-labeled-inputs', '带标签输入框数', 'D03', 'labeled-inputs', {
    description: '有 aria-label/aria-labelledby/label[for] 关联的输入框数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-labeled-inputs');

  // 必填字段标识数
  def.metrics.push(makeMetric('m-required-fields', '必填字段标识数', 'D03', 'required-fields', {
    description: '带 required/aria-required 属性的表单元素数量',
  }));
  metricIds.push('m-required-fields');

  // 错误提示元素数
  def.metrics.push(makeMetric('m-error-hints', '错误提示元素数', 'D05', 'error-hints', {
    description: '带 role=alert/aria-invalid/aria-describedby 的元素数量',
  }));
  metricIds.push('m-error-hints');

  // 可聚焦元素数
  def.metrics.push(makeMetric('m-focusable', '可聚焦元素数', 'D04', 'focusable-count', {
    description: '可通过 Tab 键到达的元素数量',
  }));
  metricIds.push('m-focusable');

  // ── 通用可访问性指标 ──
  def.metrics.push(makeMetric('m-skip-nav', '跳过导航链接', 'D04', 'skip-nav', {
    description: '指向主内容区域的跳过导航链接数量',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-skip-nav');
  def.rules.push(makeRule('r-has-skip-nav', '存在跳过导航链接', 'm-skip-nav', 'GTE', 1, {
    required: false,
    finding: {
      problemKey: 'a11y-no-skip-nav', title: '缺少跳过导航链接',
      description: '页面未提供跳过重复导航内容的链接', type: 'IMPROVEMENT_OPPORTUNITY',
      severity: 'S2', priority: 'P2', confidence: 'MEDIUM',
    },
  }));
  ruleIds.push('r-has-skip-nav');

  def.metrics.push(makeMetric('m-lang-attr', 'HTML lang 属性', 'D04', 'lang-attr', {
    description: 'html 元素是否设置了 lang 属性（0=无，1=有）',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-lang-attr');
  def.rules.push(makeRule('r-has-lang', '页面设置了 lang 属性', 'm-lang-attr', 'EQ', 1, {
    required: true,
    finding: {
      problemKey: 'a11y-no-lang', title: 'HTML 缺少 lang 属性',
      description: 'html 元素未设置 lang 属性，影响屏幕阅读器的语言识别',
      type: 'CONFIRMED_DEFECT', severity: 'S2', priority: 'P1', confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-has-lang');

  def.metrics.push(makeMetric('m-focus-visible', 'focus-visible 元素数', 'D05', 'focus-visible', {
    description: '使用 :focus-visible 或:focus-within 样式的可交互元素数量',
  }));
  metricIds.push('m-focus-visible');

  // ── 表单页面特定指标 ──
  def.metrics.push(makeMetric('m-step-indicators', '步骤指示器数', 'D03', 'step-indicators', {
    description: '多步骤表单的步骤指示器数量（li/step/progress 等）',
  }));
  metricIds.push('m-step-indicators');

  // 规则
  def.rules.push(makeRule('r-has-form', '存在表单元素', 'm-form-elements', 'GTE', 1, {
    required: true,
    critical: true,
  }));
  ruleIds.push('r-has-form');

  def.rules.push(makeRule('r-inputs-labeled', '输入框有标签', 'm-labeled-inputs', 'GTE', 1, {
    required: true,
  }));
  ruleIds.push('r-inputs-labeled');

  // 步骤
  def.steps = buildCaptureSteps(url, [
    { key: 'form-elements', selector: 'input, select, textarea, button[type=submit]' },
    { key: 'labeled-inputs', selector: 'input[aria-label], input[aria-labelledby], input[id], textarea[aria-label], select[aria-label]' },
    { key: 'required-fields', selector: '[required], [aria-required=true]' },
    { key: 'error-hints', selector: '[role=alert], [aria-invalid], [aria-describedby]' },
    { key: 'focusable-count', selector: 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])' },
    { key: 'skip-nav', selector: 'a[href^="#main"], a[href^="#content"], .skip-link, .skip-nav' },
    { key: 'lang-attr', selector: 'html[lang]' },
    { key: 'focus-visible', selector: ':focus-visible, [tabindex]:not([tabindex="-1"])' },
    { key: 'step-indicators', selector: '[class*=step], [class*=progress], [class*=wizard], [role=progressbar]' },
  ], metricIds, ruleIds);

  // 策略绑定
  def.policy.bindings = [
    { metricId: 'm-form-elements', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 30, controlPoints: [{x: 0, y: 0}, {x: 30, y: 100}] },
    { metricId: 'm-labeled-inputs', weight: 3, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-required-fields', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-error-hints', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
    { metricId: 'm-focusable', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-skip-nav', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-lang-attr', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-focus-visible', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-step-indicators', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
  ];
  def.policy.criticalRuleIds = ['r-has-form', 'r-has-lang'];
}

// ─── Profile: landing ─────────────────────────────────────

function applyLandingProfile(def: EvaluationDefinition, url: URL): void {
  const metricIds: string[] = [];
  const ruleIds: string[] = [];

  // h1 数量（落地页适用）
  def.metrics.push(makeMetric('m-h1', '一级标题数量', 'D03', 'h1-count', {
    description: '页面 h1 元素数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-h1');
  def.rules.push(makeRule('r-h1-exists', '存在一级标题', 'm-h1', 'GTE', 1, { required: true }));
  ruleIds.push('r-h1-exists');

  // 标题层级
  def.metrics.push(makeMetric('m-headings', '标题总数 (h1-h6)', 'D03', 'heading-total', {
    description: '页面所有标题元素总数',
  }));
  metricIds.push('m-headings');

  // CTA 按钮数
  def.metrics.push(makeMetric('m-cta-buttons', 'CTA 按钮数', 'D01', 'cta-buttons', {
    description: '主要行动按钮数量（含 cta/submit/primary 等 class 或 type=submit）',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-cta-buttons');
  def.rules.push(makeRule('r-has-cta', '存在行动按钮', 'm-cta-buttons', 'GTE', 1, {
    required: true,
    critical: true,
  }));
  ruleIds.push('r-has-cta');

  // 图片 alt 缺失数
  def.metrics.push(makeMetric('m-img-alt-missing', '图片缺失 alt 数量', 'D04', 'img-alt-missing', {
    description: '缺少 alt 属性的 img 元素数量',
    direction: 'LOWER_IS_BETTER',
  }));
  metricIds.push('m-img-alt-missing');

  // 可交互元素数
  def.metrics.push(makeMetric('m-interactive', '可交互元素数', 'D03', 'interactive-count', {
    description: 'button/input/select/a[href] 总数',
  }));
  metricIds.push('m-interactive');

  // ── 通用可访问性指标 ──
  def.metrics.push(makeMetric('m-skip-nav', '跳过导航链接', 'D04', 'skip-nav', {
    description: '指向主内容区域的跳过导航链接数量',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-skip-nav');
  def.rules.push(makeRule('r-has-skip-nav', '存在跳过导航链接', 'm-skip-nav', 'GTE', 1, {
    required: false,
    finding: {
      problemKey: 'a11y-no-skip-nav', title: '缺少跳过导航链接',
      description: '页面未提供跳过重复导航内容的链接', type: 'IMPROVEMENT_OPPORTUNITY',
      severity: 'S2', priority: 'P2', confidence: 'MEDIUM',
    },
  }));
  ruleIds.push('r-has-skip-nav');

  def.metrics.push(makeMetric('m-lang-attr', 'HTML lang 属性', 'D04', 'lang-attr', {
    description: 'html 元素是否设置了 lang 属性（0=无，1=有）',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-lang-attr');
  def.rules.push(makeRule('r-has-lang', '页面设置了 lang 属性', 'm-lang-attr', 'EQ', 1, {
    required: true,
    finding: {
      problemKey: 'a11y-no-lang', title: 'HTML 缺少 lang 属性',
      description: 'html 元素未设置 lang 属性，影响屏幕阅读器的语言识别',
      type: 'CONFIRMED_DEFECT', severity: 'S2', priority: 'P1', confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-has-lang');

  def.metrics.push(makeMetric('m-focus-visible', 'focus-visible 元素数', 'D05', 'focus-visible', {
    description: '使用 :focus-visible 或:focus-within 样式的可交互元素数量',
  }));
  metricIds.push('m-focus-visible');

  // ── 落地页特定指标 ──
  def.metrics.push(makeMetric('m-nav-links', '导航链接数', 'D03', 'nav-links', {
    description: '导航区域中的链接数量（nav 元素或 role=navigation 内）',
  }));
  metricIds.push('m-nav-links');

  // 页面加载
  def.rules.push(makeRule('r-page-loaded', '页面已加载', 'm-interactive', 'GTE', 1, {
    required: true,
    critical: true,
  }));
  ruleIds.push('r-page-loaded');

  // 步骤
  def.steps = buildCaptureSteps(url, [
    { key: 'h1-count', selector: 'h1' },
    { key: 'heading-total', selector: 'h1, h2, h3, h4, h5, h6' },
    { key: 'cta-buttons', selector: 'button[class*=cta], button[class*=primary], button[type=submit], a[class*=cta], a[class*=btn]' },
    { key: 'img-alt-missing', selector: 'img:not([alt])' },
    { key: 'interactive-count', selector: 'button, input, select, a[href]' },
    { key: 'skip-nav', selector: 'a[href^="#main"], a[href^="#content"], .skip-link, .skip-nav' },
    { key: 'lang-attr', selector: 'html[lang]' },
    { key: 'focus-visible', selector: ':focus-visible, [tabindex]:not([tabindex="-1"])' },
    { key: 'nav-links', selector: 'nav a, [role=navigation] a' },
  ], metricIds, ruleIds);

  // 策略绑定
  def.policy.bindings = [
    { metricId: 'm-h1', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-headings', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
    { metricId: 'm-cta-buttons', weight: 2, normalization: 'PIECEWISE_LINEAR', min: 0, max: 5, controlPoints: [{x: 0, y: 0}, {x: 5, y: 100}] },
    { metricId: 'm-img-alt-missing', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 100}, {x: 10, y: 0}] },
    { metricId: 'm-interactive', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-skip-nav', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-lang-attr', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-focus-visible', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-nav-links', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
  ];
  def.policy.criticalRuleIds = ['r-has-cta', 'r-page-loaded', 'r-has-lang'];
}

// ─── Profile: settings ─────────────────────────────────────

function applySettingsProfile(def: EvaluationDefinition, url: URL): void {
  const metricIds: string[] = [];
  const ruleIds: string[] = [];

  // 表单/控件元素数
  def.metrics.push(makeMetric('m-form-elements', '设置控件数', 'D01', 'form-elements', {
    description: 'input/select/textarea/button[type=submit]/[role=switch]/[role=checkbox] 总数',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-form-elements');

  // 带标签输入框数
  def.metrics.push(makeMetric('m-labeled-inputs', '带标签控件数', 'D04', 'labeled-inputs', {
    description: '有 aria-label/aria-labelledby/label[for] 关联的输入框和控件数量',
    required: true,
    applicable: true,
  }));
  metricIds.push('m-labeled-inputs');

  // 分组区域数
  def.metrics.push(makeMetric('m-setting-groups', '设置分组数', 'D03', 'setting-groups', {
    description: 'fieldset/role=group/带标题的 section 等设置分组区域数量',
  }));
  metricIds.push('m-setting-groups');

  // 可聚焦元素数
  def.metrics.push(makeMetric('m-focusable', '可聚焦元素数', 'D04', 'focusable-count', {
    description: '可通过 Tab 键到达的元素数量',
  }));
  metricIds.push('m-focusable');

  // ARIA 角色数
  def.metrics.push(makeMetric('m-aria-roles', 'ARIA 角色数', 'D04', 'aria-roles', {
    description: '带 role 属性的元素数量',
  }));
  metricIds.push('m-aria-roles');

  // ── 通用可访问性指标 ──
  def.metrics.push(makeMetric('m-skip-nav', '跳过导航链接', 'D04', 'skip-nav', {
    description: '指向主内容区域的跳过导航链接数量',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-skip-nav');
  def.rules.push(makeRule('r-has-skip-nav', '存在跳过导航链接', 'm-skip-nav', 'GTE', 1, {
    required: false,
    finding: {
      problemKey: 'a11y-no-skip-nav', title: '缺少跳过导航链接',
      description: '页面未提供跳过重复导航内容的链接', type: 'IMPROVEMENT_OPPORTUNITY',
      severity: 'S2', priority: 'P2', confidence: 'MEDIUM',
    },
  }));
  ruleIds.push('r-has-skip-nav');

  def.metrics.push(makeMetric('m-lang-attr', 'HTML lang 属性', 'D04', 'lang-attr', {
    description: 'html 元素是否设置了 lang 属性（0=无，1=有）',
    valueKind: 'NUMBER',
  }));
  metricIds.push('m-lang-attr');
  def.rules.push(makeRule('r-has-lang', '页面设置了 lang 属性', 'm-lang-attr', 'EQ', 1, {
    required: true,
    finding: {
      problemKey: 'a11y-no-lang', title: 'HTML 缺少 lang 属性',
      description: 'html 元素未设置 lang 属性，影响屏幕阅读器的语言识别',
      type: 'CONFIRMED_DEFECT', severity: 'S2', priority: 'P1', confidence: 'HIGH',
    },
  }));
  ruleIds.push('r-has-lang');

  def.metrics.push(makeMetric('m-focus-visible', 'focus-visible 元素数', 'D05', 'focus-visible', {
    description: '使用 :focus-visible 或:focus-within 样式的可交互元素数量',
  }));
  metricIds.push('m-focus-visible');

  // ── 设置页面特定指标 ──
  def.metrics.push(makeMetric('m-live-regions', '状态反馈区域数', 'D05', 'live-regions', {
    description: '带 aria-live/role=status 的反馈区域数量（设置保存成功/失败提示）',
  }));
  metricIds.push('m-live-regions');

  // 规则
  def.rules.push(makeRule('r-has-settings', '存在设置控件', 'm-form-elements', 'GTE', 1, {
    required: true,
    critical: true,
  }));
  ruleIds.push('r-has-settings');

  def.rules.push(makeRule('r-inputs-labeled', '控件有标签', 'm-labeled-inputs', 'GTE', 1, {
    required: true,
  }));
  ruleIds.push('r-inputs-labeled');

  // 步骤
  def.steps = buildCaptureSteps(url, [
    { key: 'form-elements', selector: 'input, select, textarea, button[type=submit], [role=switch], [role=checkbox]' },
    { key: 'labeled-inputs', selector: 'input[aria-label], input[aria-labelledby], input[id], textarea[aria-label], select[aria-label], [role=switch][aria-label], [role=checkbox][aria-label]' },
    { key: 'setting-groups', selector: 'fieldset, [role=group], section[class*=group], [class*=setting-group], [class*=section]' },
    { key: 'focusable-count', selector: 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])' },
    { key: 'aria-roles', selector: '[role]' },
    { key: 'skip-nav', selector: 'a[href^="#main"], a[href^="#content"], .skip-link, .skip-nav' },
    { key: 'lang-attr', selector: 'html[lang]' },
    { key: 'focus-visible', selector: ':focus-visible, [tabindex]:not([tabindex="-1"])' },
    { key: 'live-regions', selector: '[aria-live], [role=status], [role=alert]' },
  ], metricIds, ruleIds);

  // 策略绑定
  def.policy.bindings = [
    { metricId: 'm-form-elements', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-labeled-inputs', weight: 3, normalization: 'PIECEWISE_LINEAR', min: 0, max: 30, controlPoints: [{x: 0, y: 0}, {x: 30, y: 100}] },
    { metricId: 'm-setting-groups', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 20, controlPoints: [{x: 0, y: 0}, {x: 20, y: 100}] },
    { metricId: 'm-focusable', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 100, controlPoints: [{x: 0, y: 0}, {x: 100, y: 100}] },
    { metricId: 'm-aria-roles', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 30, controlPoints: [{x: 0, y: 0}, {x: 30, y: 100}] },
    { metricId: 'm-skip-nav', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-lang-attr', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 1, controlPoints: [{x: 0, y: 0}, {x: 1, y: 100}] },
    { metricId: 'm-focus-visible', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 50, controlPoints: [{x: 0, y: 0}, {x: 50, y: 100}] },
    { metricId: 'm-live-regions', weight: 1, normalization: 'PIECEWISE_LINEAR', min: 0, max: 10, controlPoints: [{x: 0, y: 0}, {x: 10, y: 100}] },
  ];
  def.policy.criticalRuleIds = ['r-has-settings', 'r-has-lang'];

  def.scope.limitations = [
    '设置页面的 D05 交互可靠性为结构代理指标，未测试实际保存操作和错误恢复流程',
  ];
}

// ─── Helpers ─────────────────────────────────────

function makeMetric(
  id: string, name: string, dimensionId: string, sourceKey: string,
  opts: Partial<{
    description: string; metricType: string; valueKind: string;
    direction: string; unit: string; aggregation: string;
    minimum: number; maximum: number; required: boolean;
    applicable: boolean; evidenceRequired: boolean; limitations: string[];
  }> = {},
): NonNullable<EvaluationDefinition['metrics'][number]> {
  return {
    id,
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    version: '0.1.0',
    implementationVersion: '0.1.0',
    name,
    description: opts.description ?? `${name}（结构代理指标）`,
    dimensionId,
    metricType: (opts.metricType as 'PROXY' | 'OBS') ?? 'PROXY',
    valueKind: (opts.valueKind as 'NUMBER' | 'BOOLEAN') ?? 'NUMBER',
    direction: (opts.direction as 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'TARGET_RANGE') ?? 'HIGHER_IS_BETTER',
    sourceKey,
    unit: opts.unit ?? 'count',
    aggregation: (opts.aggregation as 'LATEST' | 'MEAN' | 'SUM') ?? 'LATEST',
    minimumSamples: 1,
    minimum: opts.minimum ?? 0,
    maximum: opts.maximum ?? 10000,
    required: opts.required ?? false,
    applicable: opts.applicable ?? true,
    evidenceRequired: opts.evidenceRequired ?? true,
    limitations: opts.limitations ?? ['DOM count proxy, not direct UX measurement'],
  };
}

function makeRule(
  id: string, name: string, metricId: string,
  op: 'GTE' | 'EQ' | 'LTE' | 'LT' | 'GT',
  expected: number,
  opts: Partial<{
    required: boolean; critical: boolean;
    finding: NonNullable<EvaluationDefinition['rules'][number]>['finding'];
  }> = {},
): NonNullable<EvaluationDefinition['rules'][number]> {
  return {
    id,
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    version: '0.1.0',
    name,
    expression: { op, metricId, expected },
    required: opts.required ?? false,
    critical: opts.critical ?? false,
    ...(opts.finding ? { finding: opts.finding } : {}),
  };
}

interface CaptureTarget {
  key: string;
  selector: string;
}

function buildCaptureSteps(
  url: URL,
  targets: CaptureTarget[],
  metricIds: string[],
  ruleIds: string[],
): NonNullable<EvaluationDefinition['steps']> {
  const base = { required: true, inputRefs: [], requiredCapabilities: [] };
  const steps: NonNullable<EvaluationDefinition['steps']> = [];

  // 1. 导航
  steps.push({
    ...base,
    stepId: 'navigate',
    kind: 'PAGE_NAVIGATION',
    dependsOn: [],
    outputContracts: [],
    sessionId: 'page',
    action: { action: 'NAVIGATE', url: url.href },
  });

  // 2. 逐个采集
  let prevStepId = 'navigate';
  for (const target of targets) {
    const stepId = `cap-${target.key}`;
    steps.push({
      ...base,
      stepId,
      kind: 'OBSERVATION_CAPTURE',
      dependsOn: [prevStepId],
      outputContracts: ['RawObservation', 'Evidence'],
      sessionId: 'page',
      action: {
        action: 'CAPTURE',
        selector: target.selector,
        key: target.key,
        extractor: 'COUNT',
        unit: 'count',
      },
    });
    prevStepId = stepId;
  }

  // 3. 截图
  steps.push({
    ...base,
    stepId: 'screenshot',
    kind: 'OBSERVATION_CAPTURE',
    dependsOn: [prevStepId],
    outputContracts: ['Evidence'],
    sessionId: 'page',
    action: { action: 'SCREENSHOT', name: 'page' },
  });

  // 4. 指标计算
  steps.push({
    ...base,
    stepId: 'calc-metrics',
    kind: 'METRIC_CALCULATION',
    dependsOn: ['screenshot'],
    outputContracts: ['MetricResult'],
    metricIds,
    inputRefs: targets.map((t) => ({ stepId: `cap-${t.key}`, contract: 'RawObservation' })),
  });

  // 5. 规则评估
  if (ruleIds.length > 0) {
    steps.push({
      ...base,
      stepId: 'eval-rules',
      kind: 'RULE_EVALUATION',
      dependsOn: ['calc-metrics'],
      outputContracts: ['RuleResult'],
      ruleIds,
      inputRefs: [{ stepId: 'calc-metrics', contract: 'MetricResult' }],
    });
  }

  // 6. 评分
  steps.push({
    ...base,
    stepId: 'scoring',
    kind: 'SCORING',
    dependsOn: ruleIds.length > 0 ? ['calc-metrics', 'eval-rules', 'screenshot'] : ['calc-metrics', 'screenshot'],
    outputContracts: ['ScoreResult'],
    inputRefs: [{ stepId: 'calc-metrics', contract: 'MetricResult' }],
  });

  return steps;
}

// ─── Offline example (unchanged) ─────────────────────────────────────

function buildOfflineExample(): EvaluationDefinition {
  return {
    id: newId('def'),
    schemaVersion: '1.0.0',
    createdAt: systemClock.now(),
    definitionVersion: '0.1.0',
    name: '示例评价定义（测试用途）',
    target: {
      id: 'target-example',
      name: '示例目标',
      type: 'OFFLINE',
      version: '0.0.0',
      environment: 'test',
    },
    scope: {
      entityIds: [],
      routes: [],
      taskIds: [],
      exclusions: [],
      limitations: ['示例定义仅供测试'],
    },
    dimensions: ['D01'],
    methods: ['AUTOMATED'],
    metrics: [
      {
        id: 'metric-obs-1',
        schemaVersion: '1.0.0',
        createdAt: systemClock.now(),
        version: '0.1.0',
        implementationVersion: '0.1.0',
        name: '页面加载时间',
        description: '从导航到内容可见的时间（测试用途）',
        dimensionId: 'D01',
        metricType: 'OBS',
        valueKind: 'NUMBER',
        direction: 'LOWER_IS_BETTER',
        sourceKey: 'load-time',
        unit: 'ms',
        aggregation: 'LATEST',
        minimumSamples: 1,
        minimum: 0,
        maximum: 60000,
        required: true,
        applicable: true,
        evidenceRequired: false,
        limitations: ['测试用途'],
      },
    ],
    rules: [],
    policy: {
      id: newId('policy'),
      schemaVersion: '1.0.0',
      createdAt: systemClock.now(),
      version: '0.1.0',
      name: '示例评分策略（测试用途）',
      mode: 'SCORE',
      bindings: [
        {
          metricId: 'metric-obs-1',
          weight: 1,
          normalization: 'PIECEWISE_LINEAR',
          min: 0,
          max: 10000,
          controlPoints: [{ x: 0, y: 100 }, { x: 10000, y: 0 }],
        },
      ],
      dimensions: [{ dimensionId: 'D01', weight: 1, minimumCoverage: 0 }],
      missingPolicy: 'EXCLUDE_WITH_DISCLOSURE',
      minimumCoverage: 0,
      allowPartial: true,
      criticalRuleIds: [],
      riskSeverities: [],
      rationale: '示例策略仅供测试',
      limitations: ['测试用途'],
    },
    tasks: [],
    steps: [
      {
        stepId: 'step-obs',
        kind: 'OBSERVATION_CAPTURE',
        dependsOn: [],
        required: true,
        inputRefs: [],
        outputContracts: ['RawObservation'],
        requiredCapabilities: [],
        observation: {
          key: 'load-time',
          value: 1500,
          unit: 'ms',
          entityId: 'target-example',
          scenarioId: 'scenario-example',
          source: 'E1',
          method: 'AUTOMATED',
          observedAt: systemClock.now(),
          sampleId: newId('sample'),
          excluded: false,
        },
      },
      {
        stepId: 'step-metric',
        kind: 'METRIC_CALCULATION',
        dependsOn: ['step-obs'],
        required: true,
        inputRefs: [{ stepId: 'step-obs', contract: 'RawObservation' }],
        outputContracts: ['MetricResult'],
        requiredCapabilities: [],
        metricIds: ['metric-obs-1'],
      },
      {
        stepId: 'step-score',
        kind: 'SCORING',
        dependsOn: ['step-metric'],
        required: true,
        inputRefs: [{ stepId: 'step-metric', contract: 'MetricResult' }],
        outputContracts: ['ScoreResult'],
        requiredCapabilities: [],
      },
    ],
    limitations: ['示例定义仅供测试'],
  };
}
