import { describe, it, expect, beforeEach } from 'vitest';
import {
  TokenParser,
  TokenValidator,
  TokenTransformer,
  TokenRegistry,
  type DesignToken,
} from '../src/index.js';

describe('@uxq/tokens', () => {
  describe('TokenParser', () => {
    let parser: TokenParser;

    beforeEach(() => {
      parser = new TokenParser();
    });

    it('应该解析简单的 Token 定义', () => {
      const input = JSON.stringify({
        color: {
          primary: {
            value: '#007bff',
            type: 'color',
            description: '主色调',
          },
        },
      });

      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(1);
      expect(result.tokens[0]).toMatchObject({
        name: 'primary',
        value: '#007bff',
        type: 'color',
        description: '主色调',
      });
    });

    it('应该解析嵌套的 Token 定义', () => {
      const input = JSON.stringify({
        color: {
          primary: {
            value: '#007bff',
            type: 'color',
          },
          secondary: {
            value: '#6c757d',
            type: 'color',
          },
        },
        spacing: {
          small: {
            value: 8,
            type: 'spacing',
          },
        },
      });

      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(3);
      expect(result.tokens.map((t) => t.name)).toEqual(['primary', 'secondary', 'small']);
    });

    it('应该处理无效的 JSON', () => {
      const input = '{ invalid json }';
      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('PARSE_ERROR');
    });

    it('应该处理非对象输入', () => {
      const input = JSON.stringify('not an object');
      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_FORMAT');
    });

    it('应该拒绝无效的 Token 类型', () => {
      const input = JSON.stringify({
        invalid: {
          value: 'test',
          type: 'invalid_type',
        },
      });

      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('INVALID_TOKEN_TYPE');
    });

    it('应该处理空对象', () => {
      const input = JSON.stringify({});
      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(0);
      expect(result.tokens).toHaveLength(0);
    });

    it('应该解析带扩展属性的 Token', () => {
      const input = JSON.stringify({
        token: {
          value: '#fff',
          type: 'color',
          extensions: {
            'com.example': {
              deprecated: true,
            },
          },
        },
      });

      const result = parser.parse(input, 'json');

      expect(result.errors).toHaveLength(0);
      expect(result.tokens[0].extensions).toBeDefined();
      expect(result.tokens[0].extensions?.['com.example']).toEqual({ deprecated: true });
    });
  });

  describe('TokenValidator', () => {
    let validator: TokenValidator;

    beforeEach(() => {
      validator = new TokenValidator();
    });

    it('应该验证有效的 Token 列表', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
        { name: 'color-secondary', value: '#6c757d', type: 'color' },
      ];

      const result = validator.validate(tokens);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('应该检测重复的 Token 名称', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
        { name: 'color-primary', value: '#ff0000', type: 'color' },
      ];

      const result = validator.validate(tokens);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('DUPLICATE_NAME');
    });

    it('应该警告未解析的引用', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '{color-base}', type: 'color' },
      ];

      const result = validator.validate(tokens);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].code).toBe('UNRESOLVED_REFERENCE');
    });

    it('应该接受已解析的引用', () => {
      const tokens: DesignToken[] = [
        { name: 'color-base', value: '#007bff', type: 'color' },
        { name: 'color-primary', value: '{color-base}', type: 'color' },
      ];

      const result = validator.validate(tokens);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('TokenTransformer', () => {
    let transformer: TokenTransformer;

    beforeEach(() => {
      transformer = new TokenTransformer();
    });

    it('应该转换 Token 列表', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
      ];

      const result = transformer.transform(tokens, 'light');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        name: 'color-primary',
        originalValue: '#007bff',
        transformedValue: '#007bff',
        theme: 'light',
      });
    });

    it('应该保留原始值', () => {
      const tokens: DesignToken[] = [
        { name: 'spacing-small', value: 8, type: 'spacing' },
      ];

      const result = transformer.transform(tokens);

      expect(result[0].originalValue).toBe(8);
      expect(result[0].transformedValue).toBe(8);
    });
  });

  describe('TokenRegistry', () => {
    let registry: TokenRegistry;

    beforeEach(() => {
      registry = new TokenRegistry();
    });

    it('应该注册 Token', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
      ];

      const result = registry.register(tokens);

      expect(result.valid).toBe(true);
      expect(registry.getAll()).toHaveLength(1);
    });

    it('应该解析已注册的 Token', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
      ];

      registry.register(tokens);
      const resolved = registry.resolve('color-primary');

      expect(resolved).toBeDefined();
      expect(resolved?.value).toBe('#007bff');
    });

    it('应该拒绝重复的 Token 名称', () => {
      const tokens1: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
      ];
      const tokens2: DesignToken[] = [
        { name: 'color-primary', value: '#ff0000', type: 'color' },
      ];

      registry.register(tokens1);
      const result = registry.register(tokens2);

      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('DUPLICATE_NAME');
    });

    it('应该比较 Token 差异', () => {
      const baseline: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
        { name: 'color-secondary', value: '#6c757d', type: 'color' },
      ];
      const current: DesignToken[] = [
        { name: 'color-primary', value: '#0056b3', type: 'color' }, // 修改
        { name: 'color-tertiary', value: '#28a745', type: 'color' }, // 新增
      ];

      const diffs = registry.compare(baseline, current);

      expect(diffs).toHaveLength(3);
      expect(diffs.find((d) => d.name === 'color-primary')?.type).toBe('modified');
      expect(diffs.find((d) => d.name === 'color-tertiary')?.type).toBe('added');
      expect(diffs.find((d) => d.name === 'color-secondary')?.type).toBe('removed');
    });

    it('应该清空注册表', () => {
      const tokens: DesignToken[] = [
        { name: 'color-primary', value: '#007bff', type: 'color' },
      ];

      registry.register(tokens);
      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
    });
  });
});
