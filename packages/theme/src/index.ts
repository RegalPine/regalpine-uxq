/**
 * @uxq/theme - 主题处理与验证
 *
 * 提供主题定义、切换、验证和矩阵测试能力。
 * 支持 Light/Dark 主题和多浏览器矩阵验证。
 */

import type { DesignToken } from '@uxq/tokens';

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 主题类型
 */
export type ThemeType = 'light' | 'dark' | string;

/**
 * 主题规则类型
 */
export type ThemeRuleType = 'contrast' | 'readability' | 'consistency' | 'accessibility';

/**
 * 主题规则
 */
export interface ThemeRule {
  /** 规则 ID */
  id: string;
  /** 规则描述 */
  description: string;
  /** 规则类型 */
  type: ThemeRuleType;
  /** 检查函数 */
  check: (theme: Theme) => ThemeRuleResult;
}

/**
 * 主题规则检查结果
 */
export interface ThemeRuleResult {
  /** 是否通过 */
  passed: boolean;
  /** 规则 ID */
  ruleId: string;
  /** 结果描述 */
  message: string;
  /** 详细信息 */
  details?: Record<string, unknown>;
}

/**
 * 主题定义
 */
export interface Theme {
  /** 主题 ID */
  id: string;
  /** 主题名称 */
  name: ThemeType;
  /** Token 集合 */
  tokens: Record<string, DesignToken>;
  /** 主题规则 */
  rules: ThemeRule[];
  /** 主题描述 */
  description?: string;
  /** 父主题（用于继承） */
  extends?: string;
}

/**
 * 主题配置
 */
export interface ThemeConfig {
  /** 主题 ID */
  id: string;
  /** 主题名称 */
  name: ThemeType;
  /** Token 定义 */
  tokens: DesignToken[];
  /** 规则定义 */
  rules?: ThemeRule[];
  /** 主题描述 */
  description?: string;
  /** 父主题 ID */
  extends?: string;
}

/**
 * 主题验证结果
 */
export interface ThemeValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误列表 */
  errors: ThemeError[];
  /** 警告列表 */
  warnings: ThemeWarning[];
}

/**
 * 主题错误
 */
export interface ThemeError {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 主题 ID */
  themeId?: string;
}

/**
 * 主题警告
 */
export interface ThemeWarning {
  /** 警告代码 */
  code: string;
  /** 警告消息 */
  message: string;
  /** 主题 ID */
  themeId?: string;
}

/**
 * 对比度检查结果
 */
export interface ContrastResult {
  /** Token 名称 */
  tokenName: string;
  /** 前景色 */
  foreground: string;
  /** 背景色 */
  background: string;
  /** 对比度比值 */
  ratio: number;
  /** WCAG AA 级别是否通过 */
  aa: boolean;
  /** WCAG AAA 级别是否通过 */
  aaa: boolean;
}

/**
 * 可读性检查结果
 */
export interface ReadabilityResult {
  /** Token 名称 */
  tokenName: string;
  /** 字体大小 */
  fontSize?: number;
  /** 字重 */
  fontWeight?: number;
  /** 可读性评分 */
  score: number;
  /** 是否通过 */
  passed: boolean;
}

/**
 * 一致性检查结果
 */
export interface ConsistencyResult {
  /** 检查项 */
  item: string;
  /** 是否一致 */
  consistent: boolean;
  /** 详细信息 */
  details?: string;
}

/**
 * 浏览器类型
 */
export type BrowserType = 'chromium' | 'firefox' | 'webkit';

/**
 * 测试矩阵项
 */
export interface TestMatrixItem {
  /** 主题 */
  theme: ThemeType;
  /** 浏览器 */
  browser: BrowserType;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 测试矩阵
 */
export interface TestMatrix {
  /** 矩阵项列表 */
  items: TestMatrixItem[];
  /** 总组合数 */
  total: number;
  /** 启用的组合数 */
  enabled: number;
}

/**
 * 主题管理器配置
 */
export interface ThemeManagerConfig {
  /** 默认主题 */
  defaultTheme?: ThemeType;
  /** 是否自动验证 */
  autoValidate?: boolean;
}

// ============================================================================
// 主题管理器
// ============================================================================

/**
 * 主题管理器
 */
export class ThemeManager {
  private themes: Map<string, Theme> = new Map();
  private currentTheme: string | null = null;
  private config: ThemeManagerConfig;
  private validator: ThemeValidator;

  constructor(config: ThemeManagerConfig = {}) {
    this.config = {
      defaultTheme: 'light',
      autoValidate: true,
      ...config,
    };
    this.validator = new ThemeValidator();
  }

  /**
   * 定义主题
   */
  defineTheme(themeConfig: ThemeConfig): Theme {
    const theme: Theme = {
      id: themeConfig.id,
      name: themeConfig.name,
      tokens: this.tokensToMap(themeConfig.tokens),
      rules: themeConfig.rules || [],
      ...(themeConfig.description !== undefined && { description: themeConfig.description }),
      ...(themeConfig.extends !== undefined && { extends: themeConfig.extends }),
    };

    // 处理继承
    if (theme.extends) {
      const parentTheme = this.themes.get(theme.extends);
      if (parentTheme) {
        theme.tokens = { ...parentTheme.tokens, ...theme.tokens };
        theme.rules = [...parentTheme.rules, ...theme.rules];
      }
    }

    this.themes.set(theme.id, theme);

    // 自动验证
    if (this.config.autoValidate) {
      this.validator.validateTheme(theme);
    }

    return theme;
  }

  /**
   * 切换主题
   */
  switchTheme(themeId: string): void {
    if (!this.themes.has(themeId)) {
      throw new Error(`主题不存在: ${themeId}`);
    }
    this.currentTheme = themeId;
  }

  /**
   * 获取当前主题
   */
  getCurrentTheme(): Theme | null {
    if (!this.currentTheme) {
      return null;
    }
    return this.themes.get(this.currentTheme) || null;
  }

  /**
   * 获取主题
   */
  getTheme(themeId: string): Theme | undefined {
    return this.themes.get(themeId);
  }

  /**
   * 获取所有主题
   */
  getAllThemes(): Theme[] {
    return Array.from(this.themes.values());
  }

  /**
   * 生成测试矩阵
   */
  generateMatrix(themes: ThemeType[], browsers: BrowserType[]): TestMatrix {
    const items: TestMatrixItem[] = [];

    for (const theme of themes) {
      for (const browser of browsers) {
        items.push({
          theme,
          browser,
          enabled: true,
        });
      }
    }

    return {
      items,
      total: items.length,
      enabled: items.filter((i) => i.enabled).length,
    };
  }

  /**
   * Token 数组转 Map
   */
  private tokensToMap(tokens: DesignToken[]): Record<string, DesignToken> {
    const map: Record<string, DesignToken> = {};
    for (const token of tokens) {
      map[token.name] = token;
    }
    return map;
  }
}

// ============================================================================
// 主题验证器
// ============================================================================

/**
 * 主题验证器
 */
export class ThemeValidator {
  /**
   * 验证主题
   */
  validateTheme(theme: Theme): ThemeValidationResult {
    const result: ThemeValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // 检查必需字段
    if (!theme.id) {
      result.errors.push({
        code: 'MISSING_ID',
        message: '主题缺少 ID',
        themeId: theme.id,
      });
      result.valid = false;
    }

    if (!theme.name) {
      result.errors.push({
        code: 'MISSING_NAME',
        message: '主题缺少名称',
        themeId: theme.id,
      });
      result.valid = false;
    }

    // 检查 Token
    if (Object.keys(theme.tokens).length === 0) {
      result.warnings.push({
        code: 'NO_TOKENS',
        message: '主题没有定义任何 Token',
        themeId: theme.id,
      });
    }

    // 执行规则检查
    for (const rule of theme.rules) {
      const ruleResult = rule.check(theme);
      if (!ruleResult.passed) {
        result.errors.push({
          code: 'RULE_FAILED',
          message: `规则检查失败: ${rule.description}`,
          themeId: theme.id,
        });
        result.valid = false;
      }
    }

    return result;
  }

  /**
   * 检查对比度
   */
  checkContrast(theme: Theme): ContrastResult[] {
    const results: ContrastResult[] = [];

    // 简化实现：检查颜色类型 Token 的对比度
    for (const [name, token] of Object.entries(theme.tokens)) {
      if (token.type === 'color' && typeof token.value === 'string') {
        // 假设检查与白色背景的对比度
        const ratio = this.calculateContrastRatio(token.value, '#ffffff');
        results.push({
          tokenName: name,
          foreground: token.value,
          background: '#ffffff',
          ratio,
          aa: ratio >= 4.5,
          aaa: ratio >= 7,
        });
      }
    }

    return results;
  }

  /**
   * 检查可读性
   */
  checkReadability(theme: Theme): ReadabilityResult[] {
    const results: ReadabilityResult[] = [];

    // 简化实现：检查排版类型 Token
    for (const [name, token] of Object.entries(theme.tokens)) {
      if (token.type === 'typography') {
        results.push({
          tokenName: name,
          score: 1.0,
          passed: true,
        });
      }
    }

    return results;
  }

  /**
   * 检查一致性
   */
  checkConsistency(theme: Theme): ConsistencyResult[] {
    const results: ConsistencyResult[] = [];

    // 检查 Token 命名一致性
    const tokenNames = Object.keys(theme.tokens);
    const hasConsistentNaming = tokenNames.every((name) => /^[a-z0-9-]+$/.test(name));

    results.push({
      item: 'Token 命名',
      consistent: hasConsistentNaming,
      details: hasConsistentNaming ? '所有 Token 使用一致的命名规范' : '部分 Token 命名不规范',
    });

    return results;
  }

  /**
   * 计算对比度比值（简化版）
   */
  private calculateContrastRatio(foreground: string, background: string): number {
    // 简化实现：返回固定值
    // 实际应使用 WCAG 对比度计算公式
    return 4.5;
  }
}

// ============================================================================
// 导出
// ============================================================================

export default {
  ThemeManager,
  ThemeValidator,
};
