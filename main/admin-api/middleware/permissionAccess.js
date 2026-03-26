"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.permissionAccessMiddleware = void 0;
const menu_1 = __importDefault(require("../models/menu"));
const role_1 = __importDefault(require("../models/role"));
const roleMenu_1 = __importDefault(require("../models/roleMenu"));
const userRole_1 = __importDefault(require("../models/userRole"));
const API_PERMISSION_RULES = [
    { path: /^\/menu(?:\/|$)/, menuPath: "/system/menu/index" },
    { path: /^\/role(?:\/|$)/, menuPath: "/system/role/index" },
    { path: /^\/dept(?:\/|$)/, menuPath: "/system/dept/index" },
    { path: /^\/user(?:\/|$)/, menuPath: "/system/user/index" },
    { path: /^\/system\/basic-info(?:\/|$)/, menuPath: "/system/basic/index" },
    { path: /^\/system\/i18n(?:\/|$)/, menuPath: "/system/i18n/language" },
    { path: /^\/monitor\/online-logs(?:\/|$)/, menuPath: "/monitor/online-user" },
    { path: /^\/monitor\/offline(?:\/|$)/, menuPath: "/monitor/online-user" },
    { path: /^\/monitor\/login-logs(?:\/|$)/, menuPath: "/monitor/login-logs" },
    { path: /^\/monitor\/operation-logs(?:\/|$)/, menuPath: "/monitor/operation-logs" },
    { path: /^\/monitor\/operation-logs-detail(?:\/|$)/, menuPath: "/monitor/operation-logs" },
    { path: /^\/monitor\/system-logs(?:\/|$)/, menuPath: "/monitor/system-logs" },
    { path: /^\/monitor\/system-logs-detail(?:\/|$)/, menuPath: "/monitor/system-logs" },
    { path: /^\/carousel\/category(?:\/|$)/, menuPath: "/carousel/category" },
    { path: /^\/carousel\/resource(?:\/|$)/, menuPath: "/carousel/resource" },
    { path: /^\/resource-system\/category(?:\/|$)/, menuPath: "/resource-system/category" },
    { path: /^\/resource-system\/resource(?:\/|$)/, menuPath: "/resource-system/resource" },
    { path: /^\/resource-system\/storage(?:\/|$)/, menuPath: "/resource-system/storage" },
    { path: /^\/system\/third-party(?:\/|$)/, menuPath: "/third-party/*" },
    { path: /^\/form-workflow(?:\/|$)/, menuPath: "/survey/workflow" },
    { path: /^\/survey(?:\/|$)/, menuPath: "/survey/*" }
];
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
const normalizePath = (inputPath) => {
    const path = (inputPath || "").trim();
    if (!path)
        return "/";
    if (path.length > 1 && path.endsWith("/"))
        return path.slice(0, -1);
    return path;
};
const getMatchedRule = (method, path) => {
    return API_PERMISSION_RULES.find(rule => {
        if (rule.method && rule.method.toUpperCase() !== method.toUpperCase())
            return false;
        return rule.path.test(path);
    });
};
const checkMenuPathAllowed = (menuPath, menuPathSet) => {
    if (!menuPath)
        return true;
    if (menuPath.endsWith("/*")) {
        const prefix = menuPath.slice(0, -2);
        return Array.from(menuPathSet).some(path => path === prefix || path.startsWith(`${prefix}/`));
    }
    return menuPathSet.has(menuPath);
};
const permissionAccessMiddleware = (req, res, next) => {
    void (async () => {
        try {
            const matched = getMatchedRule((req.method || "").toUpperCase(), normalizePath(req.path || "/"));
            if (!matched)
                return next();
            const authorization = (req.headers?.authorization ?? "").toString();
            const userId = parseUserIdFromAccessToken(authorization);
            if (!userId)
                return res.error("无权限访问", 403);
            const userRoles = await userRole_1.default.findAll({ where: { userId }, attributes: ["roleId"] });
            const roleIds = userRoles.map(item => Number(item.roleId)).filter(Boolean);
            if (roleIds.length === 0)
                return res.error("无权限访问", 403);
            const roles = await role_1.default.findAll({ where: { id: roleIds, status: 1 }, attributes: ["id", "code"] });
            const roleCodes = roles.map(item => String(item.code));
            if (roleCodes.includes("admin"))
                return next();
            const enabledRoleIds = roles.map(item => Number(item.id)).filter(Boolean);
            if (enabledRoleIds.length === 0)
                return res.error("无权限访问", 403);
            const roleMenus = await roleMenu_1.default.findAll({ where: { roleId: enabledRoleIds }, attributes: ["menuId"] });
            const menuIds = Array.from(new Set(roleMenus.map(item => Number(item.menuId)).filter(Boolean)));
            if (menuIds.length === 0)
                return res.error("无权限访问", 403);
            const menus = await menu_1.default.findAll({ where: { id: menuIds }, attributes: ["menuType", "path", "auths"] });
            const menuPathSet = new Set(menus
                .filter(item => Number(item.menuType) !== 3)
                .map(item => String(item.path || "").trim())
                .filter(Boolean));
            const authSet = new Set(menus
                .filter(item => Number(item.menuType) === 3)
                .flatMap(item => String(item.auths || "").split(","))
                .map(item => item.trim())
                .filter(Boolean));
            const menuAllowed = checkMenuPathAllowed(matched.menuPath, menuPathSet);
            const authAllowed = matched.auth ? authSet.has(matched.auth) || authSet.has("*:*:*") : true;
            if (menuAllowed && authAllowed)
                return next();
            return res.error("无权限访问", 403);
        }
        catch (error) {
            return res.error(`权限校验失败: ${error instanceof Error ? error.message : String(error)}`, 500);
        }
    })();
};
exports.permissionAccessMiddleware = permissionAccessMiddleware;
