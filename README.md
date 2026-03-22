<p align="right">
  <a href="./README.md">中文</a> |
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="./image/myaichatlogo.png" alt="myaichat" width="480" />
</p>

# myaichat

`myaichat` 是一个基于 `Vue 3 + Node.js + Python LangGraph` 的 AI 聊天项目，目标是提供更接近真实聊天软件的对话体验，并为多智能体协作、长期记忆和工具调用预留清晰扩展路径。

当前版本采用三服务架构：

- `chat/`：Vue 3 + Vite 前端
- `main/`：Node.js + Express 业务网关
- `agent/`：Python + FastAPI + LangGraph 智能体服务

## 当前能力

- Clerk 登录鉴权
- 会话、模型配置、智能体按用户隔离
- OpenAI-compatible 模型接入
- LangGraph 多智能体链路
- 动态结构化记忆 schema
- 会话级结构化记忆参数控制
- 模型配置描述与标签
- Web 工具：搜索与 URL 抓取
- `file` / `mysql` 持久化模式

## 当前进展

结合 [TASK_CHECKLIST.md](./TASK_CHECKLIST.md) 与当前代码，近期已落地的重点如下：

- 已完成用户登录后的数据隔离
- 前端页面已完成一轮重构，包含聊天页、会话列表、模型配置、智能体配置、结构化记忆展示
- “机器人”命名已统一调整为“智能体”
- 已支持 Clerk 登录鉴权与受保护业务接口
- 已支持结构化记忆 schema 编辑、树状查看与会话级记忆配置
- 已支持模型配置的描述、标签、温度与当前模型切换

## 项目结构

- `chat/`：Vue 3 + Vite 前端
- `main/`：Node.js + Express 后端网关
- `agent/`：Python FastAPI + LangGraph 服务
- `docker-compose.yml`：完整 Docker 运行配置
- `DATABASE_DOCKER_SETUP.zh-CN.md`：MySQL Docker 说明
- `TASK_CHECKLIST*.md`：项目任务清单

## 环境要求

- Node.js `20.19.0+` 或 `22.12.0+`
- pnpm
- Python `3.12+`
- Docker Desktop 或 Docker Engine
- 一个已配置好 `GitHub / Google / Email` 登录方式的 Clerk 应用

## 本地开发

### 1. 环境变量

根目录 `.env.example`：

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

`main/.env.example`：

```env
PORT=3000
STORAGE_DRIVER=file
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
AGENT_SERVICE_URL=http://127.0.0.1:8000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
DB_LOGGING=false
```

`chat/.env.example`：

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

### 2. 安装依赖

```powershell
cd main
npm install

cd ..\chat
pnpm install

cd ..\agent
python -m pip install -r requirements.txt --user
```

### 3. 启动三个服务

终端 1：

```powershell
cd agent
$env:AGENT_STORAGE_DRIVER="file"
$env:AGENT_FILE_STORE_DIR="$PWD\.state"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

终端 2：

```powershell
cd main
npm run dev
```

终端 3：

```powershell
cd chat
pnpm dev
```

默认地址：

- 前端：`http://localhost:5173`
- 主后端：`http://127.0.0.1:3000`
- Agent：`http://127.0.0.1:8000`

本地开发时，`agent` 默认建议使用 `--reload` 热加载；Docker 容器如需热加载，可额外设置：

```env
AGENT_RELOAD=true
```

## Docker

```powershell
docker compose up --build
```

默认地址：

- 前端：`http://127.0.0.1:8080`
- 主后端：`http://127.0.0.1:3000`
- MySQL：`127.0.0.1:3306`

## 模型配置

当前只支持 `OpenAI-compatible` 语义：

- `baseUrl`
- `apiKey`
- `model`
- `temperature`
- `description`
- `tags`

例如：

- `baseUrl`: `https://api.deepseek.com/v1`
- `model`: `deepseek-chat`

## 结构化记忆

长期记忆现在采用“智能体可配置的动态 schema”，不再限制为固定的 `preferences / facts / tasks`。

当前行为：

- 每个智能体模板可以定义自己的 `memorySchema`
- 新会话会复制该 schema 作为会话快照
- 会话可单独配置结构化记忆处理间隔与历史消息条数
- `agent` 会按 `structuredMemoryInterval` 在指定用户轮次触发结构化记忆整理
- `structuredMemoryHistoryLimit` 用于限制结构化记忆与回答阶段看到的历史消息窗口
- 后端会按当前 schema 做字段过滤、类型归一化和保底合并
- 前端以树状结构只读展示最终记忆

默认模板仍内置了这些示例分类：

- `preferences`
- `facts`
- `tasks`

但它们只是默认值，不再是系统唯一支持的结构。

### 当前多智能体

当前固定角色如下：

- `moderator`：判断是否需要联网，并产出搜索词与简短说明
- `researcher`：执行 Web 搜索与 URL 抓取
- `answerer`：综合结构化记忆和历史消息生成最终中文内容
- `memory`：在回复后整理并合并结构化记忆

当前 `answerer` 固定追加提示词为：

```text
你是多智能体系统中面向用户输出的 answerer。
请综合结构化记忆、历史消息，直接给出中文内容。
```

`researcher` 当前是工具执行节点，不是单独的 LLM 提示词角色。

### Memory Agent 日志

开发排查时，`memory_agent` 会在 `agent` 控制台输出这些日志：

- `[memory-agent:raw]`：模型原始返回
- `[memory-agent:parsed]`：解析后的 JSON
- `[memory-agent:normalized]`：按 schema 归一化后的完整结构化记忆
- `[memory-agent:merged]`：与当前会话旧记忆合并后的最终结果

默认开启；如需关闭：

```env
MEMORY_AGENT_LOGGING=false
```

## 健康检查

```powershell
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:3000/api/capabilities
curl http://127.0.0.1:5173
```

## Windows 常见问题

### `python` / `py` 不可用

请安装官方 `Python 3.12+`，并确认：

```powershell
python --version
py --version
```

### `main` 启动时报 `spawn EPERM`

当前 `main` 已改为：

```json
"dev": "node server.mjs"
```

### `chat` 启动时报 `spawn EPERM`

当前 `chat` 已使用包装脚本启动 Vite：

```json
"dev": "node ./scripts/dev-vite.mjs --config vite.config.mjs --configLoader runner"
```

### `agent` 能启动但不能对话

通常是模型配置无效，需要确认：

- `baseUrl`
- `apiKey`
- `model`

## 说明

- `main/package.json` 提供 `npm run migrate`
- `main/data/` 是 `file` 模式业务数据目录
- `agent/.state/` 是本地 `file` 模式 agent 状态目录
- 构建产物、日志和本地运行数据均已被 Git 忽略

## 路线图

- [TASK_CHECKLIST.md](./TASK_CHECKLIST.md)
- [TASK_CHECKLIST.en.md](./TASK_CHECKLIST.en.md)
- [TASK_CHECKLIST.zh-CN.md](./TASK_CHECKLIST.zh-CN.md)
