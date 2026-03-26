"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initI18nCategorySeedData = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const i18nCategory_1 = __importDefault(require("../../models/i18nCategory"));
const ALLOW_I18N_EXT = new Set([".yaml", ".yml", ".json"]);
const BRANCH_REMARK_KEY = "__remark";
const DEFAULT_ZH_FILE_PRIORITY = ["zh-CN.yaml", "zh-CN.yml", "zh-CN.json"];
const isValidCategoryKey = (input) => /^[A-Za-z][A-Za-z0-9._-]*$/.test(input);
const resolveLocaleDirCandidates = () => {
    return [
        path_1.default.resolve(process.cwd(), "../admin/locales"),
        path_1.default.resolve(process.cwd(), "admin/locales"),
        path_1.default.resolve(__dirname, "../../../../admin/locales")
    ];
};
const pickExistingLocaleDir = async () => {
    for (const p of resolveLocaleDirCandidates()) {
        try {
            const stat = await promises_1.default.stat(p);
            if (stat.isDirectory())
                return p;
        }
        catch {
            // continue
        }
    }
    throw new Error("admin/locales directory not found");
};
const loadYaml = () => require("js-yaml");
const parseLocaleFile = (filename, content) => {
    const ext = path_1.default.extname(filename).toLowerCase();
    const clean = String(content || "").replace(/^\uFEFF/, "");
    if (ext === ".json")
        return JSON.parse(clean);
    const yaml = loadYaml();
    return yaml.load(clean);
};
const normalizeStructureValue = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return String(input ?? "");
    }
    const out = {};
    Object.entries(input).forEach(([k, v]) => {
        if (k === BRANCH_REMARK_KEY)
            return;
        out[k] = normalizeStructureValue(v);
    });
    return out;
};
const buildSeedRowsFromZhRoot = (zhRoot, languages) => {
    const now = Date.now();
    return Object.entries(zhRoot)
        .map(([key, value]) => {
        const normalizedKey = String(key || "").trim();
        if (!normalizedKey || !isValidCategoryKey(normalizedKey))
            return null;
        const normalizedValue = normalizeStructureValue(value);
        const structure = normalizedValue && typeof normalizedValue === "object" && !Array.isArray(normalizedValue)
            ? normalizedValue
            : { value: String(normalizedValue ?? "") };
        return {
            name: normalizedKey,
            key: normalizedKey,
            languages,
            structure,
            dictionaryPaths: [{ path: normalizedKey }],
            createTime: now,
            updateTime: now
        };
    })
        .filter(Boolean);
};
const initI18nCategorySeedData = async () => {
    await i18nCategory_1.default.sync();
    const localeDir = await pickExistingLocaleDir();
    const entries = await promises_1.default.readdir(localeDir, { withFileTypes: true });
    const localeFiles = entries
        .filter(item => item.isFile())
        .map(item => item.name)
        .filter(name => ALLOW_I18N_EXT.has(path_1.default.extname(name).toLowerCase()));
    const languages = Array.from(new Set(localeFiles
        .map(name => path_1.default.basename(name, path_1.default.extname(name)).trim())
        .filter(Boolean)));
    const zhFilename = DEFAULT_ZH_FILE_PRIORITY.find(name => localeFiles.includes(name)) ||
        localeFiles.find(name => /^zh-CN\./i.test(name));
    if (!zhFilename)
        throw new Error("zh-CN locale file not found in admin/locales");
    const zhContent = await promises_1.default.readFile(path_1.default.join(localeDir, zhFilename), "utf8");
    const parsed = parseLocaleFile(zhFilename, zhContent);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${zhFilename} must contain an object at root`);
    }
    const rows = buildSeedRowsFromZhRoot(parsed, languages);
    if (rows.length === 0)
        throw new Error(`no valid category rows parsed from ${zhFilename}`);
    const existing = await i18nCategory_1.default.findAll();
    const existingMap = new Map(existing.map(item => [String(item.key || "").trim(), item]));
    let inserted = 0;
    let updated = 0;
    for (const row of rows) {
        const current = existingMap.get(row.key);
        if (!current) {
            await i18nCategory_1.default.create(row);
            inserted += 1;
            continue;
        }
        await current.update({
            name: row.name,
            languages: row.languages,
            structure: row.structure,
            dictionaryPaths: row.dictionaryPaths,
            updateTime: Date.now()
        });
        updated += 1;
    }
    console.log(`i18n category seed finished: inserted=${inserted}, updated=${updated}`);
};
exports.initI18nCategorySeedData = initI18nCategorySeedData;
