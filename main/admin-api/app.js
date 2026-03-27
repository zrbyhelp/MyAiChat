"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const config_1 = __importDefault(require("./config"));
const router_1 = __importDefault(require("./router"));
const database_1 = __importDefault(require("./database"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const menuSeed_1 = require("./database/seeds/menuSeed");
const roleSeed_1 = require("./database/seeds/roleSeed");
const deptSeed_1 = require("./database/seeds/deptSeed");
const userSeed_1 = require("./database/seeds/userSeed");
const seedRunner_1 = require("./database/seeds/seedRunner");
const carouselSeed_1 = require("./database/seeds/carouselSeed");
const schemaPatch_1 = require("./database/seeds/schemaPatch");
const response_1 = require("./middleware/response");
const monitor_1 = require("./router/monitor");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: config_1.default.api.bodyLimit }));
app.use(express_1.default.urlencoded({ extended: true, limit: config_1.default.api.bodyLimit }));
app.use("/uploads", express_1.default.static(path_1.default.resolve(process.cwd(), "public/uploads")));
app.use((req, _res, next) => {
    req.__requestStartTime = Date.now();
    next();
});
const responseHandler = (req, res, next) => (0, response_1.responseMiddleware)(req, res, next);
app.use(responseHandler);
const swaggerOptions = {
    swaggerDefinition: {
        swagger: "2.0",
        info: {
            title: "API 文档",
            version: "1.0.0",
            description: "后台管理 API",
        },
        host: `localhost:${config_1.default.port}`,
        basePath: "/",
        produces: ["application/json"],
        schemes: ["http", "https"],
    },
    apis: [path_1.default.join(process.cwd(), "src/router/*.ts")],
};
const swaggerDocs = (0, swagger_jsdoc_1.default)(swaggerOptions);
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocs));
app.use(config_1.default.api.prefix, router_1.default);
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});
const syncDatabase = async () => {
    try {
        console.log(`数据库同步模式: alter=${config_1.default.database.syncAlter}`);
        await database_1.default.sync({ alter: config_1.default.database.syncAlter });
        await (0, seedRunner_1.runSeedOnce)("menu_seed_v15", menuSeed_1.initMenuSeedData);
        await (0, seedRunner_1.runSeedOnce)("role_seed_v7", roleSeed_1.initRoleSeedData);
        await (0, seedRunner_1.runSeedOnce)("dept_seed_v1", deptSeed_1.initDeptSeedData);
        await (0, seedRunner_1.runSeedOnce)("user_seed_v1", userSeed_1.initUserSeedData);
        await (0, seedRunner_1.runSeedOnce)("category_parent_id_patch_v1", schemaPatch_1.patchCategoryParentIdColumns);
        await (0, seedRunner_1.runSeedOnce)("resource_system_category_storage_columns_patch_v3", schemaPatch_1.patchResourceSystemCategoryStorageColumns);
        await (0, seedRunner_1.runSeedOnce)("resource_system_resource_storage_columns_patch_v1", schemaPatch_1.patchResourceSystemResourceStorageColumns);
        await (0, seedRunner_1.runSeedOnce)("carousel_resource_ref_columns_patch_v1", schemaPatch_1.patchCarouselResourceRefColumns);
        await (0, seedRunner_1.runSeedOnce)("workflow_instance_approver_columns_patch_v1", schemaPatch_1.patchWorkflowInstanceApproverColumns);
        await (0, seedRunner_1.runSeedOnce)("user_profile_columns_patch_v1", schemaPatch_1.patchUserProfileColumns);
        await (0, seedRunner_1.runSeedOnce)("carousel_legacy_json_to_db_v1", carouselSeed_1.migrateLegacyCarouselData);
        console.log("数据库模型同步成功");
    }
    catch (error) {
        console.error("数据库模型同步失败", error);
        void (0, monitor_1.appendSystemExceptionLog)({
            source: "数据库",
            message: "数据库模型同步失败",
            detail: {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            },
            requestTime: Date.now()
        }).catch(logError => {
            console.error("记录数据库同步异常日志失败", logError);
        });
    }
};
const startServer = async () => {
    await syncDatabase();
    app.listen(config_1.default.port, () => {
        console.log(`admin-api running at http://127.0.0.1:${config_1.default.port}`);
    });
};
function safeSendError(res, message, statusCode) {
    const maybeError = res?.error;
    if (typeof maybeError === "function") {
        maybeError(message, statusCode);
        return;
    }
    const payload = {
        code: 200,
        bizCode: statusCode,
        statusCode,
        message,
        mess: message
    };
    res.locals = res.locals || {};
    res.locals.responseBody = payload;
    res.status(200).json(payload);
}
app.use((req, res, next) => {
    safeSendError(res, "接口不存在", 404);
});
const errorHandler = (err, req, res, next) => {
    const isEntityTooLarge = err?.type === "entity.too.large" || err?.name === "PayloadTooLargeError";
    const isRequestAborted = err?.type === "request.aborted" || err?.code === "ECONNABORTED";
    const statusCode = isEntityTooLarge ? 413 : isRequestAborted ? 400 : (err?.status || 500);
    const message = isEntityTooLarge
        ? `请求体过大，最大允许 ${config_1.default.api.bodyLimit}`
        : isRequestAborted
            ? "请求已中断，请重试"
            : (err?.message || "服务器内部错误");
    if (isEntityTooLarge || isRequestAborted) {
        console.warn("请求异常:", {
            type: err?.type,
            code: err?.code,
            length: err?.length,
            limit: err?.limit,
            message
        });
    }
    else {
        console.error("错误:", err);
    }
    safeSendError(res, message, statusCode);
};
app.use(errorHandler);
process.on("uncaughtException", error => {
    console.error("未捕获异常:", error);
    void (0, monitor_1.appendSystemExceptionLog)({
        source: "进程",
        message: "未捕获异常",
        detail: {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        },
        requestTime: Date.now()
    }).catch(logError => {
        console.error("记录未捕获异常日志失败", logError);
    });
});
process.on("unhandledRejection", reason => {
    console.error("未处理 Promise 拒绝:", reason);
    void (0, monitor_1.appendSystemExceptionLog)({
        source: "进程",
        message: "未处理 Promise 拒绝",
        detail: {
            reason: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error ? reason.stack : undefined
        },
        requestTime: Date.now()
    }).catch(logError => {
        console.error("记录未处理 Promise 拒绝日志失败", logError);
    });
});
void startServer();
exports.default = app;
