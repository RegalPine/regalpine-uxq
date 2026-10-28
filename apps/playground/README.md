# UXQ Playground - 评价策略演示环境

UXQ Playground 是一个交互式命令行工具，用于演示和实验 UXQ 评价策略的各种能力。

## 功能特性

- 📊 **标准化演示** — 演示 4 种指标值标准化方法（LINEAR_HIGHER / LINEAR_LOWER / TARGET_RANGE / BOOLEAN）
- 🔍 **规则引擎演示** — 展示规则表达式求值过程，含预设场景
- 📈 **完整评分流程** — 从指标 → 维度 → 总体评价的完整链路演示
- ⚖️ **策略对比** — 对比不同评分策略（严格/均衡/体验优先）的效果

## 安装

```bash
# 在 UXQ 项目根目录
pnpm install

# 构建 playground
cd apps/playground
pnpm build
```

## 使用方法

### 1. 交互式帮助

```bash
uxq-playground interactive
```

### 2. 指标标准化演示

```bash
# 线性高分（值越大分越高）
uxq-playground normalize --method LINEAR_HIGHER --values 0,30,60,90

# 线性低分（值越小分越高）
uxq-playground normalize --method LINEAR_LOWER --min 0 --max 100 --values 0,25,50,75,100

# 目标范围（在目标区间内满分）
uxq-playground normalize --method TARGET_RANGE --target-min 40 --target-max 80 --values 0,20,40,60,80,100

# 布尔（满足即满分）
uxq-playground normalize --method BOOLEAN --values 0,1
```

### 3. 规则引擎演示

```bash
# 可访问性检查场景
uxq-playground rule --preset accessibility

# 性能指标检查场景
uxq-playground rule --preset performance

# 评价完整性检查场景
uxq-playground rule --preset completeness
```

### 4. 完整评分流程

```bash
# 优秀产品
uxq-playground scoring --scenario good

# 中等产品
uxq-playground scoring --scenario mixed

# 待改进产品
uxq-playground scoring --scenario poor
```

### 5. 策略对比

```bash
uxq-playground compare
```

## 预设场景说明

### 规则引擎预设

| 预设 | 说明 | 关键规则 |
|---|---|---|
| `accessibility` | WCAG 2.1 AA 级可访问性检查 | alt 缺失为零、无键盘陷阱 |
| `performance` | Core Web Vitals 性能检查 | LCP ≤ 2500ms、FID ≤ 100ms、CLS ≤ 0.1 |
| `completeness` | 评价覆盖率和证据充分性 | 覆盖率 ≥ 80%、证据数 ≥ 10 |

### 评分场景预设

| 场景 | 说明 | 总体得分区间 |
|---|---|---|
| `good` | 各维度表现优异 | 85-95 |
| `mixed` | 部分良好部分待改进 | 60-75 |
| `poor` | 多维度存在严重问题 | 30-50 |

## 技术架构

- **输入**：使用 `@uxq/contracts` 的标准类型定义
- **标准化**：调用 `@uxq/scoring` 的 `normalize` 函数
- **规则求值**：调用 `@uxq/rules` 的 `evaluateExpression` 函数
- **展示**：使用 chalk 颜色编码 + 可视化条形图

## 与项目其他应用的关系

| 应用 | 定位 |
|---|---|
| `apps/cli` | 完整评价工具链（生产用） |
| `apps/inspector` | 评价结果交互式浏览（分析用） |
| `apps/playground` | 评价策略演示实验（教学用） |
