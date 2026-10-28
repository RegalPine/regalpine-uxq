# UXQ - 用户体验质量评价工具集

UXQ 是一个基于证据的用户体验质量评价框架，提供定量化的 UX 评估、测量和改进能力。

## ✨ 核心特性

- 📊 **多维度评价** - 覆盖任务完成、认知负荷、可访问性、设计一致性等 16 个维度
- 🔍 **证据追溯** - 每个 Finding 都有完整的证据链支持
- 📈 **定量评分** - 基于指标标准化和规则引擎的客观评分体系
- 🔄 **回归检测** - 对比基线版本，自动检测 UX 退化
- 📋 **诊断建议** - 智能识别问题根因并生成改进建议
- 🎯 **标准化流程** - 完整的评价定义 → 执行 → 报告生成工作流

## 🚀 快速开始

### 环境要求

- Node.js >= 24
- pnpm >= 10

### 安装

```bash
# 克隆仓库
git clone https://github.com/RegalPine/regalpine-uxq.git
cd regalpine-uxq

# 安装依赖
pnpm install

# 生成契约类型
pnpm generate

# 构建所有包
pnpm build
```

### 使用示例

```bash
# 运行评价
uxq evaluate --definition ./evaluation-def.json --output result.json

# 查看评价结果
uxq-inspector overview result.json

# 交互式浏览
uxq-inspector inspect result.json

# 对比两个版本
uxq-inspector compare baseline.json current.json
```

## 📦 项目结构

UXQ 采用 pnpm monorepo 架构，包含以下组件：

### 核心包 (`packages/`)

| 包名                 | 说明                 |
| -------------------- | -------------------- |
| `@uxq/core`          | 核心标识符和基础工具 |
| `@uxq/contracts`     | 领域契约和类型定义   |
| `@uxq/execution`     | 评价执行引擎         |
| `@uxq/measurement`   | 指标测量             |
| `@uxq/scoring`       | 评分计算             |
| `@uxq/rules`         | 规则引擎             |
| `@uxq/evidence`      | 证据管理             |
| `@uxq/diagnostic`    | 诊断和 Finding 生成  |
| `@uxq/regression`    | 回归分析             |
| `@uxq/reporting`     | 报告生成             |
| `@uxq/tasks`         | 任务定义和执行       |
| `@uxq/cognition`     | 认知负荷测量         |
| `@uxq/accessibility` | 可访问性评估         |
| `@uxq/research`      | 用户研究集成         |
| `@uxq/theme`         | 主题评价             |
| `@uxq/tokens`        | 设计令牌检查         |
| `@uxq/metrics`       | UX 指标              |
| `@uxq/geometry`      | 几何测量             |
| `@uxq/color`         | 色彩分析             |
| `@uxq/browser`       | 浏览器自动化         |
| `@uxq/conformance`   | 符合性检查           |

### 应用 (`apps/`)

| 应用              | 说明             |
| ----------------- | ---------------- |
| `apps/cli`        | 命令行评价工具   |
| `apps/inspector`  | 交互式结果查看器 |
| `apps/playground` | 评价策略演示环境 |
| `apps/reference`  | 参考实现和示例   |

### 集成 (`integrations/`)

| 集成                 | 说明                |
| -------------------- | ------------------- |
| `integrations/radix` | Radix UI 组件库集成 |

## 🛠️ 开发

### 常用命令

```bash
# 格式化检查
pnpm format:check

# 格式化代码
pnpm format

# ESLint 检查
pnpm lint

# 类型检查
pnpm typecheck

# 运行测试
pnpm test

# 运行浏览器测试
pnpm test:browser

# 架构依赖检查
pnpm test:architecture

# 治理基线检查
pnpm test:governance

# 验证脚本
pnpm verify

# 完整检查（发布前）
pnpm check
```

### 测试

```bash
# 单元测试
pnpm test

# 端到端测试
pnpm test:browser

# 架构测试
pnpm test:architecture

# 治理测试
pnpm test:governance
```

### 构建

```bash
# 构建所有包
pnpm build

# 生成契约类型
pnpm generate

# 提取 Schema
pnpm schemas:extract
```

## 📚 文档

### Skill 工作流

详细的工作流文档请参考 [`skills/uxq-ux-evaluation/`](./skills/uxq-ux-evaluation/SKILL.md)：

- [任务评价](./skills/uxq-ux-evaluation/workflows/task-evaluation.md)
- [认知负荷测量](./skills/uxq-ux-evaluation/workflows/cognitive-load.md)
- [可访问性评估](./skills/uxq-ux-evaluation/workflows/accessibility.md)
- [证据管理](./skills/uxq-ux-evaluation/workflows/evidence.md)
- [用户研究集成](./skills/uxq-ux-evaluation/workflows/research.md)
- [指标与评分](./skills/uxq-ux-evaluation/workflows/metrics-scoring.md)
- [诊断与建议](./skills/uxq-ux-evaluation/workflows/diagnostic.md)
- [回归测试](./skills/uxq-ux-evaluation/workflows/regression.md)
- [报告生成](./skills/uxq-ux-evaluation/workflows/report.md)
- [设计系统评价](./skills/uxq-ux-evaluation/workflows/design-system.md)

### Schema 规范

JSON Schema 定义位于 [`schemas/`](./schemas/) 目录：

- `uxq.schema.json` - 主 Schema
- `definition/` - 评价定义
- `execution/` - 执行过程
- `measurement/` - 测量结果
- `evidence/` - 证据管理
- `diagnostic/` - 诊断发现
- `result/` - 评价结果
- `reporting/` - 报告输出

## 🤝 贡献

欢迎贡献！请参考 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详细信息。

## 📄 许可证

[MIT](./LICENSE) © UXQ Contributors

## 🔗 链接

- [问题反馈](https://github.com/RegalPine/regalpine-uxq/issues)
- [讨论区](https://github.com/RegalPine/regalpine-uxq/discussions)
- [更新日志](./CHANGELOG.md)
