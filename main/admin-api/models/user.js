"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class User extends sequelize_1.Model {
}
User.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
    },
    avatar: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
    },
    username: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false,
        unique: true,
    },
    nickname: {
        type: sequelize_1.DataTypes.STRING(100),
        allowNull: false,
        defaultValue: "",
    },
    password: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "123456",
    },
    phone: {
        type: sequelize_1.DataTypes.STRING(30),
        allowNull: false,
        defaultValue: "",
    },
    email: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        defaultValue: "",
    },
    sex: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    status: {
        type: sequelize_1.DataTypes.TINYINT.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
    },
    deptId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
    },
    remark: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
    },
}, {
    sequelize: database_1.default,
    tableName: "users",
});
exports.default = User;
