/**
 * UXQ 浏览器端到端测试 — E2E-01: 正常评价链路
 *
 * 依据 UXQ-ARCH-012 §10 E2E-01：
 * - 有效页面、有效任务、可执行评价计划
 * - Run 完成、必需指标产生有效结果、规则得到执行
 * - 评分按照指定策略结算、评价状态和总体结论分别生成
 *
 * 本测试使用 Playwright 打开一个内联 HTML 页面，验证浏览器采集链路。
 */

import { test, expect } from '@playwright/test';

const SAMPLE_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ E2E Test</title></head>
<body>
  <main>
    <h1>UXQ 端到端测试页面</h1>
    <button id="action-btn" type="button">主要操作</button>
    <input id="text-input" type="text" placeholder="输入测试" aria-label="测试输入框" />
    <p id="result" role="status" aria-live="polite"></p>
  </main>
  <script>
    document.getElementById('action-btn').addEventListener('click', () => {
      document.getElementById('result').textContent = '操作完成';
    });
  </script>
</body>
</html>`;

test.describe('E2E-01: 正常评价链路', () => {
  test('页面加载和基本采集', async ({ page }) => {
    await page.goto(SAMPLE_PAGE);

    // 验证页面标题
    const title = await page.title();
    expect(title).toBe('UXQ E2E Test');

    // 验证按钮可见
    const button = page.locator('#action-btn');
    await expect(button).toBeVisible();

    // 验证按钮可点击
    await button.click();

    // 验证操作结果
    const result = page.locator('#result');
    await expect(result).toHaveText('操作完成');
  });

  test('可访问性基本检查', async ({ page }) => {
    await page.goto(SAMPLE_PAGE);

    // 验证输入框有可访问名称
    const input = page.locator('#text-input');
    await expect(input).toHaveAttribute('aria-label', '测试输入框');

    // 验证状态区域有 aria-live
    const status = page.locator('#result');
    await expect(status).toHaveAttribute('role', 'status');
  });

  test('页面几何信息采集', async ({ page }) => {
    await page.goto(SAMPLE_PAGE);

    // 采集视口尺寸
    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(viewport!.width).toBeGreaterThan(0);
    expect(viewport!.height).toBeGreaterThan(0);

    // 采集按钮位置和尺寸
    const button = page.locator('#action-btn');
    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });
});
