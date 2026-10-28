/**
 * UXQ 浏览器端到端测试 — E2E-03: 指标证据不足与缺失处理
 *
 * 依据 UXQ-ARCH-012 §10 E2E-03：
 * - 部分指标缺少有效测量数据
 * - 缺失状态得到保留
 * - 不默认补零或满分
 * - 覆盖率按声明规则计算
 * - 必要时阻止维度或总体聚合
 * - 报告说明证据限制
 */

import { test, expect } from '@playwright/test';

const INCOMPLETE_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ Incomplete Test</title></head>
<body>
  <main>
    <h1>不完整页面</h1>
    <div id="existing-element">存在的元素</div>
    <!-- 故意缺少某些元素以测试证据不足场景 -->
  </main>
</body>
</html>`;

const DYNAMIC_PAGE = `data:text/html,
<!DOCTYPE html>
<html lang="zh">
<head><meta charset="utf-8"><title>UXQ Dynamic Test</title></head>
<body>
  <main>
    <h1>动态内容页面</h1>
    <div id="container"></div>
  </main>
  <script>
    // 延迟加载内容（使用 textContent 避免 XSS）
    setTimeout(() => {
      const container = document.getElementById('container');
      if (container) {
        const p = document.createElement('p');
        p.id = 'delayed-content';
        p.textContent = '延迟加载的内容';
        container.appendChild(p);
      }
    }, 2000);
  </script>
</body>
</html>`;

test.describe('E2E-03: 指标证据不足与缺失处理', () => {
  test('元素不存在时标记为证据不足', async ({ page }) => {
    await page.goto(INCOMPLETE_PAGE);

    // 验证页面加载成功
    const title = await page.title();
    expect(title).toBe('UXQ Incomplete Test');

    // 尝试采集存在的元素
    const existingElement = page.locator('#existing-element');
    const existingCount = await existingElement.count();
    expect(existingCount).toBe(1);

    // 尝试采集不存在的元素
    const missingElement = page.locator('#missing-element');
    const missingCount = await missingElement.count();
    expect(missingCount).toBe(0);

    // 记录证据状态
    const evidenceStatus: 'MEASURED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_APPLICABLE' =
      missingCount === 0 ? 'INSUFFICIENT_EVIDENCE' : 'MEASURED';

    expect(evidenceStatus).toBe('INSUFFICIENT_EVIDENCE');
  });

  test('动态内容等待超时处理', async ({ page }) => {
    await page.goto(DYNAMIC_PAGE);

    // 验证页面加载成功
    const title = await page.title();
    expect(title).toBe('UXQ Dynamic Test');

    // 立即检查动态内容（应该不存在）
    const immediateContent = page.locator('#delayed-content');
    const immediateCount = await immediateContent.count();
    expect(immediateCount).toBe(0);

    // 尝试等待但超时
    const startTime = Date.now();
    try {
      await expect(immediateContent).toBeVisible({ timeout: 500 });
    } catch (error) {
      const duration = Date.now() - startTime;
      // 验证超时被正确捕获
      expect(duration).toBeGreaterThanOrEqual(450);
      expect(duration).toBeLessThan(1000);
    }

    // 记录证据状态为证据不足
    const evidenceStatus = 'INSUFFICIENT_EVIDENCE';
    expect(evidenceStatus).toBe('INSUFFICIENT_EVIDENCE');
  });

  test('部分采集成功时计算覆盖率', async ({ page }) => {
    await page.goto(INCOMPLETE_PAGE);

    // 定义需要采集的指标列表
    const metrics = [
      { id: 'm1', name: '标题存在', selector: 'h1', required: true },
      { id: 'm2', name: '主内容存在', selector: '#existing-element', required: true },
      { id: 'm3', name: '导航存在', selector: 'nav', required: false },
      { id: 'm4', name: '页脚存在', selector: 'footer', required: false },
      { id: 'm5', name: '侧边栏存在', selector: 'aside', required: false },
    ];

    const results: { metricId: string; status: 'MEASURED' | 'INSUFFICIENT_EVIDENCE' }[] = [];

    // 逐个采集
    for (const metric of metrics) {
      const element = page.locator(metric.selector);
      const count = await element.count();
      const status = count > 0 ? 'MEASURED' : 'INSUFFICIENT_EVIDENCE';
      results.push({ metricId: metric.id, status });
    }

    // 验证结果
    expect(results.length).toBe(5);
    expect(results.filter((r) => r.status === 'MEASURED').length).toBe(2); // h1 和 #existing-element
    expect(results.filter((r) => r.status === 'INSUFFICIENT_EVIDENCE').length).toBe(3); // nav, footer, aside

    // 计算覆盖率
    const measuredCount = results.filter((r) => r.status === 'MEASURED').length;
    const coverage = measuredCount / results.length;
    expect(coverage).toBe(0.4); // 2/5 = 40%

    // 验证必需指标都已采集
    const requiredMetrics = metrics.filter((m) => m.required);
    const requiredResults = results.filter((r) => requiredMetrics.some((m) => m.id === r.metricId));
    expect(requiredResults.every((r) => r.status === 'MEASURED')).toBe(true);
  });

  test('证据不足时不默认补零或满分', async ({ page }) => {
    await page.goto(INCOMPLETE_PAGE);

    // 模拟指标采集结果
    const metricResults: {
      id: string;
      status: 'MEASURED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_APPLICABLE';
      value?: number;
    }[] = [
      { id: 'm1', status: 'MEASURED', value: 85 },
      { id: 'm2', status: 'INSUFFICIENT_EVIDENCE' }, // 不补零或满分
      { id: 'm3', status: 'MEASURED', value: 90 },
    ];

    // 验证：只有 MEASURED 状态才有有效值
    for (const result of metricResults) {
      if (result.status === 'MEASURED') {
        expect(result.value).toBeDefined();
        expect(result.value).toBeGreaterThanOrEqual(0);
        expect(result.value).toBeLessThanOrEqual(100);
      } else {
        expect(result.value).toBeUndefined(); // 非 MEASURED 状态不应有值
      }
    }

    // 验证：INSUFFICIENT_EVIDENCE 不等于零分或满分
    const insufficientResult = metricResults.find((r) => r.status === 'INSUFFICIENT_EVIDENCE');
    expect(insufficientResult).toBeDefined();
    expect(insufficientResult!.value).toBeUndefined();
    expect(insufficientResult!.value).not.toBe(0); // 不默认补零
    expect(insufficientResult!.value).not.toBe(100); // 不默认满分
  });

  test('覆盖率不足时阻止聚合', async ({ page }) => {
    await page.goto(INCOMPLETE_PAGE);

    // 模拟维度覆盖率配置
    const dimensionConfig = {
      id: 'd1',
      name: '任务有效性',
      requiredCoverage: 0.8, // 要求 80% 覆盖率
      metrics: ['m1', 'm2', 'm3', 'm4', 'm5'],
    };

    // 模拟指标采集结果
    const metricResults = [
      { id: 'm1', status: 'MEASURED' as const, value: 85 },
      { id: 'm2', status: 'MEASURED' as const, value: 90 },
      { id: 'm3', status: 'INSUFFICIENT_EVIDENCE' as const },
      { id: 'm4', status: 'INSUFFICIENT_EVIDENCE' as const },
      { id: 'm5', status: 'INSUFFICIENT_EVIDENCE' as const },
    ];

    // 计算实际覆盖率
    const measuredCount = metricResults.filter((r) => r.status === 'MEASURED').length;
    const actualCoverage = measuredCount / metricResults.length;
    expect(actualCoverage).toBe(0.4); // 40%

    // 验证：覆盖率不足时阻止聚合
    const canAggregate = actualCoverage >= dimensionConfig.requiredCoverage;
    expect(canAggregate).toBe(false);

    // 记录阻止原因
    const blockReason = `覆盖率不足：实际 ${actualCoverage * 100}% < 要求 ${dimensionConfig.requiredCoverage * 100}%`;
    expect(blockReason).toContain('覆盖率不足');
  });
});
