"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sequelize_1 = require("sequelize");
const dept_1 = __importDefault(require("../models/dept"));
const role_1 = __importDefault(require("../models/role"));
const user_1 = __importDefault(require("../models/user"));
const userRole_1 = __importDefault(require("../models/userRole"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const PASSWORD_REGEXP = /^[\S]{6,18}$/;
const toUserPayload = (user, deptMap) => ({
    id: user.id,
    avatar: user.avatar,
    username: user.username,
    nickname: user.nickname,
    password: user.password,
    phone: user.phone,
    email: user.email,
    sex: user.sex,
    status: user.status,
    dept: {
        id: user.deptId,
        name: deptMap.get(user.deptId)?.name || ""
    },
    remark: user.remark,
    createTime: user.createdAt ? new Date(user.createdAt).getTime() : Date.now()
});
router.post("/", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "QueryUser");
    try {
        const username = (req.body?.username ?? "").toString().trim();
        const phone = (req.body?.phone ?? "").toString().trim();
        const status = (req.body?.status ?? "").toString().trim();
        const deptId = Number(req.body?.deptId || 0);
        const where = {};
        if (username)
            where.username = { [sequelize_1.Op.like]: `%${username}%` };
        if (phone)
            where.phone = phone;
        if (status !== "")
            where.status = Number(status);
        if (deptId)
            where.deptId = deptId;
        const [users, depts] = await Promise.all([
            user_1.default.findAll({ where, order: [["id", "ASC"]] }),
            dept_1.default.findAll({ attributes: ["id", "name"] })
        ]);
        const deptMap = new Map(depts.map(item => [Number(item.id), item]));
        return op.success({
            list: users.map(item => toUserPayload(item, deptMap)),
            total: users.length,
            pageSize: 10,
            currentPage: 1
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询用户失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "CreateUser");
    try {
        const payload = {
            avatar: (req.body?.avatar ?? "").toString().trim(),
            username: (req.body?.username ?? "").toString().trim(),
            nickname: (req.body?.nickname ?? "").toString().trim(),
            password: (req.body?.password ?? "123456").toString(),
            phone: (req.body?.phone ?? "").toString().trim(),
            email: (req.body?.email ?? "").toString().trim(),
            sex: Number(req.body?.sex ?? 0),
            status: Number(req.body?.status ?? 1),
            deptId: Number(req.body?.parentId ?? req.body?.deptId ?? 0),
            remark: (req.body?.remark ?? "").toString().trim()
        };
        if (!payload.username)
            return op.error("用户名为必填项", 400);
        if (!PASSWORD_REGEXP.test(payload.password)) {
            return op.error("密码长度应为6-18位", 400);
        }
        const exists = await user_1.default.findOne({ where: { username: payload.username } });
        if (exists)
            return op.error("用户名已存在", 400);
        const created = await user_1.default.create(payload);
        if (Array.isArray(req.body?.roleIds) && req.body.roleIds.length > 0) {
            await userRole_1.default.bulkCreate(req.body.roleIds.map((roleId) => ({ userId: created.id, roleId: Number(roleId) })));
        }
        return op.success(created, "创建成功");
    }
    catch (error) {
        return op.error(`创建用户失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "UpdateUser");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少用户 id", 400);
        const user = await user_1.default.findByPk(id);
        if (!user)
            return op.error("用户不存在", 404);
        const username = (req.body?.username ?? user.username).toString().trim();
        if (!username)
            return op.error("用户名为必填项", 400);
        const exists = await user_1.default.findOne({ where: { username, id: { [sequelize_1.Op.ne]: id } } });
        if (exists)
            return op.error("用户名已存在", 400);
        await user.update({
            username,
            nickname: (req.body?.nickname ?? user.nickname).toString().trim(),
            phone: (req.body?.phone ?? user.phone).toString().trim(),
            email: (req.body?.email ?? user.email).toString().trim(),
            sex: Number(req.body?.sex ?? user.sex),
            status: Number(req.body?.status ?? user.status),
            deptId: Number(req.body?.parentId ?? req.body?.deptId ?? user.deptId),
            remark: (req.body?.remark ?? user.remark).toString().trim(),
            avatar: (req.body?.avatar ?? user.avatar).toString().trim()
        });
        return op.success(user, "更新成功");
    }
    catch (error) {
        return op.error(`更新用户失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "DeleteUser");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少用户 id", 400);
        await userRole_1.default.destroy({ where: { userId: id } });
        const deleted = await user_1.default.destroy({ where: { id } });
        if (!deleted)
            return op.error("用户不存在", 404);
        return op.success({ id }, "删除成功");
    }
    catch (error) {
        return op.error(`删除用户失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/batch-delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "BatchDeleteUser");
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((x) => Number(x)).filter(Boolean) : [];
        if (ids.length === 0)
            return op.error("缺少用户 ids", 400);
        await userRole_1.default.destroy({ where: { userId: { [sequelize_1.Op.in]: ids } } });
        await user_1.default.destroy({ where: { id: { [sequelize_1.Op.in]: ids } } });
        return op.success({ ids }, "批量删除成功");
    }
    catch (error) {
        return op.error(`批量删除失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/status", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "ChangeUserStatus");
    try {
        const id = Number(req.body?.id);
        const status = Number(req.body?.status);
        if (!id || ![0, 1].includes(status))
            return op.error("参数不合法", 400);
        const user = await user_1.default.findByPk(id);
        if (!user)
            return op.error("用户不存在", 404);
        await user.update({ status });
        return op.success({ id, status }, "状态更新成功");
    }
    catch (error) {
        return op.error(`更新状态失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/reset-password", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "ResetUserPassword");
    try {
        const id = Number(req.body?.id);
        const newPwd = (req.body?.newPwd ?? "").toString();
        if (!id || !newPwd)
            return op.error("参数不完整", 400);
        if (!PASSWORD_REGEXP.test(newPwd)) {
            return op.error("密码长度应为6-18位", 400);
        }
        const user = await user_1.default.findByPk(id);
        if (!user)
            return op.error("用户不存在", 404);
        await user.update({ password: newPwd });
        return op.success({ id }, "密码重置成功");
    }
    catch (error) {
        return op.error(`重置密码失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.get("/list-all-role", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "QueryAllRoles");
    try {
        const roles = await role_1.default.findAll({ attributes: ["id", "name"], order: [["id", "ASC"]] });
        return op.success(roles, "操作成功");
    }
    catch (error) {
        return op.error(`查询角色列表失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/list-role-ids", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "QueryUserRoleIds");
    try {
        const userId = Number(req.body?.userId);
        if (!userId)
            return op.error("缺少 userId", 400);
        const rows = await userRole_1.default.findAll({ where: { userId }, attributes: ["roleId"] });
        const roleIds = rows.map(item => Number(item.roleId));
        return op.success(roleIds, "操作成功");
    }
    catch (error) {
        return op.error(`查询用户角色失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/save-roles", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "User", "SaveUserRoles");
    try {
        const userId = Number(req.body?.userId);
        const roleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds.map((x) => Number(x)).filter(Boolean) : [];
        if (!userId)
            return op.error("缺少 userId", 400);
        await userRole_1.default.destroy({ where: { userId } });
        if (roleIds.length > 0) {
            await userRole_1.default.bulkCreate(roleIds.map((roleId) => ({ userId, roleId })));
        }
        return op.success({ userId, roleIds }, "角色分配成功");
    }
    catch (error) {
        return op.error(`保存用户角色失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
