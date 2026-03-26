"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class CarouselCategory extends sequelize_1.Model {
}
CarouselCategory.init({
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
    tableName: "carousel_categories"
});
exports.default = CarouselCategory;
