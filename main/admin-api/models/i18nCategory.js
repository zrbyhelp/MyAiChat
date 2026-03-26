"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class I18nCategory extends sequelize_1.Model {
}
I18nCategory.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(80),
        allowNull: false
    },
    key: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        unique: true
    },
    languages: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    structure: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    dictionaryPaths: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: []
    },
    createTime: {
        type: sequelize_1.DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    },
    updateTime: {
        type: sequelize_1.DataTypes.BIGINT.UNSIGNED,
        allowNull: false
    }
}, {
    sequelize: database_1.default,
    tableName: "i18n_category",
    timestamps: false
});
exports.default = I18nCategory;
