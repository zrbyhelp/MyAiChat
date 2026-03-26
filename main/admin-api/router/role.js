"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sequelize_1 = require("sequelize");
const menu_1 = __importDefault(require("../models/menu"));
const role_1 = __importDefault(require("../models/role"));
const roleMenu_1 = __importDefault(require("../models/roleMenu"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const toRolePayload = (role) => ({
    id: role.id,
    name: role.name,
    code: role.code,
    status: role.status,
    remark: role.remark,
    createTime: role.createdAt ? new Date(role.createdAt).getTime() : Date.now(),
    updateTime: role.updatedAt ? new Date(role.updatedAt).getTime() : Date.now()
});
router.post("/", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "QueryRole");
    try {
        const name = (req.body?.name ?? "").toString().trim();
        const code = (req.body?.code ?? "").toString().trim();
        const status = (req.body?.status ?? "").toString().trim();
        const where = {};
        if (name)
            where.name = { [sequelize_1.Op.like]: `%${name}%` };
        if (code)
            where.code = code;
        if (status !== "")
            where.status = Number(status);
        const roles = await role_1.default.findAll({ where, order: [["id", "ASC"]] });
        return op.success({
            list: roles.map(toRolePayload),
            total: roles.length,
            pageSize: 10,
            currentPage: 1
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询角色失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "CreateRole");
    try {
        const payload = {
            name: (req.body?.name ?? "").toString().trim(),
            code: (req.body?.code ?? "").toString().trim(),
            remark: (req.body?.remark ?? "").toString().trim(),
            status: 1
        };
        if (!payload.name || !payload.code) {
            return op.error("角色名称和角色标识为必填项", 400);
        }
        const exists = await role_1.default.findOne({ where: { code: payload.code } });
        if (exists) {
            return op.error("角色标识已存在", 400);
        }
        const created = await role_1.default.create(payload);
        return op.success(toRolePayload(created), "创建成功");
    }
    catch (error) {
        return op.error(`创建角色失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "UpdateRole");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少角色 id", 400);
        const role = await role_1.default.findByPk(id);
        if (!role)
            return op.error("角色不存在", 404);
        const name = (req.body?.name ?? role.name).toString().trim();
        const code = (req.body?.code ?? role.code).toString().trim();
        const remark = (req.body?.remark ?? role.remark).toString().trim();
        if (!name || !code)
            return op.error("角色名称和角色标识为必填项", 400);
        const exists = await role_1.default.findOne({
            where: {
                code,
                id: { [sequelize_1.Op.ne]: id }
            }
        });
        if (exists)
            return op.error("角色标识已存在", 400);
        await role.update({ name, code, remark });
        return op.success(toRolePayload(role), "更新成功");
    }
    catch (error) {
        return op.error(`更新角色失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/status", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "ChangeRoleStatus");
    try {
        const id = Number(req.body?.id);
        const status = Number(req.body?.status);
        if (!id || ![0, 1].includes(status))
            return op.error("参数不合法", 400);
        const role = await role_1.default.findByPk(id);
        if (!role)
            return op.error("角色不存在", 404);
        await role.update({ status });
        return op.success(toRolePayload(role), "状态更新成功");
    }
    catch (error) {
        return op.error(`更新状态失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "DeleteRole");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少角色 id", 400);
        await roleMenu_1.default.destroy({ where: { roleId: id } });
        const deleted = await role_1.default.destroy({ where: { id } });
        if (!deleted)
            return op.error("角色不存在", 404);
        return op.success({ id }, "删除成功");
    }
    catch (error) {
        return op.error(`删除角色失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/menu", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "QueryRoleMenuTree");
    try {
        const menus = await menu_1.default.findAll({
            attributes: ["id", "parentId", "menuType", "title"],
            order: [["id", "ASC"]]
        });
        return op.success(menus, "操作成功");
    }
    catch (error) {
        return op.error(`获取菜单权限树失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/menu-ids", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "QueryRoleMenuIds");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少角色 id", 400);
        const roleMenus = await roleMenu_1.default.findAll({ where: { roleId: id }, attributes: ["menuId"] });
        const menuIds = roleMenus.map(item => Number(item.menuId));
        return op.success(menuIds, "操作成功");
    }
    catch (error) {
        return op.error(`获取角色菜单权限失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/menu-save", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Role", "SaveRoleMenus");
    try {
        const id = Number(req.body?.id);
        const menuIds = Array.isArray(req.body?.menuIds) ? req.body.menuIds.map((x) => Number(x)) : [];
        if (!id)
            return op.error("缺少角色 id", 400);
        await roleMenu_1.default.destroy({ where: { roleId: id } });
        if (menuIds.length > 0) {
            await roleMenu_1.default.bulkCreate(menuIds.map((menuId) => ({ roleId: id, menuId })));
        }
        return op.success({ id, menuIds }, "菜单权限保存成功");
    }
    catch (error) {
        return op.error(`保存菜单权限失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
