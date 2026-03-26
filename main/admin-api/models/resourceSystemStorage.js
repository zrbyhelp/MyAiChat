"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class ResourceSystemStorage extends sequelize_1.Model {
}
ResourceSystemStorage.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    provider: {
        type: sequelize_1.DataTypes.ENUM("local", "qiniu", "aliyun", "tencent", "minio", "aws"),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    bucket: {
        type: sequelize_1.DataTypes.STRING(180),
        allowNull: false,
        defaultValue: ""
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
    accessKey: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false,
        defaultValue: ""
    },
    secretKey: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false,
        defaultValue: ""
    },
    region: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        defaultValue: ""
    },
    basePath: {
        type: sequelize_1.DataTypes.STRING(200),
        allowNull: false,
        defaultValue: ""
    },
    remark: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    extra: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    isEnabled: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    dailyTrafficUsedMb: {
        type: sequelize_1.DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
    },
    dailyTrafficLimitMb: {
        type: sequelize_1.DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
    },
    storageUsedMb: {
        type: sequelize_1.DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
    }
}, {
    sequelize: database_1.default,
    tableName: "resource_system_storages"
});
exports.default = ResourceSystemStorage;
