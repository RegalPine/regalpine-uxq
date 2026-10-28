# UXQ Inspector - 交互式评价结果查看器

UXQ Inspector 是一个交互式命令行工具，用于可视化浏览和分析 UXQ 评价结果。

## 功能特性

- 📊 **总体概览** - 快速查看评价状态、结论和覆盖率
- 📈 **维度评分** - 详细查看各维度评分详情
- 🔍 **Finding 浏览** - 按严重程度分组查看所有发现的问题
- 🔗 **证据追溯** - 查看 Finding 关联的证据链
- 📋 **详细查看** - 交互式查看单个 Finding 的完整信息
- 📊 **回归对比** - 对比基线和当前评价结果（开发中）

## 安装

```bash
# 在 UXQ 项目根目录
pnpm install

# 构建 inspector
cd apps/inspector
pnpm build
```

## 使用方法

### 1. 交互式查看评价结果

```bash
uxq-inspector inspect <result-file.json>
```

这将启动交互式菜单，提供以下选项：

- 查看维度评分
- 查看发现的问题
- 查看详细 Finding
- 查看证据
- 回归对比

### 2. 快速查看概览

```bash
uxq-inspector overview <result-file.json>
```

快速显示评价结果的总体信息，包括：

- 运行标识
- 评价状态
- 总体结论
- 覆盖率统计
- 评价限制

### 3. 列出所有 Finding

```bash
uxq-inspector findings <result-file.json>
```

### 4. 对比两个评价结果

```bash
uxq-inspector compare <baseline-file.json> <current-file.json>
```

对比基线版本和当前版本的评价结果，显示：

- 评价状态变化
- 总体结论变化
- Finding 数量变化

## 示例

### 查看评价概览

```bash
$ uxq-inspector overview test-result.json

═══════════════════════════════════════════
  UXQ 评价结果概览
═══════════════════════════════════════════

运行标识: run-001
评价状态: ✓ 完整
总体结论: ✓ 合格
创建时间: 2026-10-28T10:00:00Z

覆盖率:
  计划评价: 6
  适用: 6
  已测量: 6
  已评分: 6
  覆盖率: 100.0%

统计:
  评分结果: 2 个
  发现问题: 1 个
```

### 交互式浏览

```bash
$ uxq-inspector inspect test-result.json

? 请选择操作: (Use arrow keys)
❯ 📊 查看维度评分
  🔍 查看发现的问题
  📋 查看详细 Finding
  🔗 查看证据
  📈 回归对比
  ❌ 退出
```

## 评价状态说明

### 评价状态 (evaluationStatus)

- `COMPLETE` ✓ - 评价完整
- `PARTIAL` ⚠ - 部分评价
- `INSUFFICIENT_EVIDENCE` ✗ - 证据不足
- `CONSTRAINED` ⚠ - 受限
- `EXECUTION_FAILED` ✗ - 执行失败

### 总体结论 (overallOutcome)

- `PASS` ✓ - 合格
- `FAIL` ✗ - 不合格
- `INCONCLUSIVE` ? - 不确定
- `NOT_RATED` - - 未评级

### Finding 严重程度

- `S1` 🔴 - 严重
- `S2` 🟡 - 重要
- `S3` 🔵 - 一般
- `S4` ⚪ - 轻微

### Finding 生命周期

- `NEW` - 新建
- `TRIAGED` - 已分类
- `INVESTIGATING` - 调查中
- `CONFIRMED` - 已确认
- `ACCEPTED` - 已接受
- `PLANNED` - 已计划
- `IN_PROGRESS` - 处理中
- `FIXED` - 已修复
- `VERIFIED` ✓ - 已验证
- `REOPENED` - 重新打开
- `WONT_FIX` - 不修复
- `INVALID` - 无效
- `CLOSED` - 已关闭

## 开发

```bash
# 开发模式（监听文件变化）
cd apps/inspector
pnpm dev

# 构建
pnpm build

# 运行
pnpm start
```

## 技术栈

- **运行时**: Node.js 24.x
- **语言**: TypeScript 5.9.x
- **CLI 框架**: Commander.js
- **交互式提示**: Inquirer.js
- **终端颜色**: Chalk

## 依赖

- `@uxq/core` - 核心标识符和工具
- `@uxq/contracts` - 领域契约和类型
- `@uxq/reporting` - 报告生成
- `@uxq/scoring` - 评分计算
- `@uxq/diagnostic` - 诊断和 Finding
- `@uxq/evidence` - 证据管理
- `@uxq/regression` - 回归分析

## 下一步计划

- [ ] 实现完整的数据加载（从实际存储中加载 Finding、Evidence 等）
- [ ] 增强回归对比功能
- [ ] 添加图表可视化
- [ ] 支持导出为 HTML 报告
- [ ] 添加搜索和过滤功能

## 许可证

MIT
