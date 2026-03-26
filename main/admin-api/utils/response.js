"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.error = exports.success = void 0;
/**
 * 成功响应
 */
const success = (res, data, message = "操作成功") => {
    const payload = {
        code: 0,
        message,
        data,
        mess: message,
    };
    res.locals = res.locals || {};
    res.locals.responseBody = payload;
    res.json(payload);
};
exports.success = success;
/**
 * 失败响应
 */
const error = (res, message = "操作失败", statusCode = 400) => {
    const payload = {
        code: 200,
        bizCode: statusCode,
        statusCode,
        message,
        mess: message,
    };
    res.locals = res.locals || {};
    res.locals.responseBody = payload;
    res.status(200).json(payload);
};
exports.error = error;
