"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class SurveyWorkflowTemplate extends sequelize_1.Model {
}
SurveyWorkflowTemplate.init({
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
    formSchema: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        field: "form_schema"
    },
    workflowSteps: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        field: "workflow_steps"
    },
    status: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "enabled"
    }
}, {
    sequelize: database_1.default,
    tableName: "survey_workflow_templates",
    indexes: [{ name: "idx_workflow_template_status", fields: ["status"] }]
});
exports.default = SurveyWorkflowTemplate;
