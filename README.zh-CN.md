<p align="right">
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="./image/myaichatlogo.png" alt="myaichat" width="480" />
</p>

# MyAiChat

`MyAiChat` 是一个面向聊天产品场景的三服务 AI 对话系统，技术栈为：

- 前端：Vue 3 + Vite + TDesign Chat
- 业务网关：Node.js + Express
- 智能体：Python FastAPI + LangGraph

当前版本重点能力：

- Clerk 登录鉴权与用户级数据隔离
- OpenAI-compatible 模型接入
- SSE 流式聊天
- 多智能体协作（moderator / researcher / numeric / answerer / ui / memory）
- 动态结构化记忆（Schema 可配置）
- `file` / `mysql` 双存储驱动

### 桌面端

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <img src="./image/z1.png" alt="一期展示 1" width="96%" />
      </td>
      <td align="center" width="50%">
        <img src="./image/z2.png" alt="一期展示 2" width="96%" />
      </td>
    </tr>
    <tr>
      <td align="center" width="50%">
        <img src="./image/z3.png" alt="一期展示 3" width="96%" />
      </td>
      <td align="center" width="50%">
        <img src="./image/z4.png" alt="一期展示 4" width="96%" />
      </td>
    </tr>
    <tr>
      <td align="center" width="50%">
        <img src="./image/z5.png" alt="一期展示 5" width="96%" />
      </td>
      <td align="center" width="50%">
        <img src="./image/z6.png" alt="一期展示 6" width="96%" />
      </td>
    </tr>
  </table>
</div>

### 移动端

<div align="center">
  <table>
    <tr>
      <td align="center" width="50%">
        <img src="./image/p1.png" alt="移动端展示 1" width="88%" />
      </td>
      <td align="center" width="50%">
        <img src="./image/p2.png" alt="移动端展示 2" width="88%" />
      </td>
    </tr>
    <tr>
      <td align="center" width="50%">
        <img src="./image/p3.png" alt="移动端展示 3" width="88%" />
      </td>
      <td align="center" width="50%">
        <img src="./image/p4.png" alt="移动端展示 4" width="88%" />
      </td>
    </tr>
  </table>
</div>

## 目录

- [1. 架构总览](#1-架构总览)
- [2. 项目结构](#2-项目结构)
- [3. 运行要求](#3-运行要求)
- [4. 本地开发（推荐）](#4-本地开发推荐)
- [5. Docker 启动](#5-docker-启动)
- [6. 配置项说明](#6-配置项说明)
- [7. API 清单（main）](#7-api-清单main)
- [8. 流式事件协议（SSE）](#8-流式事件协议sse)
- [9. 数据存储与迁移](#9-数据存储与迁移)
- [10. 开发脚本](#10-开发脚本)
- [11. 调试建议](#11-调试建议)
- [12. 常见问题](#12-常见问题)
- [13. 相关文档](#13-相关文档)

## 1. 架构总览

系统由 3 个服务组成：

1. `chat/`：前端 UI 与会话交互
2. `main/`：鉴权、数据读写、模型管理、SSE 汇聚
3. `agent/`：LangGraph 智能体执行与状态持久化

请求主链路（流式聊天）：

1. 前端请求 `POST /api/chat/stream`
2. `main` 转发到 `agent` 的 `POST /runs/stream`
3. `agent` 返回事件流
4. `main` 做事件归一化后，通过 SSE 回推给前端
5. 前端按事件更新消息、工具状态、结构化内容和统计

## 2. 项目结构

```text
.
├─ chat/                            # Vue 3 前端
│  ├─ src/views/ChatView.vue
│  ├─ src/hooks/chat-view/
│  └─ package.json
├─ main/                            # Express 网关
│  ├─ src/app.mjs                   # API 路由入口
│  ├─ src/chat-service.mjs          # 聊天与流式事件桥接
│  ├─ src/storage*.mjs              # file/mysql 存储实现
│  ├─ src/migrations/               # MySQL 迁移脚本
│  └─ package.json
├─ agent/                           # FastAPI + LangGraph
│  ├─ app/main.py                   # /health, /runs/stream
│  ├─ app/graph.py                  # 多智能体图
│  ├─ app/persistence.py            # file/mysql 持久化
│  └─ requirements.txt
├─ docker-compose.yml
├─ .env.example
├─ README.en.md
├─ README.zh-CN.md
└─ TASK_CHECKLIST*.md
```

## 3. 运行要求

- Node.js：`^20.19.0` 或 `>=22.12.0`
- 前端包管理：`pnpm`
- 后端包管理：`npm`
- Python：`3.12+`
- Docker（可选）
- Clerk 应用（必须）

## 4. 本地开发（推荐）

### 4.1 准备环境变量

#### 根目录 `.env`（参考 `.env.example`）

```env
MYSQL_ROOT_PASSWORD=rootpassword
DB_HOST=mysql
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
PORT=3000
CHAT_PORT=8080
AGENT_SERVICE_URL=http://agent:8000
```

#### `main/.env`（参考 `main/.env.example`）

本地直连 agent 时建议：

```env
PORT=3000
STORAGE_DRIVER=file
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
AGENT_SERVICE_URL=http://127.0.0.1:8000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
DB_LOGGING=false
```

#### `chat/.env`（参考 `chat/.env.example`）

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 4.2 安装依赖

```bash
cd main && npm install
cd ../chat && pnpm install
cd ../agent && python -m pip install -r requirements.txt
```

### 4.3 启动方式（file 存储）

终端 A（agent）：

```bash
cd agent
AGENT_STORAGE_DRIVER=file AGENT_FILE_STORE_DIR="$PWD/.state" uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

终端 B（main）：

```bash
cd main
npm run dev
```

终端 C（chat）：

```bash
cd chat
pnpm dev
```

访问：

- chat：`http://localhost:5173`
- main：`http://127.0.0.1:3000`
- agent：`http://127.0.0.1:8000`

### 4.4 启动方式（mysql 存储）

1. 先确保 MySQL 可连通
2. `main/.env` 设置 `STORAGE_DRIVER=mysql`
3. agent 启动时设置 `AGENT_STORAGE_DRIVER=mysql`

```bash
cd agent
AGENT_STORAGE_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=myaichat DB_USER=myaichat DB_PASSWORD=myaichat uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 5. Docker 启动

```bash
docker compose up --build
```

默认端口：

- chat：`http://127.0.0.1:8080`
- main：`http://127.0.0.1:3000`
- mysql：`127.0.0.1:3306`

Compose 中默认行为：

- `main`：`STORAGE_DRIVER=mysql`
- `agent`：`AGENT_STORAGE_DRIVER=mysql`
- `chat`：构建时注入 `VITE_CLERK_PUBLISHABLE_KEY`

## 6. 配置项说明

### 6.1 通用配置

- `PORT`：main 监听端口
- `CHAT_PORT`：chat 对外端口（Docker）
- `AGENT_SERVICE_URL`：main -> agent 地址

### 6.2 main 配置

- `STORAGE_DRIVER`：`file` / `mysql`
- `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
- `DB_LOGGING=true` 可打开 Sequelize SQL 日志

### 6.3 agent 配置

- `AGENT_STORAGE_DRIVER`：`file` / `mysql`
- `AGENT_FILE_STORE_DIR`：file 模式路径（默认 `/tmp/myaichat-agent`）
- `AGENT_RELOAD=true`：容器内热加载

### 6.4 Clerk 配置

- `CLERK_SECRET_KEY`：服务端校验
- `CLERK_PUBLISHABLE_KEY`：服务端透传/兼容
- `VITE_CLERK_PUBLISHABLE_KEY`：前端登录 SDK 使用

## 7. API 清单（main）

来源：`main/src/app.mjs`

### 7.1 模型配置

- `GET /api/model-configs`
- `POST /api/model-configs`
- `POST /api/model-configs/test`

兼容旧接口：

- `GET /api/model-config`
- `POST /api/model-config`
- `POST /api/model-config/test`

### 7.2 会话

- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/delete`（兼容）

### 7.3 智能体

- `GET /api/robots`
- `POST /api/robots`

### 7.4 模型能力

- `GET /api/models`
- `GET /api/capabilities`

### 7.5 聊天

- `POST /api/chat`（非流式）
- `POST /api/chat/stream`（SSE 流式）

## 8. 流式事件协议（SSE）

`main/src/chat-service.mjs` 会把 agent 事件归一化为前端消费事件。

### 8.1 主要事件类型

- `text`：回复文本增量
- `ui_loading`：正在生成结构化 UI（建议/表单）
- `suggestion`：建议项列表
- `form`：结构化表单
- `memory_status`：记忆阶段状态
- `structured_memory`：结构化记忆更新
- `tool_status`：工具调用/工具结果状态
- `numeric_state_updated`：数值状态更新
- `usage`：token 使用量
- `done`：流式完成
- `error`：流式异常

### 8.2 前端处理位置

- `chat/src/hooks/chat-view/useChatStreaming.ts`
- `chat/src/hooks/chat-view/useChatbotRuntime.ts`
- `chat/src/hooks/chat-view/useChatMessagePipeline.ts`

## 9. 数据存储与迁移

### 9.1 main 存储驱动

- `file`：基于文件存储
- `mysql`：Sequelize + MySQL

驱动选择逻辑：`main/src/database-config.mjs`

### 9.2 main 迁移

迁移脚本位于：`main/src/migrations/`

执行命令：

```bash
cd main
npm run migrate
```

### 9.3 agent 持久化

- `file`：按线程 ID 存为 JSON 文件
- `mysql`：表 `agent_threads`

实现位置：`agent/app/persistence.py`

## 10. 开发脚本

### 10.1 chat

```bash
cd chat
pnpm dev
pnpm type-check
pnpm test:unit --run
pnpm test:e2e
pnpm build
pnpm lint
pnpm spell:check
```

### 10.2 main

```bash
cd main
npm run dev
npm run start
npm run migrate
npm run spell:check
```

## 11. 调试建议

### 11.1 先测链路，再测业务

1. 访问 `GET agent /health`
2. 访问 `GET main /api/...`（带登录）
3. 最后验证前端流式页面

### 11.2 观察点

- main 控制台：上游连接失败、接口错误
- agent 控制台：智能体链路日志、数值状态输入输出
- 浏览器网络面板：`/api/chat/stream` 的 SSE 事件序列

### 11.3 常用定位手段

- main 打开 `DB_LOGGING=true` 看 SQL
- 本地先用 `file` 模式排除数据库因素
- 仅启动 `agent + main`，用接口工具复现

## 12. 常见问题

### 12.1 前端 401 / 登录状态异常

检查：

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- Clerk 应用的登录方式是否启用

### 12.2 main 连不上 agent

检查：

- `AGENT_SERVICE_URL` 是否指向正确端口
- agent 是否已启动
- 本地是否存在代理/防火墙拦截

### 12.3 mysql 模式失败

检查：

- `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
- `main` 与 `agent` 是否都设置为 mysql 驱动
- 是否执行了 `npm run migrate`

### 12.4 Docker 启动后前端白屏

检查：

- `VITE_CLERK_PUBLISHABLE_KEY` 是否在构建时传入
- 浏览器控制台是否报 Clerk 初始化错误

## 13. 相关文档

- [README.md](./README.md)
- [README.en.md](./README.en.md)
- [DATABASE_DOCKER_SETUP.zh-CN.md](./DATABASE_DOCKER_SETUP.zh-CN.md)
- [TASK_CHECKLIST.md](./TASK_CHECKLIST.md)
- [TASK_CHECKLIST.en.md](./TASK_CHECKLIST.en.md)
- [TASK_CHECKLIST.zh-CN.md](./TASK_CHECKLIST.zh-CN.md)
