"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const menu_1 = __importDefault(require("../models/menu"));
const role_1 = __importDefault(require("../models/role"));
const roleMenu_1 = __importDefault(require("../models/roleMenu"));
const userRole_1 = __importDefault(require("../models/userRole"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
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
const menuSort = (a, b) => {
    const ar = a.rank === null || a.rank === undefined ? Number.MAX_SAFE_INTEGER : Number(a.rank);
    const br = b.rank === null || b.rank === undefined ? Number.MAX_SAFE_INTEGER : Number(b.rank);
    if (ar !== br)
        return ar - br;
    return Number(a.id) - Number(b.id);
};
router.get("/get-async-routes", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Route", "QueryAsyncRoutes");
    try {
        const authorization = (req.headers.authorization ?? "").toString();
        const userId = parseUserIdFromAccessToken(authorization);
        if (!userId)
            return op.error("无效的访问凭证", 401);
        const userRoles = await userRole_1.default.findAll({ where: { userId }, attributes: ["roleId"] });
        const roleIds = userRoles.map(item => Number(item.roleId)).filter(Boolean);
        if (roleIds.length === 0)
            return op.success([], "操作成功");
        const roles = await role_1.default.findAll({ where: { id: roleIds, status: 1 }, attributes: ["id", "code"] });
        const roleCodes = roles.map(item => String(item.code)).filter(Boolean);
        const enabledRoleIds = roles.map(item => Number(item.id)).filter(Boolean);
        if (enabledRoleIds.length === 0)
            return op.success([], "操作成功");
        const allMenus = await menu_1.default.findAll({
            order: [
                ["parentId", "ASC"],
                ["id", "ASC"]
            ]
        });
        const menuMap = new Map();
        allMenus.forEach(item => menuMap.set(Number(item.id), item));
        let scopedMenuIds = [];
        if (roleCodes.includes("admin")) {
            scopedMenuIds = allMenus.map(item => Number(item.id));
        }
        else {
            const roleMenus = await roleMenu_1.default.findAll({ where: { roleId: enabledRoleIds }, attributes: ["menuId"] });
            scopedMenuIds = Array.from(new Set(roleMenus.map(item => Number(item.menuId)).filter(Boolean)));
        }
        const selectedIds = new Set(scopedMenuIds);
        scopedMenuIds.forEach(id => {
            let cursor = id;
            while (true) {
                const menu = menuMap.get(cursor);
                if (!menu)
                    break;
                const parentId = Number(menu.parentId);
                if (!parentId || selectedIds.has(parentId))
                    break;
                selectedIds.add(parentId);
                cursor = parentId;
            }
        });
        const selectedMenus = allMenus.filter(item => selectedIds.has(Number(item.id)));
        const buttonByParent = new Map();
        selectedMenus
            .filter(item => Number(item.menuType) === 3)
            .forEach(item => {
            const parentId = Number(item.parentId);
            const auths = String(item.auths || "")
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
            if (auths.length === 0)
                return;
            const current = buttonByParent.get(parentId) ?? [];
            buttonByParent.set(parentId, Array.from(new Set([...current, ...auths])));
        });
        const routeMenus = selectedMenus.filter(item => Number(item.menuType) !== 3).sort(menuSort);
        const routeNodeMap = new Map();
        routeMenus.forEach(menu => {
            const id = Number(menu.id);
            const meta = { title: menu.title };
            if (menu.icon)
                meta.icon = menu.icon;
            if (menu.rank !== null && menu.rank !== undefined)
                meta.rank = menu.rank;
            if (menu.frameSrc)
                meta.frameSrc = menu.frameSrc;
            if (menu.keepAlive)
                meta.keepAlive = Boolean(menu.keepAlive);
            if (!menu.showLink)
                meta.showLink = false;
            if (menu.showParent)
                meta.showParent = true;
            if (menu.activePath)
                meta.activePath = menu.activePath;
            if (menu.fixedTag)
                meta.fixedTag = true;
            if (menu.hiddenTag)
                meta.hiddenTag = true;
            if (roleCodes.length > 0)
                meta.roles = roleCodes;
            if (buttonByParent.has(id))
                meta.auths = buttonByParent.get(id);
            const node = { path: menu.path, meta };
            if (menu.name)
                node.name = menu.name;
            if (menu.component)
                node.component = menu.component;
            if (menu.redirect)
                node.redirect = menu.redirect;
            routeNodeMap.set(id, node);
        });
        const tree = [];
        routeMenus.forEach(menu => {
            const id = Number(menu.id);
            const parentId = Number(menu.parentId);
            const node = routeNodeMap.get(id);
            if (!node)
                return;
            if (parentId && routeNodeMap.has(parentId)) {
                const parent = routeNodeMap.get(parentId);
                if (!parent.children)
                    parent.children = [];
                parent.children.push(node);
            }
            else {
                tree.push(node);
            }
        });
        return op.success(tree, "操作成功");
    }
    catch (error) {
        return op.error(`获取动态路由失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
exports.default = router;
