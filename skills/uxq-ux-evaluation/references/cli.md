# UXQ CLI 命令参考

## 输出格式

所有命令输出统一 JSON 响应结构：

```json
{
  "schemaVersion": "1.0.0",
  "uxqVersion": "0.1.0",
  "command": "<命令名>",
  "status": "COMPLETED|PARTIAL|UNKNOWN|ERROR",
  "data": { ... },
  "errors": [{ "code": "...", "message": "..." }],
  "warnings": [{ "code": "...", "message": "..." }]
}
```

stdout 只输出 JSON，stderr 只输出 `[uxq]` 前缀的日志。

## 命令列表

### 基础命令

| 命令 | 说明 | 示例 |
|---|---|---|
| `version` | 显示版本 | `uxq version --json` |
| `doctor` | 诊断环境 | `uxq doctor --json` |
| `capabilities` | 输出能力清单 | `uxq capabilities --json` |

### 定义管理

| 命令 | 说明 | 示例 |
|---|---|---|
| `init <file>` | 生成示例定义 | `uxq init eval.json --url http://localhost:8080` |
| `validate <file>` | 校验定义 | `uxq validate eval.json --json` |
| `plan <file>` | 编译执行计划 | `uxq plan eval.json --json` |

### 执行与查询

| 命令 | 说明 | 示例 |
|---|---|---|
| `evaluate <file>` | 执行评价 | `uxq evaluate eval.json --root .uxq --json` |
| `list` | 列出运行 | `uxq list --root .uxq --json` |
| `inspect <run-id>` | 查看详情 | `uxq inspect <run-id> metrics --root .uxq --json` |
| `cancel <run-id>` | 取消运行 | `uxq cancel <run-id> --root .uxq` |
| `report <run-id>` | 生成报告 | `uxq report <run-id> --root .uxq` |

### 基线与比较

| 命令 | 说明 | 示例 |
|---|---|---|
| `baseline create <name> <run-id>` | 创建基线 | `uxq baseline create v1 <run-id> --root .uxq` |
| `baseline update <name> <run-id>` | 更新基线 | `uxq baseline update v1 <run-id> --reason "修复" --root .uxq` |
| `baseline list` | 列出基线 | `uxq baseline list --root .uxq` |
| `baseline delete <name>` | 删除基线 | `uxq baseline delete v1 --root .uxq` |
| `compare <run-id> [baseline]` | 与基线比较 | `uxq compare <run-id> v1 --root .uxq` |

### 质量门禁

| 命令 | 说明 | 示例 |
|---|---|---|
| `quality-gate <run-id>` | 门禁检查 | `uxq quality-gate <run-id> --gate gate.json` |
| `settle <run-id>` | 重新结算 | `uxq settle <run-id> --policy policy.json` |

### 验证与符合性

| 命令 | 说明 | 示例 |
|---|---|---|
| `verify plan <run-id>` | 创建验证计划 | `uxq verify plan <run-id> --finding-id f1` |
| `verify result <plan-id>` | 生成验证结果 | `uxq verify result <plan-id> --source-run <new-run-id>` |
| `conformance <run-id>` | 符合性检查 | `uxq conformance <run-id> --root .uxq` |
| `finding list <run-id>` | 查询 Finding | `uxq finding list <run-id> --root .uxq` |

### Skill 管理

| 命令 | 说明 | 示例 |
|---|---|---|
| `install-skill` | 安装 Skill | `uxq install-skill --agent qoder --copy` |
| `uninstall-skill` | 卸载 Skill | `uxq uninstall-skill --agent qoder` |

## 通用选项

| 选项 | 说明 | 默认值 |
|---|---|---|
| `--root <dir>` | 存储根目录 | `.uxq` |
| `--config <file>` | 运行配置文件 | - |
| `--json` | JSON 输出格式 | false |
| `--gate <file>` | 质量门禁配置 | - |
| `--source-run <id>` | 关联源运行 | - |
| `--finding-id <id>` | 关联 Finding ID | - |
| `--policy <file>` | 评分策略文件 | - |
| `--url <url>` | init 页面模板 URL | - |
| `--reason <text>` | 基线更新原因 | - |
| `--agent <name>` | Agent 名称 | `qoder` |
| `--copy` | 复制而非符号链接 | false |

## 退出码

| 码 | 含义 |
|---|---|
| 0 | 成功 |
| 1 | 门禁策略失败 |
| 2 | 输入/配置无效 |
| 3 | 环境不可用 |
| 4 | 运行失败 |
| 5 | 契约/不变量失败 |
| 6 | 持久化/工件失败 |
| 130 | 用户取消 |
