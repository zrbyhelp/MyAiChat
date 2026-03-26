"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class ResourceSystemCategory extends sequelize_1.Model {
}
ResourceSystemCategory.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    key: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        unique: true
    },
    parentId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    storageProvider: {
        type: sequelize_1.DataTypes.ENUM("local", "qiniu", "aliyun", "tencent", "minio", "aws"),
        allowNull: false,
        defaultValue: "local"
    },
    storageConfigId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        field: "storage_id"
    },
    fileTypeGroup: {
        type: sequelize_1.DataTypes.ENUM("image", "video", "text", "audio"),
        allowNull: false,
        defaultValue: "image",
        field: "file_type_group"
    },
    fileSubtypes: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: true,
        field: "file_subtypes"
    },
    triggerTypes: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    speed: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 3000
    },
    loop: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    direction: {
        type: sequelize_1.DataTypes.ENUM("horizontal", "vertical"),
        allowNull: false,
        defaultValue: "horizontal"
    }
}, {
    sequelize: database_1.default,
    tableName: "resource_system_categories"
});
exports.default = ResourceSystemCategory;
