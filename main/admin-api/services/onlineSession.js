"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.offlineByUserId = exports.isAccessTokenOnline = exports.listOnlineSessions = exports.refreshOnlineSessionToken = exports.upsertOnlineSession = exports.parseClientInfo = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const DATA_DIR = path_1.default.resolve(process.cwd(), "data");
const ONLINE_SESSION_FILE = path_1.default.join(DATA_DIR, "online-sessions.json");
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
let sessionCache = null;
let initPromise = null;
let writeQueue = Promise.resolve();
const normalizeSessions = (raw) => {
    if (!Array.isArray(raw))
        return [];
    return raw
        .map(item => {
        const row = item;
        const id = Number(row.id);
        if (!Number.isFinite(id) || !row.username)
            return null;
        return {
            id,
            username: String(row.username),
            ip: String(row.ip || ""),
            address: String(row.address || ""),
            system: String(row.system || ""),
            browser: String(row.browser || ""),
            loginTime: Number(row.loginTime) || Date.now(),
            accessToken: String(row.accessToken || ""),
            refreshToken: String(row.refreshToken || ""),
            updatedAt: Number(row.updatedAt) || Date.now()
        };
    })
        .filter(Boolean);
};
const pruneExpired = (list) => {
    const minUpdatedAt = Date.now() - SESSION_TTL_MS;
    return list.filter(item => item.updatedAt >= minUpdatedAt);
};
const persist = async () => {
    if (!sessionCache)
        return;
    try {
        await promises_1.default.mkdir(DATA_DIR, { recursive: true });
        await promises_1.default.writeFile(ONLINE_SESSION_FILE, JSON.stringify(sessionCache, null, 2), "utf-8");
    }
    catch {
        // Ignore persistence errors and keep serving from memory.
    }
};
const init = async () => {
    if (sessionCache)
        return;
    try {
        await promises_1.default.mkdir(DATA_DIR, { recursive: true });
        const raw = await promises_1.default.readFile(ONLINE_SESSION_FILE, "utf-8");
        sessionCache = pruneExpired(normalizeSessions(JSON.parse(raw)));
    }
    catch {
        sessionCache = [];
    }
    await persist();
};
const ensureInited = async () => {
    if (!initPromise)
        initPromise = init();
    await initPromise;
};
const mutate = async (mutator) => {
    await ensureInited();
    mutator(sessionCache);
    sessionCache = pruneExpired(sessionCache);
    writeQueue = writeQueue.then(() => persist());
    await writeQueue;
};
const parseClientInfo = (req) => {
    const xff = (req.headers?.["x-forwarded-for"] ?? "").toString();
    const realIp = (req.headers?.["x-real-ip"] ?? "").toString();
    const forwardedIp = xff.split(",").map(item => item.trim()).find(Boolean) || "";
    const ip = forwardedIp || realIp || String(req.ip || "").replace(/^::ffff:/, "") || "unknown";
    const ua = (req.headers?.["user-agent"] ?? "").toString().toLowerCase();
    let system = "Unknown";
    if (ua.includes("windows"))
        system = "Windows";
    else if (ua.includes("mac os") || ua.includes("macintosh"))
        system = "macOS";
    else if (ua.includes("linux"))
        system = "Linux";
    else if (ua.includes("android"))
        system = "Android";
    else if (ua.includes("iphone") || ua.includes("ios"))
        system = "iOS";
    let browser = "Unknown";
    if (ua.includes("edg/"))
        browser = "Edge";
    else if (ua.includes("chrome/"))
        browser = "Chrome";
    else if (ua.includes("firefox/"))
        browser = "Firefox";
    else if (ua.includes("safari/"))
        browser = "Safari";
    const localIpSet = new Set(["127.0.0.1", "::1", "localhost", "unknown"]);
    const isLan = ip.startsWith("192.168.") || ip.startsWith("10.") || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
    const address = localIpSet.has(ip) || isLan ? "Local Network" : "Unknown Region";
    return { ip, system, browser, address };
};
exports.parseClientInfo = parseClientInfo;
const upsertOnlineSession = async (payload) => {
    const now = Date.now();
    await mutate(draft => {
        const idx = draft.findIndex(item => item.id === payload.id);
        const base = {
            id: payload.id,
            username: payload.username,
            ip: payload.ip,
            address: payload.address,
            system: payload.system,
            browser: payload.browser,
            loginTime: payload.loginTime ?? now,
            accessToken: payload.accessToken,
            refreshToken: payload.refreshToken,
            updatedAt: now
        };
        if (idx < 0) {
            draft.push(base);
            return;
        }
        draft[idx] = {
            ...draft[idx],
            ...base,
            loginTime: draft[idx].loginTime || base.loginTime,
            updatedAt: now
        };
    });
};
exports.upsertOnlineSession = upsertOnlineSession;
const refreshOnlineSessionToken = async (userId, accessToken, refreshToken) => {
    await mutate(draft => {
        const idx = draft.findIndex(item => item.id === userId);
        if (idx < 0)
            return;
        draft[idx] = {
            ...draft[idx],
            accessToken,
            refreshToken,
            updatedAt: Date.now()
        };
    });
};
exports.refreshOnlineSessionToken = refreshOnlineSessionToken;
const listOnlineSessions = async (username) => {
    try {
        await ensureInited();
    }
    catch {
        sessionCache = sessionCache || [];
    }
    const list = pruneExpired([...sessionCache]);
    if (!username)
        return list;
    const keyword = username.trim().toLowerCase();
    if (!keyword)
        return list;
    return list.filter(item => item.username.toLowerCase().includes(keyword));
};
exports.listOnlineSessions = listOnlineSessions;
const isAccessTokenOnline = async (accessToken) => {
    if (!accessToken)
        return false;
    try {
        await ensureInited();
    }
    catch {
        sessionCache = sessionCache || [];
    }
    const list = pruneExpired([...sessionCache]);
    return list.some(item => item.accessToken === accessToken);
};
exports.isAccessTokenOnline = isAccessTokenOnline;
const offlineByUserId = async (userId) => {
    let removed = false;
    await mutate(draft => {
        const sizeBefore = draft.length;
        const filtered = draft.filter(item => item.id !== userId);
        removed = filtered.length !== sizeBefore;
        draft.splice(0, draft.length, ...filtered);
    });
    return removed;
};
exports.offlineByUserId = offlineByUserId;
