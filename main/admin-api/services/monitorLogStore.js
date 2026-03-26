"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendLoginLog = exports.mutateMonitorLogState = exports.getMonitorLogState = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const LOG_RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const LOG_DIR = path_1.default.resolve(process.cwd(), "data");
const LOG_FILE = path_1.default.join(LOG_DIR, "monitor-logs.json");
let stateCache = null;
let initPromise = null;
let writeQueue = Promise.resolve();
const now = Date.now;
const createDefaultState = () => ({
    loginLogs: [],
    operationLogs: [],
    systemLogs: []
});
const normalizeState = (raw) => ({
    loginLogs: Array.isArray(raw?.loginLogs) ? raw.loginLogs : [],
    operationLogs: Array.isArray(raw?.operationLogs) ? raw.operationLogs : [],
    systemLogs: Array.isArray(raw?.systemLogs) ? raw.systemLogs : []
});
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
};
const persistState = async () => {
    if (!stateCache)
        return;
    await promises_1.default.mkdir(LOG_DIR, { recursive: true });
    await promises_1.default.writeFile(LOG_FILE, JSON.stringify(stateCache, null, 2), "utf-8");
};
const initLogState = async () => {
    if (stateCache)
        return;
    try {
        await promises_1.default.mkdir(LOG_DIR, { recursive: true });
        const content = await promises_1.default.readFile(LOG_FILE, "utf-8");
        stateCache = normalizeState(JSON.parse(content));
    }
    catch {
        stateCache = createDefaultState();
        pruneState(stateCache);
        await persistState();
        return;
    }
    pruneState(stateCache);
    await persistState();
};
const ensureInited = async () => {
    if (!initPromise) {
        initPromise = initLogState();
    }
    await initPromise;
};
const getMonitorLogState = async () => {
    await ensureInited();
    return stateCache;
};
exports.getMonitorLogState = getMonitorLogState;
const mutateMonitorLogState = async (mutator) => {
    await ensureInited();
    mutator(stateCache);
    pruneState(stateCache);
    writeQueue = writeQueue.then(() => persistState());
    await writeQueue;
};
exports.mutateMonitorLogState = mutateMonitorLogState;
const appendLoginLog = async (payload) => {
    await (0, exports.mutateMonitorLogState)(draft => {
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
            loginTime: payload.loginTime || now()
        });
    });
};
exports.appendLoginLog = appendLoginLog;
