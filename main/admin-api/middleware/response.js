"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.responseMiddleware = void 0;
const response_1 = require("../utils/response");
/**
 * 响应工具中间件，将 success 和 error 方法挂载到 res 对象上
 */
const responseMiddleware = (req, res, next) => {
    // 使用类型断言来避免类型错误
    const resWithMethods = res;
    // 挂载 success 方法
    resWithMethods.success = (data, message = "操作成功") => {
        (0, response_1.success)(res, data, message);
    };
    // 挂载 error 方法
    resWithMethods.error = (message = "操作失败", statusCode = 400) => {
        (0, response_1.error)(res, message, statusCode);
    };
    // 将扩展后的对象赋值回 res
    Object.assign(res, resWithMethods);
    next();
};
exports.responseMiddleware = responseMiddleware;
