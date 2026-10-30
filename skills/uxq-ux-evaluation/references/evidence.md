# UXQ 证据参考

## 证据来源分类

| 分类 | 说明 |
|---|---|
| E1 | 浏览器自动化采集（DOM、截图） |
| E2 | 用户研究数据（问卷、访谈） |
| E3 | 分析推断（模型计算） |
| E4 | 外部系统（API、日志） |

## 材料类型

| 类型 | 说明 |
|---|---|
| DOM | DOM 元素数据 |
| SCREENSHOT | 页面截图 |
| SURVEY | 问卷数据 |
| INTERVIEW | 访谈记录 |
| ANALYTICS | 分析数据 |
| SYNTHETIC | 合成数据 |

## 证据生命周期

| 状态 | 说明 |
|---|---|
| CAPTURED | 已采集 |
| VALIDATED | 已验证（Playwright 采集自动标记） |
| EXPIRED | 已过期 |
| REVOKED | 已撤销 |

## 有效性判定

证据在以下情况下可用（isEvidenceUsable）：
- 生命周期为 VALIDATED 或 CAPTURED
- 未过期（retentionUntil > 当前时间）
- 允许用于当前目的（EVALUATION 或 VERIFICATION）

## 隐私约束

| 分类 | 说明 |
|---|---|
| PUBLIC | 公开数据 |
| INTERNAL | 内部数据 |
| CONFIDENTIAL | 机密数据 |
| RESTRICTED | 受限数据 |

证据的 `privacy.redacted` 字段标记是否已脱敏。

## 用途限制

`privacy.allowedPurposes` 声明证据可用于：
- EVALUATION: 评价
- VERIFICATION: 验证
- RESEARCH: 研究
