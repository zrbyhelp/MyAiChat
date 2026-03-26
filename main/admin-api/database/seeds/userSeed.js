"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initUserSeedData = void 0;
const user_1 = __importDefault(require("../../models/user"));
const userRole_1 = __importDefault(require("../../models/userRole"));
const userSeedData = [
    {
        id: 1,
        avatar: "https://avatars.githubusercontent.com/u/44761321",
        username: "admin",
        nickname: "小铭",
        password: "123456",
        phone: "15888886789",
        email: "admin@example.com",
        sex: 0,
        status: 1,
        deptId: 103,
        remark: "管理员",
    },
    {
        id: 2,
        avatar: "https://avatars.githubusercontent.com/u/52823142",
        username: "common",
        nickname: "小林",
        password: "123456",
        phone: "18288882345",
        email: "common@example.com",
        sex: 1,
        status: 1,
        deptId: 105,
        remark: "普通用户",
    },
];
const userRoleSeedData = [
    { userId: 1, roleId: 1 },
    { userId: 2, roleId: 2 },
];
const initUserSeedData = async () => {
    const existingUsers = await user_1.default.findAll({ attributes: ["id"] });
    const userIds = new Set(existingUsers.map(item => Number(item.id)));
    const missingUsers = userSeedData.filter(item => !userIds.has(item.id));
    if (missingUsers.length > 0) {
        await user_1.default.bulkCreate(missingUsers);
        console.log(`用户初始化完成，补齐 ${missingUsers.length} 条数据`);
    }
    const existingUserRoles = await userRole_1.default.findAll({ attributes: ["userId", "roleId"] });
    const exists = new Set(existingUserRoles.map(item => `${item.userId}-${item.roleId}`));
    const missingUserRoles = userRoleSeedData.filter(item => !exists.has(`${item.userId}-${item.roleId}`));
    if (missingUserRoles.length > 0) {
        await userRole_1.default.bulkCreate(missingUserRoles);
        console.log(`用户角色初始化完成，补齐 ${missingUserRoles.length} 条数据`);
    }
};
exports.initUserSeedData = initUserSeedData;
