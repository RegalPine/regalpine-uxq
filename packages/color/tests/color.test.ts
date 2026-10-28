import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseHex,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  relativeLuminance,
  contrastRatio,
  calculateContrast,
  blendColors,
  adjustBrightness,
  adjustSaturation,
  ColorValidator,
  ColorAnalyzer,
  createContrastAARule,
  createContrastAAARule,
  type RGB,
} from '../src/index.js';

describe('@uxq/color', () => {
  describe('颜色转换', () => {
    it('应该解析 HEX 颜色', () => {
      expect(parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0 });
      expect(parseHex('#00ff00')).toEqual({ r: 0, g: 255, b: 0 });
      expect(parseHex('#0000ff')).toEqual({ r: 0, g: 0, b: 255 });
      expect(parseHex('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('应该转换 RGB 到 HEX', () => {
      expect(rgbToHex({ r: 255, g: 0, b: 0 })).toBe('#ff0000');
      expect(rgbToHex({ r: 0, g: 255, b: 0 })).toBe('#00ff00');
      expect(rgbToHex({ r: 0, g: 0, b: 255 })).toBe('#0000ff');
    });

    it('应该转换 RGB 到 HSL', () => {
      const red = rgbToHsl({ r: 255, g: 0, b: 0 });
      expect(red.h).toBeCloseTo(0);
      expect(red.s).toBeCloseTo(100);
      expect(red.l).toBeCloseTo(50);

      const green = rgbToHsl({ r: 0, g: 255, b: 0 });
      expect(green.h).toBeCloseTo(120);
      expect(green.s).toBeCloseTo(100);
      expect(green.l).toBeCloseTo(50);
    });

    it('应该转换 HSL 到 RGB', () => {
      const red = hslToRgb({ h: 0, s: 100, l: 50 });
      expect(red.r).toBeCloseTo(255);
      expect(red.g).toBeCloseTo(0);
      expect(red.b).toBeCloseTo(0);
    });

    it('应该保持往返转换一致性', () => {
      const original: RGB = { r: 128, g: 64, b: 192 };
      const hsl = rgbToHsl(original);
      const back = hslToRgb(hsl);
      expect(back.r).toBeCloseTo(original.r, 0);
      expect(back.g).toBeCloseTo(original.g, 0);
      expect(back.b).toBeCloseTo(original.b, 0);
    });
  });

  describe('对比度计算', () => {
    it('应该计算相对亮度', () => {
      const white = relativeLuminance({ r: 255, g: 255, b: 255 });
      expect(white).toBeCloseTo(1);

      const black = relativeLuminance({ r: 0, g: 0, b: 0 });
      expect(black).toBeCloseTo(0);
    });

    it('应该计算对比度比值', () => {
      const blackWhite = contrastRatio(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(blackWhite).toBeCloseTo(21);

      const same = contrastRatio(
        { r: 128, g: 128, b: 128 },
        { r: 128, g: 128, b: 128 }
      );
      expect(same).toBeCloseTo(1);
    });

    it('应该计算完整对比度结果', () => {
      const result = calculateContrast(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result.ratio).toBeCloseTo(21);
      expect(result.aa).toBe(true);
      expect(result.aaa).toBe(true);
      expect(result.aaLarge).toBe(true);
      expect(result.aaaLarge).toBe(true);
    });

    it('应该识别低对比度', () => {
      const result = calculateContrast(
        { r: 200, g: 200, b: 200 },
        { r: 255, g: 255, b: 255 }
      );
      expect(result.ratio).toBeLessThan(4.5);
      expect(result.aa).toBe(false);
      expect(result.aaa).toBe(false);
    });
  });

  describe('颜色混合', () => {
    it('应该混合两种颜色', () => {
      const result = blendColors(
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 0, b: 255 },
        0.5
      );
      expect(result.color.r).toBeCloseTo(128);
      expect(result.color.g).toBeCloseTo(0);
      expect(result.color.b).toBeCloseTo(128);
    });

    it('应该按比例混合', () => {
      const result = blendColors(
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 0, b: 255 },
        0.75
      );
      expect(result.color.r).toBeCloseTo(191);
      expect(result.color.b).toBeCloseTo(64);
    });

    it('应该拒绝无效比例', () => {
      expect(() =>
        blendColors({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }, -0.1)
      ).toThrow();
      expect(() =>
        blendColors({ r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }, 1.1)
      ).toThrow();
    });
  });

  describe('颜色调整', () => {
    it('应该调整亮度', () => {
      const darker = adjustBrightness({ r: 128, g: 128, b: 128 }, -20);
      const lighter = adjustBrightness({ r: 128, g: 128, b: 128 }, 20);
      expect(rgbToHsl(darker).l).toBeLessThan(rgbToHsl(lighter).l);
    });

    it('应该调整饱和度', () => {
      const moreSaturated = adjustSaturation({ r: 128, g: 64, b: 64 }, 20);
      const lessSaturated = adjustSaturation({ r: 128, g: 64, b: 64 }, -20);
      expect(rgbToHsl(moreSaturated).s).toBeGreaterThanOrEqual(
        rgbToHsl(lessSaturated).s
      );
    });
  });

  describe('ColorValidator', () => {
    let validator: ColorValidator;

    beforeEach(() => {
      validator = new ColorValidator().addDefaultRules();
    });

    it('应该验证高对比度颜色对', () => {
      const results = validator.validate(
        { r: 0, g: 0, b: 0 },
        { r: 255, g: 255, b: 255 }
      );
      expect(validator.isAllPassed(results)).toBe(true);
      expect(validator.getErrors(results)).toHaveLength(0);
    });

    it('应该检测低对比度颜色对', () => {
      const results = validator.validate(
        { r: 200, g: 200, b: 200 },
        { r: 255, g: 255, b: 255 }
      );
      expect(validator.isAllPassed(results)).toBe(false);
      expect(validator.getErrors(results).length).toBeGreaterThan(0);
    });
  });

  describe('ColorAnalyzer', () => {
    let analyzer: ColorAnalyzer;

    beforeEach(() => {
      analyzer = new ColorAnalyzer();
    });

    it('应该分析单个颜色对', () => {
      const results = analyzer.analyzePair({
        name: 'test',
        foreground: { r: 0, g: 0, b: 0 },
        background: { r: 255, g: 255, b: 255 },
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it('应该分析多个颜色对', () => {
      const report = analyzer.analyzePairs([
        {
          name: 'good',
          foreground: { r: 0, g: 0, b: 0 },
          background: { r: 255, g: 255, b: 255 },
        },
        {
          name: 'bad',
          foreground: { r: 200, g: 200, b: 200 },
          background: { r: 255, g: 255, b: 255 },
        },
      ]);
      expect(report.passedCount).toBe(1);
      expect(report.failedCount).toBe(1);
      expect(report.overallScore).toBeCloseTo(50);
    });

    it('应该生成报告', () => {
      const report = analyzer.analyzePairs([
        {
          name: 'primary',
          foreground: { r: 0, g: 0, b: 0 },
          background: { r: 255, g: 255, b: 255 },
        },
      ]);
      const markdown = analyzer.generateReport(report);
      expect(markdown).toContain('颜色对比度分析报告');
      expect(markdown).toContain('primary');
    });
  });
});
