"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sequelize_1 = require("sequelize");
const menu_1 = __importDefault(require("../models/menu"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const toPayload = (menu) => ({
    id: menu.id,
    parentId: menu.parentId,
    menuType: menu.menuType,
    title: menu.title,
    name: menu.name,
    path: menu.path,
    component: menu.component,
    rank: menu.rank,
    redirect: menu.redirect,
    icon: menu.icon,
    extraIcon: menu.extraIcon,
    enterTransition: menu.enterTransition,
    leaveTransition: menu.leaveTransition,
    activePath: menu.activePath,
    auths: menu.auths,
    frameSrc: menu.frameSrc,
    frameLoading: menu.frameLoading,
    keepAlive: menu.keepAlive,
    hiddenTag: menu.hiddenTag,
    fixedTag: menu.fixedTag,
    showLink: menu.showLink,
    showParent: menu.showParent
});
router.post("/", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Menu", "QueryMenu");
    try {
        const title = (req.body?.title ?? "").toString().trim();
        const where = title ? { title: { [sequelize_1.Op.like]: `%${title}%` } } : undefined;
        const menus = await menu_1.default.findAll({
            where,
            order: [
                ["parentId", "ASC"],
                ["id", "ASC"]
            ]
        });
        return op.success(menus.map(toPayload), "操作成功");
    }
    catch (error) {
        return op.error(`查询菜单失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Menu", "CreateMenu");
    try {
        const created = await menu_1.default.create(req.body ?? {});
        return op.success(toPayload(created), "创建成功");
    }
    catch (error) {
        return op.error(`创建菜单失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Menu", "UpdateMenu");
    try {
        const id = Number(req.body?.id);
        if (!id) {
            return op.error("缺少菜单 id", 400);
        }
        const menu = await menu_1.default.findByPk(id);
        if (!menu) {
            return op.error("菜单不存在", 404);
        }
        await menu.update(req.body ?? {});
        return op.success(toPayload(menu), "更新成功");
    }
    catch (error) {
        return op.error(`更新菜单失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Menu", "DeleteMenu");
    try {
        const id = Number(req.body?.id);
        if (!id) {
            return op.error("缺少菜单 id", 400);
        }
        const allMenus = await menu_1.default.findAll({ attributes: ["id", "parentId"] });
        const childrenMap = new Map();
        allMenus.forEach(item => {
            const parentId = Number(item.parentId);
            const menuId = Number(item.id);
            const list = childrenMap.get(parentId) ?? [];
            list.push(menuId);
            childrenMap.set(parentId, list);
        });
        const toDeleteIds = new Set();
        const stack = [id];
        while (stack.length > 0) {
            const current = stack.pop();
            if (toDeleteIds.has(current))
                continue;
            toDeleteIds.add(current);
            const children = childrenMap.get(current) ?? [];
            children.forEach(childId => stack.push(childId));
        }
        await menu_1.default.destroy({
            where: {
                id: {
                    [sequelize_1.Op.in]: Array.from(toDeleteIds)
                }
            }
        });
        return op.success({ deletedIds: Array.from(toDeleteIds) }, "删除成功");
    }
    catch (error) {
        return op.error(`删除菜单失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
