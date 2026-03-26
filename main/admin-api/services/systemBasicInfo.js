"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveSystemBasicInfo = exports.getSystemBasicInfo = void 0;
const systemStore_1 = __importDefault(require("../models/systemStore"));
const SYSTEM_BASIC_INFO_KEY = "system_basic_info_v1";
const buildDefaultBasicInfo = () => ({
    logo: "/logo.svg",
    longProjectName: "PureAdmin Management System",
    shortProjectName: "PureAdmin",
    copyright: "Copyright (c) 2020-present PureAdmin"
});
const normalizeBasicInfo = (raw) => {
    const defaults = buildDefaultBasicInfo();
    const legacyProjectName = String(raw?.projectName ?? "").trim();
    const longProjectNameCandidate = String(raw?.longProjectName ?? "").trim();
    const shortProjectName = String(raw?.shortProjectName ?? "").trim() ||
        legacyProjectName ||
        longProjectNameCandidate ||
        defaults.shortProjectName;
    const longProjectName = longProjectNameCandidate || shortProjectName || defaults.longProjectName;
    const logo = String(raw?.logo ?? "").trim() || defaults.logo;
    const copyright = String(raw?.copyright ?? "").trim() || `Copyright (c) 2020-present ${shortProjectName}`;
    return {
        logo,
        longProjectName,
        shortProjectName,
        copyright
    };
};
const getSystemBasicInfo = async () => {
    await systemStore_1.default.sync();
    const row = await systemStore_1.default.findOne({ where: { storeKey: SYSTEM_BASIC_INFO_KEY } });
    if (!row?.storeValue)
        return buildDefaultBasicInfo();
    try {
        const raw = JSON.parse(String(row.storeValue));
        return normalizeBasicInfo(raw);
    }
    catch {
        return buildDefaultBasicInfo();
    }
};
exports.getSystemBasicInfo = getSystemBasicInfo;
const saveSystemBasicInfo = async (input) => {
    const payload = normalizeBasicInfo(input);
    await systemStore_1.default.sync();
    const storeValue = JSON.stringify(payload);
    const [row, created] = await systemStore_1.default.findOrCreate({
        where: { storeKey: SYSTEM_BASIC_INFO_KEY },
        defaults: {
            storeKey: SYSTEM_BASIC_INFO_KEY,
            storeValue
        }
    });
    if (!created) {
        row.storeValue = storeValue;
        await row.save();
    }
    return payload;
};
exports.saveSystemBasicInfo = saveSystemBasicInfo;
