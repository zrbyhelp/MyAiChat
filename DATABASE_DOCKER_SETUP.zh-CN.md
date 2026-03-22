# MyAiChat 数据库 Docker 安装说明

本项目本地数据库模式使用 `MySQL 8.4`，默认配置来自根目录 `.env.example`：

- `DB_NAME=myaichat`
- `DB_USER=myaichat`
- `DB_PASSWORD=myaichat`
- `DB_PORT=3306`
- `MYSQL_ROOT_PASSWORD=rootpassword`

如果你只想先把数据库跑起来，再让 `main` 服务连接它，可以直接执行下面对应系统的命令。

## Windows

适用于 PowerShell：

```powershell
docker run -d --name myaichat-mysql `
  -e MYSQL_ROOT_PASSWORD=rootpassword `
  -e MYSQL_DATABASE=myaichat `
  -e MYSQL_USER=myaichat `
  -e MYSQL_PASSWORD=myaichat `
  -p 3306:3306 `
  -v myaichat-mysql-data:/var/lib/mysql `
  mysql:8.4
```

## Linux

适用于 bash：

```bash
docker run -d --name myaichat-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=myaichat \
  -e MYSQL_USER=myaichat \
  -e MYSQL_PASSWORD=myaichat \
  -p 3306:3306 \
  -v myaichat-mysql-data:/var/lib/mysql \
  mysql:8.4
```

## macOS

适用于 zsh 或 bash：

```bash
docker run -d --name myaichat-mysql \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=myaichat \
  -e MYSQL_USER=myaichat \
  -e MYSQL_PASSWORD=myaichat \
  -p 3306:3306 \
  -v myaichat-mysql-data:/var/lib/mysql \
  mysql:8.4
```

## 项目连接配置

数据库启动后，本项目本地 MySQL 模式可使用以下配置：

```env
STORAGE_DRIVER=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=myaichat
DB_USER=myaichat
DB_PASSWORD=myaichat
```

如果你使用的是 `main/.env`，再补上：

```env
CLERK_SECRET_KEY=sk_test_your_clerk_secret_key
CLERK_PUBLISHABLE_KEY=pk_test_your_clerk_publishable_key
```

## 检查数据库是否启动成功

```bash
docker ps
```

看到容器名 `myaichat-mysql` 处于 `Up` 状态即可。

## 停止和删除数据库容器

```bash
docker stop myaichat-mysql
docker rm myaichat-mysql
```

如果还要一并删除数据卷：

```bash
docker volume rm myaichat-mysql-data
```

## 补充说明

- 如果本机 `3306` 端口已被占用，可以把命令中的 `-p 3306:3306` 改成例如 `-p 3307:3306`，同时把项目里的 `DB_PORT` 改成 `3307`。
- 如果你要直接启动整套项目，也可以使用仓库根目录现成的 `docker-compose.yml`：

```powershell
docker compose up --build
```
