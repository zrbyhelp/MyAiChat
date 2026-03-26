"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class Dept extends sequelize_1.Model {
}
Dept.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    parentId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    name: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false,
    },
    sort: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "",
    },
    principal: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false,
        defaultValue: "",
    },
    email: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        defaultValue: "",
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
    },
    type: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 3,
    },
    remark: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
    },
}, {
    sequelize: database_1.default,
    tableName: "depts",
});
exports.default = Dept;
