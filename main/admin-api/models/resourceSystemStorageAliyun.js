"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class ResourceSystemStorageAliyun extends sequelize_1.Model {
}
ResourceSystemStorageAliyun.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    bucket: {
        type: sequelize_1.DataTypes.STRING(180),
        allowNull: false
    },
    region: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    endpoint: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false,
        defaultValue: ""
    },
    domain: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false,
        defaultValue: ""
    },
    accessKeyId: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false
    },
    accessKeySecret: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false
    },
    remark: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    isEnabled: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    }
}, {
    sequelize: database_1.default,
    tableName: "resource_system_storage_aliyun_configs"
});
exports.default = ResourceSystemStorageAliyun;
