# 可访问性：能力与证据边界

当前 CLI 没有 accessibility audit、screen-reader 或 keyboard 命令。@uxq/accessibility 是领域 SDK；通用 CLI 可通过定义执行键盘动作、DOM 可见性或可访问名称采集，但不会自动执行完整 WCAG 审计，也不会启动 NVDA 或 VoiceOver。

明确检查标准、页面状态、控件和键盘路径；把可验证的条件写进任务定义，使用 evaluate 执行并检查证据。外部审计工具或人工读屏测试的结果必须标注工具、版本、方法及范围，不与 UXQ 原生采集混淆。

h1 数量演示、自动可访问名称或截图不能证明 WCAG 全部通过。未执行的检查写成未覆盖，不给合规百分比。UXQ conformance 是数据契约检查，不是可访问性合规命令。对应维度为 D04 可访问性与包容性。
