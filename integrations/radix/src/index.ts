/**
 * @uxq/radix - Radix UI 设计系统集成适配器
 *
 * 提供 Radix UI 组件的 DOM 约定解析能力：
 * - data-radix-* 属性识别
 * - 主题上下文追踪（data-theme）
 * - Token 绑定解析
 * - 组件状态识别（data-state）
 */

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Token 绑定信息
 * 描述元素与 CSS 变量（设计 Token）的绑定关系
 */
export interface TokenBinding {
  /** 绑定的 Token ID */
  readonly tokenId: string;
  /** 对应的 CSS 变量名（如 --color-primary） */
  readonly cssVariable: string;
  /** 计算后的实际值 */
  readonly computedValue: string;
  /** 关联的评价主体 ID */
  readonly subjectId: string;
}

/**
 * collectBinding 选项
 */
export interface CollectBindingOptions {
  /** DOM 元素 */
  readonly element: Element;
  /** 评价主体 ID */
  readonly subjectId: string;
  /** tokenId → CSS 变量名映射 */
  readonly cssVariableMap?: Readonly<Record<string, string>>;
}

/**
 * 从元素采集 Token 绑定信息
 * 读取元素上 data-uxq-token-* 属性，解析为 TokenBinding
 */
export function collectBinding(options: CollectBindingOptions): TokenBinding {
  const { element, subjectId, cssVariableMap } = options;
  const tokenId = element.getAttribute('data-uxq-token')?.trim() ?? '';
  const cssVariable =
    (cssVariableMap !== undefined && cssVariableMap[tokenId]) ||
    element.getAttribute('data-uxq-token-var')?.trim() ||
    `--${tokenId}`;
  const computedValue =
    element.getAttribute('data-uxq-token-value')?.trim() ??
    getComputedStyle(element).getPropertyValue(cssVariable).trim();

  return {
    tokenId,
    cssVariable,
    computedValue,
    subjectId,
  };
}

/**
 * 组件绑定信息
 */
export interface ComponentBinding {
  /** 组件类型（如 'dialog-content'，来自 data-radix-dialog-content） */
  readonly componentType: string;
  /** 组件状态（如 open/closed/checked，来自 data-state） */
  readonly state: string | null;
  /** Radix 相关属性投影 */
  readonly attributes: Readonly<Record<string, string>>;
}

/**
 * 主题上下文
 */
export interface ThemeContext {
  /** 主题 ID */
  readonly themeId: string;
  /** 声明主题的元素标识 */
  readonly declaredBy: string;
}

/**
 * 设计系统适配器接口
 */
export interface DesignSystemAdapter {
  /** 解析元素的 Token 绑定 */
  resolveToken(element: Element): readonly TokenBinding[];
  /** 解析组件信息 */
  resolveComponent(element: Element): ComponentBinding | undefined;
  /** 解析主题上下文 */
  resolveTheme(element: Element): ThemeContext | undefined;
}

/**
 * Radix DOM 适配器选项
 */
export interface RadixDomAdapterOptions {
  /** tokenId → CSS 变量名映射 */
  readonly cssVariableMap?: Readonly<Record<string, string>>;
}

// ============================================================================
// 常量
// ============================================================================

const RADIX_ATTRIBUTE_PREFIX = 'data-radix-';
const CONTAINER_RADIX_KEYS = new Set(['portal', 'popper-content-wrapper']);
const STATE_ATTRIBUTES = [
  'data-state',
  'data-disabled',
  'data-orientation',
  'data-required',
] as const;

// ============================================================================
// Radix DOM 适配器
// ============================================================================

/**
 * Radix 纯 DOM 适配器
 *
 * 识别 Radix 渲染后的 DOM 约定：
 * - data-radix-* 属性 → 组件标识与状态
 * - [data-radix-portal] → Portal 容器
 * - data-theme → 主题上下文
 */
export class RadixDomAdapter implements DesignSystemAdapter {
  private readonly cssVariableMap: Readonly<Record<string, string>> | undefined;

  constructor(options: RadixDomAdapterOptions = {}) {
    this.cssVariableMap = options.cssVariableMap;
  }

  /**
   * 解析 Token 绑定
   * 委托给本地 collectBinding 的绑定采集
   */
  resolveToken(element: Element): readonly TokenBinding[] {
    const subjectId = element.getAttribute('data-uxq-id')?.trim() ?? '';
    return [
      collectBinding({
        element,
        subjectId,
        ...(this.cssVariableMap !== undefined ? { cssVariableMap: this.cssVariableMap } : {}),
      }),
    ];
  }

  /**
   * 解析组件信息
   * 识别首个非容器 data-radix-* 属性
   */
  resolveComponent(element: Element): ComponentBinding | undefined {
    const attributes: Record<string, string> = {};
    let componentType: string | undefined;

    for (const attr of Array.from(element.attributes)) {
      if (attr.name.startsWith(RADIX_ATTRIBUTE_PREFIX)) {
        const key = attr.name.slice(RADIX_ATTRIBUTE_PREFIX.length);
        attributes[key] = attr.value;
        if (componentType === undefined && !CONTAINER_RADIX_KEYS.has(key)) {
          componentType = key;
        }
      } else if ((STATE_ATTRIBUTES as readonly string[]).includes(attr.name)) {
        attributes[attr.name.slice('data-'.length)] = attr.value;
      }
    }

    if (componentType === undefined) {
      return undefined;
    }

    return {
      componentType,
      state: attributes['state'] ?? null,
      attributes,
    };
  }

  /**
   * 解析主题上下文
   * 从元素向上遍历查找 data-theme
   */
  resolveTheme(element: Element): ThemeContext | undefined {
    let current: Element | null = element;

    while (current !== null) {
      const themeId = current.getAttribute('data-theme');
      if (themeId !== null && themeId.trim() !== '') {
        return {
          themeId: themeId.trim(),
          declaredBy: current.getAttribute('data-uxq-id')?.trim() ?? current.tagName.toLowerCase(),
        };
      }
      current = current.parentElement;
    }

    return undefined;
  }
}
