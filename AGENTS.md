# Repository Guidelines

## Project Structure & Module Organization
- `chat/`：Vue 3 + TypeScript 前端；业务代码在 `chat/src/`，单测在 `chat/src/**/*.spec.ts`，E2E 在 `chat/e2e/`。
- `main/`：Node.js API 服务；入口是 `main/server.mjs`，核心逻辑在 `main/src/`，迁移脚本在 `main/src/migrations/`。
- `agent/`：Python 智能体服务（`agent/app/`），由 `main` 通过 HTTP 调用。
- `upload/`：独立上传服务，负责 MinIO 文件/图片上传。
- 根目录关键文件：`README.md`、`.env.example`、`docker-compose.yml`。

## Build, Test, and Development Commands
- 安装依赖：
  - `cd chat && pnpm install`
  - `cd main && npm install`
- 前端开发：`cd chat && pnpm dev`
- 前端构建：`cd chat && pnpm build`
- 前端检查：
  - `pnpm type-check`
  - `pnpm test:unit --run`
  - `pnpm test:e2e`
  - `pnpm lint`
- 后端开发：
  - `cd main && npm run dev`
  - `npm run migrate`（执行数据库迁移）
- Docker 一键启动：`docker compose up --build`

## Coding Style & Naming Conventions
- 前端使用 ESLint + Oxlint + Prettier（见 `chat/eslint.config.ts`、`chat/package.json`）。
- 前端优先 TypeScript；Node 服务统一使用 ESM（`*.mjs`）。
- Vue 组件文件采用 PascalCase（如 `ChatAgentPanels.vue`）。
- 组合式函数采用 `useXxx` 命名（如 `useChatStreaming.ts`）。
- 先复用现有模块，再新增工具；保持最小改动面。

## Testing Guidelines
- 单元测试：Vitest（`chat/vitest.config.ts`，`jsdom` 环境）。
- 端到端测试：Playwright（`chat/playwright.config.ts`）。
- 命名与位置：
  - 单测：靠近源码的 `*.spec.ts`
  - E2E：`chat/e2e/` 目录
- 提交 PR 前至少执行：`pnpm type-check`、`pnpm test:unit --run`、`pnpm lint`（在 `chat/` 下）。

## Commit & Pull Request Guidelines
- 提交历史主要遵循 Conventional Commit：`feat`、`fix`、`refactor`、`docs`，可带 scope（如 `feat(upload): ...`）。
- 提交信息用祈使句，单次提交只做一类逻辑改动。
- PR 必填内容：
  - 变更目的与影响范围
  - 涉及模块（如 `chat`、`main`、`agent`、`upload`）
  - 测试证据（命令与结果）
  - UI 改动附截图或录屏

## Security & Configuration Tips
- 禁止提交真实密钥；本地配置基于 `*.env.example` 复制。
- 联调前确认 Clerk 与数据库变量已配置。
- 使用 MySQL 模式时，先在 `main/` 执行 `npm run migrate` 再做功能验证。
