# 环境编排与站点准备

评估前必须确认目标环境可用、网络路径畅通、登录态已解决。本文覆盖实战中耗时最长的三类问题：WebSocket/dev server 阻塞、静态服务器选型、登录态获取。

## 前置检查清单（新会话第一步）

```
[ ] 后端/依赖服务已启动并探活（如 127.0.0.1:3000 /api/v1/...）
[ ] 测试账号可登录并取得 token（curl 验证后立即弃用明文）
[ ] 目标 URL 非 dev server，或已切换为静态构建 + 静态服务器
[ ] uxq doctor --json 通过，浏览器版本匹配
[ ] profile.allowedOrigins 覆盖页面与 API origin，allowPrivateNetwork 按需
[ ] uxq capabilities --json 确认所需动作/步骤类型在当前版本已实现
```

## WebSocket / Dev Server 阻塞

### 后果

`allowWebSocket: false`（默认）时，Playwright 的 `routeWebSocket(/.*/)` 无条件拦截所有 WebSocket 流量且不可配置。任何 WS 连接——包括 Vite/Webpack HMR——都会导致：

1. `navigate` 步骤 ERROR
2. 下游所有步骤 BLOCKED
3. `evaluate` 返回 rc=4（EXECUTION_FAILED）

**不要尝试加参数放行**——拦截逻辑在采集器内部，没有白名单机制。

### 判定方法

目标 URL 满足以下任一条件即为 dev server：
- 端口 5173（Vite）、3000（常见 dev server）、8080（webpack-dev-server）
- URL 路径含 `/__vite`、`/webpack-hmr`、`/.well-known/mercure`

### 解决方案

**方案 A（推荐）**：先构建静态产物再用静态服务器评估。
```bash
cd <project>
npm run build
# 使用下方静态服务器参考实现托管 dist/ 目录
```

**方案 B**：改用生产/预发布环境地址（非 dev server）。

**方案 C**：如目标确实需要 WebSocket 且评估目标就是 WS 应用本身，可在 profile 中设置 `allowWebSocket: true`——但采集器自身的健康检查可能被 WS 流量干扰，需自行验证采集完整性。

## 静态服务器参考实现

### 为什么不能用 Python http.server

Python `http.server`（单线程）与 `ThreadingHTTPServer`（backlog 不足）在浏览器并发拉取懒加载 JS chunk 时随机 ECONNREFUSED。Playwright 的 route 代理会同时发起数十个资源请求，单线程/低 backlog 服务器无法承受。

### 必须使用 Node.js http 模块

技能目录提供 `scripts/serve-static.mjs` 参考实现（见下方），特性：
- SPA fallback（所有未匹配路径返回 index.html）
- 可选 `/api` 反代到后端
- 仅监听 `127.0.0.1`（本地回环，不暴露到网络）
- 并发连接无限制

### 使用方式

```bash
# 1. 构建目标项目
cd <target-project>
npm run build

# 2. 启动静态服务器（参考 scripts/serve-static.mjs）
node <path-to>/serve-static.mjs --dir dist --port 8090

# 3. 在 UXQ 定义中使用 http://127.0.0.1:8090 作为目标 URL
```

> **安全约束**：仅监听 `127.0.0.1`；不使用生产账号；token 用后删除。

## 登录态与受保护路由

### 决策树

1. **页面无守卫** → 直接 NAVIGATE。
2. **有守卫且 CLI 支持 FILL/FILL_SECRET**（用 `uxq capabilities --json` 核对）→ 正常登录流：NAVIGATE 到登录页 → FILL 用户名 → FILL_SECRET 密码 → CLICK 登录按钮 → WAIT_FOR 目标页面。
3. **有守卫但 CLI 无交互动作**（或登录流过于复杂）→ **Token 注入**：

### Token 注入方案

适用场景：前端使用 `localStorage` 判定登录态的 SPA。

**方法**：在评估前，通过服务端向目标 HTML 注入 token：
```html
<script>localStorage.setItem('access_token', '<JWT>');</script>
```

或在定义中使用 TASK_EXECUTION 步骤执行注入脚本（如果 CLI 支持）。

**约束**：
- 仅限本地回环监听、仅测试账号的短时 token
- 产物目录加入 `.gitignore`，token 明文文件用后删除
- 报告 `scope.limitations` 必须声明："预注入 token 非真实登录流程，登录交互不在评估范围"
- **不适用于** cookie/httpOnly 会话、服务端渲染鉴权

### 不受保护路由影响的替代方案

如果目标页面可以通过直接 URL 访问（无路由守卫），跳过登录步骤直接 NAVIGATE。

## 评估环境偏差声明

当实际评估环境与用户请求的目标不同时（如请求 `localhost:5173` 但实际评估 `127.0.0.1:8090` 静态产物），报告必须包含：

```json
{
  "evaluatedEnvironment": {
    "requestedUrl": "http://localhost:5173/canvas/new",
    "actualUrl": "http://127.0.0.1:8090/canvas/new",
    "environmentType": "static-build",
    "differences": ["dev server 改为静态构建", "端口变更"]
  }
}
```

此字段放在"评价结论"之前，确保读者首先看到环境差异。
