"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTablePrefix = exports.getAdminTablePrefix = void 0;
const getAdminTablePrefix = () => {
    const prefix = String(process.env.ADMIN_TABLE_PREFIX || "admin_").trim();
    return prefix;
};
exports.getAdminTablePrefix = getAdminTablePrefix;
const withTablePrefix = (tableName) => {
    const prefix = (0, exports.getAdminTablePrefix)();
    if (!prefix)
        return tableName;
    return tableName.startsWith(prefix) ? tableName : `${prefix}${tableName}`;
};
exports.withTablePrefix = withTablePrefix;
