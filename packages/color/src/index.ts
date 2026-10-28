/**
 * @uxq/color - 颜色计算与对比度分析
 *
 * 提供颜色转换、对比度计算、混合和 WCAG 合规性检查。
 * 支持 HEX、RGB、HSL 颜色格式。
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * RGB 颜色
 */
export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

/**
 * HSL 颜色
 */
export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

/**
 * 颜色格式
 */
export type ColorFormat = 'hex' | 'rgb' | 'hsl';

/**
 * 对比度结果
 */
export interface ContrastResult {
  /** 对比度比值 (1-21) */
  ratio: number;
  /** WCAG AA 标准（普通文本 >= 4.5，大文本 >= 3） */
  aa: boolean;
  /** WCAG AAA 标准（普通文本 >= 7，大文本 >= 4.5） */
  aaa: boolean;
  /** 大文本 AA 标准 */
  aaLarge: boolean;
  /** 大文本 AAA 标准 */
  aaaLarge: boolean;
}

/**
 * 颜色混合结果
 */
export interface BlendResult {
  /** 混合后的颜色 */
  color: RGB;
  /** 混合比例 */
  ratio: number;
}

/**
 * 颜色验证规则
 */
export interface ColorRule {
  /** 规则 ID */
  id: string;
  /** 规则描述 */
  description: string;
  /** 检查函数 */
  check: (foreground: RGB, background: RGB) => ColorRuleResult;
}

/**
 * 颜色规则结果
 */
export interface ColorRuleResult {
  /** 是否通过 */
  passed: boolean;
  /** 严重性 */
  severity: 'info' | 'warning' | 'error';
  /** 消息 */
  message: string;
  /** 对比度 */
  contrast?: ContrastResult;
}

// ============================================================================
// 颜色转换工具
// ============================================================================

/**
 * 解析 HEX 颜色
 */
export function parseHex(hex: string): RGB {
  const cleanHex = hex.replace('#', '');
  const bigint = parseInt(cleanHex, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

/**
 * RGB 转 HEX
 */
export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

/**
 * RGB 转 HSL
 */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * HSL 转 RGB
 */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const gray = Math.round(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

// ============================================================================
// 对比度计算
// ============================================================================

/**
 * 计算相对亮度（WCAG 2.0）
 */
export function relativeLuminance(rgb: RGB): number {
  const sRGB = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const linear = sRGB.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

/**
 * 计算对比度（WCAG 2.0）
 */
export function contrastRatio(foreground: RGB, background: RGB): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * 完整的对比度结果
 */
export function calculateContrast(foreground: RGB, background: RGB): ContrastResult {
  const ratio = contrastRatio(foreground, background);
  return {
    ratio,
    aa: ratio >= 4.5,
    aaa: ratio >= 7,
    aaLarge: ratio >= 3,
    aaaLarge: ratio >= 4.5,
  };
}

// ============================================================================
// 颜色混合
// ============================================================================

/**
 * 混合两种颜色
 */
export function blendColors(color1: RGB, color2: RGB, ratio: number = 0.5): BlendResult {
  if (ratio < 0 || ratio > 1) {
    throw new Error('混合比例必须在 0 到 1 之间');
  }

  return {
    color: {
      r: Math.round(color1.r * ratio + color2.r * (1 - ratio)),
      g: Math.round(color1.g * ratio + color2.g * (1 - ratio)),
      b: Math.round(color1.b * ratio + color2.b * (1 - ratio)),
    },
    ratio,
  };
}

/**
 * 调整颜色亮度
 */
export function adjustBrightness(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  hsl.l = Math.max(0, Math.min(100, hsl.l + amount));
  return hslToRgb(hsl);
}

/**
 * 调整颜色饱和度
 */
export function adjustSaturation(rgb: RGB, amount: number): RGB {
  const hsl = rgbToHsl(rgb);
  hsl.s = Math.max(0, Math.min(100, hsl.s + amount));
  return hslToRgb(hsl);
}

// ============================================================================
// 颜色验证规则
// ============================================================================

/**
 * 创建 WCAG AA 对比度规则
 */
export function createContrastAARule(): ColorRule {
  return {
    id: 'wcag-aa-contrast',
    description: 'WCAG AA 对比度要求（普通文本 >= 4.5:1）',
    check: (foreground: RGB, background: RGB) => {
      const contrast = calculateContrast(foreground, background);
      return {
        passed: contrast.aa,
        severity: contrast.aa ? 'info' : 'error',
        message: contrast.aa
          ? `对比度 ${contrast.ratio.toFixed(2)}:1 符合 WCAG AA 标准`
          : `对比度 ${contrast.ratio.toFixed(2)}:1 不符合 WCAG AA 标准（需要 >= 4.5:1）`,
        contrast,
      };
    },
  };
}

/**
 * 创建 WCAG AAA 对比度规则
 */
export function createContrastAAARule(): ColorRule {
  return {
    id: 'wcag-aaa-contrast',
    description: 'WCAG AAA 对比度要求（普通文本 >= 7:1）',
    check: (foreground: RGB, background: RGB) => {
      const contrast = calculateContrast(foreground, background);
      return {
        passed: contrast.aaa,
        severity: contrast.aaa ? 'info' : 'warning',
        message: contrast.aaa
          ? `对比度 ${contrast.ratio.toFixed(2)}:1 符合 WCAG AAA 标准`
          : `对比度 ${contrast.ratio.toFixed(2)}:1 不符合 WCAG AAA 标准（需要 >= 7:1）`,
        contrast,
      };
    },
  };
}

/**
 * 创建大文本对比度规则
 */
export function createLargeTextContrastRule(): ColorRule {
  return {
    id: 'large-text-contrast',
    description: '大文本对比度要求（>= 3:1）',
    check: (foreground: RGB, background: RGB) => {
      const contrast = calculateContrast(foreground, background);
      return {
        passed: contrast.aaLarge,
        severity: contrast.aaLarge ? 'info' : 'error',
        message: contrast.aaLarge
          ? `对比度 ${contrast.ratio.toFixed(2)}:1 符合大文本标准`
          : `对比度 ${contrast.ratio.toFixed(2)}:1 不符合大文本标准（需要 >= 3:1）`,
        contrast,
      };
    },
  };
}

// ============================================================================
// 颜色验证器
// ============================================================================

/**
 * 颜色验证器
 */
export class ColorValidator {
  private rules: ColorRule[] = [];

  /**
   * 添加规则
   */
  addRule(rule: ColorRule): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * 添加默认 WCAG 规则
   */
  addDefaultRules(): this {
    this.addRule(createContrastAARule());
    this.addRule(createContrastAAARule());
    this.addRule(createLargeTextContrastRule());
    return this;
  }

  /**
   * 验证颜色对比度
   */
  validate(foreground: RGB, background: RGB): ColorRuleResult[] {
    return this.rules.map((rule) => rule.check(foreground, background));
  }

  /**
   * 检查是否全部通过
   */
  isAllPassed(results: ColorRuleResult[]): boolean {
    return results.every((r) => r.passed);
  }

  /**
   * 获取错误结果
   */
  getErrors(results: ColorRuleResult[]): ColorRuleResult[] {
    return results.filter((r) => !r.passed && r.severity === 'error');
  }

  /**
   * 获取警告结果
   */
  getWarnings(results: ColorRuleResult[]): ColorRuleResult[] {
    return results.filter((r) => !r.passed && r.severity === 'warning');
  }
}

// ============================================================================
// 颜色分析器
// ============================================================================

/**
 * 颜色对
 */
export interface ColorPair {
  name: string;
  foreground: RGB;
  background: RGB;
}

/**
 * 颜色分析报告
 */
export interface ColorAnalysisReport {
  pairs: ColorPair[];
  results: Map<string, ColorRuleResult[]>;
  overallScore: number;
  passedCount: number;
  failedCount: number;
}

/**
 * 颜色分析器
 */
export class ColorAnalyzer {
  private validator: ColorValidator;

  constructor() {
    this.validator = new ColorValidator().addDefaultRules();
  }

  /**
   * 分析单个颜色对
   */
  analyzePair(pair: ColorPair): ColorRuleResult[] {
    return this.validator.validate(pair.foreground, pair.background);
  }

  /**
   * 分析多个颜色对
   */
  analyzePairs(pairs: ColorPair[]): ColorAnalysisReport {
    const results = new Map<string, ColorRuleResult[]>();
    let passedCount = 0;
    let failedCount = 0;

    for (const pair of pairs) {
      const pairResults = this.analyzePair(pair);
      results.set(pair.name, pairResults);

      if (this.validator.isAllPassed(pairResults)) {
        passedCount++;
      } else {
        failedCount++;
      }
    }

    const total = pairs.length;
    const overallScore = total > 0 ? (passedCount / total) * 100 : 0;

    return {
      pairs,
      results,
      overallScore,
      passedCount,
      failedCount,
    };
  }

  /**
   * 生成分析报告
   */
  generateReport(analysis: ColorAnalysisReport): string {
    const lines: string[] = [];
    lines.push('# 颜色对比度分析报告\n');
    lines.push(`## 总体评分: ${analysis.overallScore.toFixed(1)}/100\n`);
    lines.push(`- 通过: ${analysis.passedCount}`);
    lines.push(`- 失败: ${analysis.failedCount}\n`);

    lines.push('## 详细结果\n');

    for (const [name, results] of analysis.results.entries()) {
      const pair = analysis.pairs.find((p) => p.name === name);
      if (!pair) continue;

      const fgHex = rgbToHex(pair.foreground);
      const bgHex = rgbToHex(pair.background);

      lines.push(`### ${name}`);
      lines.push(`- 前景: ${fgHex}`);
      lines.push(`- 背景: ${bgHex}`);

      for (const result of results) {
        const icon = result.passed ? '✅' : result.severity === 'error' ? '❌' : '⚠️';
        lines.push(`- ${icon} ${result.message}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }
}
