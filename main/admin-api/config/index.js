"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
process.env.NODE_ENV = process.env.NODE_ENV || "development";
dotenv.config();
const toBool = (value, defaultValue = false) => {
    if (value === undefined)
        return defaultValue;
    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
};
exports.default = {
    port: parseInt(process.env.PORT || process.env.ADMIN_API_PORT || "3000", 10),
    database: {
        host: process.env.DB_HOST || "localhost",
        port: parseInt(process.env.DB_PORT || "3306", 10),
        user: process.env.DB_USER || "root",
        password: process.env.DB_PASSWORD || "MySQL@Root2024!Secure",
        database: process.env.DB_NAME || "myaichat",
        syncAlter: toBool(process.env.DB_SYNC_ALTER, false),
    },
    jwtSecret: process.env.JWT_SECRET || "your_jwt_secret_key",
    jwtAlgorithm: process.env.JWT_ALGO || "HS256",
    logs: {
        level: process.env.LOG_LEVEL || "silly",
        maxDays: parseInt(process.env.LOG_MAX_DAYS || "15", 10),
    },
    agenda: {
        dbCollection: process.env.AGENDA_DB_COLLECTION || "agenda_jobs",
        pooltime: process.env.AGENDA_POOL_TIME || "5000",
        concurrency: parseInt(process.env.AGENDA_CONCURRENCY || "20", 10),
    },
    api: {
        prefix: "/api",
        bodyLimit: process.env.API_BODY_LIMIT || "30mb",
    },
};
