import { describe, it, expect, beforeEach } from 'vitest';
import {
  horizontalSpacing,
  verticalSpacing,
  measureSpacing,
  spacingToContainer,
  checkHorizontalAlignment,
  checkVerticalAlignment,
  checkAlignment,
  sizeConsistency,
  detectOverlaps,
  createGrid,
  checkGridConformance,
  LayoutAnalyzer,
  createSpacingConsistencyRule,
  createAlignmentRule,
  createNoOverlapRule,
  type LayoutElement,
  type Rect,
} from '../src/index.js';

describe('@uxq/geometry', () => {
  describe('间距计算', () => {
    it('应该计算水平间距', () => {
      const rect1: Rect = { x: 0, y: 0, width: 100, height: 50 };
      const rect2: Rect = { x: 120, y: 0, width: 100, height: 50 };
      expect(horizontalSpacing(rect1, rect2)).toBe(20);
    });

    it('应该计算垂直间距', () => {
      const rect1: Rect = { x: 0, y: 0, width: 100, height: 50 };
      const rect2: Rect = { x: 0, y: 70, width: 100, height: 50 };
      expect(verticalSpacing(rect1, rect2)).toBe(20);
    });

    it('应该计算完整间距', () => {
      const rect1: Rect = { x: 0, y: 0, width: 100, height: 50 };
      const rect2: Rect = { x: 120, y: 30, width: 100, height: 50 };
      const spacing = measureSpacing(rect1, rect2);
      expect(spacing.horizontal).toBe(20);
      expect(spacing.vertical).toBe(0);
    });

    it('应该计算容器间距', () => {
      const element: Rect = { x: 20, y: 20, width: 100, height: 50 };
      const container: Rect = { x: 0, y: 0, width: 200, height: 200 };
      const spacing = spacingToContainer(element, container);
      expect(spacing.top).toBe(20);
      expect(spacing.right).toBe(80);
      expect(spacing.bottom).toBe(130);
      expect(spacing.left).toBe(20);
    });
  });

  describe('对齐检测', () => {
    it('应该检测水平对齐', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 10, y: 0, width: 50, height: 50 } },
        { id: 'b', rect: { x: 10, y: 60, width: 50, height: 50 } },
        { id: 'c', rect: { x: 10, y: 120, width: 50, height: 50 } },
      ];
      const result = checkHorizontalAlignment(elements, 1);
      expect(result.aligned).toBe(true);
    });

    it('应该检测垂直对齐', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 10, width: 50, height: 50 } },
        { id: 'b', rect: { x: 60, y: 10, width: 50, height: 50 } },
        { id: 'c', rect: { x: 120, y: 10, width: 50, height: 50 } },
      ];
      const result = checkVerticalAlignment(elements, 1);
      expect(result.aligned).toBe(true);
    });

    it('应该检测未对齐情况', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 10, y: 0, width: 50, height: 50 } },
        { id: 'b', rect: { x: 20, y: 60, width: 50, height: 50 } },
      ];
      const result = checkHorizontalAlignment(elements, 1);
      expect(result.aligned).toBe(false);
    });
  });

  describe('尺寸分析', () => {
    it('应该计算尺寸一致性', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'b', rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'c', rect: { x: 0, y: 0, width: 100, height: 50 } },
      ];
      expect(sizeConsistency(elements)).toBe(100);
    });

    it('应该检测尺寸不一致', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'b', rect: { x: 0, y: 0, width: 200, height: 50 } },
      ];
      expect(sizeConsistency(elements)).toBeLessThan(100);
    });

    it('应该检测重叠', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'b', rect: { x: 50, y: 0, width: 100, height: 50 } },
      ];
      const overlaps = detectOverlaps(elements);
      expect(overlaps).toHaveLength(1);
      expect(overlaps[0]).toEqual(['a', 'b']);
    });

    it('应该检测无重叠', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'b', rect: { x: 120, y: 0, width: 100, height: 50 } },
      ];
      const overlaps = detectOverlaps(elements);
      expect(overlaps).toHaveLength(0);
    });
  });

  describe('网格系统', () => {
    it('应该创建网格', () => {
      const container: Rect = { x: 0, y: 0, width: 1000, height: 800 };
      const grid = createGrid(container, {
        columns: 12,
        gutter: 20,
        margin: 40,
      });
      expect(grid).toHaveLength(12);
    });

    it('应该检查网格符合度', () => {
      const container: Rect = { x: 0, y: 0, width: 1000, height: 800 };
      const grid = createGrid(container, {
        columns: 4,
        gutter: 20,
        margin: 40,
      });
      const elements: LayoutElement[] = [
        { id: 'a', rect: grid[0]!.rect },
        { id: 'b', rect: grid[1]!.rect },
      ];
      const score = checkGridConformance(elements, grid, 5);
      expect(score).toBe(100);
    });
  });

  describe('LayoutAnalyzer', () => {
    let analyzer: LayoutAnalyzer;

    beforeEach(() => {
      analyzer = new LayoutAnalyzer().addDefaultRules();
    });

    it('应该分析布局', () => {
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 10, y: 10, width: 100, height: 50 } },
        { id: 'b', rect: { x: 10, y: 70, width: 100, height: 50 } },
        { id: 'c', rect: { x: 10, y: 130, width: 100, height: 50 } },
      ];
      const report = analyzer.analyze(elements);
      expect(report.elements).toHaveLength(3);
      expect(report.overallScore).toBeGreaterThan(0);
    });

    it('应该生成报告', () => {
      const elements: LayoutElement[] = [
        { id: 'a', name: 'Header', rect: { x: 10, y: 10, width: 100, height: 50 } },
      ];
      const report = analyzer.analyze(elements);
      const markdown = analyzer.generateReport(report);
      expect(markdown).toContain('布局分析报告');
      expect(markdown).toContain('Header');
    });
  });

  describe('几何规则', () => {
    it('应该检查间距一致性', () => {
      const rule = createSpacingConsistencyRule(20);
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 0, width: 50, height: 50 } },
        { id: 'b', rect: { x: 70, y: 0, width: 50, height: 50 } },
        { id: 'c', rect: { x: 140, y: 0, width: 50, height: 50 } },
      ];
      const results = rule.check(elements);
      expect(results.length).toBeGreaterThan(0);
    });

    it('应该检查对齐', () => {
      const rule = createAlignmentRule(2);
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 10, y: 10, width: 50, height: 50 } },
        { id: 'b', rect: { x: 10, y: 10, width: 50, height: 50 } },
      ];
      const results = rule.check(elements);
      expect(results[0]!.passed).toBe(true);
    });

    it('应该检查重叠', () => {
      const rule = createNoOverlapRule();
      const elements: LayoutElement[] = [
        { id: 'a', rect: { x: 0, y: 0, width: 100, height: 50 } },
        { id: 'b', rect: { x: 50, y: 0, width: 100, height: 50 } },
      ];
      const results = rule.check(elements);
      expect(results[0]!.passed).toBe(false);
      expect(results[0]!.severity).toBe('error');
    });
  });
});
