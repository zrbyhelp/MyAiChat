"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const config_1 = __importDefault(require("../config"));
const sequelize = new sequelize_1.Sequelize({
    dialect: "mysql",
    host: config_1.default.database.host,
    port: config_1.default.database.port,
    username: config_1.default.database.user,
    password: config_1.default.database.password,
    database: config_1.default.database.database,
    logging: false,
    define: {
        timestamps: true,
        underscored: true,
    },
});
// 测试数据库连接
const testConnection = async () => {
    try {
        await sequelize.authenticate();
    }
    catch (error) {
        console.error("数据库连接失败:", error);
    }
};
testConnection();
exports.default = sequelize;
