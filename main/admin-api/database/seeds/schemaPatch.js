"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dropLegacyPermissionTables = exports.patchUserRoleColumns = exports.patchDeptColumns = exports.patchRoleColumns = exports.patchUserProfileColumns = exports.patchWorkflowInstanceApproverColumns = exports.patchCarouselResourceRefColumns = exports.patchResourceSystemResourceStorageColumns = exports.patchResourceSystemCategoryStorageColumns = exports.patchCategoryParentIdColumns = void 0;
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../../database"));
const tableName_1 = require("../../utils/tableName");
const getColumnInfo = async (tableName, column) => {
    const rows = await database_1.default.query(`SHOW COLUMNS FROM \`${tableName}\` LIKE '${column}'`, { type: sequelize_1.QueryTypes.SELECT });
    return rows[0] || null;
};
const hasForeignKey = async (tableName, constraintName) => {
    const rows = await database_1.default.query(`SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = '${constraintName}'`, { type: sequelize_1.QueryTypes.SELECT });
    return rows.length > 0;
};
const dropForeignKeyIfExists = async (tableName, constraintName) => {
    if (!(await hasForeignKey(tableName, constraintName)))
        return;
    await database_1.default.query(`ALTER TABLE \`${tableName}\` DROP FOREIGN KEY \`${constraintName}\``);
};
const tableExists = async (tableName) => {
    const rows = await database_1.default.query(`SHOW TABLES LIKE '${tableName}'`, { type: sequelize_1.QueryTypes.SELECT });
    return rows.length > 0;
};
const hasColumn = async (tableName, column) => {
    return Boolean(await getColumnInfo(tableName, column));
};
const ensureParentIdColumn = async (tableName) => {
    if (await hasColumn(tableName, "parent_id"))
        return;
    await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`parent_id\` INT UNSIGNED NOT NULL DEFAULT 0 AFTER \`key\``);
};
const patchCategoryParentIdColumns = async () => {
    await ensureParentIdColumn((0, tableName_1.withTablePrefix)("carousel_categories"));
    await ensureParentIdColumn((0, tableName_1.withTablePrefix)("resource_system_categories"));
};
exports.patchCategoryParentIdColumns = patchCategoryParentIdColumns;
const patchResourceSystemCategoryStorageColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("resource_system_categories");
    if (!(await hasColumn(tableName, "storage_id"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`storage_id\` INT UNSIGNED NOT NULL DEFAULT 0 AFTER \`parent_id\``);
    }
    if (!(await hasColumn(tableName, "storage_provider"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`storage_provider\` VARCHAR(32) NOT NULL DEFAULT 'local' AFTER \`storage_id\``);
    }
    if (!(await hasColumn(tableName, "file_type_group"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`file_type_group\` VARCHAR(32) NOT NULL DEFAULT 'image' AFTER \`storage_provider\``);
    }
    if (!(await hasColumn(tableName, "file_subtypes"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`file_subtypes\` JSON NULL AFTER \`file_type_group\``);
    }
};
exports.patchResourceSystemCategoryStorageColumns = patchResourceSystemCategoryStorageColumns;
const patchResourceSystemResourceStorageColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("resource_system_resources");
    if (!(await hasColumn(tableName, "storage_provider"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`storage_provider\` VARCHAR(32) NOT NULL DEFAULT 'local' AFTER \`app_path\``);
    }
    if (!(await hasColumn(tableName, "storage_config_id"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`storage_config_id\` INT UNSIGNED NOT NULL DEFAULT 0 AFTER \`storage_provider\``);
    }
    if (!(await hasColumn(tableName, "file_size"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`file_size\` BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`storage_config_id\``);
    }
    if (!(await hasColumn(tableName, "storage_object_key"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`storage_object_key\` VARCHAR(500) NOT NULL DEFAULT '' AFTER \`file_size\``);
    }
};
exports.patchResourceSystemResourceStorageColumns = patchResourceSystemResourceStorageColumns;
const patchCarouselResourceRefColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("carousel_resources");
    if (!(await hasColumn(tableName, "resource_system_resource_id"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`resource_system_resource_id\` INT UNSIGNED NOT NULL DEFAULT 0 AFTER \`category_id\``);
    }
};
exports.patchCarouselResourceRefColumns = patchCarouselResourceRefColumns;
const patchWorkflowInstanceApproverColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("survey_workflow_instances");
    if (!(await hasColumn(tableName, "current_approver_ids"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`current_approver_ids\` JSON NULL AFTER \`submitter_name\``);
        await database_1.default.query(`UPDATE \`${tableName}\` SET \`current_approver_ids\` = JSON_ARRAY() WHERE \`current_approver_ids\` IS NULL`);
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`current_approver_ids\` JSON NOT NULL`);
    }
    if (!(await hasColumn(tableName, "current_approver_role_codes"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`current_approver_role_codes\` JSON NULL AFTER \`current_approver_ids\``);
        await database_1.default.query(`UPDATE \`${tableName}\` SET \`current_approver_role_codes\` = JSON_ARRAY() WHERE \`current_approver_role_codes\` IS NULL`);
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`current_approver_role_codes\` JSON NOT NULL`);
    }
};
exports.patchWorkflowInstanceApproverColumns = patchWorkflowInstanceApproverColumns;
const patchUserProfileColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("users");
    const userRoleTableName = (0, tableName_1.withTablePrefix)("user_roles");
    const idColumn = await getColumnInfo(tableName, "id");
    if (idColumn && String(idColumn.Type || "").toLowerCase().includes("varchar")) {
        await dropForeignKeyIfExists(userRoleTableName, `${userRoleTableName}_ibfk_1`);
        const userRoleUserIdColumn = await getColumnInfo(userRoleTableName, "user_id");
        if (userRoleUserIdColumn && String(userRoleUserIdColumn.Type || "").toLowerCase().includes("varchar")) {
            await database_1.default.query(`ALTER TABLE \`${userRoleTableName}\` MODIFY COLUMN \`user_id\` INT UNSIGNED NOT NULL`);
        }
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT`);
    }
    if (!(await hasColumn(tableName, "avatar"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`avatar\` VARCHAR(500) NOT NULL DEFAULT '' AFTER \`id\``);
    }
    if (!(await hasColumn(tableName, "nickname"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`nickname\` VARCHAR(100) NOT NULL DEFAULT '' AFTER \`username\``);
    }
    if (!(await hasColumn(tableName, "password"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`password\` VARCHAR(255) NOT NULL DEFAULT '123456' AFTER \`nickname\``);
    }
    if (!(await hasColumn(tableName, "phone"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`phone\` VARCHAR(30) NOT NULL DEFAULT '' AFTER \`password\``);
    }
    if (!(await hasColumn(tableName, "email"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`email\` VARCHAR(120) NOT NULL DEFAULT '' AFTER \`phone\``);
    }
    if (!(await hasColumn(tableName, "sex"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`sex\` TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER \`email\``);
    }
    if (!(await hasColumn(tableName, "status"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`status\` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER \`sex\``);
    }
    if (!(await hasColumn(tableName, "dept_id"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`dept_id\` INT UNSIGNED NOT NULL DEFAULT 0 AFTER \`status\``);
    }
    if (!(await hasColumn(tableName, "remark"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`remark\` VARCHAR(500) NOT NULL DEFAULT '' AFTER \`dept_id\``);
    }
    if (await hasColumn(tableName, "password_hash")) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`password_hash\` TEXT NULL`);
    }
    if (await hasColumn(tableName, "display_name")) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`display_name\` VARCHAR(255) NOT NULL DEFAULT ''`);
    }
    const statusColumn = await getColumnInfo(tableName, "status");
    if (statusColumn && String(statusColumn.Type || "").toLowerCase().includes("varchar")) {
        await database_1.default.query(`UPDATE \`${tableName}\` SET \`status\` = CASE WHEN \`status\` IN ('active', 'enabled', 'true', '1') THEN '1' ELSE '0' END`);
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`status\` TINYINT UNSIGNED NOT NULL DEFAULT 1`);
    }
};
exports.patchUserProfileColumns = patchUserProfileColumns;
const patchRoleColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("roles");
    const rolePermissionTableName = (0, tableName_1.withTablePrefix)("role_permissions");
    const userRoleTableName = (0, tableName_1.withTablePrefix)("user_roles");
    const idColumn = await getColumnInfo(tableName, "id");
    if (idColumn && String(idColumn.Type || "").toLowerCase().includes("varchar")) {
        const hasRolePermissionTable = await tableExists(rolePermissionTableName);
        if (hasRolePermissionTable) {
            await dropForeignKeyIfExists(rolePermissionTableName, `${rolePermissionTableName}_ibfk_1`);
        }
        await dropForeignKeyIfExists(userRoleTableName, `${userRoleTableName}_ibfk_2`);
        if (hasRolePermissionTable) {
            const rolePermissionRoleIdColumn = await getColumnInfo(rolePermissionTableName, "role_id");
            if (rolePermissionRoleIdColumn && String(rolePermissionRoleIdColumn.Type || "").toLowerCase().includes("varchar")) {
                await database_1.default.query(`ALTER TABLE \`${rolePermissionTableName}\` MODIFY COLUMN \`role_id\` INT UNSIGNED NOT NULL`);
            }
        }
        const userRoleRoleIdColumn = await getColumnInfo(userRoleTableName, "role_id");
        if (userRoleRoleIdColumn && String(userRoleRoleIdColumn.Type || "").toLowerCase().includes("varchar")) {
            await database_1.default.query(`ALTER TABLE \`${userRoleTableName}\` MODIFY COLUMN \`role_id\` INT UNSIGNED NOT NULL`);
        }
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT`);
    }
    if (!(await hasColumn(tableName, "status"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`status\` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER \`code\``);
    }
    if (!(await hasColumn(tableName, "remark"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`remark\` VARCHAR(500) NOT NULL DEFAULT '' AFTER \`status\``);
    }
    if (await hasColumn(tableName, "description")) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`description\` VARCHAR(500) NOT NULL DEFAULT ''`);
    }
};
exports.patchRoleColumns = patchRoleColumns;
const patchUserRoleColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("user_roles");
    await dropForeignKeyIfExists(tableName, `${tableName}_ibfk_1`);
    await dropForeignKeyIfExists(tableName, `${tableName}_ibfk_2`);
    const userIdColumn = await getColumnInfo(tableName, "user_id");
    if (userIdColumn && String(userIdColumn.Type || "").toLowerCase().includes("varchar")) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`user_id\` INT UNSIGNED NOT NULL`);
    }
    const roleIdColumn = await getColumnInfo(tableName, "role_id");
    if (roleIdColumn && String(roleIdColumn.Type || "").toLowerCase().includes("varchar")) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` MODIFY COLUMN \`role_id\` INT UNSIGNED NOT NULL`);
    }
};
exports.patchUserRoleColumns = patchUserRoleColumns;
const dropLegacyPermissionTables = async () => {
    const rolePermissionTableName = (0, tableName_1.withTablePrefix)("role_permissions");
    const permissionTableName = (0, tableName_1.withTablePrefix)("permissions");
    if (await tableExists(rolePermissionTableName)) {
        await database_1.default.query(`DROP TABLE IF EXISTS \`${rolePermissionTableName}\``);
    }
    if (await tableExists(permissionTableName)) {
        await database_1.default.query(`DROP TABLE IF EXISTS \`${permissionTableName}\``);
    }
};
exports.dropLegacyPermissionTables = dropLegacyPermissionTables;
const patchDeptColumns = async () => {
    const tableName = (0, tableName_1.withTablePrefix)("depts");
    if (!(await hasColumn(tableName, "parent_id"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`parent_id\` INT UNSIGNED NOT NULL DEFAULT 0 AFTER \`id\``);
    }
    if (!(await hasColumn(tableName, "sort"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`sort\` INT NOT NULL DEFAULT 0 AFTER \`name\``);
    }
    if (!(await hasColumn(tableName, "phone"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`phone\` VARCHAR(30) NOT NULL DEFAULT '' AFTER \`sort\``);
    }
    if (!(await hasColumn(tableName, "principal"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`principal\` VARCHAR(100) NOT NULL DEFAULT '' AFTER \`phone\``);
    }
    if (!(await hasColumn(tableName, "email"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`email\` VARCHAR(120) NOT NULL DEFAULT '' AFTER \`principal\``);
    }
    if (!(await hasColumn(tableName, "status"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`status\` TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER \`email\``);
    }
    if (!(await hasColumn(tableName, "type"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`type\` TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER \`status\``);
    }
    if (!(await hasColumn(tableName, "remark"))) {
        await database_1.default.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`remark\` VARCHAR(500) NOT NULL DEFAULT '' AFTER \`type\``);
    }
};
exports.patchDeptColumns = patchDeptColumns;
