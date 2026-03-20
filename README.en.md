<p align="right">
  <a href="./README.md">中文</a> |
  <a href="./README.en.md">English</a>
</p>

# myaichat

`myaichat` is an AI conversation project focused on building a real messaging-style chat experience.

It is not meant to be just a question-and-answer window. The goal is to make it feel closer to a real chat application: users can have ongoing conversations with AI characters, receive proactive messages from agents, observe interactions between multiple agents, and eventually extend the system toward group chat, character relationships, scene customization, and story progression.

The project aims to become a highly customizable character-and-scenario chat system with support for character setup, memory, proactive messaging, multi-character interaction, group chat, and future extensions such as vector memory, graph relationships, and visual presentation.

The server currently supports two persistence drivers:

- `file`: store runtime data in `main/data/*.json`
- `mysql`: store runtime data in MySQL through Sequelize

## Project Introduction

The current product direction focuses on:

- a chat window experience closer to a real messaging app
- proactive agent messages instead of only passive replies
- multi-character interaction and future group chat support
- highly customizable characters, relationships, scenarios, and world settings
- session memory, model management, and local/cloud model switching
- an extensible architecture for multi-agent collaboration, vector databases, graph databases, dynamic functions, and visual presentation

## Positioning

This project is better described as:

- an AI chat simulator
- a character chat system
- a multi-agent interactive messaging system
- an extensible platform for story, scenario, and character-driven chat

## GitHub About

Suggested About text:

`An AI chat system focused on real messaging-style conversations, with proactive messages, group chat, multi-agent interaction, and highly customizable characters and scenarios.`

Suggested Topics:

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

## Project Structure

- `chat/`: Vue 3 + Vite front end
- `main/`: Node.js + Express back end
- `docker-compose.yml`: full Docker startup for MySQL mode
- `TASK_CHECKLIST.md`: task checklist
- `TASK_CHECKLIST.zh-CN.md`: Chinese task checklist

## Requirements

- Node.js `20.19.0+` or `22.12.0+`
- pnpm
- Docker Desktop or Docker Engine

## Docker Startup

Docker mode uses MySQL by default.

1. Create the root env file from `.env.example`
2. Start the full stack:

```powershell
docker compose up --build
```

Default access:

- Front end: `http://127.0.0.1:8080`
- Back end: `http://127.0.0.1:3000`
- MySQL: `127.0.0.1:3306`

In Docker mode:

- `chat` is served by Nginx
- `/api` is proxied to the `main` container
- the server runs with `STORAGE_DRIVER=mysql`
- runtime data is stored in MySQL instead of JSON files

## npm/pnpm Startup

### Mode 1: Local File Storage

This is the default local development mode.

Front end:

```powershell
cd chat
pnpm install
pnpm dev
```

Back end:

```powershell
cd main
npm install
npm run dev
```

In this mode:

- no MySQL is required
- `STORAGE_DRIVER` defaults to `file`
- data is written into `main/data/model-configs.json`
- data is written into `main/data/robots.json`
- data is written into `main/data/sessions.json`

### Mode 2: Local MySQL Storage

Use this mode when you want local development to access MySQL instead of JSON files.

1. Create `main/.env` from `main/.env.example`
2. Set:

```env
STORAGE_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
```

3. Start the server:

```powershell
cd main
npm install
npm run dev
```

4. Start the front end:

```powershell
cd chat
pnpm install
pnpm dev
```

In this mode:

- the server connects to MySQL with Sequelize
- database migrations run during startup
- JSON files in `main/data/` are not used as the active persistence backend

## Environment Variables

Server variables:

- `STORAGE_DRIVER=file|mysql`
- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_LOGGING=true|false`

Default behavior:

- local `npm run dev`: `file`
- Docker Compose: `mysql`

## Roadmap

Detailed task lists:

- [TASK_CHECKLIST.md](C:/Users/Administrator/Desktop/myaichat/TASK_CHECKLIST.md)
- [TASK_CHECKLIST.zh-CN.md](C:/Users/Administrator/Desktop/myaichat/TASK_CHECKLIST.zh-CN.md)

Current priorities:

- [ ] implement independent user login data
- [ ] improve the real chat window experience
- [ ] improve token display and settings layout
- [ ] rename "Robot" to "Agent"
- [ ] support configurable memory-generation models per session
- [ ] support local models
- [ ] support agent sharing, forum, and platform features
- [ ] support vector databases, graph databases, and multi-agent group chat
- [ ] support Love2D-based visual agent presentation

## Notes

- `node_modules/`, build output, logs, and local runtime data are ignored by Git.
- `main/data/` is treated as local runtime data and is not committed.
- `main/data/` is kept for file mode and can be disabled by switching `STORAGE_DRIVER=mysql`.
- `main/package.json` provides `npm run migrate` for manual database migration execution.

## Collaboration

If you want to collaborate on this project, please apply through GitHub Issues.

- Use Issues to describe your idea, bug report, feature proposal, or collaboration intent
- Please include your goal, expected contribution, and contact details when necessary

## Star History

<a href="https://www.star-history.com/?repos=zrbyhelp%2FMyAiChat&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&legend=top-left" />
 </picture>
</a>
