"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
const i18nCategory_1 = __importDefault(require("../models/i18nCategory"));
const systemThirdPartyConfig_1 = __importDefault(require("../models/systemThirdPartyConfig"));
const operationLogger_1 = require("../services/operationLogger");
const systemBasicInfo_1 = require("../services/systemBasicInfo");
const router = express_1.default.Router();
const MAX_SHORT_PROJECT_NAME_LENGTH = 60;
const MAX_LONG_PROJECT_NAME_LENGTH = 120;
const MAX_LOGO_LENGTH = 500;
const MAX_COPYRIGHT_LENGTH = 200;
const MAX_I18N_CONTENT_LENGTH = 2 * 1024 * 1024;
const MAX_I18N_CATEGORY_NAME_LENGTH = 80;
const MAX_I18N_CATEGORY_KEY_LENGTH = 120;
const MAX_I18N_CATEGORY_COUNT = 500;
const ALLOW_I18N_EXT = new Set([".yaml", ".yml", ".json"]);
const NON_DELETABLE_CATEGORY_KEYS = new Set(["locale"]);
const BRANCH_REMARK_KEY = "__remark";
const I18N_DICTIONARY_ROOT = path_1.default.resolve(__dirname, "../../dictionaries");
const I18N_LOCALE_DICTIONARY_ROOT = path_1.default.resolve(I18N_DICTIONARY_ROOT, "locale");
const I18N_CATEGORY_GENERATED_ROOT = path_1.default.resolve(__dirname, "../../data/dictionaries");
const LEGACY_I18N_DICTIONARY_ROOT = "dictionaries";
let legacyDictionarySynced = false;
let localeStructureImported = false;
const YAML_LOCALE_FILENAME = "zh-CN.yaml";
const MAX_THIRD_PARTY_NAME_LENGTH = 120;
const MAX_THIRD_PARTY_PROVIDER_LENGTH = 50;
const MAX_THIRD_PARTY_TEXT_LENGTH = 500;
const THIRD_PARTY_PROVIDER_GROUPS = [
    {
        key: "social",
        label: "社交平台",
        providers: [
            { value: "wechat_open", label: "微信开放平台" },
            { value: "wechat_mp", label: "微信公众平台" },
            { value: "qq", label: "QQ 设置" }
        ]
    },
    {
        key: "cloud",
        label: "云服务",
        providers: [
            { value: "aliyun", label: "阿里云配置" },
            { value: "qiniu", label: "七牛云配置" },
            { value: "tencent", label: "腾讯云配置" },
            { value: "aws", label: "AWS 配置" }
        ]
    },
    {
        key: "other",
        label: "其他",
        providers: [{ value: "custom", label: "自定义配置" }]
    }
];
const THIRD_PARTY_PROVIDER_SET = new Set(THIRD_PARTY_PROVIDER_GROUPS.flatMap(item => item.providers.map(provider => provider.value)));
const normalizeCategoryName = (input) => String(input ?? "").trim();
const normalizeCategoryKey = (input) => String(input ?? "").trim();
const isValidCategoryKey = (input) => /^[A-Za-z][A-Za-z0-9._-]*$/.test(input);
const normalizeCategoryLanguages = (input) => {
    if (!Array.isArray(input))
        return [];
    return Array.from(new Set(input
        .map(item => String(item ?? "").trim())
        .filter(Boolean)
        .filter(item => /^[A-Za-z0-9_-]+$/.test(item))));
};
const normalizeCategoryStructure = (input) => {
    if (input && typeof input === "object" && !Array.isArray(input)) {
        return input;
    }
    return {};
};
const normalizeCategoryPaths = (input) => {
    if (!Array.isArray(input))
        return [];
    const out = [];
    const seen = new Set();
    input.forEach(row => {
        const pathValue = String(row?.path ?? "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
        if (!pathValue)
            return;
        if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(pathValue))
            return;
        if (seen.has(pathValue))
            return;
        seen.add(pathValue);
        out.push({ path: pathValue });
    });
    return out;
};
const parseCategoryStructure = (input) => {
    if (input && typeof input === "object" && !Array.isArray(input)) {
        return input;
    }
    const text = String(input ?? "").trim();
    if (!text)
        return {};
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            throw new Error("字典结构必须是 JSON 对象");
        }
        return parsed;
    }
    catch (error) {
        throw new Error(`字典结构格式错误: ${error instanceof Error ? error.message : String(error)}`);
    }
};
const normalizeI18nCategoryList = (raw) => {
    if (!Array.isArray(raw))
        return [];
    return raw
        .map(row => {
        const item = row;
        const id = Number(item.id);
        const name = normalizeCategoryName(item.name);
        const key = normalizeCategoryKey(item.key);
        if (!Number.isFinite(id) || id <= 0 || !name || !key || !isValidCategoryKey(key))
            return null;
        const normalizedPaths = normalizeCategoryPaths(item.dictionaryPaths);
        return {
            id,
            name,
            key,
            languages: normalizeCategoryLanguages(item.languages),
            structure: normalizeCategoryStructure(item.structure),
            dictionaryPaths: (normalizedPaths.length > 0 ? normalizedPaths.slice(0, 1) : [{ path: key }]),
            createTime: Number(item.createTime) || Date.now(),
            updateTime: Number(item.updateTime) || Date.now()
        };
    })
        .filter(Boolean);
};
const readI18nCategoryList = async () => {
    await i18nCategory_1.default.sync();
    const rows = await i18nCategory_1.default.findAll();
    return normalizeI18nCategoryList(rows.map(row => row.get({ plain: true })));
};
const writeI18nCategoryList = async (list) => {
    await i18nCategory_1.default.sync();
    await i18nCategory_1.default.destroy({ where: {} });
    if (!Array.isArray(list) || list.length === 0)
        return;
    await i18nCategory_1.default.bulkCreate(list.map(item => ({
        id: item.id,
        name: item.name,
        key: item.key,
        languages: item.languages,
        structure: item.structure,
        dictionaryPaths: item.dictionaryPaths,
        createTime: item.createTime,
        updateTime: item.updateTime
    })));
};
const listLanguageOptionsByDir = async (dir) => {
    try {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        return Array.from(new Set(entries
            .filter(entry => entry.isFile())
            .filter(entry => ALLOW_I18N_EXT.has(path_1.default.extname(entry.name).toLowerCase()))
            .map(entry => path_1.default.basename(entry.name, path_1.default.extname(entry.name)).trim())
            .filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }
    catch {
        return [];
    }
};
const readLocaleDictionarySeedStructure = async () => {
    const yamlPath = path_1.default.join(I18N_LOCALE_DICTIONARY_ROOT, YAML_LOCALE_FILENAME);
    if (!(await pathExists(yamlPath)))
        return {};
    return normalizeLocaleStructure(await readYamlObjectFile(yamlPath));
};
const listLocaleDictionaryLanguageOptions = async () => {
    return listLanguageOptionsByDir(I18N_LOCALE_DICTIONARY_ROOT);
};
const buildDefaultI18nCategorySeedData = async () => {
    const [structure, languageOptions] = await Promise.all([
        readLocaleDictionarySeedStructure(),
        listLocaleDictionaryLanguageOptions()
    ]);
    const now = Date.now();
    return {
        name: "Locale Dictionary",
        key: "locale",
        languages: languageOptions,
        structure,
        dictionaryPaths: [{ path: "locale" }],
        createTime: now,
        updateTime: now
    };
};
const ensureDefaultI18nCategorySeedInDb = async () => {
    const list = await readI18nCategoryList();
    const localeKey = "locale";
    const idx = list.findIndex(item => String(item.key || "").trim() === localeKey);
    if (idx >= 0) {
        const current = list[idx];
        const currentPath = String(current.dictionaryPaths?.[0]?.path || "").trim();
        if (currentPath !== localeKey) {
            list[idx] = {
                ...current,
                dictionaryPaths: [{ path: localeKey }],
                updateTime: Date.now()
            };
            await writeI18nCategoryList(list);
        }
        return list;
    }
    if (list.length >= MAX_I18N_CATEGORY_COUNT)
        return list;
    const seed = await buildDefaultI18nCategorySeedData();
    const nextId = list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const nextItem = {
        id: nextId,
        ...seed
    };
    const next = [...list, nextItem];
    await writeI18nCategoryList(next);
    await ensureDictionaryFilesForFolder(localeKey, seed.languages, seed.structure);
    return next;
};
const loadI18nCategoryState = async () => {
    const list = await ensureDefaultI18nCategorySeedInDb();
    return {
        list,
        defaultKeySet: new Set(NON_DELETABLE_CATEGORY_KEYS)
    };
};
const pathExists = async (inputPath) => {
    try {
        await promises_1.default.stat(inputPath);
        return true;
    }
    catch {
        return false;
    }
};
const resolveFolderPathUnderDictionaryRoot = async (relativeFolderPath) => {
    const dictionaryRoot = I18N_CATEGORY_GENERATED_ROOT;
    await promises_1.default.mkdir(dictionaryRoot, { recursive: true });
    const normalized = String(relativeFolderPath || "")
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
    if (!normalized)
        throw new Error("Dictionary path is required");
    if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(normalized)) {
        throw new Error(`Dictionary path must be a folder path: ${relativeFolderPath}`);
    }
    const fullPath = path_1.default.resolve(dictionaryRoot, normalized);
    if (fullPath !== dictionaryRoot && !fullPath.startsWith(`${dictionaryRoot}${path_1.default.sep}`)) {
        throw new Error(`Dictionary path is out of dictionaries root: ${relativeFolderPath}`);
    }
    return { dictionaryRoot, fullPath, normalized };
};
const copyFilesRecursively = async (sourceDir, targetDir) => {
    await promises_1.default.mkdir(targetDir, { recursive: true });
    const entries = await promises_1.default.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path_1.default.join(sourceDir, entry.name);
        const targetPath = path_1.default.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            await copyFilesRecursively(sourcePath, targetPath);
            continue;
        }
        if (!entry.isFile())
            continue;
        await promises_1.default.copyFile(sourcePath, targetPath);
    }
};
const syncLegacyDictionaryFilesToBackend = async () => {
    if (legacyDictionarySynced)
        return;
    let localeDir = "";
    try {
        localeDir = await pickExistingLocaleDir();
    }
    catch {
        legacyDictionarySynced = true;
        return;
    }
    const legacyRoot = path_1.default.resolve(localeDir, LEGACY_I18N_DICTIONARY_ROOT);
    try {
        const stat = await promises_1.default.stat(legacyRoot);
        if (!stat.isDirectory()) {
            legacyDictionarySynced = true;
            return;
        }
    }
    catch {
        legacyDictionarySynced = true;
        return;
    }
    await copyFilesRecursively(legacyRoot, I18N_DICTIONARY_ROOT);
    legacyDictionarySynced = true;
};
const buildDictionaryContentFromStructure = (structure) => {
    const walk = (input) => {
        const out = {};
        Object.entries(input || {}).forEach(([k, v]) => {
            if (k === BRANCH_REMARK_KEY)
                return;
            if (v && typeof v === "object" && !Array.isArray(v)) {
                out[k] = walk(v);
            }
            else {
                // Category structure stores remarks; generated dictionary values should start empty.
                out[k] = "";
            }
        });
        return out;
    };
    return walk(structure || {});
};
const mergeDictionaryTemplateIntoCurrent = (current, template) => {
    const currentObj = current && typeof current === "object" && !Array.isArray(current)
        ? current
        : {};
    const result = { ...currentObj };
    Object.entries(template || {}).forEach(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            result[key] = mergeDictionaryTemplateIntoCurrent(result[key], value);
            return;
        }
        const currentValue = result[key];
        if (currentValue === undefined || currentValue === null || String(currentValue).trim() === "") {
            result[key] = String(value ?? "");
        }
    });
    return result;
};
const loadYaml = () => require("js-yaml");
const readYamlObjectFile = async (filePath) => {
    try {
        const raw = await promises_1.default.readFile(filePath, "utf8");
        const yaml = loadYaml();
        const parsed = yaml.load(String(raw || "").replace(/^\uFEFF/, ""));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    }
    catch {
        return {};
    }
};
const writeYamlObjectFile = async (filePath, data) => {
    const yaml = loadYaml();
    const content = yaml.dump(data, {
        indent: 2,
        lineWidth: -1,
        noRefs: true,
        sortKeys: false
    });
    await promises_1.default.mkdir(path_1.default.dirname(filePath), { recursive: true });
    await promises_1.default.writeFile(filePath, content, "utf8");
};
const readDictionaryObjectFile = async (filePath) => {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") {
        return readYamlObjectFile(filePath);
    }
    try {
        const raw = await promises_1.default.readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    }
    catch {
        return {};
    }
};
const writeDictionaryObjectFile = async (filePath, data) => {
    const ext = path_1.default.extname(filePath).toLowerCase();
    if (ext === ".yaml" || ext === ".yml") {
        await writeYamlObjectFile(filePath, data);
        return;
    }
    await promises_1.default.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};
const ensureZhCnYamlForCategory = async (categoryKey, structure) => {
    const key = String(categoryKey || "").trim();
    if (!key)
        return;
    const localeDir = await pickExistingLocaleDir();
    const yamlPath = path_1.default.join(localeDir, YAML_LOCALE_FILENAME);
    const root = await readYamlObjectFile(yamlPath);
    const template = buildDictionaryContentFromStructure(structure || {});
    root[key] = mergeDictionaryTemplateIntoCurrent(root[key], template);
    await writeYamlObjectFile(yamlPath, root);
};
const ensureDictionaryFilesForFolder = async (folderPath, languages, structure) => {
    const fullPath = folderPath === "locale"
        ? I18N_LOCALE_DICTIONARY_ROOT
        : (await resolveFolderPathUnderDictionaryRoot(folderPath)).fullPath;
    await promises_1.default.mkdir(fullPath, { recursive: true });
    const template = buildDictionaryContentFromStructure(structure);
    for (const language of languages) {
        const languageCode = String(language).trim();
        if (!languageCode)
            continue;
        const existingCandidates = [".yaml", ".yml", ".json"].map(ext => path_1.default.join(fullPath, `${languageCode}${ext}`));
        const existingFilePath = (await Promise.all(existingCandidates.map(async (file) => ((await pathExists(file)) ? file : "")))).find(Boolean);
        const filePath = existingFilePath || path_1.default.join(fullPath, `${languageCode}.yaml`);
        let nextValue = template;
        if (await pathExists(filePath)) {
            const parsed = await readDictionaryObjectFile(filePath);
            nextValue = mergeDictionaryTemplateIntoCurrent(parsed, template);
        }
        await writeDictionaryObjectFile(filePath, nextValue);
    }
};
const moveDictionaryFilesBetweenFolders = async (fromFolderPath, toFolderPath, languages) => {
    const fromResolved = await resolveFolderPathUnderDictionaryRoot(fromFolderPath);
    const toResolved = await resolveFolderPathUnderDictionaryRoot(toFolderPath);
    if (fromResolved.normalized === toResolved.normalized)
        return;
    await promises_1.default.mkdir(toResolved.fullPath, { recursive: true });
    for (const language of languages) {
        const languageCode = String(language).trim();
        if (!languageCode)
            continue;
        const sourceCandidates = [".yaml", ".yml", ".json"].map(ext => path_1.default.join(fromResolved.fullPath, `${languageCode}${ext}`));
        const targetCandidates = [".yaml", ".yml", ".json"].map(ext => path_1.default.join(toResolved.fullPath, `${languageCode}${ext}`));
        const sourceFile = (await Promise.all(sourceCandidates.map(async (file) => ((await pathExists(file)) ? file : "")))).find(Boolean);
        const sourceExists = Boolean(sourceFile);
        if (!sourceExists)
            continue;
        const targetExists = (await Promise.all(targetCandidates.map(file => pathExists(file)))).some(Boolean);
        if (targetExists)
            continue;
        const targetFile = path_1.default.join(toResolved.fullPath, path_1.default.basename(String(sourceFile)));
        await promises_1.default.rename(String(sourceFile), targetFile);
    }
};
const ensureDictionaryFilesForCategories = async (list) => {
    for (const category of list) {
        if (category.key === "locale")
            continue;
        const folderPath = String(category.dictionaryPaths?.[0]?.path || category.key || "").trim();
        if (!folderPath)
            continue;
        await ensureDictionaryFilesForFolder(folderPath, Array.isArray(category.languages) ? category.languages : [], category.structure || {});
        await ensureZhCnYamlForCategory(category.key, category.structure || {});
    }
};
const resolveLocaleDir = () => {
    const candidates = [
        path_1.default.resolve(process.cwd(), "../admin/locales"),
        path_1.default.resolve(process.cwd(), "admin/locales"),
        path_1.default.resolve(__dirname, "../../../admin/locales")
    ];
    return candidates;
};
const pickExistingLocaleDir = async () => {
    for (const p of resolveLocaleDir()) {
        try {
            const stat = await promises_1.default.stat(p);
            if (stat.isDirectory())
                return p;
        }
        catch {
            // continue
        }
    }
    throw new Error("未找到 admin/locales 目录");
};
const normalizeLocaleStructure = (input) => {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return {};
    const out = {};
    Object.entries(input).forEach(([k, v]) => {
        if (k === BRANCH_REMARK_KEY)
            return;
        if (v && typeof v === "object" && !Array.isArray(v)) {
            out[k] = normalizeLocaleStructure(v);
            return;
        }
        out[k] = String(v ?? "");
    });
    return out;
};
const importZhCnStructureToCategories = async () => {
    if (localeStructureImported)
        return;
    await i18nCategory_1.default.sync();
    const rows = await i18nCategory_1.default.findAll();
    if (rows.length === 0) {
        localeStructureImported = true;
        return;
    }
    const localeDir = await pickExistingLocaleDir();
    const yamlPath = path_1.default.join(localeDir, YAML_LOCALE_FILENAME);
    const root = await readYamlObjectFile(yamlPath);
    const structure = normalizeLocaleStructure(root);
    if (Object.keys(structure).length === 0) {
        localeStructureImported = true;
        return;
    }
    const now = Date.now();
    for (const row of rows) {
        await row.update({
            structure,
            updateTime: now
        });
    }
    localeStructureImported = true;
};
const sanitizeLocaleFilename = (input) => {
    const raw = String(input ?? "").trim();
    if (!raw)
        throw new Error("文件名不能为空");
    if (raw.includes("/") || raw.includes("\\"))
        throw new Error("文件名不合法");
    if (!/^[A-Za-z0-9._-]+$/.test(raw))
        throw new Error("文件名仅支持字母、数字、点、下划线和中划线");
    const ext = path_1.default.extname(raw).toLowerCase();
    if (!ALLOW_I18N_EXT.has(ext))
        throw new Error("仅支持 .yaml/.yml/.json 文件");
    return raw;
};
const getLocaleFilePath = async (filename) => {
    const localeDir = await pickExistingLocaleDir();
    return path_1.default.join(localeDir, filename);
};
const ensureCategoryDictionaryFilesByKey = async (categoryKeyInput) => {
    const categoryKey = normalizeCategoryKey(categoryKeyInput);
    if (!categoryKey)
        return;
    if (categoryKey === "locale")
        return;
    const list = await readI18nCategoryList();
    const category = list.find(item => item.key === categoryKey);
    if (!category)
        return;
    const folderPath = String(category.dictionaryPaths?.[0]?.path || category.key || "").trim();
    if (!folderPath)
        return;
    await ensureDictionaryFilesForFolder(folderPath, category.languages || [], category.structure || {});
};
const getI18nBaseDir = async (categoryKeyInput, createIfMissing = false) => {
    const categoryKey = normalizeCategoryKey(categoryKeyInput);
    if (!categoryKey || categoryKey === "locale")
        return I18N_LOCALE_DICTIONARY_ROOT;
    if (!isValidCategoryKey(categoryKey)) {
        throw new Error("分类 key 格式不合法");
    }
    await ensureCategoryDictionaryFilesByKey(categoryKey);
    const { fullPath } = await resolveFolderPathUnderDictionaryRoot(categoryKey);
    if (createIfMissing) {
        await promises_1.default.mkdir(fullPath, { recursive: true });
    }
    return fullPath;
};
const getI18nFilePath = async (filename, categoryKeyInput, createIfMissing = false) => {
    const baseDir = await getI18nBaseDir(categoryKeyInput, createIfMissing);
    return path_1.default.join(baseDir, filename);
};
const listLocaleLanguageOptions = async () => {
    const localeDir = await pickExistingLocaleDir();
    return listLanguageOptionsByDir(localeDir);
};
const normalizeThirdPartyText = (input, maxLength = MAX_THIRD_PARTY_TEXT_LENGTH) => String(input ?? "").trim().slice(0, maxLength);
const normalizeThirdPartyExtra = (input) => {
    if (!input)
        return {};
    if (typeof input === "string") {
        const text = input.trim();
        if (!text)
            return {};
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
            return {};
        }
        catch {
            return {};
        }
    }
    if (typeof input === "object" && !Array.isArray(input)) {
        return input;
    }
    return {};
};
const toThirdPartyConfigPayload = (item) => ({
    id: Number(item.id),
    provider: String(item.provider || ""),
    name: String(item.name || ""),
    appId: String(item.appId || ""),
    appKey: String(item.appKey || ""),
    appSecret: String(item.appSecret || ""),
    endpoint: String(item.endpoint || ""),
    bucket: String(item.bucket || ""),
    region: String(item.region || ""),
    callbackUrl: String(item.callbackUrl || ""),
    isEnabled: Boolean(item.isEnabled),
    remark: String(item.remark || ""),
    extra: item.extra && typeof item.extra === "object" && !Array.isArray(item.extra)
        ? item.extra
        : {},
    createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
    updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
});
const validateThirdPartyProvider = (providerInput) => {
    const provider = String(providerInput ?? "").trim().slice(0, MAX_THIRD_PARTY_PROVIDER_LENGTH);
    if (!provider)
        return { ok: false, message: "Provider 不能为空" };
    if (!THIRD_PARTY_PROVIDER_SET.has(provider)) {
        return { ok: false, message: "Provider 不合法" };
    }
    return { ok: true, provider };
};
const validateThirdPartyPayload = (payload) => {
    const providerResult = validateThirdPartyProvider(payload?.provider);
    if (!providerResult.ok)
        return { ok: false, message: providerResult.message };
    const name = normalizeThirdPartyText(payload?.name, MAX_THIRD_PARTY_NAME_LENGTH);
    if (!name)
        return { ok: false, message: "配置名称不能为空" };
    const appId = normalizeThirdPartyText(payload?.appId);
    const appKey = normalizeThirdPartyText(payload?.appKey);
    const appSecret = normalizeThirdPartyText(payload?.appSecret);
    const endpoint = normalizeThirdPartyText(payload?.endpoint);
    const bucket = normalizeThirdPartyText(payload?.bucket);
    const region = normalizeThirdPartyText(payload?.region, 120);
    const callbackUrl = normalizeThirdPartyText(payload?.callbackUrl);
    const remark = normalizeThirdPartyText(payload?.remark);
    const extra = normalizeThirdPartyExtra(payload?.extra);
    const isEnabled = payload?.isEnabled === undefined ? true : Boolean(payload?.isEnabled);
    return {
        ok: true,
        data: {
            provider: providerResult.provider,
            name,
            appId,
            appKey,
            appSecret,
            endpoint,
            bucket,
            region,
            callbackUrl,
            isEnabled,
            remark,
            extra
        }
    };
};
const validateSavePayload = (payload) => {
    const legacyProjectName = String(payload?.projectName ?? "").trim();
    const shortProjectName = String(payload?.shortProjectName ?? "").trim() || legacyProjectName;
    const longProjectName = String(payload?.longProjectName ?? "").trim() || shortProjectName;
    const logo = String(payload?.logo ?? "").trim();
    const copyright = String(payload?.copyright ?? "").trim();
    if (!shortProjectName)
        return "项目短名称不能为空";
    if (shortProjectName.length > MAX_SHORT_PROJECT_NAME_LENGTH) {
        return `项目短名称最多 ${MAX_SHORT_PROJECT_NAME_LENGTH} 个字符`;
    }
    if (!longProjectName)
        return "项目长名称不能为空";
    if (longProjectName.length > MAX_LONG_PROJECT_NAME_LENGTH) {
        return `项目长名称最多 ${MAX_LONG_PROJECT_NAME_LENGTH} 个字符`;
    }
    if (logo.length > MAX_LOGO_LENGTH)
        return `Logo 地址最多 ${MAX_LOGO_LENGTH} 个字符`;
    if (copyright.length > MAX_COPYRIGHT_LENGTH)
        return `版权声明最多 ${MAX_COPYRIGHT_LENGTH} 个字符`;
    return "";
};
router.post("/basic-info/get", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "GetSystemBasicInfo");
    try {
        const data = await (0, systemBasicInfo_1.getSystemBasicInfo)();
        return op.success(data, "操作成功");
    }
    catch (error) {
        return op.error(`获取系统基本信息失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/basic-info/save", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "SaveSystemBasicInfo");
    try {
        const message = validateSavePayload(req.body || {});
        if (message)
            return op.error(message, 400);
        const data = await (0, systemBasicInfo_1.saveSystemBasicInfo)(req.body || {});
        return op.success(data, "保存成功");
    }
    catch (error) {
        return op.error(`保存系统基本信息失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/third-party/provider/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "QueryThirdPartyProviderList");
    try {
        const list = THIRD_PARTY_PROVIDER_GROUPS.map(group => ({
            key: group.key,
            label: group.label,
            providers: group.providers.map(provider => ({
                value: provider.value,
                label: provider.label
            }))
        }));
        return op.success({ list }, "操作成功");
    }
    catch (error) {
        return op.error(`获取三方配置分类失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/third-party/config/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "QueryThirdPartyConfigList");
    try {
        const providerInput = String(req.body?.provider ?? "").trim();
        const keyword = String(req.body?.keyword ?? "").trim();
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Number(req.body?.pageSize) || 20);
        const where = {};
        if (providerInput) {
            const providerResult = validateThirdPartyProvider(providerInput);
            if (!providerResult.ok)
                return op.error(providerResult.message, 400);
            where.provider = providerResult.provider;
        }
        if (keyword) {
            where.name = { [sequelize_1.Op.like]: `%${keyword}%` };
        }
        const { rows, count } = await systemThirdPartyConfig_1.default.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const list = rows.map(item => toThirdPartyConfigPayload(item));
        return op.success({ list, total: count, pageSize, currentPage }, "操作成功");
    }
    catch (error) {
        return op.error(`查询三方配置失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/third-party/config/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "CreateThirdPartyConfig");
    try {
        const parsed = validateThirdPartyPayload(req.body || {});
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const duplicate = await systemThirdPartyConfig_1.default.findOne({
            where: {
                provider: parsed.data.provider,
                name: parsed.data.name
            }
        });
        if (duplicate)
            return op.error("同类型下配置名称已存在", 400);
        const created = await systemThirdPartyConfig_1.default.create(parsed.data);
        return op.success(toThirdPartyConfigPayload(created), "新增成功");
    }
    catch (error) {
        return op.error(`新增三方配置失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/third-party/config/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "UpdateThirdPartyConfig");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await systemThirdPartyConfig_1.default.findByPk(id);
        if (!row)
            return op.error("配置不存在", 404);
        const parsed = validateThirdPartyPayload(req.body || {});
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const duplicate = await systemThirdPartyConfig_1.default.findOne({
            where: {
                provider: parsed.data.provider,
                name: parsed.data.name,
                id: { [sequelize_1.Op.ne]: id }
            }
        });
        if (duplicate)
            return op.error("同类型下配置名称已存在", 400);
        await row.update(parsed.data);
        return op.success(toThirdPartyConfigPayload(row), "更新成功");
    }
    catch (error) {
        return op.error(`更新三方配置失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/third-party/config/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "DeleteThirdPartyConfig");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await systemThirdPartyConfig_1.default.findByPk(id);
        if (!row)
            return op.error("配置不存在", 404);
        await row.destroy();
        return op.success({ id }, "删除成功");
    }
    catch (error) {
        return op.error(`删除三方配置失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/i18n/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "QueryI18nFiles");
    try {
        const baseDir = await getI18nBaseDir(req.body?.categoryKey, false);
        let entries = [];
        try {
            entries = await promises_1.default.readdir(baseDir, { withFileTypes: true });
        }
        catch {
            return op.success([], "操作成功");
        }
        const list = (await Promise.all(entries
            .filter(entry => entry.isFile())
            .map(async (entry) => {
            const ext = path_1.default.extname(entry.name).toLowerCase();
            if (!ALLOW_I18N_EXT.has(ext))
                return null;
            const fullPath = path_1.default.join(baseDir, entry.name);
            const stat = await promises_1.default.stat(fullPath);
            return {
                filename: entry.name,
                ext,
                size: stat.size,
                updateTime: stat.mtimeMs
            };
        })))
            .filter(Boolean)
            .sort((a, b) => String(a.filename).localeCompare(String(b.filename)));
        return op.success(list, "操作成功");
    }
    catch (error) {
        return op.error(`获取多语言文件列表失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/i18n/get", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "GetI18nFileContent");
    try {
        const filename = sanitizeLocaleFilename(req.body?.filename);
        const fullPath = await getI18nFilePath(filename, req.body?.categoryKey, false);
        const content = await promises_1.default.readFile(fullPath, "utf8");
        return op.success({ filename, content }, "操作成功");
    }
    catch (error) {
        return op.error(`读取多语言文件失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/i18n/save", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "SaveI18nFileContent");
    try {
        const filename = sanitizeLocaleFilename(req.body?.filename);
        const content = String(req.body?.content ?? "");
        if (!content.trim())
            return op.error("文件内容不能为空", 400);
        if (content.length > MAX_I18N_CONTENT_LENGTH) {
            return op.error(`文件内容过大，最大允许 ${MAX_I18N_CONTENT_LENGTH} 字节`, 400);
        }
        const fullPath = await getI18nFilePath(filename, req.body?.categoryKey, true);
        await promises_1.default.writeFile(fullPath, content, "utf8");
        return op.success({ filename }, "保存成功");
    }
    catch (error) {
        return op.error(`保存多语言文件失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/i18n/upload", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "UploadI18nFile");
    try {
        const filename = sanitizeLocaleFilename(req.body?.filename);
        const content = String(req.body?.content ?? "");
        if (!content.trim())
            return op.error("上传文件内容不能为空", 400);
        if (content.length > MAX_I18N_CONTENT_LENGTH) {
            return op.error(`文件内容过大，最大允许 ${MAX_I18N_CONTENT_LENGTH} 字节`, 400);
        }
        const fullPath = await getI18nFilePath(filename, req.body?.categoryKey, true);
        await promises_1.default.writeFile(fullPath, content, "utf8");
        return op.success({ filename }, "上传成功");
    }
    catch (error) {
        return op.error(`上传多语言文件失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.get("/i18n/download", async (req, res) => {
    try {
        const filename = sanitizeLocaleFilename(req.query?.filename);
        const fullPath = await getI18nFilePath(filename, req.query?.categoryKey, false);
        const content = await promises_1.default.readFile(fullPath, "utf8");
        res.setHeader("Content-Type", "application/octet-stream; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
        return res.send(Buffer.from(content, "utf8"));
    }
    catch (error) {
        return res.error(`下载多语言文件失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/i18n/category/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "系统管理", "QueryI18nCategoryList");
    try {
        const [state, languageOptions] = await Promise.all([
            loadI18nCategoryState(),
            listLocaleDictionaryLanguageOptions()
        ]);
        const sorted = [...state.list].sort((a, b) => b.updateTime - a.updateTime);
        const finalList = sorted.map(item => ({
            ...item,
            readonly: state.defaultKeySet.has(String(item.key || "").trim())
        }));
        return op.success({ list: finalList, languageOptions }, "操作成功");
    }
    catch (error) {
        return op.error(`获取分类管理列表失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/i18n/category/save", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "System", "SaveI18nCategory");
    try {
        const id = Number(req.body?.id);
        const name = normalizeCategoryName(req.body?.name);
        const key = normalizeCategoryKey(req.body?.key);
        const languages = normalizeCategoryLanguages(req.body?.languages);
        const structure = parseCategoryStructure(req.body?.structure);
        const dictionaryPaths = [{ path: key }];
        if (!name)
            return op.error("Name is required", 400);
        if (name.length > MAX_I18N_CATEGORY_NAME_LENGTH) {
            return op.error(`Name length must be <= ${MAX_I18N_CATEGORY_NAME_LENGTH}`, 400);
        }
        if (!key)
            return op.error("Key is required", 400);
        if (key.length > MAX_I18N_CATEGORY_KEY_LENGTH) {
            return op.error(`Key length must be <= ${MAX_I18N_CATEGORY_KEY_LENGTH}`, 400);
        }
        if (!isValidCategoryKey(key)) {
            return op.error("Invalid key format. Use letters, numbers, dot, underscore and dash.", 400);
        }
        if (languages.length === 0)
            return op.error("At least one language is required", 400);
        const state = await loadI18nCategoryState();
        const keyDuplicated = state.list.some(item => item.key === key && item.id !== id);
        if (keyDuplicated)
            return op.error(`Duplicated key: ${key}`, 400);
        const now = Date.now();
        let saved = null;
        if (Number.isFinite(id) && id > 0) {
            const idx = state.list.findIndex(item => item.id === id);
            if (idx < 0)
                return op.error("Category not found", 404);
            const previous = state.list[idx];
            if (NON_DELETABLE_CATEGORY_KEYS.has(String(previous.key || "").trim()) && key !== previous.key) {
                return op.error("Default category key cannot be changed", 400);
            }
            const nextItem = {
                ...previous,
                name,
                key: NON_DELETABLE_CATEGORY_KEYS.has(String(previous.key || "").trim()) ? previous.key : key,
                languages,
                structure,
                dictionaryPaths: [{
                        path: NON_DELETABLE_CATEGORY_KEYS.has(String(previous.key || "").trim())
                            ? previous.key
                            : key
                    }],
                updateTime: now
            };
            state.list[idx] = nextItem;
            saved = nextItem;
        }
        else {
            if (state.list.length >= MAX_I18N_CATEGORY_COUNT) {
                return op.error(`Category count exceeds limit (${MAX_I18N_CATEGORY_COUNT})`, 400);
            }
            const nextId = state.list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
            const nextItem = {
                id: nextId,
                name,
                key,
                languages,
                structure,
                dictionaryPaths,
                createTime: now,
                updateTime: now
            };
            state.list.push(nextItem);
            saved = nextItem;
        }
        await writeI18nCategoryList(state.list);
        if (saved) {
            const folderPath = String(saved.dictionaryPaths?.[0]?.path || saved.key || "").trim();
            await ensureDictionaryFilesForFolder(folderPath, saved.languages || [], saved.structure || {});
        }
        return op.success(saved, "Saved");
    }
    catch (error) {
        return op.error(`Save category failed: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/i18n/category/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "System", "DeleteI18nCategory");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("Invalid id", 400);
        const state = await loadI18nCategoryState();
        const target = state.list.find(item => item.id === id);
        if (!target)
            return op.error("Category not found", 404);
        if (NON_DELETABLE_CATEGORY_KEYS.has(String(target.key || "").trim())) {
            return op.error("Default category cannot be deleted", 403);
        }
        const next = state.list.filter(item => item.id !== id);
        await writeI18nCategoryList(next);
        return op.success({ id }, "Deleted");
    }
    catch (error) {
        return op.error(`Delete category failed: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
