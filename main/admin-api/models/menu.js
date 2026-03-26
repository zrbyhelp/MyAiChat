"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class Menu extends sequelize_1.Model {
}
Menu.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    menuType: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    parentId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    title: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    name: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    path: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    component: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    rank: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: true,
        defaultValue: null,
    },
    redirect: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    icon: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    extraIcon: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    enterTransition: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    leaveTransition: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    activePath: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    auths: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
    },
    frameSrc: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
    },
    frameLoading: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    keepAlive: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    hiddenTag: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    fixedTag: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    showLink: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
    showParent: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
}, {
    sequelize: database_1.default,
    tableName: "menus",
});
exports.default = Menu;
