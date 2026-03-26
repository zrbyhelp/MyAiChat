"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sequelize_1 = require("sequelize");
const dept_1 = __importDefault(require("../models/dept"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const toPayload = (dept) => ({
    id: dept.id,
    parentId: dept.parentId,
    name: dept.name,
    sort: dept.sort,
    phone: dept.phone,
    principal: dept.principal,
    email: dept.email,
    status: dept.status,
    type: dept.type,
    createTime: dept.createdAt ? new Date(dept.createdAt).getTime() : Date.now(),
    remark: dept.remark
});
router.post("/", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Dept", "QueryDept");
    try {
        const name = (req.body?.name ?? "").toString().trim();
        const status = req.body?.status;
        const where = {};
        if (name)
            where.name = { [sequelize_1.Op.like]: `%${name}%` };
        if (status !== null && status !== undefined && `${status}` !== "") {
            where.status = Number(status);
        }
        const depts = await dept_1.default.findAll({
            where,
            order: [
                ["sort", "ASC"],
                ["id", "ASC"]
            ]
        });
        return op.success(depts.map(toPayload), "操作成功");
    }
    catch (error) {
        return op.error(`查询部门失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Dept", "CreateDept");
    try {
        const payload = {
            parentId: Number(req.body?.parentId ?? 0),
            name: (req.body?.name ?? "").toString().trim(),
            principal: (req.body?.principal ?? "").toString().trim(),
            phone: (req.body?.phone ?? "").toString().trim(),
            email: (req.body?.email ?? "").toString().trim(),
            sort: Number(req.body?.sort ?? 0),
            status: Number(req.body?.status ?? 1),
            remark: (req.body?.remark ?? "").toString().trim()
        };
        if (!payload.name)
            return op.error("部门名称为必填项", 400);
        const created = await dept_1.default.create(payload);
        return op.success(toPayload(created), "创建成功");
    }
    catch (error) {
        return op.error(`创建部门失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Dept", "UpdateDept");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少部门 id", 400);
        const dept = await dept_1.default.findByPk(id);
        if (!dept)
            return op.error("部门不存在", 404);
        await dept.update(req.body ?? {});
        return op.success(toPayload(dept), "更新成功");
    }
    catch (error) {
        return op.error(`更新部门失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "Dept", "DeleteDept");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少部门 id", 400);
        const allDepts = await dept_1.default.findAll({ attributes: ["id", "parentId"] });
        const childrenMap = new Map();
        allDepts.forEach(item => {
            const parentId = Number(item.parentId);
            const deptId = Number(item.id);
            const list = childrenMap.get(parentId) ?? [];
            list.push(deptId);
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
        await dept_1.default.destroy({
            where: {
                id: {
                    [sequelize_1.Op.in]: Array.from(toDeleteIds)
                }
            }
        });
        return op.success({ deletedIds: Array.from(toDeleteIds) }, "删除成功");
    }
    catch (error) {
        return op.error(`删除部门失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
