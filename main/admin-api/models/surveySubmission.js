"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class SurveySubmission extends sequelize_1.Model {
}
SurveySubmission.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    surveyId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: "survey_id"
    },
    answers: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    },
    submitTime: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
        field: "submit_time"
    }
}, {
    sequelize: database_1.default,
    tableName: "survey_submissions",
    indexes: [
        { name: "idx_survey_submissions_survey", fields: ["survey_id"] },
        { name: "idx_survey_submissions_time", fields: ["submit_time"] }
    ]
});
exports.default = SurveySubmission;
