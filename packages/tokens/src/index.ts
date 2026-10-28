/**
 * @uxq/tokens - Design Token 解析与验证
 *
 * 提供 Design Token 的解析、验证、转换和比较能力。
 * 支持 W3C Design Token 格式（JSON/YAML）。
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Design Token 类型
 */
export type TokenType =
  'color' | 'spacing' | 'typography' | 'border' | 'shadow' | 'opacity' | 'size' | 'time';

/**
 * Design Token 定义
 */
export interface DesignToken {
  /** Token 名称（唯一标识） */
  name: string;
  /** Token 值 */
  value: string | number;
  /** Token 类型 */
  type: TokenType;
  /** Token 描述 */
  description?: string;
  /** Token 分组 */
  group?: string;
  /** 扩展属性 */
  extensions?: Record<string, unknown>;
}

/**
 * Token 解析错误
 */
export interface TokenError {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 错误位置（JSON Path） */
  path?: string;
}

/**
 * Token 解析警告
 */
export interface TokenWarning {
  /** 警告代码 */
  code: string;
  /** 警告消息 */
  message: string;
  /** 警告位置 */
  path?: string;
}

/**
 * Token 解析结果
 */
export interface TokenParseResult {
  /** 解析出的 Token 列表 */
  tokens: DesignToken[];
  /** 错误列表 */
  errors: TokenError[];
  /** 警告列表 */
  warnings: TokenWarning[];
}

/**
 * Token 验证结果
 */
export interface TokenValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: TokenError[];
  /** 警告列表 */
  warnings: TokenWarning[];
}

/**
 * 转换后的 Token
 */
export interface TransformedToken extends DesignToken {
  /** 原始值 */
  originalValue: string | number;
  /** 转换后的值 */
  transformedValue: string | number;
  /** 应用的主题 */
  theme?: string;
}

/**
 * Token 差异
 */
export interface TokenDiff {
  /** Token 名称 */
  name: string;
  /** 差异类型 */
  type: 'added' | 'removed' | 'modified';
  /** 基线值 */
  baseline?: DesignToken;
  /** 当前值 */
  current?: DesignToken;
}

/**
 * Token 注册表配置
 */
export interface TokenRegistryConfig {
  /** 是否允许重复名称 */
  allowDuplicates?: boolean;
  /** 是否自动验证 */
  autoValidate?: boolean;
}

// ============================================================================
// Token 解析器
// ============================================================================

/**
 * Design Token 解析器
 *
 * 支持 JSON 和 YAML 格式的 Token 定义解析。
 */
export class TokenParser {
  /**
   * 解析 Token 定义
   *
   * @param input - Token 定义字符串（JSON 或 YAML）
   * @param format - 格式类型（'json' 或 'yaml'）
   * @returns 解析结果
   */
  parse(input: string, format: 'json' | 'yaml' = 'json'): TokenParseResult {
    const result: TokenParseResult = {
      tokens: [],
      errors: [],
      warnings: [],
    };

    try {
      // 解析输入
      let parsed: unknown;
      if (format === 'json') {
        parsed = JSON.parse(input);
      } else {
        // YAML 解析（简化实现，实际应使用 yaml 库）
        result.errors.push({
          code: 'YAML_NOT_SUPPORTED',
          message: 'YAML 格式暂不支持，请使用 JSON 格式',
        });
        return result;
      }

      // 验证解析结果
      if (typeof parsed !== 'object' || parsed === null) {
        result.errors.push({
          code: 'INVALID_FORMAT',
          message: 'Token 定义必须是对象',
        });
        return result;
      }

      // 提取 Token
      this.extractTokens(parsed as Record<string, unknown>, '', result);
    } catch (error) {
      result.errors.push({
        code: 'PARSE_ERROR',
        message: `解析失败: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    return result;
  }

  /**
   * 递归提取 Token
   */
  private extractTokens(
    obj: Record<string, unknown>,
    path: string,
    result: TokenParseResult,
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (this.isToken(value)) {
        // 是 Token 定义
        const token = this.parseToken(key, value as Record<string, unknown>, currentPath, result);
        if (token) {
          result.tokens.push(token);
        }
      } else if (typeof value === 'object' && value !== null) {
        // 是分组，递归提取
        this.extractTokens(value as Record<string, unknown>, currentPath, result);
      }
    }
  }

  /**
   * 检查是否是 Token 定义
   */
  private isToken(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const obj = value as Record<string, unknown>;
    return 'value' in obj && 'type' in obj;
  }

  /**
   * 解析单个 Token
   */
  private parseToken(
    name: string,
    obj: Record<string, unknown>,
    path: string,
    result: TokenParseResult,
  ): DesignToken | null {
    const token: DesignToken = {
      name,
      value: obj.value as string | number,
      type: obj.type as TokenType,
    };

    // 验证类型
    if (!this.isValidTokenType(token.type)) {
      result.errors.push({
        code: 'INVALID_TOKEN_TYPE',
        message: `无效的 Token 类型: ${token.type}`,
        path,
      });
      return null;
    }

    // 可选属性
    if (typeof obj.description === 'string') {
      token.description = obj.description;
    }
    if (typeof obj.group === 'string') {
      token.group = obj.group;
    }
    if (typeof obj.extensions === 'object' && obj.extensions !== null) {
      token.extensions = obj.extensions as Record<string, unknown>;
    }

    return token;
  }

  /**
   * 验证 Token 类型
   */
  private isValidTokenType(type: string): type is TokenType {
    const validTypes: TokenType[] = [
      'color',
      'spacing',
      'typography',
      'border',
      'shadow',
      'opacity',
      'size',
      'time',
    ];
    return validTypes.includes(type as TokenType);
  }
}

// ============================================================================
// Token 验证器
// ============================================================================

/**
 * Design Token 验证器
 */
export class TokenValidator {
  /**
   * 验证 Token 列表
   */
  validate(tokens: DesignToken[]): TokenValidationResult {
    const result: TokenValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 检查重复名称
    const names = new Set<string>();
    for (const token of tokens) {
      if (names.has(token.name)) {
        result.errors.push({
          code: 'DUPLICATE_NAME',
          message: `重复的 Token 名称: ${token.name}`,
        });
        result.valid = false;
      }
      names.add(token.name);
    }

    // 检查引用
    for (const token of tokens) {
      if (
        typeof token.value === 'string' &&
        token.value.startsWith('{') &&
        token.value.endsWith('}')
      ) {
        const ref = token.value.slice(1, -1);
        if (!names.has(ref)) {
          result.warnings.push({
            code: 'UNRESOLVED_REFERENCE',
            message: `未解析的引用: ${token.value}`,
          });
        }
      }
    }

    return result;
  }
}

// ============================================================================
// Token 转换器
// ============================================================================

/**
 * Design Token 转换器
 */
export class TokenTransformer {
  /**
   * 转换 Token 列表
   *
   * @param tokens - Token 列表
   * @param theme - 应用的主题
   * @returns 转换后的 Token 列表
   */
  transform(tokens: DesignToken[], theme?: string): TransformedToken[] {
    return tokens.map((token) => ({
      ...token,
      originalValue: token.value,
      transformedValue: this.transformValue(token, theme),
      theme,
    }));
  }

  /**
   * 转换单个 Token 值
   */
  private transformValue(token: DesignToken, theme?: string): string | number {
    // 简化实现：直接返回原值
    // 实际应根据主题进行变量替换
    return token.value;
  }
}

// ============================================================================
// Token 注册表
// ============================================================================

/**
 * Design Token 注册表
 */
export class TokenRegistry {
  private tokens: Map<string, DesignToken> = new Map();
  private config: TokenRegistryConfig;

  constructor(config: TokenRegistryConfig = {}) {
    this.config = {
      allowDuplicates: false,
      autoValidate: true,
      ...config,
    };
  }

  /**
   * 注册 Token
   */
  register(tokens: DesignToken[]): TokenValidationResult {
    const result: TokenValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 验证
    if (this.config.autoValidate) {
      const validator = new TokenValidator();
      const validationResult = validator.validate([...this.tokens.values(), ...tokens]);
      if (!validationResult.valid) {
        return validationResult;
      }
    }

    // 注册
    for (const token of tokens) {
      if (!this.config.allowDuplicates && this.tokens.has(token.name)) {
        result.errors.push({
          code: 'DUPLICATE_NAME',
          message: `重复的 Token 名称: ${token.name}`,
        });
        result.valid = false;
        continue;
      }
      this.tokens.set(token.name, token);
    }

    return result;
  }

  /**
   * 解析 Token 名称
   */
  resolve(name: string): DesignToken | undefined {
    return this.tokens.get(name);
  }

  /**
   * 获取所有 Token
   */
  getAll(): DesignToken[] {
    return Array.from(this.tokens.values());
  }

  /**
   * 比较 Token 差异
   */
  compare(baseline: DesignToken[], current: DesignToken[]): TokenDiff[] {
    const diffs: TokenDiff[] = [];
    const baselineMap = new Map(baseline.map((t) => [t.name, t]));
    const currentMap = new Map(current.map((t) => [t.name, t]));

    // 查找新增和修改
    for (const [name, currentToken] of currentMap) {
      const baselineToken = baselineMap.get(name);
      if (!baselineToken) {
        diffs.push({
          name,
          type: 'added',
          current: currentToken,
        });
      } else if (
        baselineToken.value !== currentToken.value ||
        baselineToken.type !== currentToken.type
      ) {
        diffs.push({
          name,
          type: 'modified',
          baseline: baselineToken,
          current: currentToken,
        });
      }
    }

    // 查找删除
    for (const [name, baselineToken] of baselineMap) {
      if (!currentMap.has(name)) {
        diffs.push({
          name,
          type: 'removed',
          baseline: baselineToken,
        });
      }
    }

    return diffs;
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.tokens.clear();
  }
}

// ============================================================================
// 导出
// ============================================================================

export default {
  TokenParser,
  TokenValidator,
  TokenTransformer,
  TokenRegistry,
};
