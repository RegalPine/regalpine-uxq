# UXQ 浏览器动作参考

## 动作类型

| 动作 | 说明 | 必需字段 |
|---|---|---|
| NAVIGATE | 导航到 URL | `url` |
| CLICK | 点击元素 | `selector` |
| FILL | 填写表单 | `selector`, `value` |
| FILL_SECRET | 秘密填写（如密码） | `selector`, `secretRef` |
| PRESS | 按键 | `key` |
| WAIT_FOR | 等待元素状态 | `selector`, `state` |
| CAPTURE | 采集数据 | `selector`, `key`, `extractor` |
| SCREENSHOT | 截图 | `name` |

## 采样组规则

连续 CAPTURE 动作共享同一 `sampleId`，属于一个采样组。以下动作会开始新采样组：
- NAVIGATE
- CLICK
- FILL / FILL_SECRET
- PRESS
- WAIT_FOR

RATIO 指标需要配对采样（同 sampleId），不能跨组配对。

## WAIT_FOR 状态

| 状态 | 说明 |
|---|---|
| visible | 元素可见 |
| hidden | 元素隐藏 |
| attached | 元素附加到 DOM |
| detached | 元素从 DOM 移除 |

## 安全约束

- FILL_SECRET 仅 Playwright 适配器支持，Reference 适配器会抛出 `SECRET_IN_REFERENCE`
- CAPTURE 不能采集密码输入框（`SECRET_CAPTURE_DENIED`）
