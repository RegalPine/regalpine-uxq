# 认证状态管理

UXQ 支持通过 Playwright 的 `storageState` 机制加载浏览器认证状态（cookies + localStorage），让评估过程能够访问需要登录的页面。

## 核心概念

- **认证状态文件**：JSON 格式，包含 `cookies` 和 `origins`（localStorage）数组
- **来源**：可通过 `uxq auth-save` 手动登录保存，或从 Playwright `context.storageState()` 导出
- **安全**：文件含敏感信息，应设置权限 `0o600`（仅所有者可读写），不提交到版本控制

## 工作流

### 1. 保存认证状态

```bash
uxq auth-save --url https://example.com/login --file .uxq/auth.json
```

流程：
1. 打开有头浏览器（非无头模式）
2. 导航到指定 URL
3. 等待用户手动完成登录
4. 按回车确认
5. 保存 cookies + localStorage 到文件
6. 设置文件权限为 `0o600`

输出示例：
```json
{
  "status": "COMPLETED",
  "data": {
    "path": ".uxq/auth.json",
    "target": "https://example.com/login",
    "cookiesCount": 5,
    "originsCount": 2
  }
}
```

### 2. 使用认证状态评估

```bash
uxq evaluate evaluation.yaml --root .uxq --auth-state .uxq/auth.json --json
```

`--auth-state` 优先级高于配置文件中的 `authStatePath`。

也可在配置文件中指定：
```json
{
  "profile": {
    "authStatePath": ".uxq/auth.json"
  }
}
```

### 3. 清理认证状态

```bash
uxq auth-clean --file .uxq/auth.json
```

输出示例：
```json
{
  "status": "COMPLETED",
  "data": {
    "path": ".uxq/auth.json",
    "removed": true,
    "hadCookies": 5,
    "hadOrigins": 2
  }
}
```

## 安全注意事项

1. **文件权限**：`auth-save` 自动设置 `0o600`；手动创建时需自行设置
2. **版本控制**：将认证状态文件加入 `.gitignore`
3. **传输**：不要在不安全渠道传递文件内容
4. **有效期**：cookies 有过期时间，长期不用需重新保存

## 故障排查

| 错误 | 原因 | 解决 |
|---|---|---|
| `认证状态文件不存在` | 路径错误或未保存 | 先运行 `auth-save` |
| `认证状态文件格式错误：缺少 cookies 或 origins 数组` | 文件不是有效 storageState | 用 `auth-save` 重新生成 |
| `认证状态文件不是有效的 JSON` | 文件损坏或格式错误 | 检查文件内容或重新生成 |

## 与 FILL_SECRET 的区别

| 方式 | 适用场景 | 原理 |
|---|---|---|
| `--auth-state` | 需要预存登录态 | 加载 cookies/localStorage |
| `FILL_SECRET` | 需要在页面中输入密码 | 动作执行时填充，不持久化 |

两者可组合使用：用 `--auth-state` 跳过登录步骤，用 `FILL_SECRET` 处理页面中的敏感输入。
