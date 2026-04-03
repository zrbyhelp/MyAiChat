# chat

`chat/` 是 MyAiChat 的用户侧聊天前端，基于 Vue 3 + TypeScript + Vite 构建。

## 当前承载的功能

- 流式聊天界面与 SSE 事件消费
- 会话历史与会话切换
- 智能体创建、编辑、模板导入导出
- 结构化记忆编辑
- 机器人世界图谱编辑器与会话镜像图谱查看
- 移动端与桌面端双布局

## 关键目录

```text
chat/
├─ src/components/chat/      # 聊天主界面、记忆编辑、世界图谱组件
├─ src/components/tabs/      # Discover / Agent / Mine 等页签
├─ src/hooks/chat-view/      # 会话生命周期、流式状态、机器人管理
├─ src/lib/api.ts            # 对 main 服务的 API 封装
├─ src/router/               # 路由与世界图谱页面入口
└─ e2e/                      # Playwright 用例
```

## 环境变量

复制 `chat/.env.example` 为 `chat/.env`：

```bash
cp chat/.env.example chat/.env
```

当前主要变量：

- `VITE_CLERK_PUBLISHABLE_KEY`：Clerk 前端公钥，普通登录与 `linux.do` 第三方登录都复用它

`linux.do` 接入约定：

- 在 Clerk Dashboard 中把 `linux.do` 配置为外部身份提供方，不在仓库里自建 OAuth 流程
- 本地联调时至少将 `http://localhost:5173` 加入 Clerk 允许域名与回调地址
- 登录后 `chat` 仍向 `main/upload` 发送 Clerk token，因此后端无需新增登录接口

## 开发命令

```bash
cd chat
pnpm install
pnpm dev
pnpm type-check
pnpm test:unit --run
pnpm test:e2e
pnpm build
pnpm lint
pnpm spell:check
```

## 开发约定

- 组件命名使用 PascalCase
- 组合式函数使用 `useXxx`
- 优先复用 `src/hooks/chat-view/` 现有状态编排
- 世界图谱相关类型与接口集中在 `src/types/ai.ts` 和 `src/lib/api.ts`

## 联调说明

- 默认通过 `main` 的 `/api/*` 与 `/admin-api/*` 交互
- 本地前端默认地址：`http://localhost:5173`
- 若启用 `linux.do` 登录，请先确认 Clerk 中已启用该 provider，且回调域名与当前前端地址一致
- 若聊天链路异常，优先检查浏览器 Network 中 `POST /api/chat/stream` 的 SSE 返回
