"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class SurveyWorkflowInstance extends sequelize_1.Model {
}
SurveyWorkflowInstance.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    templateId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: "template_id"
    },
    templateName: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        field: "template_name"
    },
    formData: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
        field: "form_data"
    },
    stepsSnapshot: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        field: "steps_snapshot"
    },
    currentStepIndex: {
        type: sequelize_1.DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: "current_step_index"
    },
    status: {
        type: sequelize_1.DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "pending"
    },
    submitterId: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        field: "submitter_id"
    },
    submitterName: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        field: "submitter_name"
    },
    currentApproverIds: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        field: "current_approver_ids"
    },
    currentApproverRoleCodes: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        field: "current_approver_role_codes"
    },
    flowLogs: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
        field: "flow_logs"
    },
    submittedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: false,
        defaultValue: sequelize_1.DataTypes.NOW,
        field: "submitted_at"
    },
    finishedAt: {
        type: sequelize_1.DataTypes.DATE,
        allowNull: true,
        field: "finished_at"
    }
}, {
    sequelize: database_1.default,
    tableName: "survey_workflow_instances",
    indexes: [
        { name: "idx_workflow_instance_template", fields: ["template_id"] },
        { name: "idx_workflow_instance_status", fields: ["status"] },
        { name: "idx_workflow_instance_submitter", fields: ["submitter_id"] }
    ]
});
exports.default = SurveyWorkflowInstance;
