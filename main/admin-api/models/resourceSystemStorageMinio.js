"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class ResourceSystemStorageMinio extends sequelize_1.Model {
}
ResourceSystemStorageMinio.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    endpoint: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false
    },
    port: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 9000
    },
    useSSL: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    bucket: {
        type: sequelize_1.DataTypes.STRING(180),
        allowNull: false
    },
    accessKey: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false
    },
    secretKey: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false
    },
    basePath: {
        type: sequelize_1.DataTypes.STRING(220),
        allowNull: false,
        defaultValue: ""
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
    tableName: "resource_system_storage_minio_configs"
});
exports.default = ResourceSystemStorageMinio;
