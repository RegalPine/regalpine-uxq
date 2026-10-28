import { describe, it, expect } from 'vitest';
import { RadixDomAdapter } from '../src/index.js';

describe('@uxq/radix', () => {
  describe('RadixDomAdapter', () => {
    it('应该创建适配器实例', () => {
      const adapter = new RadixDomAdapter();
      expect(adapter).toBeDefined();
    });

    it('应该创建带选项的适配器实例', () => {
      const adapter = new RadixDomAdapter({
        cssVariableMap: {
          'color-primary': '--color-primary',
        },
      });
      expect(adapter).toBeDefined();
    });

    it('应该解析组件类型', () => {
      const adapter = new RadixDomAdapter();

      // 模拟 DOM 元素
      const mockElement = {
        attributes: [
          { name: 'data-radix-dialog-content', value: '' },
          { name: 'data-state', value: 'open' },
        ],
        getAttribute: (name: string) => {
          const attrs: Record<string, string> = {
            'data-radix-dialog-content': '',
            'data-state': 'open',
          };
          return attrs[name] ?? null;
        },
      } as unknown as Element;

      const binding = adapter.resolveComponent(mockElement);

      expect(binding).toBeDefined();
      expect(binding?.componentType).toBe('dialog-content');
      expect(binding?.state).toBe('open');
    });

    it('应该返回 undefined 当没有 Radix 属性时', () => {
      const adapter = new RadixDomAdapter();

      const mockElement = {
        attributes: [{ name: 'class', value: 'my-component' }],
        getAttribute: () => null,
      } as unknown as Element;

      const binding = adapter.resolveComponent(mockElement);

      expect(binding).toBeUndefined();
    });

    it('应该解析主题上下文', () => {
      const adapter = new RadixDomAdapter();

      // 模拟带主题父元素的 DOM 结构
      const parentElement = {
        getAttribute: (name: string) => {
          if (name === 'data-theme') return 'dark';
          if (name === 'data-uxq-id') return 'app-root';
          return null;
        },
        parentElement: null,
      } as unknown as Element;

      const childElement = {
        getAttribute: () => null,
        parentElement,
      } as unknown as Element;

      const theme = adapter.resolveTheme(childElement);

      expect(theme).toBeDefined();
      expect(theme?.themeId).toBe('dark');
      expect(theme?.declaredBy).toBe('app-root');
    });

    it('应该返回 undefined 当没有主题时', () => {
      const adapter = new RadixDomAdapter();

      const mockElement = {
        getAttribute: () => null,
        parentElement: null,
      } as unknown as Element;

      const theme = adapter.resolveTheme(mockElement);

      expect(theme).toBeUndefined();
    });

    it('应该跳过容器属性', () => {
      const adapter = new RadixDomAdapter();

      const mockElement = {
        attributes: [
          { name: 'data-radix-portal', value: '' },
          { name: 'data-radix-dialog-content', value: '' },
        ],
        getAttribute: (name: string) => {
          const attrs: Record<string, string> = {
            'data-radix-portal': '',
            'data-radix-dialog-content': '',
          };
          return attrs[name] ?? null;
        },
      } as unknown as Element;

      const binding = adapter.resolveComponent(mockElement);

      expect(binding).toBeDefined();
      expect(binding?.componentType).toBe('dialog-content');
    });
  });
});
