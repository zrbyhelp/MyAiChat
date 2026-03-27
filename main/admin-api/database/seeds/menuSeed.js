"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initMenuSeedData = void 0;
const sequelize_1 = require("sequelize");
const menu_1 = __importDefault(require("../../models/menu"));
const menuData_1 = require("./menuData");
const updatableFields = [
    "menuType",
    "parentId",
    "title",
    "name",
    "path",
    "component",
    "rank",
    "redirect",
    "icon",
    "extraIcon",
    "enterTransition",
    "leaveTransition",
    "activePath",
    "auths",
    "frameSrc",
    "frameLoading",
    "keepAlive",
    "hiddenTag",
    "fixedTag",
    "showLink",
    "showParent"
];
const initMenuSeedData = async () => {
    await menu_1.default.destroy({ where: { id: { [sequelize_1.Op.in]: [306, 307, 309, 622] } } });
    const existing = await menu_1.default.findAll();
    const existingMap = new Map(existing.map(item => [Number(item.id), item]));
    const missing = menuData_1.menuSeedData.filter(item => !existingMap.has(item.id));
    if (missing.length > 0) {
        await menu_1.default.bulkCreate(missing);
        console.log(`menu seed inserted ${missing.length} rows`);
    }
    let updatedCount = 0;
    for (const seed of menuData_1.menuSeedData) {
        const record = existingMap.get(seed.id);
        if (!record)
            continue;
        const patch = {};
        let changed = false;
        for (const field of updatableFields) {
            const nextValue = seed[field];
            const prevValue = record[field];
            if (prevValue !== nextValue) {
                patch[field] = nextValue;
                changed = true;
            }
        }
        if (changed) {
            await record.update(patch);
            updatedCount += 1;
        }
    }
    if (updatedCount > 0) {
        console.log(`menu seed updated ${updatedCount} rows`);
    }
};
exports.initMenuSeedData = initMenuSeedData;
