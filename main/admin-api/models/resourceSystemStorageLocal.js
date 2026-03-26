"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class ResourceSystemStorageLocal extends sequelize_1.Model {
}
ResourceSystemStorageLocal.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        defaultValue: "本地默认存储"
    },
    basePath: {
        type: sequelize_1.DataTypes.STRING(220),
        allowNull: false,
        defaultValue: "resource-system"
    },
    remark: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    }
}, {
    sequelize: database_1.default,
    tableName: "resource_system_storage_local_configs"
});
exports.default = ResourceSystemStorageLocal;
