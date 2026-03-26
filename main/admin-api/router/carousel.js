"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sequelize_1 = require("sequelize");
const crypto_1 = __importDefault(require("crypto"));
const config_1 = __importDefault(require("../config"));
const carouselCategory_1 = __importDefault(require("../models/carouselCategory"));
const carouselResource_1 = __importDefault(require("../models/carouselResource"));
const resourceSystemResource_1 = __importDefault(require("../models/resourceSystemResource"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const UPLOAD_DIR = path_1.default.resolve(process.cwd(), "public", "uploads", "carousel");
const IMAGE_URL_PREFIX = "/uploads/carousel/";
const parseTriggerTypes = (input) => {
    const allow = new Set(["url", "page", "miniProgram", "app"]);
    if (!Array.isArray(input))
        return [];
    return Array.from(new Set(input.map(x => String(x).trim()).filter(x => allow.has(x))));
};
const parseImageFit = (input) => {
    const allow = ["fill", "contain", "cover", "none", "scale-down"];
    const value = String(input || "cover").trim();
    return allow.includes(value) ? value : "cover";
};
const toCategoryPayload = (item) => ({
    id: Number(item.id),
    name: item.name,
    key: item.key,
    parentId: Number(item.parentId || 0),
    triggerTypes: Array.isArray(item.triggerTypes) ? item.triggerTypes : [],
    speed: Number(item.speed),
    loop: Boolean(item.loop),
    direction: item.direction,
    createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
    updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
});
const toResourcePayload = (item, categoryName = "", resourceMap) => {
    const resourceSystemResourceId = Number(item.resourceSystemResourceId || 0);
    const linkedResource = resourceSystemResourceId > 0 ? resourceMap?.get(resourceSystemResourceId) : null;
    const resolvedName = String(linkedResource?.name || item.name || "");
    const resolvedImage = String(linkedResource?.image || item.image || "");
    return {
        id: Number(item.id),
        name: resolvedName,
        image: resolvedImage,
        fit: parseImageFit(item.fit),
        categoryId: Number(item.categoryId),
        categoryName,
        resourceSystemResourceId,
        resourceSystemResourceName: linkedResource?.name
            ? String(linkedResource.name)
            : "",
        triggerType: (item.triggerType || ""),
        triggerUrl: item.triggerUrl || "",
        triggerPagePath: item.triggerPagePath || "",
        miniProgramAppId: item.miniProgramAppId || "",
        miniProgramPagePath: item.miniProgramPagePath || "",
        appPath: item.appPath || "",
        createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
        updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
    };
};
const getMediaExtByContentType = (contentType) => {
    const normalized = contentType.toLowerCase();
    if (normalized.includes("image/png"))
        return "png";
    if (normalized.includes("image/jpeg") || normalized.includes("image/jpg"))
        return "jpg";
    if (normalized.includes("image/webp"))
        return "webp";
    if (normalized.includes("image/gif"))
        return "gif";
    if (normalized.includes("image/svg+xml"))
        return "svg";
    if (normalized.includes("image/bmp"))
        return "bmp";
    if (normalized.includes("video/mp4"))
        return "mp4";
    if (normalized.includes("video/webm"))
        return "webm";
    if (normalized.includes("video/ogg"))
        return "ogv";
    if (normalized.includes("video/quicktime"))
        return "mov";
    if (normalized.includes("video/x-msvideo"))
        return "avi";
    if (normalized.includes("video/x-matroska"))
        return "mkv";
    if (normalized.includes("video/mpeg"))
        return "mpeg";
    return "";
};
const safeUnlinkUploaded = async (imageUrl) => {
    if (!imageUrl.startsWith(IMAGE_URL_PREFIX))
        return;
    const relative = imageUrl.slice(IMAGE_URL_PREFIX.length);
    if (!relative)
        return;
    const filePath = path_1.default.join(UPLOAD_DIR, relative);
    try {
        await promises_1.default.unlink(filePath);
    }
    catch {
        // ignore
    }
};
const validateCategoryPayload = (payload, idRequired = false) => {
    const id = Number(payload?.id);
    if (idRequired && (!Number.isFinite(id) || id <= 0))
        return { ok: false, message: "缂哄皯鏈夋晥 id" };
    const name = String(payload?.name ?? "").trim();
    const key = String(payload?.key ?? "").trim();
    if (!name)
        return { ok: false, message: "绫荤洰鍚嶇О涓嶈兘涓虹┖" };
    if (!key)
        return { ok: false, message: "key 不能为空" };
    const triggerTypes = parseTriggerTypes(payload?.triggerTypes);
    const speed = Number(payload?.speed);
    if (!Number.isFinite(speed) || speed <= 0)
        return { ok: false, message: "杞挱閫熷害蹇呴』澶т簬0" };
    const loop = Boolean(payload?.loop);
    const directionRaw = String(payload?.direction ?? "horizontal").trim();
    const direction = directionRaw === "vertical" ? "vertical" : "horizontal";
    const parentIdRaw = Number(payload?.parentId ?? 0);
    const parentId = Number.isFinite(parentIdRaw) && parentIdRaw > 0 ? Math.floor(parentIdRaw) : 0;
    return { ok: true, id: idRequired ? id : undefined, data: { name, key, parentId, triggerTypes, speed, loop, direction } };
};
const buildCategoryTree = (items) => {
    const nodeMap = new Map();
    for (const item of items) {
        const node = toCategoryPayload(item);
        node.children = [];
        nodeMap.set(node.id, node);
    }
    const roots = [];
    for (const node of nodeMap.values()) {
        const parentId = Number(node.parentId || 0);
        if (parentId > 0 && nodeMap.has(parentId)) {
            nodeMap.get(parentId).children.push(node);
        }
        else {
            roots.push(node);
        }
    }
    return roots;
};
const collectDescendantIds = (startId, all) => {
    const childrenMap = new Map();
    for (const item of all) {
        const pid = Number(item.parentId || 0);
        const list = childrenMap.get(pid) ?? [];
        list.push(Number(item.id));
        childrenMap.set(pid, list);
    }
    const visited = new Set();
    const stack = [startId];
    while (stack.length > 0) {
        const current = Number(stack.pop());
        if (!Number.isFinite(current) || current <= 0 || visited.has(current))
            continue;
        visited.add(current);
        const children = childrenMap.get(current) ?? [];
        children.forEach(childId => stack.push(childId));
    }
    return Array.from(visited);
};
const validateResourcePayload = (payload, categories, idRequired = false) => {
    const id = Number(payload?.id);
    if (idRequired && (!Number.isFinite(id) || id <= 0))
        return { ok: false, message: "缂哄皯鏈夋晥 id" };
    const name = String(payload?.name ?? "").trim();
    const image = String(payload?.image ?? "").trim();
    if (/^data:(image|video)\//.test(image))
        return { ok: false, message: "璇峰厛涓婁紶鏂囦欢锛屼笉鑳戒娇鐢╞ase64" };
    const resourceSystemResourceIdRaw = Number(payload?.resourceSystemResourceId || 0);
    const resourceSystemResourceId = Number.isFinite(resourceSystemResourceIdRaw) && resourceSystemResourceIdRaw > 0
        ? Math.floor(resourceSystemResourceIdRaw)
        : 0;
    if (resourceSystemResourceId <= 0)
        return { ok: false, message: "请选择资源系统资源" };
    const fit = parseImageFit(payload?.fit);
    const categoryId = Number(payload?.categoryId);
    if (!Number.isFinite(categoryId) || categoryId <= 0)
        return { ok: false, message: "璇烽€夋嫨褰掑睘绫荤洰" };
    const category = categories.find(item => item.id === categoryId);
    if (!category)
        return { ok: false, message: "所属类目不存在" };
    const triggerTypeRaw = String(payload?.triggerType ?? "").trim();
    const triggerType = (triggerTypeRaw || "");
    if (triggerType && !category.triggerTypes.includes(triggerType)) {
        return { ok: false, message: "触发事件不在所选类目的可用范围内" };
    }
    const triggerUrl = String(payload?.triggerUrl ?? "").trim();
    const triggerPagePath = String(payload?.triggerPagePath ?? "").trim();
    const miniProgramAppId = String(payload?.miniProgramAppId ?? "").trim();
    const miniProgramPagePath = String(payload?.miniProgramPagePath ?? "").trim();
    const appPath = String(payload?.appPath ?? "").trim();
    if (triggerType === "url" && !triggerUrl)
        return { ok: false, message: "璇峰～鍐橴RL" };
    if (triggerType === "page" && !triggerPagePath)
        return { ok: false, message: "请填写页面路径" };
    if (triggerType === "miniProgram") {
        if (!miniProgramAppId)
            return { ok: false, message: "璇峰～鍐欏皬绋嬪簭AppID" };
        if (!miniProgramPagePath)
            return { ok: false, message: "璇峰～鍐欏皬绋嬪簭椤甸潰璺緞" };
    }
    if (triggerType === "app" && !appPath)
        return { ok: false, message: "璇峰～鍐橝pp璺宠浆璺緞" };
    return {
        ok: true,
        id: idRequired ? id : undefined,
        data: {
            name,
            image,
            fit,
            categoryId,
            resourceSystemResourceId,
            triggerType,
            triggerUrl,
            triggerPagePath,
            miniProgramAppId,
            miniProgramPagePath,
            appPath
        }
    };
};
router.post("/resource/upload", express_1.default.raw({
    type: ["image/*", "video/*", "application/octet-stream"],
    limit: config_1.default.api.bodyLimit
}), async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "UploadCarouselResourceImage");
    try {
        const body = req.body;
        if (!body || !Buffer.isBuffer(body) || body.length === 0)
            return op.error("缂哄皯璧勬簮鏂囦欢", 400);
        const contentType = String(req.headers["content-type"] || "application/octet-stream");
        const ext = getMediaExtByContentType(contentType) || "bin";
        const filename = `${Date.now()}-${crypto_1.default.randomUUID().replace(/-/g, "")}.${ext}`;
        await promises_1.default.mkdir(UPLOAD_DIR, { recursive: true });
        await promises_1.default.writeFile(path_1.default.join(UPLOAD_DIR, filename), body);
        return op.success({ imageUrl: `${IMAGE_URL_PREFIX}${filename}`, mediaUrl: `${IMAGE_URL_PREFIX}${filename}` }, "涓婁紶鎴愬姛");
    }
    catch (error) {
        return op.error(`涓婁紶璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/category/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "QueryCarouselCategory");
    try {
        const name = String(req.body?.name ?? "").trim();
        const key = String(req.body?.key ?? "").trim();
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Number(req.body?.pageSize) || 10);
        const where = {};
        if (name)
            where.name = { [sequelize_1.Op.like]: `%${name}%` };
        if (key)
            where.key = { [sequelize_1.Op.like]: `%${key}%` };
        const rows = await carouselCategory_1.default.findAll({
            where,
            order: [["parentId", "ASC"], ["id", "ASC"]]
        });
        const treeList = buildCategoryTree(rows);
        const total = treeList.length;
        const start = (currentPage - 1) * pageSize;
        const list = treeList.slice(start, start + pageSize);
        return op.success({
            list,
            total,
            pageSize,
            currentPage
        }, "鎿嶄綔鎴愬姛");
    }
    catch (error) {
        return op.error(`鏌ヨ绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/category/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "CreateCarouselCategory");
    try {
        const parsed = validateCategoryPayload(req.body, false);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const exists = await carouselCategory_1.default.findOne({ where: { key: parsed.data.key } });
        if (exists)
            return op.error("key 鍊煎凡瀛樺湪", 400);
        if (parsed.data.parentId > 0) {
            const parentExists = await carouselCategory_1.default.findByPk(parsed.data.parentId);
            if (!parentExists)
                return op.error("父级类目不存在", 400);
        }
        await carouselCategory_1.default.create(parsed.data);
        return op.success({}, "鏂板鎴愬姛");
    }
    catch (error) {
        return op.error(`鏂板绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/category/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "UpdateCarouselCategory");
    try {
        const parsed = validateCategoryPayload(req.body, true);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const exists = await carouselCategory_1.default.findOne({
            where: {
                key: parsed.data.key,
                id: { [sequelize_1.Op.ne]: parsed.id }
            }
        });
        if (exists)
            return op.error("key 鍊煎凡瀛樺湪", 400);
        const row = await carouselCategory_1.default.findByPk(parsed.id);
        if (!row)
            return op.error("类目不存在", 404);
        if (Number(parsed.data.parentId || 0) === Number(parsed.id))
            return op.error("父级类目不能选择自己", 400);
        if (parsed.data.parentId > 0) {
            const all = await carouselCategory_1.default.findAll({ attributes: ["id", "parentId"] });
            const descendants = collectDescendantIds(Number(parsed.id), all.map(item => ({ id: Number(item.id), parentId: Number(item.parentId || 0) })));
            if (descendants.includes(Number(parsed.data.parentId))) {
                return op.error("父级类目不能选择当前类目或其子类目", 400);
            }
        }
        await row.update(parsed.data);
        return op.success({}, "鏇存柊鎴愬姛");
    }
    catch (error) {
        return op.error(`鏇存柊绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/category/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "DeleteCarouselCategory");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缂哄皯鏈夋晥 id", 400);
        const allCategories = await carouselCategory_1.default.findAll({ attributes: ["id", "parentId"] });
        const deleteIds = collectDescendantIds(id, allCategories.map(item => ({ id: Number(item.id), parentId: Number(item.parentId || 0) })));
        const inUse = await carouselResource_1.default.count({ where: { categoryId: { [sequelize_1.Op.in]: deleteIds } } });
        if (inUse > 0)
            return op.error("褰撳墠绫荤洰涓嬪瓨鍦ㄨ祫婧愶紝涓嶈兘鍒犻櫎", 400);
        const deleted = await carouselCategory_1.default.destroy({ where: { id: { [sequelize_1.Op.in]: deleteIds } } });
        if (!deleted)
            return op.error("类目不存在", 404);
        return op.success({ id, deletedIds: deleteIds }, "鍒犻櫎鎴愬姛");
    }
    catch (error) {
        return op.error(`鍒犻櫎绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/resource/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "QueryCarouselResource");
    try {
        const name = String(req.body?.name ?? "").trim();
        const categoryId = Number(req.body?.categoryId || 0);
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Number(req.body?.pageSize) || 10);
        const where = {};
        if (name)
            where.name = { [sequelize_1.Op.like]: `%${name}%` };
        if (categoryId > 0) {
            const allCategories = await carouselCategory_1.default.findAll({ attributes: ["id", "parentId"] });
            const matchIds = collectDescendantIds(categoryId, allCategories.map(item => ({ id: Number(item.id), parentId: Number(item.parentId || 0) })));
            where.categoryId = { [sequelize_1.Op.in]: matchIds };
        }
        const [resources, total, categories] = await Promise.all([
            carouselResource_1.default.findAll({
                where,
                order: [["id", "DESC"]],
                offset: (currentPage - 1) * pageSize,
                limit: pageSize
            }),
            carouselResource_1.default.count({ where }),
            carouselCategory_1.default.findAll({ attributes: ["id", "name"] })
        ]);
        const resourceSystemIds = Array.from(new Set(resources
            .map(item => Number(item.resourceSystemResourceId || 0))
            .filter(id => Number.isFinite(id) && id > 0)));
        const linkedResources = resourceSystemIds.length > 0
            ? await resourceSystemResource_1.default.findAll({
                where: { id: { [sequelize_1.Op.in]: resourceSystemIds } },
                attributes: ["id", "name", "image"]
            })
            : [];
        const linkedResourceMap = new Map(linkedResources.map(item => [Number(item.id), item]));
        const categoryMap = new Map(categories.map(item => [Number(item.id), item.name]));
        const list = resources.map(item => toResourcePayload(item, categoryMap.get(Number(item.categoryId)) || "", linkedResourceMap));
        return op.success({ list, total, pageSize, currentPage }, "鎿嶄綔鎴愬姛");
    }
    catch (error) {
        return op.error(`鏌ヨ璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/resource/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "CreateCarouselResource");
    try {
        const categories = await carouselCategory_1.default.findAll({ attributes: ["id", "triggerTypes"] });
        const parsed = validateResourcePayload(req.body, categories.map(item => ({ id: Number(item.id), triggerTypes: item.triggerTypes || [] })), false);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const linkedResource = await resourceSystemResource_1.default.findByPk(Number(parsed.data.resourceSystemResourceId), { attributes: ["id", "name", "image"] });
        if (!linkedResource)
            return op.error("所选资源系统资源不存在", 400);
        if (!String(linkedResource.image || "").trim()) {
            return op.error("所选资源无可用地址", 400);
        }
        const payload = {
            ...parsed.data,
            name: String(linkedResource.name || parsed.data.name),
            image: String(linkedResource.image || parsed.data.image)
        };
        await carouselResource_1.default.create(payload);
        return op.success({}, "鏂板鎴愬姛");
    }
    catch (error) {
        return op.error(`鏂板璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/resource/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "UpdateCarouselResource");
    try {
        const categories = await carouselCategory_1.default.findAll({ attributes: ["id", "triggerTypes"] });
        const parsed = validateResourcePayload(req.body, categories.map(item => ({ id: Number(item.id), triggerTypes: item.triggerTypes || [] })), true);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const linkedResource = await resourceSystemResource_1.default.findByPk(Number(parsed.data.resourceSystemResourceId), { attributes: ["id", "name", "image"] });
        if (!linkedResource)
            return op.error("所选资源系统资源不存在", 400);
        if (!String(linkedResource.image || "").trim()) {
            return op.error("所选资源无可用地址", 400);
        }
        const row = await carouselResource_1.default.findByPk(parsed.id);
        if (!row)
            return op.error("资源不存在", 404);
        const oldImage = row.image;
        const payload = {
            ...parsed.data,
            name: String(linkedResource.name || parsed.data.name),
            image: String(linkedResource.image || parsed.data.image)
        };
        await row.update(payload);
        if (oldImage && oldImage !== payload.image) {
            await safeUnlinkUploaded(oldImage);
        }
        return op.success({}, "鏇存柊鎴愬姛");
    }
    catch (error) {
        return op.error(`鏇存柊璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/resource/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "轮播图管理", "DeleteCarouselResource");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缂哄皯鏈夋晥 id", 400);
        const row = await carouselResource_1.default.findByPk(id);
        if (!row)
            return op.error("资源不存在", 404);
        const image = row.image;
        await row.destroy();
        await safeUnlinkUploaded(image);
        return op.success({ id }, "鍒犻櫎鎴愬姛");
    }
    catch (error) {
        return op.error(`鍒犻櫎璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
