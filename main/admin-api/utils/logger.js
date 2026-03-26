"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");
const config_1 = __importDefault(require("../config"));
// 错误日志配置
const errorTransport = new DailyRotateFile({
    filename: "logs/error-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxFiles: `${config_1.default.logs.maxDays}d`,
    level: "error",
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
});
// 所有日志配置（可选）
const combinedTransport = new DailyRotateFile({
    filename: "logs/combined-%DATE%.log",
    datePattern: "YYYY-MM-DD",
    maxFiles: `${config_1.default.logs.maxDays}d`,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
});
// 创建日志记录器
const logger = winston.createLogger({
    level: config_1.default.logs.level,
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        errorTransport,
        combinedTransport,
        // 同时输出到控制台
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
    ],
});
exports.default = logger;
