import { defineConfig, devices } from '@playwright/test';

/**
 * UXQ 浏览器端到端测试配置
 *
 * 依据 UXQ-ARCH-002 §12.1 和 UXQ-ARCH-012 §9.4：
 * - 使用 Playwright 验证真实页面交互和采集链路
 * - 覆盖页面加载、任务执行、浏览器事件采集、指标计算、规则判定、证据保存、结果结算、报告生成
 * - 与纯领域逻辑测试分离，避免启动成本过高
 */
export default defineConfig({
  testDir: './tests/e2e/browser',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : 2,
  reporter: 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    // Chromium Light/Dark 主题矩阵（借鉴 UIQ P12-01）
    {
      name: 'chromium-light',
      use: { ...devices['Desktop Chrome'], colorScheme: 'light' },
    },
    {
      name: 'chromium-dark',
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    // Firefox 和 WebKit 支持（可选，按需启用）
    // {
    //   name: 'firefox-light',
    //   use: { ...devices['Desktop Firefox'], colorScheme: 'light' },
    // },
    // {
    //   name: 'firefox-dark',
    //   use: { ...devices['Desktop Firefox'], colorScheme: 'dark' },
    // },
    // {
    //   name: 'webkit-light',
    //   use: { ...devices['Desktop Safari'], colorScheme: 'light' },
    // },
    // {
    //   name: 'webkit-dark',
    //   use: { ...devices['Desktop Safari'], colorScheme: 'dark' },
    // },
  ],
  // E2E 测试目标由测试用例自行指定
});
