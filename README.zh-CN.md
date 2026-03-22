<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a>
</p>

[English README](./README.md) | [中文 README](./README.zh-CN.md)

# myaichat

`myaichat` 是一个基于 `Vue 3 + Node.js + Python LangGraph` 的 AI 聊天项目。

当前版本采用三服务架构：

- `chat/`：Vue 3 + Vite 前端
- `main/`：Node.js + Express 业务网关，负责 Clerk 鉴权、会话/模型配置/智能体管理、SSE 收口
- `agent/`：Python + FastAPI + LangGraph 智能体服务，负责多智能体编排、结构化记忆、工具调用、OpenAI-compatible 模型接入

## 当前能力

- Clerk 登录鉴权
- 会话、模型配置、智能体按用户隔离
- OpenAI-compatible 模型接入
- LangGraph 多智能体执行链路
- 动态结构化记忆 schema
- 会话级结构化记忆参数控制
- 模型配置描述与标签
- Web 工具：搜索与 URL 抓取
- `file` / `mysql` 两种持久化模式

## 当前进展

结合 [TASK_CHECKLIST.md](./TASK_CHECKLIST.md) 与当前代码，近期已落地的重点如下：

- 已完成用户登录后的数据隔离
- 前端页面已完成一轮重构，覆盖聊天页、会话列表、模型配置、智能体配置、结构化记忆展示
- “机器人”命名已统一调整为“智能体”
- 已支持 Clerk 登录鉴权与受保护业务接口
- 已支持结构化记忆 schema 编辑、树状查看与会话级记忆配置
- 已支持模型配置的描述、标签、温度与当前模型切换

## 目前进度

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

## 项目结构

- `chat/`：Vue 3 + Vite 前端
- `main/`：Node.js + Express 后端网关
- `agent/`：Python FastAPI + LangGraph 智能体服务
- `docker-compose.yml`：完整 Docker 启动配置
- `DATABASE_DOCKER_SETUP.zh-CN.md`：MySQL Docker 说明
- `TASK_CHECKLIST*.md`：任务清单与路线图

## 环境要求

- Node.js `20.19.0+` 或 `22.12.0+`
- pnpm
- Python `3.12+`
- Docker Desktop 或 Docker Engine
- 一个已配置好 `GitHub / Google / Email` 登录方式的 Clerk 应用

## 快速开始

### 1. 根目录环境变量

根据根目录 `.env.example` 创建 `.env`：

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

### 2. 子项目环境变量

`main/.env`：

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

`chat/.env`：

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

## 本地开发启动

### 模式一：本地文件存储

这是当前最省事的开发方式，不依赖 MySQL。

先安装依赖：

```powershell
cd main
npm install

cd ..\chat
pnpm install

cd ..\agent
python -m pip install -r requirements.txt --user
```

然后分别开 3 个终端：

终端 1，启动 `agent`：

```powershell
cd agent
$env:AGENT_STORAGE_DRIVER="file"
$env:AGENT_FILE_STORE_DIR="$PWD\.state"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

终端 2，启动 `main`：

```powershell
cd main
npm run dev
```

终端 3，启动 `chat`：

```powershell
cd chat
pnpm dev
```

默认访问地址：

- 前端：`http://localhost:5173`
- 主后端：`http://127.0.0.1:3000`
- Agent：`http://127.0.0.1:8000`

本地开发建议让 `agent` 使用 `--reload` 热加载；如果是 Docker 容器开发模式，可额外设置：

```env
AGENT_RELOAD=true
```

文件模式下：

- `main` 数据写入 `main/data/*.json`
- `agent` thread/checkpoint 写入 `agent/.state/`

### 模式二：本地 MySQL 存储

如果希望本地联调时使用 MySQL：

1. 启动 MySQL
2. 把 `main/.env` 中 `STORAGE_DRIVER` 改为 `mysql`
3. 启动 `agent` 时设置：

```powershell
$env:AGENT_STORAGE_DRIVER="mysql"
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_NAME="myaichat"
$env:DB_USER="myaichat"
$env:DB_PASSWORD="myaichat"
```

4. 再按三终端方式启动 `agent`、`main`、`chat`

在这个模式下：

- `main` 使用 Sequelize 管理业务表与迁移
- `agent` 使用 MySQL 保存线程状态和结构化记忆

## Docker 启动

Docker Compose 默认使用 MySQL。

```powershell
docker compose up --build
```

默认地址：

- 前端：`http://127.0.0.1:8080`
- 主后端：`http://127.0.0.1:3000`
- Agent：容器内 `http://agent:8000`
- MySQL：`127.0.0.1:3306`

`docker-compose.yml` 当前包含：

- `mysql`
- `agent`
- `main`
- `chat`

## 模型配置

当前仅支持 `OpenAI-compatible` 配置语义，不再区分 `provider`。

需要配置的字段：

- `baseUrl`
- `apiKey`
- `model`
- `temperature`
- `description`
- `tags`

例如：

- `baseUrl`: `https://api.deepseek.com/v1`
- `model`: `deepseek-chat`

模型配置通过应用内“模型配置”功能保存；`agent` 在运行时从 `main` 转发的配置中读取这些参数。

## 结构化记忆

`agent` 不再使用摘要式长期记忆，当前采用“智能体可配置的动态 schema”。

当前行为：

- 每个智能体模板都可以定义自己的 `memorySchema`
- 新会话会复制当前智能体的 schema 作为会话快照
- 会话可单独配置结构化记忆处理间隔与历史消息条数
- `agent` 会按 `structuredMemoryInterval` 在指定用户轮次触发结构化记忆整理
- `structuredMemoryHistoryLimit` 用于限制结构化记忆与回答阶段看到的历史消息窗口
- 后端会按当前 schema 做字段过滤、类型归一化和保底合并
- 前端当前以树状结构只读展示最终记忆

默认模板仍然内置了这些示例分类：

- `preferences`：用户偏好、风格、长期约束
- `facts`：稳定事实、背景信息、环境上下文
- `tasks`：目标、进展、待办、阻塞项

但这些只是默认值，不再是唯一支持的结构。

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
- `[memory-agent:merged]`：和旧记忆合并后的最终结果

默认开启；如需关闭：

```env
MEMORY_AGENT_LOGGING=false
```

## 健康检查

本地启动后可以用这些命令确认服务状态：

```powershell
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:3000/api/capabilities
curl http://127.0.0.1:5173
```

也可以直接看端口：

- `8000`：agent
- `3000`：main
- `5173`：chat

## Windows 常见问题

### 1. `python` 或 `py` 不可用

如果系统装了 Windows Store 别名但没装正式 Python，常见现象是：

- `python` 无法启动
- `py` 无法启动
- `venv` 或 `pip` 行为异常

建议直接安装官方 `Python 3.12+`，并确认以下命令可用：

```powershell
python --version
py --version
```

### 2. `npm run dev` 报 `spawn EPERM`

当前仓库里 `main` 的开发脚本已经改为直接运行：

```json
"dev": "node server.mjs"
```

不要再依赖 `nodemon`。

### 3. `pnpm dev` 报 `spawn EPERM`

Windows 下部分环境中，Vite 在解析网络驱动器时会触发 `net use` 调用并报错。当前仓库已经为此加了开发包装脚本：

```json
"dev": "node ./scripts/dev-vite.mjs --config vite.config.mjs --configLoader runner"
```

如果你修改了 `chat/package.json`，请保留这个入口。

### 4. `agent` 启动后无法真正对话

这通常不是 Python 服务本身挂了，而是模型配置无效。至少需要一组可用的：

- `baseUrl`
- `apiKey`
- `model`

## 相关说明

- `main/package.json` 提供了 `npm run migrate`
- `node_modules/`、构建产物、日志和本地运行数据都已加入 Git 忽略
- `main/data/` 是 `file` 模式的数据目录
- `agent/.state/` 是本地 `file` 模式的 agent 状态目录

## 路线图

详细任务清单请查看：

- [TASK_CHECKLIST.md](./TASK_CHECKLIST.md)
- [TASK_CHECKLIST.en.md](./TASK_CHECKLIST.en.md)
- [TASK_CHECKLIST.zh-CN.md](./TASK_CHECKLIST.zh-CN.md)
