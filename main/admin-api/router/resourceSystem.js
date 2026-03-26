"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const sequelize_1 = require("sequelize");
const ali_oss_1 = __importDefault(require("ali-oss"));
const cos_nodejs_sdk_v5_1 = __importDefault(require("cos-nodejs-sdk-v5"));
const minio_1 = __importDefault(require("minio"));
const qiniu_1 = __importDefault(require("qiniu"));
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = __importDefault(require("../config"));
const resourceSystemCategory_1 = __importDefault(require("../models/resourceSystemCategory"));
const resourceSystemResource_1 = __importDefault(require("../models/resourceSystemResource"));
const resourceSystemStorageLocal_1 = __importDefault(require("../models/resourceSystemStorageLocal"));
const resourceSystemStorageQiniu_1 = __importDefault(require("../models/resourceSystemStorageQiniu"));
const resourceSystemStorageAliyun_1 = __importDefault(require("../models/resourceSystemStorageAliyun"));
const resourceSystemStorageTencent_1 = __importDefault(require("../models/resourceSystemStorageTencent"));
const resourceSystemStorageMinio_1 = __importDefault(require("../models/resourceSystemStorageMinio"));
const resourceSystemStorageAws_1 = __importDefault(require("../models/resourceSystemStorageAws"));
const operationLogger_1 = require("../services/operationLogger");
const router = express_1.default.Router();
const LOCAL_ROOT_DIR = path_1.default.resolve(process.cwd(), "public", "uploads", "resource-system");
const LOCAL_URL_PREFIX = "/uploads/resource-system/";
const UNCATEGORIZED_OBJECT_PREFIX = "uncategorized";
const STORAGE_PROVIDER_VALUES = [
    "local",
    "qiniu",
    "aliyun",
    "tencent",
    "minio",
    "aws"
];
const STORAGE_PROVIDER_SET = new Set(STORAGE_PROVIDER_VALUES);
const RESOURCE_FILE_TYPE_GROUPS = [
    "image",
    "video",
    "text",
    "audio"
];
const RESOURCE_FILE_TYPE_GROUP_SET = new Set(RESOURCE_FILE_TYPE_GROUPS);
const RESOURCE_FILE_SUBTYPE_OPTIONS = {
    image: ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"],
    video: ["mp4", "webm", "ogv", "mov", "avi", "mkv", "mpeg"],
    text: ["txt", "md", "json", "xml", "csv", "html"],
    audio: ["mp3", "wav", "ogg", "m4a", "aac", "flac"]
};
const RESOURCE_FILE_TYPE_LABEL = {
    image: "图片",
    video: "视频",
    text: "文本",
    audio: "语音"
};
const STORAGE_PROVIDER_LABEL = {
    local: "鏈湴瀛樺偍",
    qiniu: "七牛云",
    aliyun: "闃块噷浜?OSS",
    tencent: "鑵捐浜?COS",
    minio: "MinIO",
    aws: "Amazon S3"
};
const LOCAL_DEFAULT_NAME = "鏈湴榛樿瀛樺偍";
const providerModels = {
    local: resourceSystemStorageLocal_1.default,
    qiniu: resourceSystemStorageQiniu_1.default,
    aliyun: resourceSystemStorageAliyun_1.default,
    tencent: resourceSystemStorageTencent_1.default,
    minio: resourceSystemStorageMinio_1.default,
    aws: resourceSystemStorageAws_1.default
};
const parseTriggerTypes = (input) => {
    const allow = new Set(["url", "page", "miniProgram", "app"]);
    if (!Array.isArray(input))
        return [];
    return Array.from(new Set(input
        .map((x) => String(x).trim())
        .filter((x) => allow.has(x))));
};
const parseImageFit = (input) => {
    const allow = ["fill", "contain", "cover", "none", "scale-down"];
    const value = String(input || "cover").trim();
    return allow.includes(value) ? value : "cover";
};
const parseStorageProvider = (input) => {
    const value = String(input || "local").trim();
    return STORAGE_PROVIDER_SET.has(value) ? value : "local";
};
const parseResourceFileTypeGroup = (input) => {
    const value = String(input || "image").trim();
    return RESOURCE_FILE_TYPE_GROUP_SET.has(value) ? value : "image";
};
const normalizeResourceFileSubtypes = (group, input) => {
    const allowSet = new Set(RESOURCE_FILE_SUBTYPE_OPTIONS[group] || []);
    if (!Array.isArray(input)) {
        return [...allowSet];
    }
    const picked = Array.from(new Set(input
        .map((item) => String(item || "")
        .trim()
        .toLowerCase()
        .replace(/^\./, ""))
        .filter(Boolean)
        .filter(item => allowSet.has(item))));
    return picked.length > 0 ? picked : [...allowSet];
};
const formatMb = (bytes) => {
    const num = Number(bytes || 0);
    return Number.isFinite(num) ? Number((num / 1024 / 1024).toFixed(2)) : 0;
};
const withHttpPrefix = (value) => {
    const v = String(value || "").trim();
    if (!v)
        return "";
    if (/^https?:\/\//i.test(v))
        return v;
    return `https://${v}`;
};
const normalizeStorageBasePath = (value) => {
    return String(value ?? "")
        .trim()
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
};
const getMediaExtByContentType = (contentType) => {
    const normalized = contentType.toLowerCase();
    if (normalized.includes("image/png"))
        return "png";
    if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) {
        return "jpg";
    }
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
    if (normalized.includes("text/plain"))
        return "txt";
    if (normalized.includes("text/markdown"))
        return "md";
    if (normalized.includes("application/json"))
        return "json";
    if (normalized.includes("application/xml") || normalized.includes("text/xml"))
        return "xml";
    if (normalized.includes("text/csv"))
        return "csv";
    if (normalized.includes("text/html"))
        return "html";
    if (normalized.includes("audio/mpeg"))
        return "mp3";
    if (normalized.includes("audio/wav") || normalized.includes("audio/x-wav"))
        return "wav";
    if (normalized.includes("audio/ogg"))
        return "ogg";
    if (normalized.includes("audio/mp4"))
        return "m4a";
    if (normalized.includes("audio/aac"))
        return "aac";
    if (normalized.includes("audio/flac"))
        return "flac";
    return "bin";
};
const getExtFromUrl = (url) => {
    const clean = String(url || "").split("?")[0].trim().toLowerCase();
    const idx = clean.lastIndexOf(".");
    if (idx < 0 || idx === clean.length - 1)
        return "";
    return clean.slice(idx + 1);
};
const normalizeObjectKey = (basePath, ext) => {
    const dateSegment = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const cleanBase = String(basePath || "")
        .replace(/\\/g, "/")
        .replace(/^\/+|\/+$/g, "");
    const name = `${Date.now()}-${crypto_1.default.randomUUID().replace(/-/g, "")}.${ext}`;
    return cleanBase ? `${cleanBase}/${dateSegment}/${name}` : `${dateSegment}/${name}`;
};
const joinObjectPath = (...parts) => {
    return parts
        .map(item => String(item || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
        .filter(Boolean)
        .join("/");
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
const ensureLocalStorageConfig = async () => {
    const first = await resourceSystemStorageLocal_1.default.findOne({ order: [["id", "ASC"]] });
    if (first) {
        if (!String(first.name || "").trim()) {
            await first.update({ name: LOCAL_DEFAULT_NAME });
        }
        return first;
    }
    return resourceSystemStorageLocal_1.default.create({
        name: LOCAL_DEFAULT_NAME,
        basePath: "resource-system",
        remark: "绯荤粺榛樿鏈湴瀛樺偍"
    });
};
const ensureLocalStorageConfigs = async () => {
    await ensureLocalStorageConfig();
    return resourceSystemStorageLocal_1.default.findAll({ order: [["id", "ASC"]] });
};
const toStorageOption = (provider, row) => ({
    provider,
    configId: Number(row.id),
    name: String(row.name || "").trim(),
    providerLabel: STORAGE_PROVIDER_LABEL[provider],
    value: `${provider}:${Number(row.id)}`,
    isEnabled: provider === "local" ? true : Boolean(row.isEnabled)
});
const listAllStorageOptions = async (enabledOnly = false) => {
    const localRows = await ensureLocalStorageConfigs();
    const list = localRows.map(item => toStorageOption("local", item));
    for (const provider of STORAGE_PROVIDER_VALUES) {
        if (provider === "local")
            continue;
        const rows = await providerModels[provider].findAll({
            where: enabledOnly ? { isEnabled: true } : undefined,
            order: [["id", "DESC"]]
        });
        rows.forEach((item) => list.push(toStorageOption(provider, item)));
    }
    return list;
};
const getStorageConfig = async (provider, configId, opts) => {
    if (provider === "local") {
        if (configId > 0) {
            return resourceSystemStorageLocal_1.default.findByPk(configId);
        }
        return ensureLocalStorageConfig();
    }
    const row = await providerModels[provider].findByPk(configId);
    if (!row)
        return null;
    if (opts?.enabledOnly && !Boolean(row.isEnabled))
        return null;
    return row;
};
const queryStorageMetrics = async (provider, configId) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const whereBase = { storageProvider: provider, storageConfigId: configId };
    const [totalBytes, todayBytes] = await Promise.all([
        resourceSystemResource_1.default.sum("fileSize", { where: whereBase }),
        resourceSystemResource_1.default.sum("fileSize", {
            where: { ...whereBase, createdAt: { [sequelize_1.Op.gte]: startOfDay } }
        })
    ]);
    return {
        storageUsedMb: formatMb(totalBytes || 0),
        dailyTrafficUsedMb: formatMb(todayBytes || 0)
    };
};
const qiniuZoneMap = {
    z0: qiniu_1.default.zone.Zone_z0,
    z1: qiniu_1.default.zone.Zone_z1,
    z2: qiniu_1.default.zone.Zone_z2,
    na0: qiniu_1.default.zone.Zone_na0,
    as0: qiniu_1.default.zone.Zone_as0
};
const uploadByStorage = async (params) => {
    const { provider, config, contentType, body } = params;
    const ext = getMediaExtByContentType(contentType);
    const objectPathPrefix = joinObjectPath(params.objectPathPrefix);
    if (provider === "local") {
        const basePath = joinObjectPath(String(config.basePath || "resource-system"), objectPathPrefix);
        const objectKey = normalizeObjectKey(basePath, ext);
        const fullPath = path_1.default.join(LOCAL_ROOT_DIR, objectKey);
        await promises_1.default.mkdir(path_1.default.dirname(fullPath), { recursive: true });
        await promises_1.default.writeFile(fullPath, body);
        return {
            imageUrl: `${LOCAL_URL_PREFIX}${objectKey.replace(/\\/g, "/")}`,
            objectKey
        };
    }
    if (provider === "qiniu") {
        const objectKey = normalizeObjectKey(objectPathPrefix, ext);
        const conf = new qiniu_1.default.conf.Config();
        conf.zone =
            qiniuZoneMap[String(config.zone || "z0")] || qiniu_1.default.zone.Zone_z0;
        const mac = new qiniu_1.default.auth.digest.Mac(String(config.accessKey || ""), String(config.secretKey || ""));
        const putPolicy = new qiniu_1.default.rs.PutPolicy({
            scope: `${config.bucket}:${objectKey}`
        });
        const uploadToken = putPolicy.uploadToken(mac);
        const formUploader = new qiniu_1.default.form_up.FormUploader(conf);
        await new Promise((resolve, reject) => {
            formUploader.put(uploadToken, objectKey, body, new qiniu_1.default.form_up.PutExtra(), (err, _body, info) => {
                if (err)
                    return reject(err);
                if (!info || info.statusCode !== 200) {
                    return reject(new Error(`涓冪墰涓婁紶澶辫触锛岀姸鎬佺爜: ${info?.statusCode ?? "unknown"}`));
                }
                resolve();
            });
        });
        const domain = withHttpPrefix(String(config.domain || ""));
        return { imageUrl: `${domain}/${objectKey}`, objectKey };
    }
    if (provider === "aliyun") {
        const objectKey = normalizeObjectKey(objectPathPrefix, ext);
        const endpoint = String(config.endpoint || "").trim();
        const client = new ali_oss_1.default({
            region: String(config.region || "").trim(),
            bucket: String(config.bucket || "").trim(),
            endpoint: endpoint || undefined,
            accessKeyId: String(config.accessKeyId || "").trim(),
            accessKeySecret: String(config.accessKeySecret || "").trim()
        });
        await client.put(objectKey, body, {
            headers: { "Content-Type": contentType }
        });
        const domain = withHttpPrefix(String(config.domain || ""));
        const imageUrl = domain
            ? `${domain}/${objectKey}`
            : endpoint
                ? `${withHttpPrefix(endpoint)}/${objectKey}`
                : objectKey;
        return { imageUrl, objectKey };
    }
    if (provider === "tencent") {
        const objectKey = normalizeObjectKey(objectPathPrefix, ext);
        const cos = new cos_nodejs_sdk_v5_1.default({
            SecretId: String(config.secretId || "").trim(),
            SecretKey: String(config.secretKey || "").trim()
        });
        await new Promise((resolve, reject) => {
            cos.putObject({
                Bucket: String(config.bucket || "").trim(),
                Region: String(config.region || "").trim(),
                Key: objectKey,
                Body: body,
                ContentType: contentType
            }, (err) => {
                if (err)
                    return reject(err);
                resolve();
            });
        });
        const domain = withHttpPrefix(String(config.domain || ""));
        const imageUrl = domain
            ? `${domain}/${objectKey}`
            : `https://${String(config.bucket || "").trim()}.cos.${String(config.region || "").trim()}.myqcloud.com/${objectKey}`;
        return { imageUrl, objectKey };
    }
    if (provider === "minio") {
        const basePath = joinObjectPath(String(config.basePath || ""), objectPathPrefix);
        const objectKey = normalizeObjectKey(basePath, ext);
        const client = new minio_1.default.Client({
            endPoint: String(config.endpoint || "").trim(),
            port: Number(config.port || 9000),
            useSSL: Boolean(config.useSSL),
            accessKey: String(config.accessKey || "").trim(),
            secretKey: String(config.secretKey || "").trim()
        });
        const bucket = String(config.bucket || "").trim();
        const exists = await client.bucketExists(bucket);
        if (!exists)
            await client.makeBucket(bucket, "us-east-1");
        await client.putObject(bucket, objectKey, body, body.length, {
            "Content-Type": contentType
        });
        const protocol = Boolean(config.useSSL) ? "https" : "http";
        return {
            imageUrl: `${protocol}://${String(config.endpoint || "").trim()}:${Number(config.port || 9000)}/${bucket}/${objectKey}`,
            objectKey
        };
    }
    const objectKey = normalizeObjectKey(objectPathPrefix, ext);
    const endpoint = String(config.endpoint || "").trim();
    const s3 = new client_s3_1.S3Client({
        region: String(config.region || "").trim(),
        endpoint: endpoint || undefined,
        forcePathStyle: Boolean(endpoint),
        credentials: {
            accessKeyId: String(config.accessKeyId || "").trim(),
            secretAccessKey: String(config.secretAccessKey || "").trim()
        }
    });
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: String(config.bucket || "").trim(),
        Key: objectKey,
        Body: body,
        ContentType: contentType
    }));
    const domain = withHttpPrefix(String(config.domain || ""));
    const imageUrl = domain
        ? `${domain}/${objectKey}`
        : endpoint
            ? `${withHttpPrefix(endpoint)}/${String(config.bucket || "").trim()}/${objectKey}`
            : `https://${String(config.bucket || "").trim()}.s3.${String(config.region || "").trim()}.amazonaws.com/${objectKey}`;
    return { imageUrl, objectKey };
};
const deleteByStorage = async (params) => {
    const { provider, config, imageUrl, objectKey } = params;
    if (!objectKey)
        return;
    if (provider === "local") {
        if (!imageUrl.startsWith(LOCAL_URL_PREFIX))
            return;
        const filePath = path_1.default.join(LOCAL_ROOT_DIR, imageUrl.slice(LOCAL_URL_PREFIX.length));
        await promises_1.default.unlink(filePath).catch(() => undefined);
        return;
    }
    if (provider === "qiniu") {
        const mac = new qiniu_1.default.auth.digest.Mac(String(config.accessKey || "").trim(), String(config.secretKey || "").trim());
        const bucketManager = new qiniu_1.default.rs.BucketManager(mac, new qiniu_1.default.conf.Config());
        await new Promise(resolve => {
            bucketManager.delete(String(config.bucket || "").trim(), objectKey, () => resolve());
        });
        return;
    }
    if (provider === "aliyun") {
        const client = new ali_oss_1.default({
            region: String(config.region || "").trim(),
            bucket: String(config.bucket || "").trim(),
            endpoint: String(config.endpoint || "").trim() || undefined,
            accessKeyId: String(config.accessKeyId || "").trim(),
            accessKeySecret: String(config.accessKeySecret || "").trim()
        });
        await client.delete(objectKey).catch(() => undefined);
        return;
    }
    if (provider === "tencent") {
        const cos = new cos_nodejs_sdk_v5_1.default({
            SecretId: String(config.secretId || "").trim(),
            SecretKey: String(config.secretKey || "").trim()
        });
        await new Promise(resolve => {
            cos.deleteObject({
                Bucket: String(config.bucket || "").trim(),
                Region: String(config.region || "").trim(),
                Key: objectKey
            }, () => resolve());
        });
        return;
    }
    if (provider === "minio") {
        const client = new minio_1.default.Client({
            endPoint: String(config.endpoint || "").trim(),
            port: Number(config.port || 9000),
            useSSL: Boolean(config.useSSL),
            accessKey: String(config.accessKey || "").trim(),
            secretKey: String(config.secretKey || "").trim()
        });
        await client
            .removeObject(String(config.bucket || "").trim(), objectKey)
            .catch(() => undefined);
        return;
    }
    const endpoint = String(config.endpoint || "").trim();
    const s3 = new client_s3_1.S3Client({
        region: String(config.region || "").trim(),
        endpoint: endpoint || undefined,
        forcePathStyle: Boolean(endpoint),
        credentials: {
            accessKeyId: String(config.accessKeyId || "").trim(),
            secretAccessKey: String(config.secretAccessKey || "").trim()
        }
    });
    await s3
        .send(new client_s3_1.DeleteObjectCommand({
        Bucket: String(config.bucket || "").trim(),
        Key: objectKey
    }))
        .catch(() => undefined);
};
const toCategoryPayload = (item, storageMap) => {
    const provider = parseStorageProvider(item.storageProvider);
    const storageConfigId = Number(item.storageConfigId || 0);
    const storage = storageMap.get(`${provider}:${storageConfigId}`);
    return {
        id: Number(item.id),
        name: String(item.name || ""),
        key: String(item.key || ""),
        parentId: Number(item.parentId || 0),
        storageProvider: provider,
        storageConfigId,
        storageValue: `${provider}:${storageConfigId}`,
        storageName: storage?.name || "",
        storageProviderLabel: storage?.providerLabel || STORAGE_PROVIDER_LABEL[provider],
        fileTypeGroup: parseResourceFileTypeGroup(item.fileTypeGroup),
        fileSubtypes: normalizeResourceFileSubtypes(parseResourceFileTypeGroup(item.fileTypeGroup), item.fileSubtypes),
        triggerTypes: Array.isArray(item.triggerTypes) ? item.triggerTypes : [],
        speed: Number(item.speed || 3000),
        loop: Boolean(item.loop),
        direction: item.direction,
        createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
        updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
    };
};
const toResourcePayload = (item, categoryName, storageMap) => {
    const provider = parseStorageProvider(item.storageProvider);
    const storageConfigId = Number(item.storageConfigId || 0);
    const storage = storageMap.get(`${provider}:${storageConfigId}`);
    return {
        id: Number(item.id),
        name: String(item.name || ""),
        image: String(item.image || ""),
        fit: item.fit,
        categoryId: Number(item.categoryId),
        categoryName,
        triggerType: (item.triggerType || ""),
        triggerUrl: String(item.triggerUrl || ""),
        triggerPagePath: String(item.triggerPagePath || ""),
        miniProgramAppId: String(item.miniProgramAppId || ""),
        miniProgramPagePath: String(item.miniProgramPagePath || ""),
        appPath: String(item.appPath || ""),
        storageProvider: provider,
        storageConfigId,
        storageName: storage?.name || "",
        storageProviderLabel: storage?.providerLabel || STORAGE_PROVIDER_LABEL[provider],
        fileSize: Number(item.fileSize || 0),
        storageObjectKey: String(item.storageObjectKey || ""),
        createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
        updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
    };
};
const buildCategoryTree = (items, storageMap) => {
    const nodeMap = new Map();
    for (const item of items) {
        const node = toCategoryPayload(item, storageMap);
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
const validateCategoryPayload = (payload, localConfigId, idRequired = false) => {
    const id = Number(payload?.id);
    if (idRequired && (!Number.isFinite(id) || id <= 0)) {
        return { ok: false, message: "缂哄皯鏈夋晥 id" };
    }
    const name = String(payload?.name ?? "").trim();
    const key = String(payload?.key ?? "").trim();
    if (!name)
        return { ok: false, message: "绫荤洰鍚嶇О涓嶈兘涓虹┖" };
    if (!key)
        return { ok: false, message: "Key 涓嶈兘涓虹┖" };
    const triggerTypes = parseTriggerTypes(payload?.triggerTypes);
    const speed = Number(payload?.speed);
    if (!Number.isFinite(speed) || speed <= 0) {
        return { ok: false, message: "杞挱閫熷害蹇呴』澶т簬 0" };
    }
    const loop = Boolean(payload?.loop);
    const directionRaw = String(payload?.direction ?? "horizontal").trim();
    const direction = directionRaw === "vertical" ? "vertical" : "horizontal";
    const parentIdRaw = Number(payload?.parentId ?? 0);
    const parentId = Number.isFinite(parentIdRaw) && parentIdRaw > 0 ? Math.floor(parentIdRaw) : 0;
    const storageProvider = parseStorageProvider(payload?.storageProvider);
    const storageConfigIdRaw = Number(payload?.storageConfigId ?? payload?.storageId ?? 0);
    const storageConfigId = Number.isFinite(storageConfigIdRaw) && storageConfigIdRaw > 0
        ? Math.floor(storageConfigIdRaw)
        : localConfigId;
    const fileTypeGroup = parseResourceFileTypeGroup(payload?.fileTypeGroup);
    const fileSubtypes = normalizeResourceFileSubtypes(fileTypeGroup, payload?.fileSubtypes);
    return {
        ok: true,
        id: idRequired ? id : undefined,
        data: {
            name,
            key,
            parentId,
            storageProvider,
            storageConfigId,
            fileTypeGroup,
            fileSubtypes,
            triggerTypes,
            speed,
            loop,
            direction
        }
    };
};
const validateResourcePayload = (payload, categories, idRequired = false) => {
    const id = Number(payload?.id);
    if (idRequired && (!Number.isFinite(id) || id <= 0)) {
        return { ok: false, message: "缂哄皯鏈夋晥 id" };
    }
    const name = String(payload?.name ?? "").trim();
    if (!name)
        return { ok: false, message: "鍚嶇О涓嶈兘涓虹┖" };
    const image = String(payload?.image ?? "").trim();
    if (!image)
        return { ok: false, message: "璧勬簮鏂囦欢涓嶈兘涓虹┖" };
    const fit = parseImageFit(payload?.fit);
    const categoryIdRaw = Number(payload?.categoryId);
    const categoryId = Number.isFinite(categoryIdRaw) && categoryIdRaw > 0
        ? Math.floor(categoryIdRaw)
        : 0;
    const category = categoryId > 0 ? categories.find(item => item.id === categoryId) : undefined;
    if (categoryId > 0 && !category)
        return { ok: false, message: "鎵€灞炵被鐩笉瀛樺湪" };
    if (category) {
        const currentExt = getExtFromUrl(image);
        const allowSubtypeSet = new Set(normalizeResourceFileSubtypes(category.fileTypeGroup, category.fileSubtypes));
        if (!currentExt || !allowSubtypeSet.has(currentExt)) {
            return { ok: false, message: "当前资源文件类型与类目允许的子类型不匹配" };
        }
    }
    const triggerTypeRaw = String(payload?.triggerType ?? "").trim();
    const triggerType = (triggerTypeRaw || "");
    if (category && triggerType && !category.triggerTypes.includes(triggerType)) {
        return { ok: false, message: "触发事件不在所选类目的可用范围内" };
    }
    if (!category && triggerType) {
        return { ok: false, message: "未选择类目时不支持设置触发事件" };
    }
    const triggerUrl = String(payload?.triggerUrl ?? "").trim();
    const triggerPagePath = String(payload?.triggerPagePath ?? "").trim();
    const miniProgramAppId = String(payload?.miniProgramAppId ?? "").trim();
    const miniProgramPagePath = String(payload?.miniProgramPagePath ?? "").trim();
    const appPath = String(payload?.appPath ?? "").trim();
    if (triggerType === "url" && !triggerUrl)
        return { ok: false, message: "璇峰～鍐?URL" };
    if (triggerType === "page" && !triggerPagePath)
        return { ok: false, message: "请填写页面路径" };
    if (triggerType === "miniProgram") {
        if (!miniProgramAppId)
            return { ok: false, message: "璇峰～鍐欏皬绋嬪簭 AppID" };
        if (!miniProgramPagePath)
            return { ok: false, message: "璇峰～鍐欏皬绋嬪簭椤甸潰璺緞" };
    }
    if (triggerType === "app" && !appPath)
        return { ok: false, message: "璇峰～鍐?App 璺宠浆璺緞" };
    const uploadStorageProvider = parseStorageProvider(payload?.storageProvider);
    const uploadStorageConfigId = Number(payload?.storageConfigId || 0);
    if (category) {
        if (uploadStorageConfigId > 0 &&
            (uploadStorageProvider !== category.storageProvider ||
                uploadStorageConfigId !== category.storageConfigId)) {
            return { ok: false, message: "当前资源与类目存储配置不一致，请重新上传资源" };
        }
    }
    const finalStorageProvider = category ? category.storageProvider : uploadStorageProvider;
    const finalStorageConfigId = category
        ? category.storageConfigId
        : Number.isFinite(uploadStorageConfigId) && uploadStorageConfigId > 0
            ? Math.floor(uploadStorageConfigId)
            : 0;
    const fileSizeRaw = Number(payload?.fileSize || 0);
    const fileSize = Number.isFinite(fileSizeRaw) && fileSizeRaw > 0 ? Math.floor(fileSizeRaw) : 0;
    const storageObjectKey = String(payload?.storageObjectKey || "").trim();
    return {
        ok: true,
        id: idRequired ? id : undefined,
        data: {
            name,
            image,
            fit,
            categoryId,
            triggerType,
            triggerUrl,
            triggerPagePath,
            miniProgramAppId,
            miniProgramPagePath,
            appPath,
            storageProvider: finalStorageProvider,
            storageConfigId: finalStorageConfigId,
            fileSize,
            storageObjectKey
        }
    };
};
const buildStorageListRow = async (provider, row) => {
    const metrics = await queryStorageMetrics(provider, Number(row.id));
    const base = {
        provider,
        providerLabel: STORAGE_PROVIDER_LABEL[provider],
        configId: Number(row.id),
        id: Number(row.id),
        name: String(row.name || "").trim(),
        isEnabled: provider === "local" ? true : Boolean(row.isEnabled),
        remark: String(row.remark || "").trim(),
        createTime: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
        updateTime: row.updatedAt ? new Date(row.updatedAt).getTime() : Date.now()
    };
    if (provider === "local") {
        base.basePath = String(row.basePath || "").trim();
        base.storageUsedMb = metrics.storageUsedMb;
        return base;
    }
    base.dailyTrafficUsedMb = metrics.dailyTrafficUsedMb;
    base.storageUsedMb = metrics.storageUsedMb;
    if (provider === "qiniu") {
        base.bucket = String(row.bucket || "").trim();
        base.domain = String(row.domain || "").trim();
        base.zone = String(row.zone || "").trim();
        base.accessKey = String(row.accessKey || "").trim();
        base.secretKey = String(row.secretKey || "").trim();
    }
    else if (provider === "aliyun") {
        base.bucket = String(row.bucket || "").trim();
        base.region = String(row.region || "").trim();
        base.endpoint = String(row.endpoint || "").trim();
        base.domain = String(row.domain || "").trim();
        base.accessKeyId = String(row.accessKeyId || "").trim();
        base.accessKeySecret = String(row.accessKeySecret || "").trim();
    }
    else if (provider === "tencent") {
        base.bucket = String(row.bucket || "").trim();
        base.region = String(row.region || "").trim();
        base.domain = String(row.domain || "").trim();
        base.secretId = String(row.secretId || "").trim();
        base.secretKey = String(row.secretKey || "").trim();
    }
    else if (provider === "minio") {
        base.endpoint = String(row.endpoint || "").trim();
        base.port = Number(row.port || 9000);
        base.useSSL = Boolean(row.useSSL);
        base.bucket = String(row.bucket || "").trim();
        base.accessKey = String(row.accessKey || "").trim();
        base.secretKey = String(row.secretKey || "").trim();
        base.basePath = String(row.basePath || "").trim();
    }
    else {
        base.bucket = String(row.bucket || "").trim();
        base.region = String(row.region || "").trim();
        base.endpoint = String(row.endpoint || "").trim();
        base.domain = String(row.domain || "").trim();
        base.accessKeyId = String(row.accessKeyId || "").trim();
        base.secretAccessKey = String(row.secretAccessKey || "").trim();
    }
    return base;
};
router.post("/resource/upload", express_1.default.raw({
    type: ["image/*", "video/*", "audio/*", "text/*", "application/*", "application/octet-stream"],
    limit: config_1.default.api.bodyLimit
}), async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "UploadResourceSystemImage");
    try {
        const body = req.body;
        if (!body || !Buffer.isBuffer(body) || body.length === 0) {
            return op.error("缂哄皯璧勬簮鏂囦欢", 400);
        }
        const contentType = String(req.headers["content-type"] || "application/octet-stream");
        const categoryId = Number(req.query?.categoryId || 0);
        const localConfig = await ensureLocalStorageConfig();
        let storageProvider = "local";
        let storageConfigId = Number(localConfig.id);
        let objectPathPrefix = UNCATEGORIZED_OBJECT_PREFIX;
        if (Number.isFinite(categoryId) && categoryId > 0) {
            const category = await resourceSystemCategory_1.default.findByPk(categoryId);
            if (!category)
                return op.error("归属类目不存在", 400);
            const uploadExt = getMediaExtByContentType(contentType);
            const fileTypeGroup = parseResourceFileTypeGroup(category.fileTypeGroup);
            const allowSubtypes = normalizeResourceFileSubtypes(fileTypeGroup, category.fileSubtypes);
            if (!allowSubtypes.includes(uploadExt)) {
                return op.error("上传文件类型不在当前类目允许范围内", 400);
            }
            storageProvider = parseStorageProvider(category.storageProvider);
            storageConfigId = Number(category.storageConfigId || 0);
            objectPathPrefix = "";
        }
        const storageConfig = await getStorageConfig(storageProvider, storageConfigId, {
            enabledOnly: true
        });
        if (!storageConfig)
            return op.error("当前类目存储配置不可用", 400);
        const uploaded = await uploadByStorage({
            provider: storageProvider,
            config: storageConfig,
            contentType,
            body,
            objectPathPrefix
        });
        return op.success({
            imageUrl: uploaded.imageUrl,
            mediaUrl: uploaded.imageUrl,
            storageProvider,
            storageConfigId: Number(storageConfig.id),
            fileSize: body.length,
            storageObjectKey: uploaded.objectKey
        }, "涓婁紶鎴愬姛");
    }
    catch (error) {
        return op.error(`涓婁紶璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/storage/enabled/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "QueryEnabledResourceSystemStorage");
    try {
        const list = await listAllStorageOptions(true);
        return op.success({ list }, "鎿嶄綔鎴愬姛");
    }
    catch (error) {
        return op.error(`鏌ヨ鍙敤瀛樺偍澶辫触: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/storage/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "QueryResourceSystemStorage");
    try {
        await ensureLocalStorageConfig();
        const provider = parseStorageProvider(req.body?.provider);
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Number(req.body?.pageSize) || 20);
        const { rows, count } = await providerModels[provider].findAndCountAll({
            where: provider === "local" ? undefined : {},
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const list = await Promise.all(rows.map((item) => buildStorageListRow(provider, item)));
        return op.success({ list, total: count, pageSize, currentPage }, "鎿嶄綔鎴愬姛");
    }
    catch (error) {
        return op.error(`鏌ヨ瀛樺偍閰嶇疆澶辫触: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/storage/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "CreateResourceSystemStorage");
    try {
        const provider = parseStorageProvider(req.body?.provider);
        const name = String(req.body?.name || "").trim();
        if (!name)
            return op.error("閰嶇疆鍚嶇О涓嶈兘涓虹┖", 400);
        const exists = await providerModels[provider].findOne({ where: { name } });
        if (exists)
            return op.error("同类型下配置名称已存在", 400);
        if (provider === "local") {
            const basePath = normalizeStorageBasePath(req.body?.basePath);
            if (!basePath)
                return op.error("璺緞鍓嶇紑涓嶈兘涓虹┖", 400);
            const existsBasePath = await resourceSystemStorageLocal_1.default.findOne({
                where: { basePath }
            });
            if (existsBasePath)
                return op.error("路径前缀已存在", 400);
            await resourceSystemStorageLocal_1.default.create({
                name,
                basePath,
                remark: String(req.body?.remark || "").trim()
            });
            return op.success({}, "鏂板鎴愬姛");
        }
        const payload = {
            ...req.body,
            name,
            provider: undefined,
            id: undefined,
            remark: String(req.body?.remark || "").trim(),
            isEnabled: Boolean(req.body?.isEnabled)
        };
        delete payload.provider;
        delete payload.id;
        if (provider === "qiniu") {
            if (!payload.bucket || !payload.domain || !payload.accessKey || !payload.secretKey) {
                return op.error("璇峰畬鏁村～鍐欎竷鐗涗簯閰嶇疆", 400);
            }
            payload.zone = String(payload.zone || "z0").trim();
        }
        if (provider === "aliyun") {
            if (!payload.bucket || !payload.region || !payload.accessKeyId || !payload.accessKeySecret) {
                return op.error("璇峰畬鏁村～鍐欓樋閲屼簯閰嶇疆", 400);
            }
        }
        if (provider === "tencent") {
            if (!payload.bucket || !payload.region || !payload.secretId || !payload.secretKey) {
                return op.error("璇峰畬鏁村～鍐欒吘璁簯閰嶇疆", 400);
            }
        }
        if (provider === "minio") {
            if (!payload.endpoint || !payload.bucket || !payload.accessKey || !payload.secretKey) {
                return op.error("璇峰畬鏁村～鍐?MinIO 閰嶇疆", 400);
            }
            payload.port = Number(payload.port || 9000) || 9000;
            payload.useSSL = Boolean(payload.useSSL);
            payload.basePath = normalizeStorageBasePath(payload.basePath);
            if (!payload.basePath)
                return op.error("璺緞鍓嶇紑涓嶈兘涓虹┖", 400);
            const existsBasePath = await resourceSystemStorageMinio_1.default.findOne({
                where: { basePath: payload.basePath }
            });
            if (existsBasePath)
                return op.error("路径前缀已存在", 400);
        }
        if (provider === "aws") {
            if (!payload.bucket || !payload.region || !payload.accessKeyId || !payload.secretAccessKey) {
                return op.error("璇峰畬鏁村～鍐?S3 閰嶇疆", 400);
            }
        }
        await providerModels[provider].create(payload);
        return op.success({}, "鏂板鎴愬姛");
    }
    catch (error) {
        return op.error(`鏂板瀛樺偍閰嶇疆澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/storage/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "UpdateResourceSystemStorage");
    try {
        const provider = parseStorageProvider(req.body?.provider);
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缂哄皯鏈夋晥 id", 400);
        const row = await providerModels[provider].findByPk(id);
        if (!row)
            return op.error("存储配置不存在", 404);
        if (provider === "local") {
            const basePath = normalizeStorageBasePath(req.body?.basePath);
            if (!basePath)
                return op.error("璺緞鍓嶇紑涓嶈兘涓虹┖", 400);
            const existsBasePath = await resourceSystemStorageLocal_1.default.findOne({
                where: { basePath, id: { [sequelize_1.Op.ne]: id } }
            });
            if (existsBasePath)
                return op.error("路径前缀已存在", 400);
            await row.update({
                name: String(req.body?.name || LOCAL_DEFAULT_NAME).trim() || LOCAL_DEFAULT_NAME,
                basePath,
                remark: String(req.body?.remark || "").trim()
            });
            return op.success({}, "鏇存柊鎴愬姛");
        }
        const name = String(req.body?.name || "").trim();
        if (!name)
            return op.error("閰嶇疆鍚嶇О涓嶈兘涓虹┖", 400);
        const exists = await providerModels[provider].findOne({
            where: { name, id: { [sequelize_1.Op.ne]: id } }
        });
        if (exists)
            return op.error("同类型下配置名称已存在", 400);
        const patch = {
            ...req.body,
            provider: undefined,
            id: undefined,
            name,
            remark: String(req.body?.remark || "").trim(),
            isEnabled: Boolean(req.body?.isEnabled)
        };
        delete patch.provider;
        delete patch.id;
        if (provider === "minio") {
            const basePath = normalizeStorageBasePath(patch.basePath);
            if (!basePath)
                return op.error("璺緞鍓嶇紑涓嶈兘涓虹┖", 400);
            const existsBasePath = await resourceSystemStorageMinio_1.default.findOne({
                where: { basePath, id: { [sequelize_1.Op.ne]: id } }
            });
            if (existsBasePath)
                return op.error("路径前缀已存在", 400);
            patch.basePath = basePath;
            patch.port = Number(patch.port || 9000) || 9000;
            patch.useSSL = Boolean(patch.useSSL);
        }
        await row.update(patch);
        return op.success({}, "鏇存柊鎴愬姛");
    }
    catch (error) {
        return op.error(`鏇存柊瀛樺偍閰嶇疆澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/storage/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "DeleteResourceSystemStorage");
    try {
        const provider = parseStorageProvider(req.body?.provider);
        const configId = Number(req.body?.id || req.body?.configId);
        if (!Number.isFinite(configId) || configId <= 0)
            return op.error("缂哄皯鏈夋晥 id", 400);
        const row = await providerModels[provider].findByPk(configId);
        if (!row)
            return op.error("存储配置不存在", 404);
        const [inUseByCategory, inUseByResource] = await Promise.all([
            resourceSystemCategory_1.default.count({
                where: { storageProvider: provider, storageConfigId: configId }
            }),
            resourceSystemResource_1.default.count({
                where: { storageProvider: provider, storageConfigId: configId }
            })
        ]);
        if (inUseByCategory > 0 || inUseByResource > 0) {
            return op.error("当前存储配置已被使用，不能删除", 400);
        }
        if (provider === "local") {
            const localCount = await resourceSystemStorageLocal_1.default.count();
            if (localCount <= 1) {
                return op.error("至少保留一个本地存储配置", 400);
            }
        }
        await row.destroy();
        return op.success({ provider, configId }, "鍒犻櫎鎴愬姛");
    }
    catch (error) {
        return op.error(`鍒犻櫎瀛樺偍閰嶇疆澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/category/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "QueryResourceSystemCategory");
    try {
        await ensureLocalStorageConfig();
        const name = String(req.body?.name ?? "").trim();
        const key = String(req.body?.key ?? "").trim();
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Number(req.body?.pageSize) || 10);
        const where = {};
        if (name)
            where.name = { [sequelize_1.Op.like]: `%${name}%` };
        if (key)
            where.key = { [sequelize_1.Op.like]: `%${key}%` };
        const rows = await resourceSystemCategory_1.default.findAll({
            where,
            order: [["parentId", "ASC"], ["id", "ASC"]]
        });
        const storageOptions = await listAllStorageOptions(false);
        const storageMap = new Map(storageOptions.map(item => [item.value, item]));
        const treeList = buildCategoryTree(rows, storageMap);
        const total = treeList.length;
        const start = (currentPage - 1) * pageSize;
        const list = treeList.slice(start, start + pageSize);
        const fileTypeOptions = RESOURCE_FILE_TYPE_GROUPS.map(group => ({
            group,
            label: RESOURCE_FILE_TYPE_LABEL[group],
            subtypes: RESOURCE_FILE_SUBTYPE_OPTIONS[group]
        }));
        return op.success({ list, total, pageSize, currentPage, fileTypeOptions }, "鎿嶄綔鎴愬姛");
    }
    catch (error) {
        return op.error(`鏌ヨ绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/category/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "CreateResourceSystemCategory");
    try {
        const localConfig = await ensureLocalStorageConfig();
        const parsed = validateCategoryPayload(req.body, Number(localConfig.id), false);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const exists = await resourceSystemCategory_1.default.findOne({ where: { key: parsed.data.key } });
        if (exists)
            return op.error("Key 鍊煎凡瀛樺湪", 400);
        if (parsed.data.parentId > 0) {
            const parentExists = await resourceSystemCategory_1.default.findByPk(parsed.data.parentId);
            if (!parentExists)
                return op.error("父级类目不存在", 400);
        }
        const storage = await getStorageConfig(parsed.data.storageProvider, parsed.data.storageConfigId, {
            enabledOnly: true
        });
        if (!storage)
            return op.error("鎵€閫夊瓨鍌ㄩ厤缃笉鍙敤", 400);
        await resourceSystemCategory_1.default.create(parsed.data);
        return op.success({}, "鏂板鎴愬姛");
    }
    catch (error) {
        return op.error(`鏂板绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/category/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "UpdateResourceSystemCategory");
    try {
        const localConfig = await ensureLocalStorageConfig();
        const parsed = validateCategoryPayload(req.body, Number(localConfig.id), true);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const exists = await resourceSystemCategory_1.default.findOne({
            where: { key: parsed.data.key, id: { [sequelize_1.Op.ne]: parsed.id } }
        });
        if (exists)
            return op.error("Key 鍊煎凡瀛樺湪", 400);
        const row = await resourceSystemCategory_1.default.findByPk(parsed.id);
        if (!row)
            return op.error("类目不存在", 404);
        if (Number(parsed.data.parentId || 0) === Number(parsed.id)) {
            return op.error("鐖剁骇绫荤洰涓嶈兘閫夋嫨鑷繁", 400);
        }
        if (parsed.data.parentId > 0) {
            const all = await resourceSystemCategory_1.default.findAll({ attributes: ["id", "parentId"] });
            const descendants = collectDescendantIds(Number(parsed.id), all.map(item => ({
                id: Number(item.id),
                parentId: Number(item.parentId || 0)
            })));
            if (descendants.includes(Number(parsed.data.parentId))) {
                return op.error("父级类目不能选择当前类目或其子类目", 400);
            }
        }
        const storage = await getStorageConfig(parsed.data.storageProvider, parsed.data.storageConfigId, {
            enabledOnly: true
        });
        if (!storage)
            return op.error("鎵€閫夊瓨鍌ㄩ厤缃笉鍙敤", 400);
        await row.update(parsed.data);
        return op.success({}, "鏇存柊鎴愬姛");
    }
    catch (error) {
        return op.error(`鏇存柊绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/category/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "DeleteResourceSystemCategory");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缂哄皯鏈夋晥 id", 400);
        const allCategories = await resourceSystemCategory_1.default.findAll({ attributes: ["id", "parentId"] });
        const deleteIds = collectDescendantIds(id, allCategories.map(item => ({
            id: Number(item.id),
            parentId: Number(item.parentId || 0)
        })));
        const inUse = await resourceSystemResource_1.default.count({
            where: { categoryId: { [sequelize_1.Op.in]: deleteIds } }
        });
        if (inUse > 0)
            return op.error("褰撳墠绫荤洰涓嬪瓨鍦ㄨ祫婧愶紝涓嶈兘鍒犻櫎", 400);
        const deleted = await resourceSystemCategory_1.default.destroy({
            where: { id: { [sequelize_1.Op.in]: deleteIds } }
        });
        if (!deleted)
            return op.error("类目不存在", 404);
        return op.success({ id, deletedIds: deleteIds }, "鍒犻櫎鎴愬姛");
    }
    catch (error) {
        return op.error(`鍒犻櫎绫荤洰澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/resource/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "QueryResourceSystemResource");
    try {
        const name = String(req.body?.name ?? "").trim();
        const categoryId = Number(req.body?.categoryId || 0);
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Number(req.body?.pageSize) || 10);
        const where = {};
        if (name)
            where.name = { [sequelize_1.Op.like]: `%${name}%` };
        if (categoryId > 0) {
            const allCategories = await resourceSystemCategory_1.default.findAll({ attributes: ["id", "parentId"] });
            const matchIds = collectDescendantIds(categoryId, allCategories.map(item => ({
                id: Number(item.id),
                parentId: Number(item.parentId || 0)
            })));
            where.categoryId = { [sequelize_1.Op.in]: matchIds };
        }
        const [resources, total, categories, storageOptions] = await Promise.all([
            resourceSystemResource_1.default.findAll({
                where,
                order: [["id", "DESC"]],
                offset: (currentPage - 1) * pageSize,
                limit: pageSize
            }),
            resourceSystemResource_1.default.count({ where }),
            resourceSystemCategory_1.default.findAll({ attributes: ["id", "name"] }),
            listAllStorageOptions(false)
        ]);
        const categoryMap = new Map(categories.map(item => [Number(item.id), String(item.name || "")]));
        const storageMap = new Map(storageOptions.map(item => [item.value, item]));
        const list = resources.map(item => toResourcePayload(item, categoryMap.get(Number(item.categoryId)) || "未分类", storageMap));
        return op.success({ list, total, pageSize, currentPage }, "鎿嶄綔鎴愬姛");
    }
    catch (error) {
        return op.error(`鏌ヨ璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/resource/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "CreateResourceSystemResource");
    try {
        const categories = await resourceSystemCategory_1.default.findAll({
            attributes: [
                "id",
                "triggerTypes",
                "storageProvider",
                "storageConfigId",
                "fileTypeGroup",
                "fileSubtypes"
            ]
        });
        const parsed = validateResourcePayload(req.body, categories.map(item => ({
            id: Number(item.id),
            triggerTypes: item.triggerTypes || [],
            storageProvider: parseStorageProvider(item.storageProvider),
            storageConfigId: Number(item.storageConfigId || 0),
            fileTypeGroup: parseResourceFileTypeGroup(item.fileTypeGroup),
            fileSubtypes: normalizeResourceFileSubtypes(parseResourceFileTypeGroup(item.fileTypeGroup), item.fileSubtypes)
        })), false);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        await resourceSystemResource_1.default.create(parsed.data);
        return op.success({}, "鏂板鎴愬姛");
    }
    catch (error) {
        return op.error(`鏂板璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/resource/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "UpdateResourceSystemResource");
    try {
        const categories = await resourceSystemCategory_1.default.findAll({
            attributes: [
                "id",
                "triggerTypes",
                "storageProvider",
                "storageConfigId",
                "fileTypeGroup",
                "fileSubtypes"
            ]
        });
        const parsed = validateResourcePayload(req.body, categories.map(item => ({
            id: Number(item.id),
            triggerTypes: item.triggerTypes || [],
            storageProvider: parseStorageProvider(item.storageProvider),
            storageConfigId: Number(item.storageConfigId || 0),
            fileTypeGroup: parseResourceFileTypeGroup(item.fileTypeGroup),
            fileSubtypes: normalizeResourceFileSubtypes(parseResourceFileTypeGroup(item.fileTypeGroup), item.fileSubtypes)
        })), true);
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const row = await resourceSystemResource_1.default.findByPk(parsed.id);
        if (!row)
            return op.error("资源不存在", 404);
        const oldImage = String(row.image || "");
        const oldObjectKey = String(row.storageObjectKey || "");
        const oldProvider = parseStorageProvider(row.storageProvider);
        const oldConfigId = Number(row.storageConfigId || 0);
        await row.update(parsed.data);
        if (oldImage && oldImage !== parsed.data.image && oldObjectKey) {
            const oldConfig = await getStorageConfig(oldProvider, oldConfigId);
            if (oldConfig) {
                await deleteByStorage({
                    provider: oldProvider,
                    config: oldConfig,
                    imageUrl: oldImage,
                    objectKey: oldObjectKey
                });
            }
        }
        return op.success({}, "鏇存柊鎴愬姛");
    }
    catch (error) {
        return op.error(`鏇存柊璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/resource/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "璧勬簮绯荤粺", "DeleteResourceSystemResource");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缂哄皯鏈夋晥 id", 400);
        const row = await resourceSystemResource_1.default.findByPk(id);
        if (!row)
            return op.error("资源不存在", 404);
        const imageUrl = String(row.image || "");
        const objectKey = String(row.storageObjectKey || "");
        const provider = parseStorageProvider(row.storageProvider);
        const configId = Number(row.storageConfigId || 0);
        await row.destroy();
        const storageConfig = await getStorageConfig(provider, configId);
        if (storageConfig && objectKey) {
            await deleteByStorage({ provider, config: storageConfig, imageUrl, objectKey });
        }
        return op.success({ id }, "鍒犻櫎鎴愬姛");
    }
    catch (error) {
        return op.error(`鍒犻櫎璧勬簮澶辫触: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
