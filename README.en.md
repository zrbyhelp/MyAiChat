<p align="right">
  <a href="./README.md">中文</a> |
  <a href="./README.en.md">English</a>
</p>

<p align="center">
  <img src="./image/myaichatlogo.png" alt="myaichat" width="480" />
</p>

`myaichat` is an AI conversation project centered on delivering a real messaging-style chat experience.

It is not just a question-and-answer window. The goal is to make it feel closer to a real social chat application: users can keep chatting with agents, receive proactive messages from agents, observe interactions between multiple agents, and eventually extend the system toward group chat, character relationships, scene setup, and story progression.

The project is aimed at becoming a highly customizable character-and-scenario chat system with support for character setup, memory, proactive messaging, multi-character collaboration, group chat interaction, and future extensions such as vector memory, graph relationships, and visual presentation.

The server currently supports two persistence drivers:

- `file`: stores runtime data in `main/data/*.json`
- `mysql`: stores runtime data in MySQL through Sequelize

The current version also integrates `Clerk` as the unified authentication layer:

- Supports `GitHub` sign-in
- Supports `Google` sign-in
- Supports `Email` sign-in
- All business APIs require authentication
- Sessions, character cards, model configs, and memory are isolated per user

## Project Introduction

The current version focuses on evolving these capabilities:

- A chat window experience closer to real messaging apps
- Agents can send proactive messages instead of only passive replies
- Support for multi-character interaction and future group chat expansion
- Highly customizable characters, relationships, scenarios, and world settings
- Session memory, model management, and switching between local and cloud models
- Reserved extensibility for multi-agent collaboration, vector databases, graph databases, dynamic functions, and visual presentation

## Project Positioning

This project is better understood as:

- An AI chat simulator
- A character chat system
- A multi-agent interactive chat system
- An extensible platform for story, scenario, and character-driven conversations

## GitHub About

Suggested About text:

`An AI conversation system focused on real messaging-style chat, with proactive messages, group chat, multi-agent interaction, and highly customizable characters and scenarios.`

Suggested keywords:

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
- `docker-compose.yml`: full Docker startup configuration for MySQL mode
- `TASK_CHECKLIST.md`: project task checklist in Chinese
- `TASK_CHECKLIST.en.md`: project task checklist in English

## Requirements

- Node.js `20.19.0+` or `22.12.0+`
- pnpm
- Docker Desktop or Docker Engine
- A Clerk application with `GitHub / Google / Email` sign-in configured

## Docker Startup

Docker mode uses MySQL by default.

1. Create the root environment file from `.env.example`
2. Start the full service stack:

```powershell
docker compose up --build
```

Default access addresses:

- Front end: `http://127.0.0.1:8080`
- Back end: `http://127.0.0.1:3000`
- MySQL: `127.0.0.1:3306`

In Docker mode:

- `chat` is served by Nginx
- `/api` is reverse-proxied to the `main` container
- The server uses `STORAGE_DRIVER=mysql`
- The front end reads `VITE_CLERK_PUBLISHABLE_KEY` at build time
- The back end validates authentication state with `CLERK_SECRET_KEY`
- Runtime data is stored in MySQL instead of JSON files

## npm/pnpm Startup

### Mode 1: Local File Storage

This is the default local development mode.

Front end:

```powershell
cd chat
pnpm install
Copy-Item .env.example .env
pnpm dev
```

Back end:

```powershell
cd main
npm install
Copy-Item .env.example .env
npm run dev
```

In this mode:

- MySQL is not required
- `STORAGE_DRIVER` defaults to `file`
- Data is written into `main/data/model-configs.json`
- Data is written into `main/data/robots.json`
- Data is written into `main/data/sessions.json`

### Mode 2: Local MySQL Storage

If you want local development to use MySQL instead of JSON files, use this mode.

1. Create `main/.env` from `main/.env.example`
2. Set:

```env
STORAGE_DRIVER=mysql
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
```

3. Create `chat/.env` from `chat/.env.example`

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

4. Start the back end:

```powershell
cd main
npm install
npm run dev
```

5. Start the front end:

```powershell
cd chat
pnpm install
pnpm dev
```

In this mode:

- The back end connects to MySQL through Sequelize
- Database migrations run during startup
- JSON files under `main/data/` are not used as the active data source

## Environment Variables

Back-end environment variables:

- `STORAGE_DRIVER=file|mysql`
- `PORT`
- `CLERK_SECRET_KEY`
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_LOGGING=true|false`

Front-end environment variables:

- `VITE_CLERK_PUBLISHABLE_KEY`

Default behavior:

- Local `npm run dev`: `file`
- Docker Compose: `mysql`

## Roadmap

Detailed task checklists:

- [TASK_CHECKLIST.md](./TASK_CHECKLIST.md)
- [TASK_CHECKLIST.en.md](./TASK_CHECKLIST.en.md)

### Libraries and Tools

- [ ] MinIO
- [ ] Redis

### Phase 1 Tasks (Near Term)

- [x] Implement per-user isolated login data
- [x] Front-end page improvements
  - [x] Improve token number display formatting
  - [ ] Optimize settings page layout
  - [x] Rename "Robot" to "Agent"
  - [ ] Mobile UI adjustments

### Phase 2 Tasks (Depending on Priorities)

- [ ] Project localization
- [ ] Support plans for local models
- [ ] Allow configuring the model used for current session memory generation
- [ ] Deepen agent capabilities
- [ ] Project platformization
  - [ ] Build an admin dashboard
  - [ ] Add agent sharing
  - [ ] Add forum features
  - [ ] Store personal agents locally
  - [ ] Require backend review and storage for paid shared agents
  - [ ] Add agent import/export
- [ ] Session MOD features
  - [ ] MOD import/export
  - [ ] Local storage for personal MODs
  - [ ] Require backend review and storage for paid shared MODs
- [ ] Deepen model management features
  - [ ] Paid models
  - [ ] Free models
  - [ ] Personal models
- [ ] Deepen token calculation capabilities
- [ ] Online token purchase features
- [ ] Deepen agent capabilities

### Phase 3 Tasks (Need Teammates)

- [ ] Organize the codebase
- [ ] Implement vector database capabilities
  - [ ] Agent database
  - [ ] Session database
- [ ] Implement graph database capabilities
  - [ ] Create story characters
  - [ ] Link character lines
  - [ ] Link character events
- [ ] Share user preferences across multiple agents
- [ ] Implement dynamic AI function registration
  - [ ] Agent integration
  - [ ] Session integration
- [ ] Implement a session timer that autonomously generates messages

### Phase 4 Tasks (Someday)

- [ ] Connect to the Love2D engine for visual agent presentation
- [ ] Implement collaborative multi-agent group chat

### Phase 5 Tasks (Multimodal)

- [ ] Implement image, voice, and video input
- [ ] Implement video and voice capabilities

## Notes

- `node_modules/`, build artifacts, logs, and local runtime data are ignored by Git.
- `main/data/` is treated as a local runtime data directory and is not committed to the repository.
- `main/data/` remains available for file mode and can be disabled after switching to `STORAGE_DRIVER=mysql`.
- `main/package.json` provides `npm run migrate` for manually running database migrations.
- Unauthenticated users cannot call `/api/*` business endpoints.
- If a user sends a message while signed out, the chat page opens the Clerk sign-in dialog directly.

## Collaboration

If you want to collaborate on this project, please apply through GitHub Issues.

- You can use Issues to submit ideas, bugs, feature suggestions, or collaboration intent
- If needed, please include your goals, expected contribution, and contact information

## Star History

<a href="https://www.star-history.com/?repos=zrbyhelp%2FMyAiChat&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=zrbyhelp/MyAiChat&type=date&legend=top-left" />
 </picture>
</a>
