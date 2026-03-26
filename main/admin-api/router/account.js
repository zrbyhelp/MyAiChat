"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
const user_1 = __importDefault(require("../models/user"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const EMAIL_REGEXP = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AVATAR_UPLOAD_DIR = path_1.default.resolve(process.cwd(), "public/uploads/avatar");
const persistBase64Avatar = async (avatarRaw) => {
    const raw = avatarRaw.trim();
    const match = /^data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    if (!match)
        return raw;
    const ext = match[1] === "jpeg" ? "jpg" : match[1].toLowerCase();
    const data = match[2];
    const buffer = Buffer.from(data, "base64");
    if (!buffer.length)
        throw new Error("头像数据无效");
    await promises_1.default.mkdir(AVATAR_UPLOAD_DIR, { recursive: true });
    const filename = `${Date.now()}_${(0, crypto_1.randomUUID)()}.${ext}`;
    const fullPath = path_1.default.join(AVATAR_UPLOAD_DIR, filename);
    await promises_1.default.writeFile(fullPath, buffer);
    return `/uploads/avatar/${filename}`;
};
const parseUserIdFromAccessToken = (authorization) => {
    if (!authorization)
        return null;
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split("_");
    if (parts.length < 3 || parts[0] !== "atk")
        return null;
    const userId = Number(parts[1]);
    return Number.isFinite(userId) ? userId : null;
};
const toMinePayload = (user) => ({
    avatar: (user.avatar ?? "").toString(),
    username: (user.username ?? "").toString(),
    nickname: (user.nickname ?? "").toString(),
    email: (user.email ?? "").toString(),
    phone: (user.phone ?? "").toString(),
    description: (user.remark ?? "").toString()
});
const getCurrentUser = async (req) => {
    const authorization = (req.headers?.authorization ?? "").toString();
    const userId = parseUserIdFromAccessToken(authorization);
    if (userId) {
        const userById = await user_1.default.findByPk(userId);
        if (userById)
            return userById;
    }
    const username = ((req.body?.username ?? req.query?.username ?? "admin").toString().trim() || "admin");
    return user_1.default.findOne({ where: { username } });
};
router.get("/mine", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Account", "QueryMine");
    try {
        const user = await getCurrentUser(req);
        if (!user)
            return op.error("用户不存在", 404);
        return op.success(toMinePayload(user), "操作成功");
    }
    catch (error) {
        return op.error(`查询个人信息失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/mine/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Account", "UpdateMine");
    try {
        const user = await getCurrentUser(req);
        if (!user)
            return op.error("用户不存在", 404);
        const nickname = (req.body?.nickname ?? user.get("nickname")).toString().trim();
        if (!nickname)
            return op.error("昵称不能为空", 400);
        const email = (req.body?.email ?? user.get("email")).toString().trim();
        if (email && !EMAIL_REGEXP.test(email)) {
            return op.error("邮箱格式不正确", 400);
        }
        const avatarInput = (req.body?.avatar ?? user.get("avatar")).toString().trim();
        const avatar = avatarInput ? await persistBase64Avatar(avatarInput) : "";
        await user.update({
            nickname,
            email,
            phone: (req.body?.phone ?? user.get("phone")).toString().trim(),
            remark: (req.body?.description ?? user.get("remark")).toString().trim(),
            avatar
        });
        return op.success(toMinePayload(user), "更新成功");
    }
    catch (error) {
        return op.error(`更新个人信息失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.get("/mine-logs", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Account", "QueryMineLogs");
    try {
        const now = Date.now();
        const list = [
            {
                id: 1,
                ip: "127.0.0.1",
                address: "本地开发环境",
                system: "Windows",
                browser: "Chrome",
                summary: "账户登录",
                operatingTime: now
            },
            {
                id: 2,
                ip: "127.0.0.1",
                address: "本地开发环境",
                system: "Windows",
                browser: "Chrome",
                summary: "修改个人资料",
                operatingTime: now - 24 * 60 * 60 * 1000
            }
        ];
        return op.success({
            list,
            total: list.length,
            pageSize: 10,
            currentPage: 1
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询安全日志失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
exports.default = router;
