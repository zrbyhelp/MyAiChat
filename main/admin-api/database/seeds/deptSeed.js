"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initDeptSeedData = void 0;
const dept_1 = __importDefault(require("../../models/dept"));
const deptSeedData = [
    { id: 100, parentId: 0, name: "杭州总公司", sort: 0, phone: "15888888888", principal: "张三", email: "hangzhou@example.com", status: 1, type: 1, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 101, parentId: 100, name: "郑州分公司", sort: 1, phone: "15888888888", principal: "李四", email: "zhengzhou@example.com", status: 1, type: 2, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 102, parentId: 100, name: "深圳分公司", sort: 2, phone: "15888888888", principal: "王五", email: "shenzhen@example.com", status: 1, type: 2, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 103, parentId: 101, name: "研发部门", sort: 1, phone: "15888888888", principal: "赵六", email: "rd@example.com", status: 1, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 104, parentId: 101, name: "市场部门", sort: 2, phone: "15888888888", principal: "钱七", email: "market-zz@example.com", status: 1, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 105, parentId: 101, name: "测试部门", sort: 3, phone: "15888888888", principal: "孙八", email: "qa@example.com", status: 0, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 106, parentId: 101, name: "财务部门", sort: 4, phone: "15888888888", principal: "周九", email: "finance-zz@example.com", status: 1, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 107, parentId: 101, name: "运维部门", sort: 5, phone: "15888888888", principal: "吴十", email: "ops@example.com", status: 0, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 108, parentId: 102, name: "市场部门", sort: 1, phone: "15888888888", principal: "郑一", email: "market-sz@example.com", status: 1, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
    { id: 109, parentId: 102, name: "财务部门", sort: 2, phone: "15888888888", principal: "王二", email: "finance-sz@example.com", status: 1, type: 3, remark: "这里是备注信息这里是备注信息这里是备注信息这里是备注信息" },
];
const initDeptSeedData = async () => {
    const existing = await dept_1.default.findAll({ attributes: ["id"] });
    const existingIds = new Set(existing.map(item => Number(item.id)));
    const missing = deptSeedData.filter(item => !existingIds.has(item.id));
    if (missing.length === 0)
        return;
    await dept_1.default.bulkCreate(missing);
};
exports.initDeptSeedData = initDeptSeedData;
