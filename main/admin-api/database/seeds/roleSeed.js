"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRoleSeedData = void 0;
const role_1 = __importDefault(require("../../models/role"));
const roleMenu_1 = __importDefault(require("../../models/roleMenu"));
const roleSeedData = [
    {
        id: 1,
        name: "超级管理员",
        code: "admin",
        status: 1,
        remark: "超级管理员拥有最高权限"
    },
    {
        id: 2,
        name: "普通角色",
        code: "common",
        status: 1,
        remark: "普通角色拥有部分权限"
    }
];
const adminMenuIds = [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
    200, 201, 202, 203, 204,
    210, 211, 212, 220, 221, 222,
    300, 301, 302, 303, 304,
    305, 306, 307, 308, 309, 311, 312, 313, 314, 315, 316, 317, 318,
    400, 401, 402, 403, 404,
    500, 501, 502, 503,
    600, 601, 602,
    610, 611, 612, 613,
    620, 621, 622
];
const commonMenuIds = [
    100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110,
    200, 202, 204, 220, 221,
    404, 500, 501, 502, 503
];
const roleMenuSeedData = [
    ...adminMenuIds.map(menuId => ({ roleId: 1, menuId })),
    ...commonMenuIds.map(menuId => ({ roleId: 2, menuId }))
];
const initRoleSeedData = async () => {
    const existingRoles = await role_1.default.findAll({ attributes: ["id"] });
    const roleIds = new Set(existingRoles.map(item => Number(item.id)));
    const missingRoles = roleSeedData.filter(item => !roleIds.has(item.id));
    if (missingRoles.length > 0) {
        await role_1.default.bulkCreate(missingRoles);
        console.log(`角色初始化完成，补齐 ${missingRoles.length} 条数据`);
    }
    const existingRoleMenus = await roleMenu_1.default.findAll({ attributes: ["roleId", "menuId"] });
    const exists = new Set(existingRoleMenus.map(item => `${item.roleId}-${item.menuId}`));
    const missingRoleMenus = roleMenuSeedData.filter(item => !exists.has(`${item.roleId}-${item.menuId}`));
    if (missingRoleMenus.length > 0) {
        await roleMenu_1.default.bulkCreate(missingRoleMenus);
        console.log(`角色菜单权限初始化完成，补齐 ${missingRoleMenus.length} 条数据`);
    }
};
exports.initRoleSeedData = initRoleSeedData;
