# 贡献指南

感谢你对 UXQ 项目的关注！我们欢迎各种形式的贡献，包括代码、文档、问题报告和讨论。

## 行为准则

本项目采用 [Contributor Covenant](https://www.contributor-covenant.org/) 行为准则。参与即表示你同意遵守此准则，共同维护一个友好、包容的环境。

## 如何贡献

### 报告 Bug

1. 检查 [现有问题](https://github.com/RegalPine/regalpine-uxq/issues) 避免重复
2. 使用问题模板创建新 Issue
3. 提供详细的复现步骤和环境信息

### 提出新功能

1. 先在 [Discussions](https://github.com/RegalPine/regalpine-uxq/discussions) 讨论想法
2. 创建 Feature Request Issue 说明用例
3. 等待维护者反馈后再开始实现

### 提交代码

#### 开发流程

1. Fork 仓库并克隆到本地

   ```bash
   git clone https://github.com/YOUR-USERNAME/uxq.git
   cd uxq
   ```

2. 安装依赖

   ```bash
   pnpm install
   ```

3. 创建分支

   ```bash
   git checkout -b feat/your-feature-name
   # 或
   git checkout -b fix/issue-number-description
   ```

4. 进行开发
   - 遵循项目的代码风格（已有 ESLint 和 Prettier 配置）
   - 添加必要的测试
   - 确保所有检查通过

   ```bash
   pnpm check  # 完整检查
   ```

5. 提交更改
   - 使用约定式提交（Conventional Commits）
   - 提交信息格式：`type(scope): description`
   - 例如：`feat(cli): add interactive mode`

6. 推送到你的 Fork

   ```bash
   git push origin your-branch-name
   ```

7. 创建 Pull Request
   - 填写 PR 描述模板
   - 关联相关 Issue
   - 等待代码审查

#### 代码风格

- **TypeScript**: 使用严格类型检查
- **格式化**: Prettier（配置见 `.prettierrc.json`）
- **Lint**: ESLint（配置见 `eslint.config.mjs`）
- **命名**: 使用 camelCase，类型/接口使用 PascalCase
- **注释**: 公共 API 必须有 JSDoc 注释

#### 测试要求

- 新功能必须包含单元测试
- Bug 修复必须包含回归测试
- 保持测试覆盖率不降低
- 端到端测试使用 Playwright

### 改进文档

文档改进同样重要！欢迎：

- 修正拼写/语法错误
- 补充示例代码
- 改进说明清晰度
- 翻译和本地化

## 项目架构

### Monorepo 结构

```
uxq/
├── packages/          # 核心功能包
│   ├── core/         # 核心工具
│   ├── contracts/    # 类型契约
│   └── ...           # 其他领域包
├── apps/             # 应用程序
│   ├── cli/          # 命令行工具
│   ├── inspector/    # 结果查看器
│   └── playground/   # 演示环境
├── schemas/          # JSON Schema 定义
├── tests/            # 测试套件
└── skills/           # AI Agent 技能定义
```

### 包依赖规则

- 领域包之间不能直接依赖，通过 `@uxq/contracts` 交互
- 应用层可以依赖多个领域包
- 新增包需要更新 `pnpm-workspace.yaml`

### 关键命令

```bash
# 开发
pnpm dev              # 监听模式
pnpm build            # 构建
pnpm test             # 运行测试

# 质量检查
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm typecheck        # TypeScript 类型检查
pnpm check            # 完整检查

# 代码生成
pnpm generate         # 生成契约类型
pnpm schemas:extract  # 提取 Schema

# 浏览器测试
pnpm test:browser     # Playwright E2E
```

## 发布流程

维护者会处理发布，但了解流程有助于贡献：

1. 更新版本号（遵循语义化版本）
2. 更新 CHANGELOG.md
3. 创建发布分支 `release/vX.Y.Z`
4. 运行完整测试套件
5. 合并到 main 并打标签
6. CI 自动发布到 npm

## 获取帮助

- 💬 [Discussions](https://github.com/RegalPine/regalpine-uxq/discussions) - 提问和讨论
- 📧 [Email](mailto:your-email@example.com) - 直接联系维护者
- 🐛 [Issues](https://github.com/RegalPine/regalpine-uxq/issues) - 报告问题

## 认可

所有贡献者都会在 README 和 CHANGELOG 中被认可。感谢每一位帮助改进 UXQ 的人！

---

再次感谢你的贡献！🎉
