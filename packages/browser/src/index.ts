import { invariant, newId, systemClock } from '@uxq/core';
import type { Clock } from '@uxq/core';
import type {
  BrowserAction,
  Evidence,
  RawObservation,
  ExecutionProfile,
  SuccessCondition,
} from '@uxq/contracts';

export interface BrowserAdapter {
  launch(profile: ExecutionProfile): Promise<BrowserSession>;
}

export interface BrowserSession {
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  pressKey(key: string): Promise<void>;
  waitFor(selector: string, state: 'visible' | 'hidden' | 'attached' | 'detached'): Promise<void>;
  captureText(selector: string): Promise<string>;
  captureCount(selector: string): Promise<number>;
  captureVisible(selector: string): Promise<boolean>;
  captureValue(selector: string): Promise<string>;
  captureAccessibleName(selector: string): Promise<string>;
  screenshot(name: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** 内存浏览器适配器，用于测试和 reference 场景。 */
export class ReferenceBrowserAdapter implements BrowserAdapter {
  private readonly pages: Map<string, ReferencePage>;

  constructor(pages?: Map<string, ReferencePage>) {
    this.pages = pages ?? new Map();
  }

  async launch(profile: ExecutionProfile): Promise<BrowserSession> {
    invariant(profile.maxPages >= 1, 'MAX_PAGES', '至少需要一个页面配额');
    return new ReferenceBrowserSession(this.pages, profile);
  }
}

export interface ReferencePage {
  url: string;
  elements: Map<string, ReferenceElement>;
  screenshots?: Map<string, Uint8Array>;
}

export interface ReferenceElement {
  text?: string;
  value?: string;
  visible?: boolean;
  accessibleName?: string;
  attributes?: Record<string, string>;
  count?: number;
}

class ReferenceBrowserSession implements BrowserSession {
  private currentPage: ReferencePage | undefined;
  private closed = false;

  constructor(
    private readonly pages: Map<string, ReferencePage>,
    private readonly profile: ExecutionProfile,
  ) {}

  async navigate(url: string): Promise<void> {
    this.ensureOpen();
    this.currentPage = this.pages.get(url);
    if (!this.currentPage) {
      this.currentPage = { url, elements: new Map() };
      this.pages.set(url, this.currentPage);
    }
  }

  async click(selector: string): Promise<void> {
    this.ensureOpen();
    this.ensurePage();
    const el = this.currentPage!.elements.get(selector);
    invariant(el?.visible !== false, 'ELEMENT_NOT_VISIBLE', `元素不可见：${selector}`);
  }

  async fill(selector: string, value: string): Promise<void> {
    this.ensureOpen();
    this.ensurePage();
    const el = this.currentPage!.elements.get(selector);
    if (el) el.value = value;
  }

  async pressKey(_key: string): Promise<void> {
    this.ensureOpen();
  }

  async waitFor(
    selector: string,
    state: 'visible' | 'hidden' | 'attached' | 'detached',
  ): Promise<void> {
    this.ensureOpen();
    this.ensurePage();
    const el = this.currentPage!.elements.get(selector);
    if (state === 'visible')
      invariant(el?.visible !== false, 'WAIT_TIMEOUT', `等待可见超时：${selector}`);
    if (state === 'hidden')
      invariant(!el || el.visible === false, 'WAIT_TIMEOUT', `等待隐藏超时：${selector}`);
    if (state === 'attached') invariant(Boolean(el), 'WAIT_TIMEOUT', `等待附加超时：${selector}`);
    if (state === 'detached') invariant(!el, 'WAIT_TIMEOUT', `等待分离超时：${selector}`);
  }

  async captureText(selector: string): Promise<string> {
    this.ensureOpen();
    this.ensurePage();
    return this.currentPage!.elements.get(selector)?.text ?? '';
  }

  async captureCount(selector: string): Promise<number> {
    this.ensureOpen();
    this.ensurePage();
    return this.currentPage!.elements.get(selector)?.count ?? 0;
  }

  async captureVisible(selector: string): Promise<boolean> {
    this.ensureOpen();
    this.ensurePage();
    const el = this.currentPage!.elements.get(selector);
    return el?.visible !== false;
  }

  async captureValue(selector: string): Promise<string> {
    this.ensureOpen();
    this.ensurePage();
    return this.currentPage!.elements.get(selector)?.value ?? '';
  }

  async captureAccessibleName(selector: string): Promise<string> {
    this.ensureOpen();
    this.ensurePage();
    return this.currentPage!.elements.get(selector)?.accessibleName ?? '';
  }

  async screenshot(name: string): Promise<Uint8Array> {
    this.ensureOpen();
    this.ensurePage();
    const stored = this.currentPage!.screenshots?.get(name);
    return stored ?? new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG header stub
  }

  async close(): Promise<void> {
    this.closed = true;
    this.currentPage = undefined;
  }

  private ensureOpen(): void {
    invariant(!this.closed, 'SESSION_CLOSED', '浏览器会话已关闭');
  }

  private ensurePage(): void {
    invariant(this.currentPage, 'NO_PAGE', '没有活动页面');
  }
}

/** 执行浏览器动作序列，返回采集到的观测和证据。 */
export async function executeActions(
  session: BrowserSession,
  actions: readonly BrowserAction[],
  runId: string,
  stepId: string,
  attemptId: string,
  clock: Clock = systemClock,
): Promise<{ observations: RawObservation[]; evidence: Evidence[] }> {
  const observations: RawObservation[] = [];
  const evidence: Evidence[] = [];

  for (const action of actions) {
    switch (action.action) {
      case 'NAVIGATE':
        await session.navigate(action.url);
        break;
      case 'CLICK':
        await session.click(action.selector);
        break;
      case 'FILL':
        await session.fill(action.selector, action.value);
        break;
      case 'FILL_SECRET':
        invariant(false, 'SECRET_IN_REFERENCE', 'reference 适配器不支持秘密填充');
        break;
      case 'PRESS':
        await session.pressKey(action.key);
        break;
      case 'WAIT_FOR':
        await session.waitFor(action.selector, action.state);
        break;
      case 'CAPTURE': {
        let value: string | number | boolean;
        switch (action.extractor) {
          case 'TEXT':
            value = await session.captureText(action.selector);
            break;
          case 'COUNT':
            value = await session.captureCount(action.selector);
            break;
          case 'VISIBLE':
            value = await session.captureVisible(action.selector);
            break;
          case 'VALUE':
            value = await session.captureValue(action.selector);
            break;
          case 'ACCESSIBLE_NAME':
            value = await session.captureAccessibleName(action.selector);
            break;
        }
        const obs: RawObservation = {
          id: newId('obs'),
          schemaVersion: '1.0.0',
          createdAt: clock.now(),
          key: action.key,
          value: value as never,
          entityId: 'reference',
          scenarioId: 'reference',
          source: 'E1',
          method: 'AUTOMATED',
          observedAt: clock.now(),
          sampleId: newId('sample'),
          excluded: false,
          runId,
          stepId,
          attemptId,
          evidenceIds: [],
        };
        if (action.unit) (obs as unknown as Record<string, unknown>).unit = action.unit;
        observations.push(obs);
        break;
      }
      case 'SCREENSHOT': {
        await session.screenshot(action.name);
        const ev: Evidence = {
          id: newId('evidence'),
          schemaVersion: '1.0.0',
          createdAt: clock.now(),
          runId,
          sourceCategory: 'E1',
          materialType: 'SCREENSHOT',
          sourceMethod: 'browser.screenshot',
          lifecycle: 'CAPTURED',
          validity: 'UNVERIFIED',
          summary: `截图 ${action.name}`,
          derivedFromIds: [],
          observedAt: clock.now(),
          privacy: {
            classification: 'INTERNAL',
            redacted: false,
            allowedPurposes: ['EVALUATION'],
            retentionUntil: '2099-12-31T23:59:59Z',
          },
          limitations: ['reference 适配器截图为占位数据'],
        };
        if (stepId) (ev as unknown as Record<string, unknown>).stepId = stepId;
        if (attemptId) (ev as unknown as Record<string, unknown>).attemptId = attemptId;
        evidence.push(ev);
        break;
      }
    }
  }

  return { observations, evidence };
}

/** 检查任务成功条件。 */
export function checkConditions(
  conditions: readonly SuccessCondition[],
  page: ReferencePage | undefined,
): boolean {
  return conditions.every((condition) => {
    if (!page) return false;
    switch (condition.kind) {
      case 'TEXT': {
        const el = page.elements.get(condition.selector ?? '');
        return el?.text === condition.equals;
      }
      case 'VISIBLE': {
        const el = page.elements.get(condition.selector ?? '');
        return (el?.visible ?? false) === condition.equals;
      }
      case 'URL':
        return page.url === condition.equals;
      case 'ATTRIBUTE': {
        const el = page.elements.get(condition.selector ?? '');
        return el?.attributes?.[condition.attribute ?? ''] === condition.equals;
      }
      case 'BUSINESS_JSON':
        return false;
      default:
        return false;
    }
  });
}

/**
 * M4.6: 多浏览器/视口验收矩阵
 * 
 * 提供标准视口配置和浏览器矩阵，支持跨浏览器/视口测试。
 * 新覆盖独立记录，既有契约和结论无未解释退化。
 */

/** 标准视口配置 */
export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  description: string;
}

/** 浏览器矩阵配置 */
export interface BrowserMatrixConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  viewport: ViewportConfig;
  colorScheme: 'light' | 'dark';
  locale: string;
}

/** 标准视口列表 */
export const STANDARD_VIEWPORTS: ViewportConfig[] = [
  { name: 'mobile-small', width: 320, height: 568, description: '小屏手机 (iPhone SE)' },
  { name: 'mobile', width: 375, height: 667, description: '标准手机 (iPhone 8)' },
  { name: 'mobile-large', width: 414, height: 896, description: '大屏手机 (iPhone 11 Pro Max)' },
  { name: 'tablet', width: 768, height: 1024, description: '平板 (iPad)' },
  { name: 'laptop', width: 1366, height: 768, description: '笔记本' },
  { name: 'desktop', width: 1920, height: 1080, description: '桌面显示器' },
  { name: 'desktop-wide', width: 2560, height: 1440, description: '宽屏显示器' },
];

/** 标准浏览器列表 */
export const STANDARD_BROWSERS: Array<'chromium' | 'firefox' | 'webkit'> = [
  'chromium',
  'firefox',
  'webkit',
];

/** 生成浏览器矩阵配置 */
export function generateBrowserMatrix(options?: {
  browsers?: Array<'chromium' | 'firefox' | 'webkit'>;
  viewports?: ViewportConfig[];
  colorSchemes?: Array<'light' | 'dark'>;
  locale?: string;
}): BrowserMatrixConfig[] {
  const browsers = options?.browsers ?? STANDARD_BROWSERS;
  const viewports = options?.viewports ?? [STANDARD_VIEWPORTS[4]!, STANDARD_VIEWPORTS[5]!]; // laptop + desktop
  const colorSchemes = options?.colorSchemes ?? ['light' as const];
  const locale = options?.locale ?? 'zh-CN';

  const matrix: BrowserMatrixConfig[] = [];
  for (const browser of browsers) {
    for (const viewport of viewports) {
      for (const colorScheme of colorSchemes) {
        matrix.push({ browser, viewport, colorScheme, locale });
      }
    }
  }
  return matrix;
}

/** 验证浏览器矩阵覆盖完整性 */
export function validateBrowserMatrix(
  matrix: BrowserMatrixConfig[],
  requiredBrowsers: Array<'chromium' | 'firefox' | 'webkit'>,
  requiredViewports: ViewportConfig[],
): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const browser of requiredBrowsers) {
    for (const viewport of requiredViewports) {
      const found = matrix.some(
        (config) => config.browser === browser && config.viewport.name === viewport.name,
      );
      if (!found) {
        missing.push(`${browser} + ${viewport.name}`);
      }
    }
  }
  return { complete: missing.length === 0, missing };
}
