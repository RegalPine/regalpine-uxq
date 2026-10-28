/**
 * @uxq/geometry - 几何布局计算与验证
 *
 * 提供布局间距、对齐、尺寸的计算和验证能力。
 * 支持网格系统、弹性布局和设计规范检查。
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 矩形边界
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 点
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * 间距
 */
export interface Spacing {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * 对齐方式
 */
export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * 布局元素
 */
export interface LayoutElement {
  id: string;
  rect: Rect;
  name?: string;
}

/**
 * 间距测量结果
 */
export interface SpacingMeasurement {
  horizontal: number;
  vertical: number;
  diagonal: number;
}

/**
 * 对齐结果
 */
export interface AlignmentResult {
  aligned: boolean;
  axis: 'horizontal' | 'vertical' | 'both';
  tolerance: number;
  deviation: number;
}

/**
 * 几何规则类型
 */
export type GeometryRuleType = 'spacing' | 'alignment' | 'sizing' | 'grid' | 'overlap';

/**
 * 几何验证规则
 */
export interface GeometryRule {
  id: string;
  description: string;
  type: GeometryRuleType;
  check: (elements: LayoutElement[]) => GeometryRuleResult[];
}

/**
 * 几何规则结果
 */
export interface GeometryRuleResult {
  passed: boolean;
  severity: 'info' | 'warning' | 'error';
  message: string;
  elements?: string[];
  ruleType: GeometryRuleType;
}

/**
 * 网格配置
 */
export interface GridConfig {
  columns: number;
  gutter: number;
  margin: number;
  maxWidth?: number;
}

/**
 * 网格单元
 */
export interface GridCell {
  column: number;
  row: number;
  rect: Rect;
}

/**
 * 布局分析报告
 */
export interface LayoutAnalysisReport {
  elements: LayoutElement[];
  spacingConsistency: number;
  alignmentScore: number;
  gridConformance: number;
  overlapIssues: number;
  overallScore: number;
}

// ============================================================================
// 间距计算
// ============================================================================

/**
 * 计算两个矩形之间的水平间距
 */
export function horizontalSpacing(rect1: Rect, rect2: Rect): number {
  const right1 = rect1.x + rect1.width;
  const right2 = rect2.x + rect2.width;

  if (right1 <= rect2.x) {
    return rect2.x - right1;
  }
  if (right2 <= rect1.x) {
    return rect1.x - right2;
  }
  return 0;
}

/**
 * 计算两个矩形之间的垂直间距
 */
export function verticalSpacing(rect1: Rect, rect2: Rect): number {
  const bottom1 = rect1.y + rect1.height;
  const bottom2 = rect2.y + rect2.height;

  if (bottom1 <= rect2.y) {
    return rect2.y - bottom1;
  }
  if (bottom2 <= rect1.y) {
    return rect1.y - bottom2;
  }
  return 0;
}

/**
 * 计算两个矩形之间的完整间距
 */
export function measureSpacing(rect1: Rect, rect2: Rect): SpacingMeasurement {
  const horizontal = horizontalSpacing(rect1, rect2);
  const vertical = verticalSpacing(rect1, rect2);
  const diagonal = Math.sqrt(horizontal * horizontal + vertical * vertical);
  return { horizontal, vertical, diagonal };
}

/**
 * 计算元素与容器的间距
 */
export function spacingToContainer(element: Rect, container: Rect): Spacing {
  return {
    top: element.y - container.y,
    right: container.x + container.width - (element.x + element.width),
    bottom: container.y + container.height - (element.y + element.height),
    left: element.x - container.x,
  };
}

// ============================================================================
// 对齐检测
// ============================================================================

/**
 * 检测水平对齐
 */
export function checkHorizontalAlignment(
  elements: LayoutElement[],
  tolerance: number = 1
): AlignmentResult {
  if (elements.length < 2) {
    return { aligned: true, axis: 'horizontal', tolerance, deviation: 0 };
  }

  const leftEdges = elements.map((e) => e.rect.x);
  const rightEdges = elements.map((e) => e.rect.x + e.rect.width);
  const centers = elements.map((e) => e.rect.x + e.rect.width / 2);

  const checkAlignment = (values: number[]): number => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max - min;
  };

  const leftDeviation = checkAlignment(leftEdges);
  const rightDeviation = checkAlignment(rightEdges);
  const centerDeviation = checkAlignment(centers);

  const minDeviation = Math.min(leftDeviation, rightDeviation, centerDeviation);

  return {
    aligned: minDeviation <= tolerance,
    axis: 'horizontal',
    tolerance,
    deviation: minDeviation,
  };
}

/**
 * 检测垂直对齐
 */
export function checkVerticalAlignment(
  elements: LayoutElement[],
  tolerance: number = 1
): AlignmentResult {
  if (elements.length < 2) {
    return { aligned: true, axis: 'vertical', tolerance, deviation: 0 };
  }

  const topEdges = elements.map((e) => e.rect.y);
  const bottomEdges = elements.map((e) => e.rect.y + e.rect.height);
  const centers = elements.map((e) => e.rect.y + e.rect.height / 2);

  const checkAlignment = (values: number[]): number => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max - min;
  };

  const topDeviation = checkAlignment(topEdges);
  const bottomDeviation = checkAlignment(bottomEdges);
  const centerDeviation = checkAlignment(centers);

  const minDeviation = Math.min(topDeviation, bottomDeviation, centerDeviation);

  return {
    aligned: minDeviation <= tolerance,
    axis: 'vertical',
    tolerance,
    deviation: minDeviation,
  };
}

/**
 * 检测双向对齐
 */
export function checkAlignment(
  elements: LayoutElement[],
  tolerance: number = 1
): AlignmentResult {
  const horizontal = checkHorizontalAlignment(elements, tolerance);
  const vertical = checkVerticalAlignment(elements, tolerance);

  return {
    aligned: horizontal.aligned && vertical.aligned,
    axis: horizontal.aligned && vertical.aligned ? 'both' : horizontal.aligned ? 'horizontal' : 'vertical',
    tolerance,
    deviation: Math.max(horizontal.deviation, vertical.deviation),
  };
}

// ============================================================================
// 尺寸分析
// ============================================================================

/**
 * 计算元素尺寸一致性
 */
export function sizeConsistency(elements: LayoutElement[]): number {
  if (elements.length < 2) return 100;

  const widths = elements.map((e) => e.rect.width);
  const heights = elements.map((e) => e.rect.height);

  const avgWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
  const avgHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  const widthVariance =
    widths.reduce((sum, w) => sum + Math.abs(w - avgWidth), 0) / widths.length;
  const heightVariance =
    heights.reduce((sum, h) => sum + Math.abs(h - avgHeight), 0) / heights.length;

  const widthScore = avgWidth > 0 ? Math.max(0, 100 - (widthVariance / avgWidth) * 100) : 100;
  const heightScore = avgHeight > 0 ? Math.max(0, 100 - (heightVariance / avgHeight) * 100) : 100;

  return (widthScore + heightScore) / 2;
}

/**
 * 检测重叠
 */
export function detectOverlaps(elements: LayoutElement[]): Array<[string, string]> {
  const overlaps: Array<[string, string]> = [];

  for (let i = 0; i < elements.length; i++) {
    for (let j = i + 1; j < elements.length; j++) {
      const rect1 = elements[i].rect;
      const rect2 = elements[j].rect;

      const overlap =
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y;

      if (overlap) {
        overlaps.push([elements[i].id, elements[j].id]);
      }
    }
  }

  return overlaps;
}

// ============================================================================
// 网格系统
// ============================================================================

/**
 * 创建网格
 */
export function createGrid(container: Rect, config: GridConfig): GridCell[] {
  const cells: GridCell[] = [];
  const availableWidth = container.width - config.margin * 2;
  const columnWidth = (availableWidth - config.gutter * (config.columns - 1)) / config.columns;

  for (let col = 0; col < config.columns; col++) {
    const x = container.x + config.margin + col * (columnWidth + config.gutter);
    cells.push({
      column: col,
      row: 0,
      rect: {
        x,
        y: container.y + config.margin,
        width: columnWidth,
        height: container.height - config.margin * 2,
      },
    });
  }

  return cells;
}

/**
 * 检查元素是否符合网格
 */
export function checkGridConformance(
  elements: LayoutElement[],
  grid: GridCell[],
  tolerance: number = 5
): number {
  let conformingCount = 0;

  for (const element of elements) {
    const conforms = grid.some((cell) => {
      const dx = Math.abs(element.rect.x - cell.rect.x);
      const dw = Math.abs(element.rect.width - cell.rect.width);
      return dx <= tolerance && dw <= tolerance;
    });

    if (conforms) {
      conformingCount++;
    }
  }

  return elements.length > 0 ? (conformingCount / elements.length) * 100 : 100;
}

// ============================================================================
// 几何验证规则
// ============================================================================

/**
 * 创建间距一致性规则
 */
export function createSpacingConsistencyRule(expectedSpacing?: number): GeometryRule {
  return {
    id: 'spacing-consistency',
    description: '检查元素间距一致性',
    type: 'spacing',
    check: (elements: LayoutElement[]) => {
      if (elements.length < 2) return [];

      const results: GeometryRuleResult[] = [];
      const spacings: number[] = [];

      for (let i = 0; i < elements.length - 1; i++) {
        const spacing = horizontalSpacing(elements[i].rect, elements[i + 1].rect);
        spacings.push(spacing);
      }

      const avgSpacing = spacings.reduce((a, b) => a + b, 0) / spacings.length;
      const variance = spacings.reduce((sum, s) => sum + Math.abs(s - avgSpacing), 0) / spacings.length;

      const consistent = variance <= 2;

      if (expectedSpacing !== undefined) {
        const matchesExpected = Math.abs(avgSpacing - expectedSpacing) <= 2;
        results.push({
          passed: matchesExpected,
          severity: matchesExpected ? 'info' : 'warning',
          message: matchesExpected
            ? `平均间距 ${avgSpacing.toFixed(1)}px 符合预期 ${expectedSpacing}px`
            : `平均间距 ${avgSpacing.toFixed(1)}px 不符合预期 ${expectedSpacing}px`,
          elements: elements.map((e) => e.id),
          ruleType: 'spacing',
        });
      }

      results.push({
        passed: consistent,
        severity: consistent ? 'info' : 'warning',
        message: consistent
          ? `间距一致性良好（方差 ${variance.toFixed(1)}px）`
          : `间距不一致（方差 ${variance.toFixed(1)}px）`,
        elements: elements.map((e) => e.id),
        ruleType: 'spacing',
      });

      return results;
    },
  };
}

/**
 * 创建对齐规则
 */
export function createAlignmentRule(tolerance: number = 2): GeometryRule {
  return {
    id: 'element-alignment',
    description: '检查元素对齐',
    type: 'alignment',
    check: (elements: LayoutElement[]) => {
      if (elements.length < 2) return [];

      const result = checkAlignment(elements, tolerance);

      return [
        {
          passed: result.aligned,
          severity: result.aligned ? 'info' : 'warning',
          message: result.aligned
            ? `元素对齐良好（偏差 ${result.deviation.toFixed(1)}px）`
            : `元素未对齐（偏差 ${result.deviation.toFixed(1)}px，容差 ${tolerance}px）`,
          elements: elements.map((e) => e.id),
          ruleType: 'alignment',
        },
      ];
    },
  };
}

/**
 * 创建无重叠规则
 */
export function createNoOverlapRule(): GeometryRule {
  return {
    id: 'no-overlap',
    description: '检查元素无重叠',
    type: 'overlap',
    check: (elements: LayoutElement[]) => {
      const overlaps = detectOverlaps(elements);

      if (overlaps.length === 0) {
        return [
          {
            passed: true,
            severity: 'info',
            message: '无元素重叠',
            ruleType: 'overlap',
          },
        ];
      }

      return overlaps.map(([id1, id2]) => ({
        passed: false,
        severity: 'error' as const,
        message: `元素 ${id1} 和 ${id2} 存在重叠`,
        elements: [id1, id2],
        ruleType: 'overlap' as const,
      }));
    },
  };
}

// ============================================================================
// 布局分析器
// ============================================================================

/**
 * 布局分析器
 */
export class LayoutAnalyzer {
  private rules: GeometryRule[] = [];

  /**
   * 添加规则
   */
  addRule(rule: GeometryRule): this {
    this.rules.push(rule);
    return this;
  }

  /**
   * 添加默认规则
   */
  addDefaultRules(): this {
    this.addRule(createSpacingConsistencyRule());
    this.addRule(createAlignmentRule());
    this.addRule(createNoOverlapRule());
    return this;
  }

  /**
   * 分析布局
   */
  analyze(elements: LayoutElement[]): LayoutAnalysisReport {
    const allResults = this.rules.flatMap((rule) => rule.check(elements));

    const passedCount = allResults.filter((r) => r.passed).length;
    const totalCount = allResults.length;
    const overallScore = totalCount > 0 ? (passedCount / totalCount) * 100 : 100;

    const overlaps = detectOverlaps(elements);
    const spacingScore = this.calculateSpacingScore(elements);
    const alignmentScore = this.calculateAlignmentScore(elements);

    return {
      elements,
      spacingConsistency: spacingScore,
      alignmentScore,
      gridConformance: 100,
      overlapIssues: overlaps.length,
      overallScore,
    };
  }

  /**
   * 计算间距得分
   */
  private calculateSpacingScore(elements: LayoutElement[]): number {
    if (elements.length < 2) return 100;

    const spacings: number[] = [];
    for (let i = 0; i < elements.length - 1; i++) {
      spacings.push(horizontalSpacing(elements[i].rect, elements[i + 1].rect));
    }

    const avg = spacings.reduce((a, b) => a + b, 0) / spacings.length;
    const variance = spacings.reduce((sum, s) => sum + Math.abs(s - avg), 0) / spacings.length;

    return Math.max(0, 100 - variance);
  }

  /**
   * 计算对齐得分
   */
  private calculateAlignmentScore(elements: LayoutElement[]): number {
    if (elements.length < 2) return 100;

    const result = checkAlignment(elements, 2);
    return result.aligned ? 100 : Math.max(0, 100 - result.deviation * 10);
  }

  /**
   * 生成分析报告
   */
  generateReport(analysis: LayoutAnalysisReport): string {
    const lines: string[] = [];
    lines.push('# 布局分析报告\n');
    lines.push(`## 总体评分: ${analysis.overallScore.toFixed(1)}/100\n`);
    lines.push('## 指标\n');
    lines.push(`- 元素数量: ${analysis.elements.length}`);
    lines.push(`- 间距一致性: ${analysis.spacingConsistency.toFixed(1)}/100`);
    lines.push(`- 对齐得分: ${analysis.alignmentScore.toFixed(1)}/100`);
    lines.push(`- 网格符合度: ${analysis.gridConformance.toFixed(1)}/100`);
    lines.push(`- 重叠问题: ${analysis.overlapIssues}\n`);

    lines.push('## 元素列表\n');
    for (const element of analysis.elements) {
      const name = element.name || element.id;
      lines.push(
        `- ${name}: (${element.rect.x}, ${element.rect.y}) ${element.rect.width}×${element.rect.height}`
      );
    }

    return lines.join('\n');
  }
}
