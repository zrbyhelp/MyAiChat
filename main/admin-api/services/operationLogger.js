"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOperationLogger = void 0;
const user_1 = __importDefault(require("../models/user"));
const monitor_1 = require("../router/monitor");
const onlineSession_1 = require("./onlineSession");
const SENSITIVE_KEYS = new Set([
    "password",
    "newPwd",
    "pwd",
    "token",
    "accessToken",
    "refreshToken",
    "authorization"
]);
const ACTION_LABELS = {
    Login: "登录",
    RefreshToken: "刷新令牌",
    QueryMine: "查询个人信息",
    UpdateMine: "修改个人信息",
    QueryMineLogs: "查询个人安全日志",
    QueryAsyncRoutes: "查询动态路由",
    QueryMenu: "查询菜单",
    CreateMenu: "新增菜单",
    UpdateMenu: "修改菜单",
    DeleteMenu: "删除菜单",
    QueryRole: "查询角色",
    CreateRole: "新增角色",
    UpdateRole: "修改角色",
    ChangeRoleStatus: "修改角色状态",
    DeleteRole: "删除角色",
    QueryRoleMenuTree: "查询角色菜单权限树",
    QueryRoleMenuIds: "查询角色菜单权限",
    SaveRoleMenus: "保存角色菜单权限",
    QueryDept: "查询部门",
    CreateDept: "新增部门",
    UpdateDept: "修改部门",
    DeleteDept: "删除部门",
    QueryUser: "查询用户",
    CreateUser: "新增用户",
    UpdateUser: "修改用户",
    DeleteUser: "删除用户",
    BatchDeleteUser: "批量删除用户",
    ChangeUserStatus: "修改用户状态",
    ResetUserPassword: "重置用户密码",
    QueryAllRoles: "查询全部角色",
    QueryUserRoleIds: "查询用户角色",
    SaveUserRoles: "保存用户角色"
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
const sanitizeForLog = (value, depth = 0) => {
    if (value === null || value === undefined)
        return value;
    if (depth > 4)
        return "[MaxDepth]";
    if (Buffer.isBuffer(value)) {
        return {
            type: "Buffer",
            length: value.length
        };
    }
    if (ArrayBuffer.isView(value)) {
        return {
            type: value.constructor?.name || "TypedArray",
            length: value.byteLength ?? 0
        };
    }
    if (value instanceof ArrayBuffer) {
        return {
            type: "ArrayBuffer",
            length: value.byteLength
        };
    }
    if (typeof value === "string")
        return value.length > 500 ? `${value.slice(0, 500)}...` : value;
    if (typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.slice(0, 20).map(item => sanitizeForLog(item, depth + 1));
    if (typeof value === "object") {
        const result = {};
        for (const [k, v] of Object.entries(value).slice(0, 50)) {
            result[k] = SENSITIVE_KEYS.has(k) ? "***" : sanitizeForLog(v, depth + 1);
        }
        if (Object.keys(value).length > 50) {
            result.__truncatedKeys = Object.keys(value).length - 50;
        }
        return result;
    }
    return String(value);
};
const extractStoredPath = (responseBody) => {
    const data = responseBody?.data;
    const candidates = [data?.imageUrl, data?.url, data?.path, data?.filePath, responseBody?.imageUrl, responseBody?.url, responseBody?.path];
    for (const item of candidates) {
        const value = String(item ?? "").trim();
        if (value)
            return value;
    }
    return null;
};
const isBinaryPayload = (value) => {
    if (!value)
        return false;
    return Buffer.isBuffer(value) || value instanceof ArrayBuffer || ArrayBuffer.isView(value);
};
const buildRequestBodyForLog = (req, responseBody) => {
    const rawBody = req?.body;
    if (!isBinaryPayload(rawBody))
        return sanitizeForLog(rawBody);
    const fileSize = Buffer.isBuffer(rawBody)
        ? rawBody.length
        : rawBody instanceof ArrayBuffer
            ? rawBody.byteLength
            : rawBody.byteLength ?? 0;
    return {
        upload: true,
        contentType: String(req?.headers?.["content-type"] || ""),
        fileSize,
        storedPath: extractStoredPath(responseBody)
    };
};
const resolveUsername = async (req) => {
    const authHeader = (req.headers?.authorization ?? "").toString();
    const userId = parseUserIdFromAccessToken(authHeader);
    if (userId) {
        const user = await user_1.default.findByPk(userId);
        if (user)
            return String(user.username || "unknown");
    }
    return (req.body?.username ?? req.query?.username ?? "unknown").toString();
};
const append = async (req, module, action, status, responseBody) => {
    const actionLabel = ACTION_LABELS[action] || action;
    const username = await resolveUsername(req);
    const client = (0, onlineSession_1.parseClientInfo)(req);
    await (0, monitor_1.appendOperationLog)({
        username,
        module,
        summary: actionLabel,
        ip: client.ip,
        address: client.address,
        system: client.system,
        browser: client.browser,
        status,
        operatingTime: Date.now(),
        method: req.method?.toUpperCase?.() || "POST",
        url: req.path,
        requestBody: buildRequestBodyForLog(req, responseBody),
        responseBody: sanitizeForLog(responseBody)
    });
};
const createOperationLogger = (req, res, module, action) => ({
    success: async (data, message = "操作成功") => {
        const payload = { code: 0, message, data, mess: message };
        await append(req, module, action, 1, payload);
        return res.success(data, message);
    },
    error: async (message = "操作失败", statusCode = 400) => {
        const payload = { code: 200, bizCode: statusCode, statusCode, message, mess: message };
        await append(req, module, action, 0, payload);
        return res.error(message, statusCode);
    }
});
exports.createOperationLogger = createOperationLogger;
