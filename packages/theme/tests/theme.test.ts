import { describe, it, expect, beforeEach } from 'vitest';
import { ThemeManager, ThemeValidator, type Theme, type ThemeConfig } from '../src/index.js';

describe('@uxq/theme', () => {
  describe('ThemeManager', () => {
    let manager: ThemeManager;

    beforeEach(() => {
      manager = new ThemeManager();
    });

    it('应该定义主题', () => {
      const config: ThemeConfig = {
        id: 'light',
        name: 'light',
        tokens: [{ name: 'color-primary', value: '#007bff', type: 'color' }],
      };

      const theme = manager.defineTheme(config);

      expect(theme.id).toBe('light');
      expect(theme.name).toBe('light');
      expect(Object.keys(theme.tokens)).toHaveLength(1);
    });

    it('应该切换主题', () => {
      const lightConfig: ThemeConfig = {
        id: 'light',
        name: 'light',
        tokens: [],
      };
      const darkConfig: ThemeConfig = {
        id: 'dark',
        name: 'dark',
        tokens: [],
      };

      manager.defineTheme(lightConfig);
      manager.defineTheme(darkConfig);
      manager.switchTheme('dark');

      const current = manager.getCurrentTheme();
      expect(current?.id).toBe('dark');
    });

    it('应该抛出错误当主题不存在', () => {
      expect(() => manager.switchTheme('nonexistent')).toThrow('主题不存在');
    });

    it('应该获取所有主题', () => {
      manager.defineTheme({ id: 'light', name: 'light', tokens: [] });
      manager.defineTheme({ id: 'dark', name: 'dark', tokens: [] });

      const themes = manager.getAllThemes();
      expect(themes).toHaveLength(2);
    });

    it('应该生成测试矩阵', () => {
      const matrix = manager.generateMatrix(['light', 'dark'], ['chromium', 'firefox', 'webkit']);

      expect(matrix.total).toBe(6);
      expect(matrix.enabled).toBe(6);
      expect(matrix.items).toHaveLength(6);
    });

    it('应该处理主题继承', () => {
      const baseConfig: ThemeConfig = {
        id: 'base',
        name: 'light',
        tokens: [{ name: 'color-primary', value: '#007bff', type: 'color' }],
      };
      const childConfig: ThemeConfig = {
        id: 'child',
        name: 'dark',
        tokens: [{ name: 'color-secondary', value: '#6c757d', type: 'color' }],
        extends: 'base',
      };

      manager.defineTheme(baseConfig);
      const child = manager.defineTheme(childConfig);

      expect(Object.keys(child.tokens)).toHaveLength(2);
      expect(child.tokens['color-primary']).toBeDefined();
      expect(child.tokens['color-secondary']).toBeDefined();
    });
  });

  describe('ThemeValidator', () => {
    let validator: ThemeValidator;

    beforeEach(() => {
      validator = new ThemeValidator();
    });

    it('应该验证有效的主题', () => {
      const theme: Theme = {
        id: 'light',
        name: 'light',
        tokens: {
          'color-primary': { name: 'color-primary', value: '#007bff', type: 'color' },
        },
        rules: [],
      };

      const result = validator.validateTheme(theme);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测缺少 ID 的主题', () => {
      const theme = {
        id: '',
        name: 'light',
        tokens: {},
        rules: [],
      } as Theme;

      const result = validator.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
    });

    it('应该检测缺少名称的主题', () => {
      const theme = {
        id: 'light',
        name: '',
        tokens: {},
        rules: [],
      } as Theme;

      const result = validator.validateTheme(theme);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_NAME')).toBe(true);
    });

    it('应该警告空 Token 集合', () => {
      const theme: Theme = {
        id: 'light',
        name: 'light',
        tokens: {},
        rules: [],
      };

      const result = validator.validateTheme(theme);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.code === 'NO_TOKENS')).toBe(true);
    });

    it('应该检查对比度', () => {
      const theme: Theme = {
        id: 'light',
        name: 'light',
        tokens: {
          'color-primary': { name: 'color-primary', value: '#007bff', type: 'color' },
        },
        rules: [],
      };

      const results = validator.checkContrast(theme);

      expect(results).toHaveLength(1);
      expect(results[0].tokenName).toBe('color-primary');
      expect(results[0].ratio).toBeGreaterThan(0);
    });

    it('应该检查可读性', () => {
      const theme: Theme = {
        id: 'light',
        name: 'light',
        tokens: {
          'font-body': { name: 'font-body', value: '16px', type: 'typography' },
        },
        rules: [],
      };

      const results = validator.checkReadability(theme);

      expect(results).toHaveLength(1);
      expect(results[0].passed).toBe(true);
    });

    it('应该检查一致性', () => {
      const theme: Theme = {
        id: 'light',
        name: 'light',
        tokens: {
          'color-primary': { name: 'color-primary', value: '#007bff', type: 'color' },
          'color-secondary': { name: 'color-secondary', value: '#6c757d', type: 'color' },
        },
        rules: [],
      };

      const results = validator.checkConsistency(theme);

      expect(results).toHaveLength(1);
      expect(results[0].consistent).toBe(true);
    });
  });
});
