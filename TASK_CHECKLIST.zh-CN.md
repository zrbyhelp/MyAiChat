<p align="right">
  <a href="./TASK_CHECKLIST.md">English Checklist</a> |
  <a href="./TASK_CHECKLIST.zh-CN.md">中文清单</a> |
  <a href="./README.md">English README</a> |
  <a href="./README.zh-CN.md">中文 README</a>
</p>

[English Checklist](./TASK_CHECKLIST.md)|[中文清单](./TASK_CHECKLIST.zh-CN.md)|[English README](./README.md)|[中文 README](./README.zh-CN.md)

# 任务清单

## 已完成

### 基础能力

- [x] 支持 `file` 文件存储模式，并写入 `main/data/*.json`
- [x] 支持 `mysql` 数据库存储模式，并接入 Sequelize
- [x] 支持通过 `STORAGE_DRIVER` 切换存储驱动
- [x] 已加入 Sequelize migration
- [x] 已支持本地 Docker MySQL 联调
- [x] 已支持通过 `main/.env` 启动本地 MySQL 模式

### 部署能力

- [x] 已新增 `docker-compose.yml`
- [x] 已新增后端 Dockerfile
- [x] 已新增前端 Dockerfile
- [x] 已新增 `/api` 的 Nginx 代理配置
- [x] 已拆分 README 的 Docker、本地文件模式、本地数据库模式启动说明

## 进行中 / 计划中

### 第一阶段：近期任务

- [ ] 实现用户登录数据独立
- [ ] 优化前端页面
- [ ] 优化 token 用量显示方式
- [ ] 优化设置页面布局
- [ ] 将产品中的“Robot”统一更名为“Agent/智能体”
- [ ] 支持为当前会话设置记忆生成模型

### 第二阶段：扩展任务

- [ ] 增加本地模型支持方案
- [ ] 推动项目平台化
- [ ] 增加智能体分享功能
- [ ] 增加论坛模块
- [ ] 增加会话 MOD 功能
- [ ] 深化模型管理能力
- [ ] 支持收费模型
- [ ] 支持免费模型
- [ ] 支持个人模型
- [ ] 增加线上购买 token 的功能
- [ ] 深化智能体能力

### 第三阶段：多人协作功能

- [ ] 实现向量数据库支持
- [ ] 构建智能体知识库
- [ ] 构建会话知识库
- [ ] 实现图数据库支持
- [ ] 创建故事人物
- [ ] 关联人物关系
- [ ] 关联人物事件
- [ ] 支持用户偏好在多个智能体间共享
- [ ] 支持 AI 动态添加函数
- [ ] 增加智能体关联函数
- [ ] 增加会话关联函数
- [ ] 增加会话定时器自主生成消息

### 第四阶段：长期 / 实验性任务

- [ ] 接入 Love2D 引擎
- [ ] 实现智能体可视化展示体验

### 第五阶段：多模态能力

- [ ] 实现图片、语音、视频输入
- [ ] 实现视频、语音功能

## 说明

- 已勾选项目表示当前代码库已经完成。
- 未勾选项目表示尚未完成，属于后续计划。
- README 中也有简版路线图说明，可查看 [README.md](C:/Users/Administrator/Desktop/myaichat/README.md) 与 [README.zh-CN.md](C:/Users/Administrator/Desktop/myaichat/README.zh-CN.md)。
