<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a>
</p>

# myaichat

`myaichat` is a full-stack chat project with a Vue front end and a Node/Express back end.

The server supports two persistence drivers:

- `file`: store runtime data in `main/data/*.json`
- `mysql`: store runtime data in MySQL through Sequelize

## Project Structure

- `chat/`: Vue 3 + Vite front end
- `main/`: Node.js + Express back end
- `docker-compose.yml`: full Docker startup for MySQL mode
- `TASK_CHECKLIST.md`: project task checklist and roadmap

## Requirements

- Node.js `20.19.0+` or `22.12.0+`
- pnpm
- Docker Desktop or Docker Engine for container startup

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

Detailed checklist: [TASK_CHECKLIST.md](C:/Users/Administrator/Desktop/myaichat/TASK_CHECKLIST.md)

### Completed

- [x] Dual storage support: `file` and `mysql`
- [x] Sequelize migration support
- [x] Docker MySQL local integration
- [x] Split startup documentation for Docker and local modes

### Planned

- [ ] Implement independent user login data
- [ ] Improve the front-end UI and settings layout
- [ ] Rename "Robot" to "Agent"
- [ ] Add local model support
- [ ] Add agent sharing and forum features
- [ ] Deepen model management and token purchasing
- [ ] Add vector database support
- [ ] Add graph database support
- [ ] Connect to Love2D for visual agent presentation

## Notes

- `node_modules/`, build output, logs, and local session data are ignored by Git.
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
