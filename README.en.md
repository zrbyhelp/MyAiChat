<p align="right">
  <a href="./README.zh-CN.md">中文</a> |
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="./image/myaichatlogo.png" alt="myaichat" width="480" />
</p>

# MyAiChat

`MyAiChat` is a three-service AI conversation system designed for chat-product scenarios, built with:

- Frontend: Vue 3 + Vite + TDesign Chat
- Gateway: Node.js + Express
- Agent service: Python FastAPI + LangGraph

Key capabilities in the current version:

- Clerk authentication with user-level data isolation
- OpenAI-compatible model integration
- SSE streaming chat
- Multi-agent collaboration (moderator / researcher / numeric / answerer / ui / memory)
- Dynamic structured memory (configurable schema)
- Dual storage drivers: `file` / `mysql`

### Desktop Version

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

### Mobile Version

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

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. Project Structure](#2-project-structure)
- [3. Requirements](#3-requirements)
- [4. Local Development (Recommended)](#4-local-development-recommended)
- [5. Docker Startup](#5-docker-startup)
- [6. Configuration](#6-configuration)
- [7. API List (main)](#7-api-list-main)
- [8. Streaming Event Protocol (SSE)](#8-streaming-event-protocol-sse)
- [9. Storage and Migrations](#9-storage-and-migrations)
- [10. Development Scripts](#10-development-scripts)
- [11. Debugging Guide](#11-debugging-guide)
- [12. FAQ](#12-faq)
- [13. Related Documents](#13-related-documents)

## 1. Architecture Overview

The system has 3 services:

1. `chat/`: frontend UI and chat interaction
2. `main/`: auth, data read/write, model management, SSE aggregation
3. `agent/`: LangGraph execution and state persistence

Primary request flow (streaming chat):

1. Frontend sends `POST /api/chat/stream`
2. `main` forwards to `agent` via `POST /runs/stream`
3. `agent` returns event stream
4. `main` normalizes events and pushes them to frontend via SSE
5. Frontend updates messages, tool status, structured content, and usage stats

## 2. Project Structure

```text
.
├─ chat/                            # Vue 3 frontend
│  ├─ src/views/ChatView.vue
│  ├─ src/hooks/chat-view/
│  └─ package.json
├─ main/                            # Express gateway
│  ├─ src/app.mjs                   # API routes
│  ├─ src/chat-service.mjs          # chat and streaming bridge
│  ├─ src/storage*.mjs              # file/mysql storage implementations
│  ├─ src/migrations/               # MySQL migrations
│  └─ package.json
├─ agent/                           # FastAPI + LangGraph
│  ├─ app/main.py                   # /health, /runs/stream
│  ├─ app/graph.py                  # multi-agent graph
│  ├─ app/persistence.py            # file/mysql persistence
│  └─ requirements.txt
├─ docker-compose.yml
├─ .env.example
├─ README.en.md
├─ README.zh-CN.md
└─ TASK_CHECKLIST*.md
```

## 3. Requirements

- Node.js: `^20.19.0` or `>=22.12.0`
- Frontend package manager: `pnpm`
- Backend package manager: `npm`
- Python: `3.12+`
- Docker (optional)
- Clerk app (required)

## 4. Local Development (Recommended)

### 4.1 Prepare environment variables

#### Root `.env` (based on `.env.example`)

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

#### `main/.env` (based on `main/.env.example`)

Recommended for local direct agent access:

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

#### `chat/.env` (based on `chat/.env.example`)

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

### 4.2 Install dependencies

```bash
cd main && npm install
cd ../chat && pnpm install
cd ../agent && python -m pip install -r requirements.txt
```

### 4.3 Start services (`file` storage)

Terminal A (`agent`):

```bash
cd agent
AGENT_STORAGE_DRIVER=file AGENT_FILE_STORE_DIR="$PWD/.state" uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Terminal B (`main`):

```bash
cd main
npm run dev
```

Terminal C (`chat`):

```bash
cd chat
pnpm dev
```

Access URLs:

- chat: `http://localhost:5173`
- main: `http://127.0.0.1:3000`
- agent: `http://127.0.0.1:8000`

### 4.4 Start services (`mysql` storage)

1. Ensure MySQL is reachable
2. Set `STORAGE_DRIVER=mysql` in `main/.env`
3. Set `AGENT_STORAGE_DRIVER=mysql` when starting agent

```bash
cd agent
AGENT_STORAGE_DRIVER=mysql DB_HOST=127.0.0.1 DB_PORT=3306 DB_NAME=myaichat DB_USER=myaichat DB_PASSWORD=myaichat uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## 5. Docker Startup

```bash
docker compose up --build
```

Default ports:

- chat: `http://127.0.0.1:8080`
- main: `http://127.0.0.1:3000`
- mysql: `127.0.0.1:3306`

Default behavior in Compose:

- `main`: `STORAGE_DRIVER=mysql`
- `agent`: `AGENT_STORAGE_DRIVER=mysql`
- `chat`: `VITE_CLERK_PUBLISHABLE_KEY` injected at build time

## 6. Configuration

### 6.1 Common settings

- `PORT`: main listening port
- `CHAT_PORT`: chat public port (Docker)
- `AGENT_SERVICE_URL`: main -> agent address

### 6.2 main settings

- `STORAGE_DRIVER`: `file` / `mysql`
- `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
- `DB_LOGGING=true` to enable Sequelize SQL logs

### 6.3 agent settings

- `AGENT_STORAGE_DRIVER`: `file` / `mysql`
- `AGENT_FILE_STORE_DIR`: file-mode directory (default `/tmp/myaichat-agent`)
- `AGENT_RELOAD=true`: hot reload in container

### 6.4 Clerk settings

- `CLERK_SECRET_KEY`: server-side validation
- `CLERK_PUBLISHABLE_KEY`: server-side Clerk middleware config
- `VITE_CLERK_PUBLISHABLE_KEY`: frontend SDK key

## 7. API List (main)

Source: `main/src/app.mjs`

### 7.1 Model config

- `GET /api/model-configs`
- `POST /api/model-configs`
- `POST /api/model-configs/test`

Legacy-compatible endpoints:

- `GET /api/model-config`
- `POST /api/model-config`
- `POST /api/model-config/test`

### 7.2 Sessions

- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/:id`
- `DELETE /api/sessions/:id`
- `POST /api/sessions/:id/delete` (compat)

### 7.3 Agents

- `GET /api/robots`
- `POST /api/robots`

### 7.4 Model capabilities

- `GET /api/models`
- `GET /api/capabilities`

### 7.5 Chat

- `POST /api/chat` (non-stream)
- `POST /api/chat/stream` (SSE stream)

## 8. Streaming Event Protocol (SSE)

`main/src/chat-service.mjs` normalizes agent events into frontend-facing events.

### 8.1 Main event types

- `text`: incremental answer text
- `ui_loading`: generating structured UI (suggestions/form)
- `suggestion`: suggestion list
- `form`: structured form
- `memory_status`: memory-stage status
- `structured_memory`: structured memory updates
- `tool_status`: tool call/tool result status
- `numeric_state_updated`: numeric state updates
- `usage`: token usage
- `done`: stream completed
- `error`: stream failed

### 8.2 Frontend handling locations

- `chat/src/hooks/chat-view/useChatStreaming.ts`
- `chat/src/hooks/chat-view/useChatbotRuntime.ts`
- `chat/src/hooks/chat-view/useChatMessagePipeline.ts`

## 9. Storage and Migrations

### 9.1 main storage drivers

- `file`: file-based storage
- `mysql`: Sequelize + MySQL

Driver selection logic: `main/src/database-config.mjs`

### 9.2 main migrations

Migration scripts: `main/src/migrations/`

Run command:

```bash
cd main
npm run migrate
```

### 9.3 agent persistence

- `file`: per-thread JSON files
- `mysql`: `agent_threads` table

Implementation: `agent/app/persistence.py`

## 10. Development Scripts

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

### 10.3 Launcher

Added a Node-based launcher to manage the local `chat / main / agent` services in one place.

Directory:

```bash
tools/launcher
```

Supported commands:

```bash
open <chat|main|agent|all>
restart <chat|main|agent|all>
close <chat|main|agent|all>
status
logs <chat|main|agent>
exit
```

Run directly:

```bash
cd tools/launcher
node launcher.mjs
```

Short commands from the repo root:

```bash
npm run launcher
npm run launcher:open
npm run launcher:status
npm run launcher:close
npm run launcher:restart
```

Double-click entry points:

- macOS: `Start MyAiChat.command`
- Windows: `Start-MyAiChat.vbs`

Notes:

- The Windows entry opens PowerShell instead of a `cmd` popup.
- Closing the launcher window attempts to stop all services started by the launcher.
- `agent` starts in local `file` storage mode by default and writes to `agent/.state/`.

## 11. Debugging Guide

### 11.1 Validate the chain first

1. Check `GET agent /health`
2. Check `GET main /api/...` (with auth)
3. Verify frontend streaming page

### 11.2 What to observe

- main logs: upstream connection and API failures
- agent logs: graph execution and numeric state I/O
- browser network: SSE event sequence from `/api/chat/stream`

### 11.3 Useful troubleshooting tactics

- Enable `DB_LOGGING=true` in main
- Start with `file` mode to exclude DB issues
- Reproduce using only `agent + main` first

## 12. FAQ

### 12.1 Frontend 401 / auth issues

Check:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- Login methods enabled in Clerk

### 12.2 main cannot connect to agent

Check:

- `AGENT_SERVICE_URL` target host/port
- agent process is running
- local proxy/firewall interference

### 12.3 mysql mode failed

Check:

- `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`
- both `main` and `agent` are in mysql mode
- `npm run migrate` executed

### 12.4 White screen after Docker startup

Check:

- `VITE_CLERK_PUBLISHABLE_KEY` injected at build
- browser console for Clerk initialization errors

## 13. Related Documents

- [README.md](./README.md)
- [README.zh-CN.md](./README.zh-CN.md)
- [DATABASE_DOCKER_SETUP.zh-CN.md](./DATABASE_DOCKER_SETUP.zh-CN.md)
- [TASK_CHECKLIST.md](./TASK_CHECKLIST.md)
- [TASK_CHECKLIST.en.md](./TASK_CHECKLIST.en.md)
- [TASK_CHECKLIST.zh-CN.md](./TASK_CHECKLIST.zh-CN.md)
