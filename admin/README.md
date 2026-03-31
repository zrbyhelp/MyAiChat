# admin

`admin/` 是 MyAiChat 的后台管理前端，基于 `vue-pure-admin` 二次改造，实际后端由根项目中的 `main` 服务通过 `/admin-api/*` 提供。

这不是上游模板仓库说明，以下内容只针对当前项目。

## 当前用途

- 后台登录与权限入口
- 用户、角色、部门、菜单等系统管理
- 资源存储、监控日志、系统设置等后台模块
- 调查问卷 / 工作流等已接入的后台页面
- 与 `main/src/admin-backoffice.mjs` 初始化的种子数据和表结构联动

## 运行方式

1. 准备环境变量

```bash
cp admin/.env.example admin/.env
```

2. 安装依赖并启动

```bash
cd admin
pnpm install
pnpm dev
```

默认本地地址：`http://127.0.0.1:8081`

## 关键环境变量

- `ADMIN_PORT`：本地运行端口
- `VITE_PORT`：兼容原模板的端口变量
- `VITE_ADMIN_API_BASE_URL`：开发环境代理到 `main` 的地址
- `VITE_ROUTER_HISTORY`：当前默认 `hash`

## 登录说明

后台依赖 `main` 启动时执行的后台初始化逻辑。默认种子账号可见于 `main/admin-api/database/seeds/userSeed.js`：

- 用户名：`admin`
- 密码：`123456`

若无法登录，优先检查：

- `main` 是否已成功启动
- `main` 是否完成后台数据库同步与种子初始化
- `VITE_ADMIN_API_BASE_URL` 是否正确指向 `main`

## 常用命令

```bash
cd admin
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
```
