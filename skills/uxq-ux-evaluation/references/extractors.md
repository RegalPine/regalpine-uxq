# UXQ 提取器参考

## 提取器类型

| 提取器 | 说明 | 返回值类型 | 局限 |
|---|---|---|---|
| COUNT | DOM 计数（querySelectorAll.length） | number | 不验证内容、位置或可见性 |
| VISIBLE | 检查元素是否可见 | boolean | 依赖 CSS 可见性判定 |
| TEXT | 提取元素文本内容 | string | 包含子元素文本 |
| VALUE | 提取表单元素值 | string | 仅适用于 input/textarea/select |
| ACCESSIBLE_NAME | 提取元素可访问名称 | string | 按 W3C 算法计算 |

## 使用场景

在 CAPTURE 动作的 `extractor` 字段指定：

```json
{
  "action": "CAPTURE",
  "selector": "h1",
  "key": "heading-count",
  "extractor": "COUNT",
  "unit": "count"
}
```

## 已知局限

- **COUNT** 不区分语义：`<h1 class="sr-only">` 与可见 `<h1>` 同等计数
- **VISIBLE** 不检查内容正确性
- **TEXT** 可能包含空白和换行
- **VALUE** 不能用于非表单元素
- **ACCESSIBLE_NAME** 计算可能因浏览器差异略有不同
