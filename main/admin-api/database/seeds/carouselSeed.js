"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateLegacyCarouselData = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const carouselCategory_1 = __importDefault(require("../../models/carouselCategory"));
const carouselResource_1 = __importDefault(require("../../models/carouselResource"));
const LEGACY_JSON_PATH = path_1.default.resolve(process.cwd(), "data", "carousel-data.json");
const UPLOAD_DIR = path_1.default.resolve(process.cwd(), "public", "uploads", "carousel");
const IMAGE_URL_PREFIX = "/uploads/carousel/";
const parseTriggerTypes = (input) => {
    const allow = new Set(["url", "page", "miniProgram", "app"]);
    if (!Array.isArray(input))
        return [];
    return Array.from(new Set(input
        .map(item => String(item || "").trim())
        .filter(item => allow.has(item))));
};
const parseDirection = (input) => {
    return String(input || "").trim() === "vertical" ? "vertical" : "horizontal";
};
const parseImageFit = (input) => {
    const allow = ["fill", "contain", "cover", "none", "scale-down"];
    const value = String(input || "cover").trim();
    return allow.includes(value) ? value : "cover";
};
const decodeBase64Image = (raw) => {
    const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match)
        return null;
    const mime = match[1].toLowerCase();
    const base64 = match[2];
    const extMap = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/svg+xml": "svg",
        "image/bmp": "bmp"
    };
    const ext = extMap[mime] || "bin";
    try {
        return {
            ext,
            content: Buffer.from(base64, "base64")
        };
    }
    catch {
        return null;
    }
};
const persistLegacyImage = async (image) => {
    if (!image || !image.startsWith("data:image/"))
        return image;
    const decoded = decodeBase64Image(image);
    if (!decoded)
        return "";
    await promises_1.default.mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `migrated-${Date.now()}-${crypto_1.default.randomUUID().replace(/-/g, "")}.${decoded.ext}`;
    await promises_1.default.writeFile(path_1.default.join(UPLOAD_DIR, filename), decoded.content);
    return `${IMAGE_URL_PREFIX}${filename}`;
};
const migrateLegacyCarouselData = async () => {
    let content = "";
    try {
        content = await promises_1.default.readFile(LEGACY_JSON_PATH, "utf-8");
    }
    catch (error) {
        if (error?.code === "ENOENT")
            return;
        throw error;
    }
    const parsed = JSON.parse(content);
    const legacyCategories = Array.isArray(parsed.categories) ? parsed.categories : [];
    const legacyResources = Array.isArray(parsed.resources) ? parsed.resources : [];
    if (legacyCategories.length === 0 && legacyResources.length === 0)
        return;
    const categoryIdMap = new Map();
    const categoryKeyMap = new Map();
    let insertedCategoryCount = 0;
    let insertedResourceCount = 0;
    for (const item of legacyCategories) {
        const name = String(item.name || "").trim();
        const key = String(item.key || "").trim();
        if (!name || !key)
            continue;
        const triggerTypes = parseTriggerTypes(item.triggerTypes);
        const speed = Math.max(1, Number(item.speed) || 3000);
        const loop = Boolean(item.loop);
        const direction = parseDirection(item.direction);
        const existing = await carouselCategory_1.default.findOne({ where: { key } });
        const row = existing
            ? await existing.update({ name, triggerTypes, speed, loop, direction })
            : await carouselCategory_1.default.create({ name, key, triggerTypes, speed, loop, direction });
        if (!existing)
            insertedCategoryCount += 1;
        const newId = Number(row.id);
        const oldId = Number(item.id || 0);
        if (oldId > 0)
            categoryIdMap.set(oldId, newId);
        categoryKeyMap.set(key, newId);
    }
    if (legacyResources.length > 0) {
        const allCategories = await carouselCategory_1.default.findAll({ attributes: ["id", "key", "triggerTypes"] });
        const categoriesById = new Map();
        for (const item of allCategories) {
            categoriesById.set(Number(item.id), {
                triggerTypes: Array.isArray(item.triggerTypes) ? item.triggerTypes : []
            });
            categoryKeyMap.set(String(item.key || ""), Number(item.id));
        }
        for (const item of legacyResources) {
            const name = String(item.name || "").trim();
            if (!name)
                continue;
            const oldCategoryId = Number(item.categoryId || 0);
            let categoryId = categoryIdMap.get(oldCategoryId) || 0;
            if (!categoryId && categoryKeyMap.size > 0) {
                categoryId = Number(categoryKeyMap.values().next().value || 0);
            }
            if (!categoryId)
                continue;
            const imageRaw = String(item.image || "").trim();
            const image = await persistLegacyImage(imageRaw);
            if (!image)
                continue;
            const fit = parseImageFit(item.fit);
            const categoryInfo = categoriesById.get(categoryId);
            const triggerTypeRaw = String(item.triggerType || "").trim();
            const triggerType = categoryInfo?.triggerTypes.includes(triggerTypeRaw) ? triggerTypeRaw : "";
            await carouselResource_1.default.create({
                name,
                image,
                fit,
                categoryId,
                triggerType,
                triggerUrl: String(item.triggerUrl || "").trim(),
                triggerPagePath: String(item.triggerPagePath || "").trim(),
                miniProgramAppId: String(item.miniProgramAppId || "").trim(),
                miniProgramPagePath: String(item.miniProgramPagePath || "").trim(),
                appPath: String(item.appPath || "").trim()
            });
            insertedResourceCount += 1;
        }
    }
};
exports.migrateLegacyCarouselData = migrateLegacyCarouselData;
