"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class SurveyQuestionnaire extends sequelize_1.Model {
}
SurveyQuestionnaire.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    description: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    status: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "draft"
    },
    schema: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    responseCount: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        field: "response_count"
    },
    publishTime: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
        field: "publish_time"
    }
}, {
    sequelize: database_1.default,
    tableName: "survey_questionnaires",
    indexes: [
        {
            name: "idx_survey_questionnaires_status",
            fields: ["status"]
        }
    ]
});
exports.default = SurveyQuestionnaire;
