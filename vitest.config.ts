import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: [
      'packages/*/tests/**/*.test.ts',
      'integrations/*/tests/**/*.test.ts',
      'tests/**/*.test.ts',
    ],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'tests/e2e/**', // E2E 测试由 Playwright 执行
      'tests/browser/**', // 浏览器测试由 Playwright 执行
      'tests/governance/**', // 治理测试需要文档目录，暂不纳入 CI
    ],
    testTimeout: 15000,
    restoreMocks: true,
  },
});
