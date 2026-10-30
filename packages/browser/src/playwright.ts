import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { chromium, firefox, webkit } from 'playwright';
import type { Browser, Page } from 'playwright';
import { invariant, UxqError } from '@uxq/core';
import { assertProfile } from '@uxq/contracts';
import type { ExecutionProfile, SuccessCondition } from '@uxq/contracts';
import type { BrowserAdapter, BrowserSession } from './index.js';

/** 私网默认拒绝；本地测试必须同时声明 origin 和 allowPrivateNetwork。 */
function privateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(ip) === 4) {
    const [a = 0, b = 0] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19));
  }
  // IPv6 仅允许全局单播，映射 IPv4、回环、链路本地、ULA 均不隐式放行。
  return isIP(ip) !== 6 || !/^[23][0-9a-f]{3}:/.test(ip);
}

export async function assertBrowserUrl(url: string, profile: ExecutionProfile): Promise<void> {
  const parsed = new URL(url);
  invariant(['http:', 'https:'].includes(parsed.protocol), 'URL_PROTOCOL', '仅支持 HTTP(S) 页面');
  invariant(!parsed.username && !parsed.password, 'URL_CREDENTIALS', 'URL 不得携带凭据');
  invariant(profile.allowedOrigins.includes(parsed.origin), 'ORIGIN_DENIED', `origin 未授权：${parsed.origin}`);
  if (!profile.allowPrivateNetwork) {
    const host = parsed.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    invariant(addresses.length > 0 && addresses.every((entry) => !privateAddress(entry.address)),
      'PRIVATE_NETWORK_DENIED', '私网访问需要显式授权');
  }
}

/** 真实浏览器适配器。启动失败显式报错，不降级为内存桩。 */
export class PlaywrightBrowserAdapter implements BrowserAdapter {
  async launch(profile: ExecutionProfile): Promise<BrowserSession> {
    assertProfile(profile);
    let browser: Browser;
    try {
      browser = await { chromium, firefox, webkit }[profile.browser].launch({ headless: profile.headless });
    } catch {
      throw new UxqError('BROWSER_UNAVAILABLE',
        `无法启动 ${profile.browser}；请先安装对应 Playwright 浏览器（pnpm exec playwright install ${profile.browser}）`, 'ENVIRONMENT');
    }
    try {
      const context = await browser.newContext({
        viewport: profile.viewport, locale: profile.locale, colorScheme: profile.colorScheme,
        serviceWorkers: 'block', acceptDownloads: false,
      });
      const page = await context.newPage();
      page.setDefaultTimeout(profile.stepTimeoutMs);
      page.setDefaultNavigationTimeout(profile.stepTimeoutMs);
      const session = new PlaywrightBrowserSession(browser, page, profile);
      await context.route('**/*', async (route) => {
        try {
          await assertBrowserUrl(route.request().url(), profile);
          invariant(profile.allowSideEffects || ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()),
            'SIDE_EFFECT_DENIED', '非只读网络请求需要 allowSideEffects 授权');
          // 浏览器内部的重定向不会再次经过 route；按 profile.maxRedirects 控制是否自动跟随。
          const response = await route.fetch({ maxRedirects: profile.maxRedirects, timeout: profile.stepTimeoutMs });
          try {
            if (profile.maxRedirects === 0) {
              invariant(response.status() < 300 || response.status() >= 400 || response.status() === 304,
                'REDIRECT_UNSUPPORTED', '当前采集拒绝 HTTP 重定向；请提供最终授权 URL 或设置 maxRedirects > 0');
            }
            await route.fulfill({ response });
          } finally { await response.dispose(); }
        } catch (error) {
          session.networkError = error instanceof Error ? error : new Error('请求被拒绝');
          await route.abort('blockedbyclient');
        }
      });
      if (!profile.allowWebSocket) {
        await context.routeWebSocket(/.*/, (socket) => {
          session.networkError = new Error('当前采集不支持 WebSocket，请使用明确的 HTTP 测试流程或设置 allowWebSocket: true');
          socket.close();
        });
      }
      if (!profile.allowPopup) {
        context.on('page', (popup) => {
          if (popup !== page) {
            session.networkError = new Error('当前采集不支持多页面弹窗，请设置 allowPopup: true');
            void popup.close();
          }
        });
      }
      return session;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }
}

class PlaywrightBrowserSession implements BrowserSession {
  readonly kind = 'playwright';
  readonly browserVersion: string;
  networkError: Error | undefined;
  private readonly secretSelectors = new Set<string>();
  constructor(private readonly browser: Browser, private readonly page: Page,
    private readonly profile: ExecutionProfile) {
    this.browserVersion = `${profile.browser}/${browser.version()}`;
  }
  assertHealthy(): void { if (this.networkError) throw this.networkError; }
  async navigate(url: string): Promise<void> {
    await assertBrowserUrl(url, this.profile);
    try {
      const response = await this.page.goto(url, { waitUntil: 'load' });
      this.assertHealthy();
      invariant(!response || response.ok(), 'HTTP_ERROR', `页面响应失败：${response?.status()}`);
    } catch (error) { this.assertHealthy(); throw error; }
  }
  async click(selector: string): Promise<void> { await this.page.locator(selector).click(); this.assertHealthy(); }
  async fill(selector: string, value: string): Promise<void> { await this.page.locator(selector).fill(value); }
  async fillSecret(selector: string, reference: string): Promise<void> {
    const value = process.env[reference];
    invariant(value !== undefined, 'SECRET_MISSING', `未提供环境变量：${reference}`);
    this.secretSelectors.add(selector);
    // Playwright 的原始异常可能包含填充值，不向日志传播。
    try { await this.page.locator(selector).fill(value); }
    catch { throw new UxqError('SECRET_FILL_FAILED', '秘密填充失败，请检查定位器与页面状态', 'EXECUTION'); }
  }
  async pressKey(key: string): Promise<void> { await this.page.keyboard.press(key); this.assertHealthy(); }
  async waitFor(selector: string, state: 'visible' | 'hidden' | 'attached' | 'detached'): Promise<void> {
    await this.page.locator(selector).waitFor({ state }); this.assertHealthy();
  }
  private async assertPublic(selector: string): Promise<void> {
    const target = this.page.locator(selector);
    const sensitive = await target.evaluate((el) => el.matches('input[type="password"]'));
    invariant(!sensitive, 'SECRET_CAPTURE_DENIED', '不能采集密码输入框');
    for (const secret of this.secretSelectors) {
      const contains = await this.page.locator(secret).evaluateAll((elements, query) => {
        const candidates = document.querySelectorAll(query);
        return Array.from(candidates).some((candidate) => elements.some((element) => candidate.contains(element)));
      }, selector);
      invariant(!contains, 'SECRET_CAPTURE_DENIED', '不能采集含秘密输入框的元素');
    }
  }
  async captureText(selector: string): Promise<string> {
    this.assertHealthy(); await this.assertPublic(selector); return await this.page.locator(selector).innerText();
  }
  async captureCount(selector: string): Promise<number> { this.assertHealthy(); return this.page.locator(selector).count(); }
  async captureVisible(selector: string): Promise<boolean> { this.assertHealthy(); return this.page.locator(selector).isVisible(); }
  async captureValue(selector: string): Promise<string> {
    this.assertHealthy(); await this.assertPublic(selector); return this.page.locator(selector).inputValue();
  }
  async captureAccessibleName(selector: string): Promise<string> {
    this.assertHealthy(); await this.assertPublic(selector);
    const snapshot = await this.page.locator(selector).ariaSnapshot();
    const first = snapshot.split('\n')[0] ?? '';
    const label = first.match(/^\s*-\s+\w+\s+("(?:[^"\\]|\\.)*")/);
    return label ? JSON.parse(label[1]!) as string : '';
  }
  async checkCondition(condition: SuccessCondition): Promise<boolean> {
    this.assertHealthy();
    switch (condition.kind) {
      case 'TEXT': return await this.captureText(condition.selector!) === condition.equals;
      case 'VISIBLE': return await this.captureVisible(condition.selector!) === condition.equals;
      case 'URL': return this.page.url() === condition.equals;
      case 'ATTRIBUTE': return await this.page.locator(condition.selector!).getAttribute(condition.attribute!) === condition.equals;
      case 'BUSINESS_JSON':
        throw new UxqError('UNSUPPORTED_CONDITION', 'BUSINESS_JSON 尚未接入；请使用页面可验证条件，不得假定成功', 'INPUT');
    }
  }
  async screenshot(_name: string): Promise<Uint8Array> {
    this.assertHealthy();
    return this.page.screenshot({ fullPage: true,
      mask: [this.page.locator('input[type="password"]'), ...[...this.secretSelectors].map((s) => this.page.locator(s))],
    });
  }
  async close(): Promise<void> { await this.browser.close(); }
}
