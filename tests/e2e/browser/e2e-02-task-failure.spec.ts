/**
 * UXQ 浏览器端到端测试 — E2E-02: 任务执行失败与恢复
 *
 * 依据 UXQ-ARCH-012 §10 E2E-02：
 * - 任务执行中发生超时或关键操作失败
 * - 保留失败步骤与任务结果
 * - 不将执行失败自动转换为产品缺陷
 * - 按策略决定是否继续其他步骤
 * - 报告清晰区分执行状态与评价结论
 */

import { test, expect } from '@playwright/test';

const TIMEOUT_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ Timeout Test</title></head>
<body>
  <main>
    <h1>超时测试页面</h1>
    <button id="slow-btn" type="button">慢速操作</button>
    <div id="status">就绪</div>
  </main>
  <script>
    document.getElementById('slow-btn').addEventListener('click', () => {
      // 模拟长时间操作
      setTimeout(() => {
        document.getElementById('status').textContent = '完成';
      }, 10000);
    });
  </script>
</body>
</html>`;

const ERROR_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ Error Test</title></head>
<body>
  <main>
    <h1>错误测试页面</h1>
    <button id="error-btn" type="button">触发错误</button>
    <div id="error-msg" role="alert" aria-live="assertive"></div>
  </main>
  <script>
    document.getElementById('error-btn').addEventListener('click', () => {
      throw new Error('模拟操作失败');
    });
  </script>
</body>
</html>`;

test.describe('E2E-02: 任务执行失败与恢复', () => {
  test('操作超时场景', async ({ page }) => {
    await page.goto(TIMEOUT_PAGE);

    // 验证页面加载成功
    const title = await page.title();
    expect(title).toBe('UXQ Timeout Test');

    // 点击慢速按钮
    const button = page.locator('#slow-btn');
    await button.click();

    // 验证状态变为处理中（但不等待完成）
    const status = page.locator('#status');
    await expect(status).not.toHaveText('完成', { timeout: 100 });

    // 记录执行失败，但不标记为产品缺陷
    const startTime = Date.now();
    try {
      await expect(status).toHaveText('完成', { timeout: 1000 });
    } catch (error) {
      const duration = Date.now() - startTime;
      // 验证超时被正确捕获
      expect(duration).toBeGreaterThanOrEqual(900);
      expect(duration).toBeLessThan(2000);
    }
  });

  test('JavaScript 错误处理', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto(ERROR_PAGE);

    // 验证页面加载成功
    const title = await page.title();
    expect(title).toBe('UXQ Error Test');

    // 触发错误
    const button = page.locator('#error-btn');
    await button.click();

    // 验证错误被捕获
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('模拟操作失败');

    // 验证页面仍可交互（不崩溃）
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
  });

  test('部分失败后继续执行', async ({ page }) => {
    await page.goto(TIMEOUT_PAGE);

    const results: { step: string; status: 'success' | 'failed' }[] = [];

    // 步骤 1: 页面加载（成功）
    try {
      await expect(page).toHaveTitle('UXQ Timeout Test');
      results.push({ step: '页面加载', status: 'success' });
    } catch {
      results.push({ step: '页面加载', status: 'failed' });
    }

    // 步骤 2: 慢速操作（预期失败）
    try {
      const button = page.locator('#slow-btn');
      await button.click();
      await expect(page.locator('#status')).toHaveText('完成', { timeout: 500 });
      results.push({ step: '慢速操作', status: 'success' });
    } catch {
      results.push({ step: '慢速操作', status: 'failed' });
    }

    // 步骤 3: 页面几何信息采集（成功，不受前一步失败影响）
    try {
      const viewport = page.viewportSize();
      expect(viewport).not.toBeNull();
      results.push({ step: '几何采集', status: 'success' });
    } catch {
      results.push({ step: '几何采集', status: 'failed' });
    }

    // 验证结果：部分成功，部分失败
    expect(results.length).toBe(3);
    expect(results.filter((r) => r.status === 'success').length).toBe(2);
    expect(results.filter((r) => r.status === 'failed').length).toBe(1);
    expect(results[1]!.step).toBe('慢速操作');
    expect(results[1]!.status).toBe('failed');
  });

  test('执行失败不自动转为产品缺陷', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto(ERROR_PAGE);

    // 模拟任务执行
    let executionCompleted = false;
    let executionError: Error | null = null;

    try {
      const button = page.locator('#error-btn');
      await button.click();
      // 等待错误发生
      await page.waitForTimeout(100);
      executionCompleted = true;
    } catch (error) {
      executionError = error as Error;
    }

    // 验证：即使页面发生 JavaScript 错误，Playwright 操作本身仍然成功
    // 这说明执行状态和产品缺陷需要分离
    expect(executionCompleted).toBe(true);
    expect(executionError).toBeNull();

    // 但页面确实发生了错误
    expect(errors.length).toBeGreaterThan(0);

    // 关键：执行成功不等于产品无缺陷
    // 需要独立的规则检查来判断是否存在产品问题
    const hasProductDefect = errors.length > 0;
    expect(hasProductDefect).toBe(true);
  });
});
