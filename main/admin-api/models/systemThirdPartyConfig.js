"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sequelize_1 = require("sequelize");
const database_1 = __importDefault(require("../database"));
class SystemThirdPartyConfig extends sequelize_1.Model {
}
SystemThirdPartyConfig.init({
    id: {
        type: sequelize_1.DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true
    },
    provider: {
        type: sequelize_1.DataTypes.STRING(50),
        allowNull: false
    },
    name: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false
    },
    appId: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
        field: "app_id"
    },
    appKey: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: "",
        field: "app_key"
    },
    appSecret: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
        field: "app_secret"
    },
    endpoint: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    bucket: {
        type: sequelize_1.DataTypes.STRING(255),
        allowNull: false,
        defaultValue: ""
    },
    region: {
        type: sequelize_1.DataTypes.STRING(120),
        allowNull: false,
        defaultValue: ""
    },
    callbackUrl: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: "",
        field: "callback_url"
    },
    isEnabled: {
        type: sequelize_1.DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        field: "is_enabled"
    },
    remark: {
        type: sequelize_1.DataTypes.STRING(500),
        allowNull: false,
        defaultValue: ""
    },
    extra: {
        type: sequelize_1.DataTypes.JSON,
        allowNull: false,
        defaultValue: {}
    }
}, {
    sequelize: database_1.default,
    tableName: "system_third_party_configs",
    indexes: [
        {
            name: "idx_system_third_party_provider",
            fields: ["provider"]
        },
        {
            name: "uk_system_third_party_provider_name",
            unique: true,
            fields: ["provider", "name"]
        }
    ]
});
exports.default = SystemThirdPartyConfig;
