"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authSessionMiddleware = void 0;
const onlineSession_1 = require("../services/onlineSession");
const WHITELIST_PATHS = new Set(["/login", "/refresh-token"]);
const authSessionMiddleware = (req, res, next) => {
    void (async () => {
        try {
            const rawPath = (req.path || "").toString();
            if (WHITELIST_PATHS.has(rawPath))
                return next();
            const authorization = (req.headers?.authorization ?? "").toString();
            const token = authorization.replace(/^Bearer\s+/i, "").trim();
            if (!token)
                return res.error("未登录或登录已过期", 401);
            const parts = token.split("_");
            if (parts.length < 3 || parts[0] !== "atk") {
                return res.error("无效的访问凭证", 401);
            }
            const alive = await (0, onlineSession_1.isAccessTokenOnline)(token);
            if (!alive)
                return res.error("登录已失效或已被强制下线", 401);
            next();
        }
        catch (error) {
            return res.error(`鉴权失败: ${error instanceof Error ? error.message : String(error)}`, 500);
        }
    })();
};
exports.authSessionMiddleware = authSessionMiddleware;
