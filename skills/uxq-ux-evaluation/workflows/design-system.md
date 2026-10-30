# 设计系统：能力与证据边界

当前 CLI 没有 design-system tokens/theme/components 命令。tokens、theme、color、geometry 等 SDK 提供独立领域计算，但通用 CLI 不会自动从 URL 提取计算样式并对照设计 Token。

先获取可信的设计规范与版本、控件范围和主题配置，再决定使用外部采集或编写显式适配器。外部结果标注来源，不冒充本次 UXQ 原生测量。

通用定义可在 profile.colorScheme 中选择 light/dark，并使用同样的任务与 DOM 采集动作。不同主题独立记录；未采集 Token 不输出 Token 合规率。跨主题、视口比较必须解释实验条件差异，不能据单个标题指标给整个设计系统打分。
