<p align="right">
  <a href="./README.md">English</a> |
  <a href="./README.zh-CN.md">中文</a>
</p>

# myaichat

`myaichat` 是一个前端基于 Vue、后端基于 Node/Express 的全栈聊天项目。

后端目前支持两种持久化驱动：

- `file`：将运行数据写入 `main/data/*.json`
- `mysql`：通过 Sequelize 将运行数据写入 MySQL

## 项目结构

- `chat/`：Vue 3 + Vite 前端
- `main/`：Node.js + Express 后端
- `docker-compose.yml`：基于 MySQL 模式的完整 Docker 启动配置
- `TASK_CHECKLIST.md`：项目任务清单与路线图

## 环境要求

- Node.js `20.19.0+` 或 `22.12.0+`
- pnpm
- Docker Desktop 或 Docker Engine

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
- 运行时数据存储在 MySQL 中，而不是 JSON 文件中

## npm/pnpm 启动方式

### 模式一：本地文件存储

这是默认的本地开发模式。

前端：

```powershell
cd chat
pnpm install
pnpm dev
```

后端：

```powershell
cd main
npm install
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
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
```

3. 启动后端：

```powershell
cd main
npm install
npm run dev
```

4. 启动前端：

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
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_LOGGING=true|false`

默认行为：

- 本地 `npm run dev`：`file`
- Docker Compose：`mysql`

## 路线图

详细任务清单请查看：[TASK_CHECKLIST.md](C:/Users/Administrator/Desktop/myaichat/TASK_CHECKLIST.md)

### 已完成

- [x] 支持 `file` 与 `mysql` 双存储模式
- [x] 已接入 Sequelize migration
- [x] 已支持本地 Docker MySQL 联调
- [x] 已拆分 Docker 与本地两类启动文档

### 计划中

- [ ] 实现用户登录数据独立
- [ ] 优化前端页面与设置布局
- [ ] 将“机器人”统一更名为“智能体”
- [ ] 增加本地模型支持方案
- [ ] 增加智能体分享与论坛能力
- [ ] 深化模型管理与 Token 购买能力
- [ ] 增加向量数据库支持
- [ ] 增加图数据库支持
- [ ] 接入 Love2D 实现智能体可视化展示

## 说明

- `node_modules/`、构建产物、日志和本地运行数据都已被 Git 忽略。
- `main/data/` 被视为本地运行数据目录，不会提交到仓库。
- `main/data/` 会继续保留给文件模式使用，切换到 `STORAGE_DRIVER=mysql` 后可停用。
- `main/package.json` 中提供了手动执行数据库迁移的 `npm run migrate` 命令。

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
