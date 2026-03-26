"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendSystemExceptionLog = exports.appendOperationLog = exports.appendLoginLog = void 0;
const express_1 = __importDefault(require("express"));
const user_1 = __importDefault(require("../models/user"));
const monitorStore_1 = __importDefault(require("../models/monitorStore"));
const onlineSession_1 = require("../services/onlineSession");
const router = express_1.default.Router();
const LOG_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const NOTICE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const MONITOR_STATE_KEY = "monitor_logs_state_v1";
const now = Date.now;
const LOG_TYPE_TO_ROUTE = {
    login: "/monitor/login-logs",
    operation: "/monitor/operation-logs",
    system: "/monitor/system-logs"
};
const LOG_TYPE_TO_LABEL = {
    login: "登录日志",
    operation: "操作日志",
    system: "系统日志"
};
const createDefaultLogSizeNotifySettings = () => ({
    login: { enabled: false, thresholdCount: 1000, userIds: [], exceeded: false, updatedAt: now() },
    operation: { enabled: false, thresholdCount: 1000, userIds: [], exceeded: false, updatedAt: now() },
    system: { enabled: false, thresholdCount: 1000, userIds: [], exceeded: false, updatedAt: now() }
});
const createDefaultState = () => ({
    loginLogs: [
        {
            id: 1,
            username: "admin",
            ip: "192.168.1.10",
            address: "中国北京市",
            system: "macOS",
            browser: "Chrome",
            status: 1,
            behavior: "账号登录",
            loginTime: now()
        },
        {
            id: 2,
            username: "common",
            ip: "192.168.1.11",
            address: "中国广东省深圳市",
            system: "Windows",
            browser: "Firefox",
            status: 0,
            behavior: "第三方登录",
            loginTime: now() - 3600000
        }
    ],
    operationLogs: [
        {
            id: 1,
            username: "admin",
            module: "系统管理",
            summary: "菜单管理-新增菜单",
            method: "POST",
            url: "/menu/create",
            ip: "192.168.1.10",
            address: "中国北京市",
            system: "macOS",
            browser: "Chrome",
            status: 1,
            requestBody: { title: "示例菜单" },
            responseBody: { code: 0, message: "操作成功" },
            operatingTime: now()
        },
        {
            id: 2,
            username: "common",
            module: "在线用户",
            summary: "列表分页查询",
            method: "POST",
            url: "/monitor/online-logs",
            ip: "192.168.1.11",
            address: "中国广东省深圳市",
            system: "Windows",
            browser: "Firefox",
            status: 0,
            requestBody: { username: "common" },
            responseBody: { code: 200, message: "无权限", bizCode: 403 },
            operatingTime: now() - 7200000
        }
    ],
    systemLogs: [],
    logSizeNotifySettings: createDefaultLogSizeNotifySettings(),
    userNotices: {}
});
let stateCache = null;
let initPromise = null;
let writeQueue = Promise.resolve();
const buildTableResult = (list) => ({
    list,
    total: list.length,
    pageSize: 10,
    currentPage: 1
});
const MONITOR_ACTION_LABELS = {
    QueryOnlineLogs: "查询在线用户",
    OfflineUser: "强制下线用户",
    QueryLoginLogs: "查询登录日志",
    BatchDeleteLoginLogs: "批量删除登录日志",
    ClearLoginLogs: "清空登录日志",
    QueryOperationLogs: "查询操作日志",
    BatchDeleteOperationLogs: "批量删除操作日志",
    ClearOperationLogs: "清空操作日志",
    QueryOperationLogDetail: "查询操作日志详情",
    QuerySystemLogs: "查询系统日志",
    BatchDeleteSystemLogs: "批量删除系统日志",
    ClearSystemLogs: "清空系统日志",
    QuerySystemLogDetail: "查询系统日志详情",
    GetLogCountNotifySetting: "查询日志条数通知设置",
    SaveLogCountNotifySetting: "保存日志条数通知设置",
    QueryLayNotice: "查询站内通知",
    ReadLayNotice: "已读站内通知"
};
const parseUserIdFromAccessToken = (authorization) => {
    if (!authorization)
        return null;
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    const parts = token.split("_");
    if (parts.length < 3 || parts[0] !== "atk")
        return null;
    const userId = Number(parts[1]);
    return Number.isFinite(userId) ? userId : null;
};
const sanitizeLogValue = (value, depth = 0) => {
    if (value === null || value === undefined)
        return value;
    if (depth > 4)
        return "[MaxDepth]";
    if (Buffer.isBuffer(value)) {
        return {
            type: "Buffer",
            length: value.length
        };
    }
    if (ArrayBuffer.isView(value)) {
        return {
            type: value.constructor?.name || "TypedArray",
            length: value.byteLength ?? 0
        };
    }
    if (value instanceof ArrayBuffer) {
        return {
            type: "ArrayBuffer",
            length: value.byteLength
        };
    }
    if (typeof value === "string")
        return value.length > 500 ? `${value.slice(0, 500)}...` : value;
    if (typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.slice(0, 20).map(item => sanitizeLogValue(item, depth + 1));
    if (typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value).slice(0, 50)) {
            if (["password", "newPwd", "accessToken", "refreshToken", "authorization", "token"].includes(k))
                out[k] = "***";
            else
                out[k] = sanitizeLogValue(v, depth + 1);
        }
        if (Object.keys(value).length > 50) {
            out.__truncatedKeys = Object.keys(value).length - 50;
        }
        return out;
    }
    return String(value);
};
const parseIds = (input) => {
    if (!Array.isArray(input))
        return [];
    return input.map(x => Number(x)).filter(Boolean);
};
const parseLogType = (input) => {
    const value = String(input || "").trim();
    if (value === "login" || value === "operation" || value === "system")
        return value;
    return null;
};
const normalizeState = (raw) => ({
    loginLogs: Array.isArray(raw?.loginLogs) ? raw.loginLogs : [],
    operationLogs: Array.isArray(raw?.operationLogs) ? raw.operationLogs : [],
    systemLogs: Array.isArray(raw?.systemLogs) ? raw.systemLogs : [],
    logSizeNotifySettings: normalizeNotifySettings(raw),
    userNotices: raw?.userNotices && typeof raw.userNotices === "object" ? raw.userNotices : {}
});
const normalizeNotifySettings = (raw) => {
    const defaults = createDefaultLogSizeNotifySettings();
    const mapOne = (input, fallback) => {
        const thresholdCount = Number(input?.thresholdCount);
        const legacyThresholdMb = Number(input?.thresholdMb);
        return {
            ...fallback,
            ...(input || {}),
            thresholdCount: Number.isFinite(thresholdCount) && thresholdCount > 0
                ? thresholdCount
                : Number.isFinite(legacyThresholdMb) && legacyThresholdMb > 0
                    ? Math.floor(legacyThresholdMb * 100)
                    : fallback.thresholdCount,
            userIds: Array.isArray(input?.userIds) ? input.userIds.map((x) => Number(x)).filter(Boolean) : []
        };
    };
    return {
        login: mapOne(raw?.logSizeNotifySettings?.login, defaults.login),
        operation: mapOne(raw?.logSizeNotifySettings?.operation, defaults.operation),
        system: mapOne(raw?.logSizeNotifySettings?.system, defaults.system)
    };
};
const pruneByRetention = (list, timeField) => {
    const minTime = Date.now() - LOG_RETENTION_MS;
    return list.filter(item => {
        const t = Number(item?.[timeField]);
        return Number.isFinite(t) && t >= minTime;
    });
};
const pruneState = (state) => {
    state.loginLogs = pruneByRetention(state.loginLogs, "loginTime");
    state.operationLogs = pruneByRetention(state.operationLogs, "operatingTime");
    state.systemLogs = pruneByRetention(state.systemLogs, "requestTime");
    const minNoticeTime = Date.now() - NOTICE_RETENTION_MS;
    const nextNotices = {};
    for (const [key, list] of Object.entries(state.userNotices || {})) {
        const validList = Array.isArray(list)
            ? list
                .filter(item => Number(item?.datetime) >= minNoticeTime)
                .sort((a, b) => Number(b.datetime) - Number(a.datetime))
                .slice(0, 200)
            : [];
        if (validList.length > 0)
            nextNotices[key] = validList;
    }
    state.userNotices = nextNotices;
};
const getLogListByType = (state, logType) => {
    if (logType === "login")
        return state.loginLogs;
    if (logType === "operation")
        return state.operationLogs;
    return state.systemLogs;
};
const calcLogCount = (list) => (Array.isArray(list) ? list.length : 0);
const getNextNoticeId = (state) => {
    let maxId = 0;
    for (const list of Object.values(state.userNotices || {})) {
        if (!Array.isArray(list))
            continue;
        for (const item of list) {
            maxId = Math.max(maxId, Number(item?.id) || 0);
        }
    }
    return maxId + 1;
};
const appendLogCountNotice = (state, logType, thresholdCount, currentCount, userIds) => {
    if (!Array.isArray(userIds) || userIds.length === 0)
        return;
    const title = `${LOG_TYPE_TO_LABEL[logType]}条数告警`;
    const description = `${LOG_TYPE_TO_LABEL[logType]}当前 ${currentCount} 条，超过阈值 ${thresholdCount} 条`;
    const routePath = LOG_TYPE_TO_ROUTE[logType];
    const datetime = Date.now();
    let noticeId = getNextNoticeId(state);
    for (const rawUserId of userIds) {
        const userId = Number(rawUserId);
        if (!Number.isFinite(userId) || userId <= 0)
            continue;
        const key = String(userId);
        if (!Array.isArray(state.userNotices[key]))
            state.userNotices[key] = [];
        state.userNotices[key].unshift({
            id: noticeId++,
            title,
            description,
            datetime,
            routePath,
            kind: "log_count",
            read: false
        });
    }
};
const evaluateLogCountNotifications = (state) => {
    const settings = state.logSizeNotifySettings || createDefaultLogSizeNotifySettings();
    ["login", "operation", "system"].forEach(logType => {
        const setting = settings[logType] || createDefaultLogSizeNotifySettings()[logType];
        const thresholdCount = Number(setting.thresholdCount);
        const currentCount = calcLogCount(getLogListByType(state, logType));
        const exceeded = Number.isFinite(thresholdCount) && thresholdCount > 0 && currentCount > thresholdCount;
        const shouldNotify = Boolean(setting.enabled) &&
            exceeded &&
            !setting.exceeded &&
            Array.isArray(setting.userIds) &&
            setting.userIds.length > 0;
        if (shouldNotify) {
            appendLogCountNotice(state, logType, thresholdCount, currentCount, setting.userIds);
        }
        setting.exceeded = exceeded;
        settings[logType] = setting;
    });
    state.logSizeNotifySettings = settings;
};
const persistState = async () => {
    if (!stateCache)
        return;
    const payload = JSON.stringify(stateCache);
    const [row, created] = await monitorStore_1.default.findOrCreate({
        where: { storeKey: MONITOR_STATE_KEY },
        defaults: { storeKey: MONITOR_STATE_KEY, storeValue: payload }
    });
    if (!created) {
        row.storeValue = payload;
        await row.save();
    }
};
const initLogState = async () => {
    if (stateCache)
        return;
    try {
        await monitorStore_1.default.sync();
        const row = await monitorStore_1.default.findOne({ where: { storeKey: MONITOR_STATE_KEY } });
        if (row?.storeValue)
            stateCache = normalizeState(JSON.parse(String(row.storeValue)));
        else
            stateCache = createDefaultState();
    }
    catch {
        stateCache = createDefaultState();
    }
    pruneState(stateCache);
    try {
        await persistState();
    }
    catch (error) {
        console.error("持久化监控日志状态失败", error);
    }
};
const ensureInited = async () => {
    if (!initPromise) {
        initPromise = initLogState();
    }
    await initPromise;
};
const getState = async () => {
    await ensureInited();
    return stateCache;
};
const mutateState = async (mutator) => {
    await ensureInited();
    mutator(stateCache);
    evaluateLogCountNotifications(stateCache);
    pruneState(stateCache);
    writeQueue = writeQueue.then(() => persistState(), () => persistState()).catch(error => {
        console.error("异步持久化监控日志状态失败", error);
    });
    await writeQueue;
};
const appendLoginLog = async (payload) => {
    await mutateState(draft => {
        const maxId = draft.loginLogs.reduce((m, item) => Math.max(m, Number(item?.id) || 0), 0);
        draft.loginLogs.unshift({
            id: maxId + 1,
            username: payload.username || "unknown",
            ip: payload.ip || "unknown",
            address: payload.address || "Unknown Region",
            system: payload.system || "Unknown",
            browser: payload.browser || "Unknown",
            status: payload.status,
            behavior: payload.behavior || "账号登录",
            loginTime: payload.loginTime || Date.now()
        });
    });
};
exports.appendLoginLog = appendLoginLog;
const appendOperationLog = async (payload) => {
    await mutateState(draft => {
        const maxId = draft.operationLogs.reduce((m, item) => Math.max(m, Number(item?.id) || 0), 0);
        draft.operationLogs.unshift({
            id: maxId + 1,
            username: payload.username || "unknown",
            module: payload.module || "未知模块",
            summary: payload.summary || "未知操作",
            method: payload.method || "POST",
            url: payload.url || "",
            ip: payload.ip || "unknown",
            address: payload.address || "Unknown Region",
            system: payload.system || "Unknown",
            browser: payload.browser || "Unknown",
            status: payload.status,
            requestBody: payload.requestBody ?? null,
            responseBody: payload.responseBody ?? null,
            operatingTime: payload.operatingTime || Date.now()
        });
    });
};
exports.appendOperationLog = appendOperationLog;
const appendSystemExceptionLog = async (payload) => {
    await mutateState(draft => {
        const maxId = draft.systemLogs.reduce((m, item) => Math.max(m, Number(item?.id) || 0), 0);
        draft.systemLogs.unshift({
            id: maxId + 1,
            level: 0,
            kind: "runtime",
            source: payload.source || "系统",
            message: payload.message || "系统异常",
            requestTime: payload.requestTime || Date.now(),
            detail: payload.detail ?? null
        });
    });
};
exports.appendSystemExceptionLog = appendSystemExceptionLog;
const createMonitorOperationLogger = (req, res, action) => ({
    success: async (data, message = "操作成功") => {
        const actionLabel = MONITOR_ACTION_LABELS[action] || action;
        const authHeader = (req.headers?.authorization ?? "").toString();
        const userId = parseUserIdFromAccessToken(authHeader);
        let username = (req.body?.username ?? req.query?.username ?? "unknown").toString();
        if (userId) {
            const user = await user_1.default.findByPk(userId);
            if (user)
                username = String(user.username || username);
        }
        const client = (0, onlineSession_1.parseClientInfo)(req);
        await (0, exports.appendOperationLog)({
            username,
            module: "系统监控",
            summary: actionLabel,
            ip: client.ip,
            address: client.address,
            system: client.system,
            browser: client.browser,
            status: 1,
            operatingTime: Date.now(),
            method: (req.method || "POST").toUpperCase(),
            url: req.path,
            requestBody: sanitizeLogValue(req.body),
            responseBody: sanitizeLogValue({ code: 0, message, data })
        });
        return res.success(data, message);
    },
    error: async (message = "操作失败", statusCode = 400) => {
        const actionLabel = MONITOR_ACTION_LABELS[action] || action;
        const authHeader = (req.headers?.authorization ?? "").toString();
        const userId = parseUserIdFromAccessToken(authHeader);
        let username = (req.body?.username ?? req.query?.username ?? "unknown").toString();
        if (userId) {
            const user = await user_1.default.findByPk(userId);
            if (user)
                username = String(user.username || username);
        }
        const client = (0, onlineSession_1.parseClientInfo)(req);
        await (0, exports.appendOperationLog)({
            username,
            module: "系统监控",
            summary: actionLabel,
            ip: client.ip,
            address: client.address,
            system: client.system,
            browser: client.browser,
            status: 0,
            operatingTime: Date.now(),
            method: (req.method || "POST").toUpperCase(),
            url: req.path,
            requestBody: sanitizeLogValue(req.body),
            responseBody: sanitizeLogValue({ code: 200, bizCode: statusCode, statusCode, message })
        });
        return res.error(message, statusCode);
    }
});
router.post("/log-count-notify-setting/get", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "GetLogCountNotifySetting");
    try {
        const logType = parseLogType(req.body?.logType);
        if (!logType)
            return op.error("日志类型无效", 400);
        const state = await getState();
        const setting = state.logSizeNotifySettings?.[logType] || createDefaultLogSizeNotifySettings()[logType];
        return op.success({
            logType,
            enabled: Boolean(setting.enabled),
            thresholdCount: Number(setting.thresholdCount) || 0,
            userIds: Array.isArray(setting.userIds) ? setting.userIds : []
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询日志条数通知设置失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/log-count-notify-setting/save", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "SaveLogCountNotifySetting");
    try {
        const logType = parseLogType(req.body?.logType);
        if (!logType)
            return op.error("日志类型无效", 400);
        const thresholdCount = Number(req.body?.thresholdCount ?? req.body?.thresholdMb);
        if (!Number.isFinite(thresholdCount) || thresholdCount <= 0)
            return op.error("阈值条数必须大于 0", 400);
        const userIds = parseIds(req.body?.userIds);
        if (userIds.length === 0)
            return op.error("至少选择一个系统用户", 400);
        const enabled = req.body?.enabled !== false;
        await mutateState(draft => {
            draft.logSizeNotifySettings = draft.logSizeNotifySettings || createDefaultLogSizeNotifySettings();
            draft.logSizeNotifySettings[logType] = {
                enabled,
                thresholdCount: Math.floor(thresholdCount),
                userIds,
                exceeded: false,
                updatedAt: Date.now()
            };
        });
        const state = await getState();
        const setting = state.logSizeNotifySettings[logType];
        return op.success({
            logType,
            enabled: setting.enabled,
            thresholdCount: setting.thresholdCount,
            userIds: setting.userIds
        }, "保存成功");
    }
    catch (error) {
        return op.error(`保存日志条数通知设置失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/lay-notice/list", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QueryLayNotice");
    try {
        const authHeader = (req.headers?.authorization ?? "").toString();
        const userId = parseUserIdFromAccessToken(authHeader);
        if (!userId)
            return op.error("未识别当前用户", 401);
        const state = await getState();
        const list = (state.userNotices?.[String(userId)] || [])
            .slice()
            .sort((a, b) => Number(b.datetime) - Number(a.datetime));
        return op.success(list, "操作成功");
    }
    catch (error) {
        return op.error(`查询站内通知失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/lay-notice/read", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "ReadLayNotice");
    try {
        const authHeader = (req.headers?.authorization ?? "").toString();
        const userId = parseUserIdFromAccessToken(authHeader);
        if (!userId)
            return op.error("未识别当前用户", 401);
        const noticeId = Number(req.body?.id);
        await mutateState(draft => {
            const key = String(userId);
            const list = Array.isArray(draft.userNotices?.[key]) ? draft.userNotices[key] : [];
            if (noticeId > 0) {
                const target = list.find(item => Number(item.id) === noticeId);
                if (target)
                    target.read = true;
            }
            else {
                list.forEach(item => {
                    item.read = true;
                });
            }
            draft.userNotices[key] = list;
        });
        return op.success({}, "已读成功");
    }
    catch (error) {
        return op.error(`已读通知失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/online-logs", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QueryOnlineLogs");
    try {
        const username = (req.body?.username ?? "").toString().trim().toLowerCase();
        const sessions = await (0, onlineSession_1.listOnlineSessions)(username);
        const list = sessions
            .slice()
            .sort((a, b) => Number(b.loginTime) - Number(a.loginTime))
            .map(item => ({
            id: item.id,
            username: item.username,
            ip: item.ip,
            address: item.address,
            system: item.system,
            browser: item.browser,
            loginTime: item.loginTime
        }));
        return op.success(buildTableResult(list), "操作成功");
    }
    catch (error) {
        return op.error(`查询在线用户失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/offline", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "OfflineUser");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少用户 id", 400);
        const user = await user_1.default.findByPk(id);
        if (!user)
            return op.error("用户不存在", 404);
        const removed = await (0, onlineSession_1.offlineByUserId)(id);
        if (!removed)
            return op.error("该用户当前不在线", 400);
        return op.success({ id }, "强制下线成功");
    }
    catch (error) {
        return op.error(`强制下线失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/login-logs", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QueryLoginLogs");
    try {
        const username = (req.body?.username ?? "").toString().trim().toLowerCase();
        const status = (req.body?.status ?? "").toString().trim();
        const state = await getState();
        const list = state.loginLogs.filter(item => {
            if (username && !String(item.username || "").toLowerCase().includes(username))
                return false;
            if (status !== "" && String(item.status) !== status)
                return false;
            const loginTime = req.body?.loginTime;
            if (Array.isArray(loginTime) && loginTime.length === 2) {
                const start = Number(new Date(loginTime[0]).getTime());
                const end = Number(new Date(loginTime[1]).getTime());
                const current = Number(item.loginTime);
                if (Number.isFinite(start) && current < start)
                    return false;
                if (Number.isFinite(end) && current > end)
                    return false;
            }
            return true;
        }).sort((a, b) => Number(b.loginTime) - Number(a.loginTime));
        return op.success(buildTableResult(list), "操作成功");
    }
    catch (error) {
        return op.error(`查询登录日志失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/login-logs/batch-delete", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "BatchDeleteLoginLogs");
    try {
        const ids = parseIds(req.body?.ids);
        if (ids.length === 0)
            return op.error("缺少日志 ids", 400);
        await mutateState(draft => {
            draft.loginLogs = draft.loginLogs.filter(item => !ids.includes(Number(item.id)));
        });
        return op.success({ ids }, "批量删除成功");
    }
    catch (error) {
        return op.error(`批量删除登录日志失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/login-logs/clear", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "ClearLoginLogs");
    try {
        await mutateState(draft => {
            draft.loginLogs = [];
        });
        return op.success({}, "清空成功");
    }
    catch (error) {
        return op.error(`清空登录日志失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/operation-logs", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QueryOperationLogs");
    try {
        const moduleName = (req.body?.module ?? "").toString().trim().toLowerCase();
        const status = (req.body?.status ?? "").toString().trim();
        const state = await getState();
        const list = state.operationLogs.filter(item => {
            if (moduleName && !String(item.module || "").toLowerCase().includes(moduleName))
                return false;
            if (status !== "" && String(item.status) !== status)
                return false;
            const operatingTime = req.body?.operatingTime;
            if (Array.isArray(operatingTime) && operatingTime.length === 2) {
                const start = Number(new Date(operatingTime[0]).getTime());
                const end = Number(new Date(operatingTime[1]).getTime());
                const current = Number(item.operatingTime);
                if (Number.isFinite(start) && current < start)
                    return false;
                if (Number.isFinite(end) && current > end)
                    return false;
            }
            return true;
        }).sort((a, b) => Number(b.operatingTime) - Number(a.operatingTime));
        return op.success(buildTableResult(list), "操作成功");
    }
    catch (error) {
        return op.error(`查询操作日志失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/operation-logs/batch-delete", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "BatchDeleteOperationLogs");
    try {
        const ids = parseIds(req.body?.ids);
        if (ids.length === 0)
            return op.error("缺少日志 ids", 400);
        await mutateState(draft => {
            draft.operationLogs = draft.operationLogs.filter(item => !ids.includes(Number(item.id)));
        });
        return op.success({ ids }, "批量删除成功");
    }
    catch (error) {
        return op.error(`批量删除操作日志失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/operation-logs/clear", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "ClearOperationLogs");
    try {
        await mutateState(draft => {
            draft.operationLogs = [];
        });
        return op.success({}, "清空成功");
    }
    catch (error) {
        return op.error(`清空操作日志失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/operation-logs-detail", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QueryOperationLogDetail");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少日志 id", 400);
        const state = await getState();
        const base = state.operationLogs.find(item => Number(item.id) === id);
        if (!base)
            return op.error("日志不存在", 404);
        return op.success(base, "操作成功");
    }
    catch (error) {
        return op.error(`查询操作日志详情失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/system-logs", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QuerySystemLogs");
    try {
        const keyword = (req.body?.keyword ?? "").toString().trim().toLowerCase();
        const requestTime = req.body?.requestTime;
        const state = await getState();
        const list = state.systemLogs.filter(item => {
            if (item?.kind !== "runtime")
                return false;
            if (keyword) {
                const text = `${item?.source || ""} ${item?.message || ""}`.toLowerCase();
                if (!text.includes(keyword))
                    return false;
            }
            if (Array.isArray(requestTime) && requestTime.length === 2) {
                const start = Number(new Date(requestTime[0]).getTime());
                const end = Number(new Date(requestTime[1]).getTime());
                const current = Number(item.requestTime);
                if (Number.isFinite(start) && current < start)
                    return false;
                if (Number.isFinite(end) && current > end)
                    return false;
            }
            return true;
        }).sort((a, b) => Number(b.requestTime) - Number(a.requestTime));
        return op.success(buildTableResult(list), "操作成功");
    }
    catch (error) {
        return op.error(`查询系统日志失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/system-logs/batch-delete", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "BatchDeleteSystemLogs");
    try {
        const ids = parseIds(req.body?.ids);
        if (ids.length === 0)
            return op.error("缺少日志 ids", 400);
        await mutateState(draft => {
            draft.systemLogs = draft.systemLogs.filter(item => !ids.includes(Number(item.id)));
        });
        return op.success({ ids }, "批量删除成功");
    }
    catch (error) {
        return op.error(`批量删除系统日志失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/system-logs/clear", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "ClearSystemLogs");
    try {
        await mutateState(draft => {
            draft.systemLogs = [];
        });
        return op.success({}, "清空成功");
    }
    catch (error) {
        return op.error(`清空系统日志失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/system-logs-detail", async (req, res) => {
    const op = createMonitorOperationLogger(req, res, "QuerySystemLogDetail");
    try {
        const id = Number(req.body?.id);
        if (!id)
            return op.error("缺少日志 id", 400);
        const state = await getState();
        const base = state.systemLogs.find(item => Number(item.id) === id);
        if (!base)
            return op.error("日志不存在", 404);
        return op.success(base, "操作成功");
    }
    catch (error) {
        return op.error(`查询系统日志详情失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
exports.default = router;
