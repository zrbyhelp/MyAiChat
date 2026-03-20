<p align="right">
  <a href="./README.md">中文</a> |
  <a href="./README.en.md">English</a>
</p>

# myaichat

`myaichat` 是一个以“真实聊天窗口体验”为核心目标的 AI 对话项目。

它不只是一个问答窗口，而是希望做成一个更接近真实社交聊天软件的系统：用户可以和智能体持续聊天，接收智能体主动发来的消息，观察多个智能体之间的互动，甚至扩展到群聊、人物关系、场景设定和剧情推进。

项目的方向是构建一个可高度定制的角色与场景聊天系统，支持人物设定、记忆、主动消息、多角色协同、群聊互动，以及后续的向量记忆、图关系和可视化表现能力。

后端目前支持两种持久化驱动：

- `file`：将运行数据写入 `main/data/*.json`
- `mysql`：通过 Sequelize 将运行数据写入 MySQL

当前版本同时接入了 `Clerk` 统一认证：

- 支持 `GitHub` 登录
- 支持 `Google` 登录
- 支持 `邮箱` 登录
- 所有业务 API 都需要登录后访问
- 会话、角色卡片、模型配置和记忆都按用户独立隔离

## 项目介绍

当前版本重点围绕这些能力演进：

- 更接近真实聊天软件的窗口体验
- 智能体主动发消息，而不只是被动回复
- 支持多人互动与群聊扩展
- 支持人物、关系、场景、世界观的高度定制
- 支持会话记忆、模型管理、本地与云端模型切换
- 为多智能体协作、向量数据库、图数据库、动态函数和可视化展示预留扩展空间

## 项目定位

这个项目更适合被理解为：

- AI 聊天模拟器
- 角色聊天系统
- 多智能体互动聊天系统
- 可扩展的剧情 / 场景 / 人物聊天平台

## GitHub About

建议的 About 文案：

`一个面向真实聊天体验的 AI 对话系统，支持主动消息、群聊、多智能体互动，以及人物与场景的高度定制。`

建议的关键词：

`ai-chat`
`character-chat`
`roleplay`
`multi-agent`
`group-chat`
`interactive-fiction`
`vue`
`nodejs`
`express`
`sequelize`
`mysql`
`ollama`
`openai`

## 项目结构

- `chat/`：Vue 3 + Vite 前端
- `main/`：Node.js + Express 后端
- `docker-compose.yml`：基于 MySQL 模式的完整 Docker 启动配置
- `TASK_CHECKLIST.md`：项目任务清单
- `TASK_CHECKLIST.zh-CN.md`：项目任务清单中文版本

## 环境要求

- Node.js `20.19.0+` 或 `22.12.0+`
- pnpm
- Docker Desktop 或 Docker Engine
- 一个已配置好 `GitHub / Google / Email` 登录方式的 Clerk 应用

## Docker 启动方式

Docker 模式默认使用 MySQL。

1. 根据 `.env.example` 创建根目录环境变量文件
2. 启动完整服务：

```powershell
docker compose up --build
```

默认访问地址：

- 前端：`http://127.0.0.1:8080`
- 后端：`http://127.0.0.1:3000`
- MySQL：`127.0.0.1:3306`

在 Docker 模式下：

- `chat` 由 Nginx 提供静态资源
- `/api` 会反向代理到 `main` 容器
- 后端使用 `STORAGE_DRIVER=mysql`
- 前端在构建时读取 `VITE_CLERK_PUBLISHABLE_KEY`
- 后端通过 `CLERK_SECRET_KEY` 校验登录态
- 运行时数据存储在 MySQL 中，而不是 JSON 文件中

## npm/pnpm 启动方式

### 模式一：本地文件存储

这是默认的本地开发模式。

前端：

```powershell
cd chat
pnpm install
Copy-Item .env.example .env
pnpm dev
```

后端：

```powershell
cd main
npm install
Copy-Item .env.example .env
npm run dev
```

在这个模式下：

- 不需要 MySQL
- `STORAGE_DRIVER` 默认是 `file`
- 数据会写入 `main/data/model-configs.json`
- 数据会写入 `main/data/robots.json`
- 数据会写入 `main/data/sessions.json`

### 模式二：本地 MySQL 存储

如果你希望本地开发时使用 MySQL 而不是 JSON 文件，可以使用这个模式。

1. 根据 `main/.env.example` 创建 `main/.env`
2. 设置：

```env
STORAGE_DRIVER=mysql
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
```

3. 根据 `chat/.env.example` 创建 `chat/.env`

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

4. 启动后端：

```powershell
cd main
npm install
npm run dev
```

5. 启动前端：

```powershell
cd chat
pnpm install
pnpm dev
```

在这个模式下：

- 后端通过 Sequelize 连接 MySQL
- 启动时会执行数据库迁移
- `main/data/` 下的 JSON 文件不会作为当前有效的数据源

## 环境变量

后端相关环境变量：

- `STORAGE_DRIVER=file|mysql`
- `PORT`
- `CLERK_SECRET_KEY`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_LOGGING=true|false`

前端相关环境变量：

- `VITE_CLERK_PUBLISHABLE_KEY`

默认行为：

- 本地 `npm run dev`：`file`
- Docker Compose：`mysql`

## 路线图

详细任务清单请查看：

- [TASK_CHECKLIST.md](C:/Users/Administrator/Desktop/myaichat/TASK_CHECKLIST.md)
- [TASK_CHECKLIST.zh-CN.md](C:/Users/Administrator/Desktop/myaichat/TASK_CHECKLIST.zh-CN.md)

当前重点方向：

- [x] 实现用户登录数据独立
- [ ] 优化真实聊天窗口体验
- [ ] 优化 token 显示方式与设置页面布局
- [ ] 将“机器人”统一更名为“智能体”
- [ ] 支持当前会话记忆生成模型设置
- [ ] 支持本地模型
- [ ] 支持智能体分享、论坛与平台化能力
- [ ] 支持向量数据库、图数据库、多智能体协同群聊
- [ ] 支持图片、语音、视频输入与音视频能力
- [ ] 支持 Love2D 驱动的智能体可视化展示

## 说明

- `node_modules/`、构建产物、日志和本地运行数据都已被 Git 忽略。
- `main/data/` 被视为本地运行数据目录，不会提交到仓库。
- `main/data/` 会继续保留给文件模式使用，切换到 `STORAGE_DRIVER=mysql` 后可停用。
- `main/package.json` 中提供了手动执行数据库迁移的 `npm run migrate` 命令。
- 未登录用户无法调用 `/api/*` 业务接口。
- 聊天页发送消息时如果尚未登录，会直接弹出 Clerk 登录窗口。

## 协作方式

如果你希望参与这个项目的协作，请通过 GitHub Issues 申请。

- 可以通过 Issues 提交想法、Bug、功能建议或合作意向
- 如有需要，请说明你的目标、预期贡献和联系方式

## Star 历史

<a href="https://www.star-history.com/?repos=zrbyhelp%2FMyAiChat&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&legend=top-left" />
 </picture>
</a>
