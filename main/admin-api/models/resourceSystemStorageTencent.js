"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class ResourceSystemStorageTencent extends sequelize_1.Model {
}
ResourceSystemStorageTencent.init({
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
    domain: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false,
        defaultValue: ""
    },
    secretId: {
        type: sequelize_1.DataTypes.STRING(300),
        allowNull: false
    },
    secretKey: {
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
    tableName: "resource_system_storage_tencent_configs"
});
exports.default = ResourceSystemStorageTencent;
