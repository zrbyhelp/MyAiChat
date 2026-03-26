"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class MonitorStore extends sequelize_1.Model {
}
MonitorStore.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    storeKey: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        unique: true
    },
    storeValue: {
        type: sequelize_1.DataTypes.TEXT("long"),
        allowNull: false,
        validate: {
            notEmpty: true
        }
    }
}, {
    sequelize: database_1.default,
    tableName: "monitor_store",
    hooks: {
        beforeValidate: instance => {
            if (!instance.storeValue)
                instance.storeValue = "{}";
        }
    }
});
exports.default = MonitorStore;
