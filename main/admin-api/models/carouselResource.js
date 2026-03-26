"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class CarouselResource extends sequelize_1.Model {
}
CarouselResource.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    image: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false
    },
    fit: {
        type: sequelize_1.DataTypes.ENUM("fill", "contain", "cover", "none", "scale-down"),
        allowNull: false,
        defaultValue: "cover"
    },
    categoryId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false
    },
    resourceSystemResourceId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        field: "resource_system_resource_id"
    },
    triggerType: {
        type: sequelize_1.DataTypes.ENUM("url", "page", "miniProgram", "app", ""),
        allowNull: false,
        defaultValue: ""
    },
    triggerUrl: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    triggerPagePath: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    miniProgramAppId: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        defaultValue: ""
    },
    miniProgramPagePath: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    appPath: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    }
}, {
    sequelize: database_1.default,
    tableName: "carousel_resources"
});
exports.default = CarouselResource;
