import { describe, expect, it } from 'vitest';
import {
  STANDARD_VIEWPORTS,
  STANDARD_BROWSERS,
  generateBrowserMatrix,
  validateBrowserMatrix,
} from '@uxq/browser';
import type { ViewportConfig, BrowserMatrixConfig } from '@uxq/browser';

describe('M4.6: 多浏览器/视口验收矩阵', () => {
  it('标准视口列表包含主要尺寸', () => {
    expect(STANDARD_VIEWPORTS.length).toBeGreaterThanOrEqual(5);
    
    const names = STANDARD_VIEWPORTS.map((v) => v.name);
    expect(names).toContain('mobile');
    expect(names).toContain('tablet');
    expect(names).toContain('desktop');
  });

  it('标准浏览器列表包含三种引擎', () => {
    expect(STANDARD_BROWSERS).toContain('chromium');
    expect(STANDARD_BROWSERS).toContain('firefox');
    expect(STANDARD_BROWSERS).toContain('webkit');
    expect(STANDARD_BROWSERS).toHaveLength(3);
  });

  it('生成默认浏览器矩阵（laptop + desktop）', () => {
    const matrix = generateBrowserMatrix();

    // 3 browsers × 2 viewports × 1 color scheme = 6
    expect(matrix).toHaveLength(6);
    
    // 每个浏览器都有 laptop 和 desktop
    for (const browser of STANDARD_BROWSERS) {
      const configs = matrix.filter((c) => c.browser === browser);
      expect(configs).toHaveLength(2);
      expect(configs.map((c) => c.viewport.name)).toContain('laptop');
      expect(configs.map((c) => c.viewport.name)).toContain('desktop');
    }
  });

  it('自定义浏览器和视口生成矩阵', () => {
    const matrix = generateBrowserMatrix({
      browsers: ['chromium', 'firefox'],
      viewports: [STANDARD_VIEWPORTS[0]!, STANDARD_VIEWPORTS[3]!], // mobile-small + tablet
      colorSchemes: ['light', 'dark'],
      locale: 'en-US',
    });

    // 2 browsers × 2 viewports × 2 color schemes = 8
    expect(matrix).toHaveLength(8);
    
    // 检查 locale
    expect(matrix.every((c) => c.locale === 'en-US')).toBe(true);
    
    // 检查所有组合都存在
    const combos = matrix.map((c) => `${c.browser}-${c.viewport.name}-${c.colorScheme}`);
    expect(combos).toContain('chromium-mobile-small-light');
    expect(combos).toContain('chromium-mobile-small-dark');
    expect(combos).toContain('chromium-tablet-light');
    expect(combos).toContain('firefox-tablet-dark');
  });

  it('验证完整矩阵', () => {
    const matrix = generateBrowserMatrix({
      browsers: ['chromium', 'firefox', 'webkit'],
      viewports: [STANDARD_VIEWPORTS[4]!, STANDARD_VIEWPORTS[5]!], // laptop + desktop
    });

    const result = validateBrowserMatrix(
      matrix,
      ['chromium', 'firefox', 'webkit'],
      [STANDARD_VIEWPORTS[4]!, STANDARD_VIEWPORTS[5]!],
    );

    expect(result.complete).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('验证不完整矩阵报告缺失组合', () => {
    const partial: BrowserMatrixConfig[] = [
      {
        browser: 'chromium',
        viewport: STANDARD_VIEWPORTS[5]!,
        colorScheme: 'light',
        locale: 'zh-CN',
      },
    ];

    const result = validateBrowserMatrix(
      partial,
      ['chromium', 'firefox'],
      [STANDARD_VIEWPORTS[4]!, STANDARD_VIEWPORTS[5]!],
    );

    expect(result.complete).toBe(false);
    expect(result.missing).toContain('chromium + laptop');
    expect(result.missing).toContain('firefox + laptop');
    expect(result.missing).toContain('firefox + desktop');
  });

  it('视口配置包含尺寸和描述', () => {
    for (const viewport of STANDARD_VIEWPORTS) {
      expect(viewport.name).toBeTruthy();
      expect(viewport.width).toBeGreaterThan(0);
      expect(viewport.height).toBeGreaterThan(0);
      expect(viewport.description).toBeTruthy();
    }
  });
});
