"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sequelize_1 = require("sequelize");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_stream_1 = require("node:stream");
const pdfkit_1 = __importDefault(require("pdfkit"));
const archiver_1 = __importDefault(require("archiver"));
const surveyQuestionnaire_1 = __importDefault(require("../models/surveyQuestionnaire"));
const surveySubmission_1 = __importDefault(require("../models/surveySubmission"));
const surveyWorkflowTemplate_1 = __importDefault(require("../models/surveyWorkflowTemplate"));
const surveyWorkflowInstance_1 = __importDefault(require("../models/surveyWorkflowInstance"));
const user_1 = __importDefault(require("../models/user"));
const userRole_1 = __importDefault(require("../models/userRole"));
const role_1 = __importDefault(require("../models/role"));
const operationLogger_1 = require("../services/operationLogger");
const bpmnWorkflow_1 = require("../services/bpmnWorkflow");
const router = express_1.default.Router();
const MAX_NAME_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;
const STATUS_SET = new Set(["draft", "published", "closed"]);
const WORKFLOW_STATUS_SET = new Set(["enabled", "disabled"]);
const WORKFLOW_INSTANCE_STATUS_SET = new Set([
    "pending",
    "approved",
    "rejected",
    "cancelled"
]);
const parseUserIdFromAccessToken = (authorization) => {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    const parts = token.split("_");
    if (parts.length < 3 || parts[0] !== "atk")
        return null;
    const userId = Number(parts[1]);
    return Number.isFinite(userId) && userId > 0 ? userId : null;
};
const resolveOperator = async (req) => {
    const authHeader = String(req.headers?.authorization || "");
    const userId = parseUserIdFromAccessToken(authHeader);
    if (!userId)
        return { userId: 0, username: "unknown", roleCodes: [] };
    const user = await user_1.default.findByPk(userId);
    const userRoles = await userRole_1.default.findAll({ where: { userId }, attributes: ["roleId"] });
    const roleIds = userRoles.map(item => Number(item.roleId)).filter(Boolean);
    const roles = roleIds.length > 0
        ? await role_1.default.findAll({ where: { id: roleIds, status: 1 }, attributes: ["code"] })
        : [];
    return {
        userId,
        username: String(user?.username || `user-${userId}`),
        roleCodes: roles.map(item => String(item.code || "")).filter(Boolean)
    };
};
const normalizeText = (input, maxLength) => String(input ?? "").trim().slice(0, maxLength);
const normalizeStatus = (input) => {
    const value = String(input ?? "draft").trim();
    return STATUS_SET.has(value) ? value : "draft";
};
const normalizeSchema = (input) => {
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
const toPayload = (row) => ({
    id: Number(row.id),
    name: String(row.name || ""),
    description: String(row.description || ""),
    status: normalizeStatus(row.status),
    schema: normalizeSchema(row.schema),
    responseCount: Number(row.responseCount || 0),
    publishTime: row.publishTime ? new Date(row.publishTime).getTime() : null,
    createTime: row.createdAt ? new Date(row.createdAt).getTime() : Date.now(),
    updateTime: row.updatedAt ? new Date(row.updatedAt).getTime() : Date.now()
});
const validateSavePayload = (payload) => {
    const name = normalizeText(payload?.name, MAX_NAME_LENGTH);
    if (!name)
        return { ok: false, message: "问卷名称不能为空" };
    const description = normalizeText(payload?.description, MAX_DESCRIPTION_LENGTH);
    const status = normalizeStatus(payload?.status);
    const schema = normalizeSchema(payload?.schema);
    return {
        ok: true,
        data: {
            name,
            description,
            status,
            schema
        }
    };
};
const countSchemaQuestions = (schemaInput) => {
    if (!schemaInput)
        return 0;
    if (Array.isArray(schemaInput))
        return schemaInput.length;
    const schema = normalizeSchema(schemaInput);
    const directRules = Array.isArray(schema.rule) ? schema.rule : [];
    if (directRules.length > 0) {
        const walkRules = (rules) => rules.reduce((sum, item) => {
            const children = Array.isArray(item?.children) ? walkRules(item.children) : 0;
            return sum + 1 + children;
        }, 0);
        return walkRules(directRules);
    }
    const pages = Array.isArray(schema.pages) ? schema.pages : [];
    let total = 0;
    const walkElements = (elements) => {
        elements.forEach(item => {
            if (!item || typeof item !== "object")
                return;
            total += 1;
            if (Array.isArray(item.elements)) {
                walkElements(item.elements);
            }
            if (Array.isArray(item.templateElements)) {
                walkElements(item.templateElements);
            }
        });
    };
    pages.forEach((page) => {
        if (Array.isArray(page?.elements)) {
            walkElements(page.elements);
        }
    });
    return total;
};
const normalizeOptionItems = (input) => {
    if (!Array.isArray(input))
        return [];
    return input
        .map(item => {
        const value = String(item?.value ?? item?.label ?? "").trim();
        if (!value)
            return null;
        const label = String(item?.label ?? item?.value ?? value).trim();
        return { label: label || value, value };
    })
        .filter(Boolean);
};
const normalizeFlowGraph = (input) => {
    const graph = normalizeSchema(input);
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    return { ...graph, nodes, edges };
};
const normalizeTypeToken = (type) => String(type || "")
    .toLowerCase()
    .replace(/[\s:_-]/g, "");
const readDisplayText = (item, fallback = "") => {
    const candidate = item?.children ??
        item?.props?.content ??
        item?.props?.text ??
        item?.props?.title ??
        item?.props?.label ??
        item?.props?.name ??
        item?.props?.value ??
        item?.slot ??
        item?.html ??
        fallback;
    if (typeof candidate === "string")
        return candidate.trim();
    if (Array.isArray(candidate)) {
        return candidate
            .map(node => {
            if (typeof node === "string")
                return node;
            if (node && typeof node === "object") {
                const text = node.text ?? node.label ?? "";
                return typeof text === "string" ? text : "";
            }
            return "";
        })
            .join(" ")
            .trim();
    }
    if (candidate && typeof candidate === "object") {
        const text = candidate.text ?? candidate.label ?? "";
        return typeof text === "string" ? text.trim() : String(fallback || "").trim();
    }
    return String(fallback || "").trim();
};
const isDisplayOnlyType = (type) => {
    const value = normalizeTypeToken(type);
    return [
        "eltext",
        "elhtml",
        "eldivider",
        "elalert",
        "elimage",
        "elbutton",
        "title",
        "paragraph"
    ].some(item => value.includes(item));
};
const isContainerOnlyType = (type) => {
    const value = normalizeTypeToken(type);
    return [
        "row",
        "col",
        "grid",
        "flex",
        "space",
        "tabs",
        "tabpane",
        "collapse",
        "collapseitem",
        "card"
    ].some(item => value.includes(item));
};
const isAnswerableType = (type) => {
    const value = normalizeTypeToken(type);
    return [
        "input",
        "textarea",
        "select",
        "radio",
        "checkbox",
        "switch",
        "date",
        "time",
        "picker",
        "number",
        "rate",
        "slider",
        "cascader",
        "tree",
        "transfer",
        "upload",
        "sign",
        "signature",
        "editor",
        "color"
    ].some(item => value.includes(item));
};
const isLikelyDisplayNode = (item) => {
    const merged = `${String(item?.type || "")}:${String(item?.props?.type || "")}`;
    if (isContainerOnlyType(merged))
        return false;
    const text = readDisplayText(item, "");
    const image = String(item?.props?.src || "").trim();
    return isDisplayOnlyType(merged) || Boolean(text) || Boolean(image);
};
const resolveNodeTitle = (item, fallback = "") => {
    const candidate = item?.title ??
        item?.label ??
        item?.props?.title ??
        item?.props?.label ??
        item?.props?.name ??
        item?.props?.placeholder ??
        fallback;
    return String(candidate || "").trim();
};
const resolveQuestionKind = (type) => {
    const value = String(type || "").toLowerCase();
    if (["select", "radio", "checkbox", "switch", "cascader", "tree", "transfer", "color"].some(item => value.includes(item))) {
        return "choice";
    }
    if (["input", "textarea", "text", "editor"].some(item => value.includes(item))) {
        return "text";
    }
    if (["number", "rate", "slider"].some(item => value.includes(item)))
        return "number";
    if (["time", "date", "picker"].some(item => value.includes(item)))
        return "date";
    if (["upload", "sign", "signature"].some(item => value.includes(item)))
        return "upload";
    if (["bool"].some(item => value.includes(item)))
        return "boolean";
    return "other";
};
const isUploadType = (type) => /upload/i.test(String(type || ""));
const toNumber = (input) => {
    if (typeof input === "number" && Number.isFinite(input))
        return input;
    if (typeof input === "string") {
        const value = Number(input);
        return Number.isFinite(value) ? value : null;
    }
    return null;
};
const isImageUrl = (input) => {
    const text = String(input || "").trim().toLowerCase();
    if (!text)
        return false;
    if (text.startsWith("data:image/"))
        return true;
    if (text.startsWith("/uploads/"))
        return true;
    if (/^https?:\/\//i.test(text))
        return true;
    if (/^[a-z0-9+/=]{200,}$/i.test(text))
        return true;
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"].some(ext => text.includes(ext));
};
const extractImageUrls = (input) => {
    const result = [];
    const walk = (value) => {
        if (value === undefined || value === null)
            return;
        if (typeof value === "string") {
            const text = value.trim();
            if ((text.startsWith("[") || text.startsWith("{")) && text.length > 1) {
                try {
                    walk(JSON.parse(text));
                }
                catch {
                    // ignore parse error and continue plain string detection
                }
            }
            if (isImageUrl(text))
                result.push(text);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(walk);
            return;
        }
        if (typeof value === "object") {
            const candidateKeys = [
                "url",
                "src",
                "path",
                "thumbUrl",
                "image",
                "imageUrl",
                "fileUrl",
                "previewUrl",
                "sign",
                "signature",
                "value"
            ];
            candidateKeys.forEach(key => {
                if (value[key])
                    walk(value[key]);
            });
        }
    };
    walk(input);
    return result;
};
const isSwitchType = (type) => /switch|boolean|bool/i.test(String(type || ""));
const normalizeSwitchValue = (value) => {
    const raw = String(value ?? "").trim().toLowerCase();
    return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
};
const extractQuestionsFromSchema = (schemaInput) => {
    const schema = normalizeSchema(schemaInput);
    const result = [];
    const used = new Set();
    let displayIndex = 0;
    const walkRule = (rules) => {
        rules.forEach(item => {
            if (!item || typeof item !== "object")
                return;
            const field = String(item.field || item.name || "").trim();
            const title = resolveNodeTitle(item, field || "");
            const type = String(item.type || item.name || "").trim();
            const propsType = String(item?.props?.type || "").trim();
            const isRangeProp = Boolean(item?.props?.isRange);
            const mergedType = [type, propsType, isRangeProp ? "range" : ""]
                .filter(Boolean)
                .join(":");
            if (isContainerOnlyType(mergedType)) {
                if (Array.isArray(item.children))
                    walkRule(item.children);
                if (Array.isArray(item.control))
                    walkRule(item.control);
                return;
            }
            const answerable = isAnswerableType(mergedType);
            const displayOnly = isDisplayOnlyType(mergedType) || (!answerable && isLikelyDisplayNode(item));
            const rowField = field || (displayOnly ? `__display_${++displayIndex}` : "");
            if (rowField && !used.has(rowField)) {
                used.add(rowField);
                const propsOptions = normalizeOptionItems(item?.props?.options);
                const directOptions = normalizeOptionItems(item?.options);
                const options = propsOptions.length > 0 ? propsOptions : directOptions;
                const displayText = readDisplayText(item, title || resolveNodeTitle(item, ""));
                const image = String(item?.props?.src || "").trim();
                result.push({
                    field: rowField,
                    title: title || (displayOnly ? "展示组件" : rowField),
                    type: mergedType,
                    kind: resolveQuestionKind(mergedType),
                    options,
                    displayOnly,
                    displayPayload: {
                        text: displayText,
                        image
                    }
                });
            }
            if (Array.isArray(item.children))
                walkRule(item.children);
            if (Array.isArray(item.control))
                walkRule(item.control);
        });
    };
    if (Array.isArray(schema.rule)) {
        walkRule(schema.rule);
    }
    return result;
};
const readSubmissionValue = (answers, field) => {
    if (!answers || typeof answers !== "object")
        return undefined;
    return answers[field];
};
const isEmptyAnswer = (value) => {
    if (value === undefined || value === null)
        return true;
    if (typeof value === "string")
        return !value.trim();
    if (Array.isArray(value))
        return value.length === 0;
    return false;
};
const normalizeTimeBucketKey = (input) => {
    const raw = String(input ?? "").trim();
    if (!raw)
        return "";
    const pureDate = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (pureDate)
        return pureDate[0];
    const ts = Date.parse(raw);
    if (!Number.isNaN(ts)) {
        const date = new Date(ts);
        const y = date.getFullYear();
        const m = `${date.getMonth() + 1}`.padStart(2, "0");
        const d = `${date.getDate()}`.padStart(2, "0");
        return `${y}-${m}-${d}`;
    }
    return raw.length >= 10 ? raw.slice(0, 10) : raw;
};
const normalizeTimePointKey = (input) => {
    const raw = String(input ?? "").trim();
    if (!raw)
        return "";
    const pureDate = raw.match(/^\d{4}-\d{2}-\d{2}$/);
    if (pureDate)
        return pureDate[0];
    const ts = Date.parse(raw);
    if (Number.isNaN(ts))
        return raw;
    const date = new Date(ts);
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, "0");
    const d = `${date.getDate()}`.padStart(2, "0");
    const hh = `${date.getHours()}`.padStart(2, "0");
    const mm = `${date.getMinutes()}`.padStart(2, "0");
    const ss = `${date.getSeconds()}`.padStart(2, "0");
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};
const parseRangeEndpoints = (input) => {
    if (Array.isArray(input) && input.length >= 2) {
        return [input[0], input[1]];
    }
    if (input && typeof input === "object") {
        const start = input.start ?? input.startTime ?? input.from;
        const end = input.end ?? input.endTime ?? input.to;
        if (start !== undefined && end !== undefined)
            return [start, end];
    }
    if (typeof input === "string") {
        const text = input.trim();
        if (!text)
            return null;
        const splitters = ["~", " - ", " 至 ", ",", "，"];
        for (const splitter of splitters) {
            if (!text.includes(splitter))
                continue;
            const parts = text.split(splitter).map(item => item.trim()).filter(Boolean);
            if (parts.length >= 2)
                return [parts[0], parts[1]];
        }
    }
    return null;
};
const toAscii = (input) => String(input ?? "")
    .replace(/[^\x20-\x7E\r\n\t]/g, "?")
    .trim();
const wrapText = (input, maxLength = 96) => {
    const text = toAscii(input);
    if (!text)
        return [""];
    const lines = [];
    let cursor = 0;
    while (cursor < text.length) {
        lines.push(text.slice(cursor, cursor + maxLength));
        cursor += maxLength;
    }
    return lines;
};
const escapePdfText = (input) => input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const buildSimplePdf = (pages) => {
    const normalizedPages = pages.length > 0 ? pages : [["No data"]];
    const objects = [];
    const pageCount = normalizedPages.length;
    const catalogId = 1;
    const pagesId = 2;
    const firstPageId = 3;
    const firstContentId = firstPageId + pageCount;
    const fontId = firstContentId + pageCount;
    objects[catalogId] = `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`;
    const kids = Array.from({ length: pageCount }, (_, idx) => `${firstPageId + idx} 0 R`).join(" ");
    objects[pagesId] =
        `${pagesId} 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${pageCount} >>\nendobj\n`;
    normalizedPages.forEach((lines, idx) => {
        const pageId = firstPageId + idx;
        const contentId = firstContentId + idx;
        objects[pageId] =
            `${pageId} 0 obj\n` +
                `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>\n` +
                `endobj\n`;
        const streamLines = ["BT", "/F1 10 Tf", "50 800 Td", "14 TL"];
        lines.forEach((line, lineIndex) => {
            const text = escapePdfText(toAscii(line));
            streamLines.push(`(${text}) Tj`);
            if (lineIndex !== lines.length - 1)
                streamLines.push("T*");
        });
        streamLines.push("ET");
        const stream = streamLines.join("\n");
        objects[contentId] =
            `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream\nendobj\n`;
    });
    objects[fontId] = `${fontId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let i = 1; i <= fontId; i += 1) {
        offsets[i] = Buffer.byteLength(pdf, "utf8");
        pdf += objects[i];
    }
    const xrefPos = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${fontId + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= fontId; i += 1) {
        pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${fontId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.from(pdf, "utf8");
};
const getChineseFontCandidates = () => [
    "C:\\Windows\\Fonts\\simhei.ttf",
    "C:\\Windows\\Fonts\\simfang.ttf",
    "C:\\Windows\\Fonts\\msyh.ttf",
    "C:\\Windows\\Fonts\\msyh.ttc",
    "C:\\Windows\\Fonts\\simsun.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"
];
const normalizeAnswerText = (value) => {
    if (value === undefined || value === null)
        return "\u672a\u4f5c\u7b54";
    if (typeof value === "string")
        return value.trim() || "\u672a\u4f5c\u7b54";
    if (typeof value === "number")
        return String(value);
    if (typeof value === "boolean")
        return value ? "\u662f" : "\u5426";
    if (Array.isArray(value)) {
        const list = value.map(item => normalizeAnswerText(item)).filter(Boolean);
        return list.length > 0 ? list.join("\u3001") : "\u672a\u4f5c\u7b54";
    }
    if (typeof value === "object") {
        try {
            return JSON.stringify(value, null, 2);
        }
        catch {
            return String(value);
        }
    }
    return String(value);
};
const toImageList = (value) => {
    const list = extractImageUrls(value);
    const set = new Set();
    list.forEach(item => {
        const text = String(item || "").trim();
        if (text)
            set.add(text);
    });
    return [...set];
};
const resolveImageForPdf = async (input) => {
    const text = String(input || "").trim();
    if (!text)
        return null;
    try {
        if (text.startsWith("data:image/")) {
            const base64 = text.split(",")[1] || "";
            if (!base64)
                return null;
            return Buffer.from(base64, "base64");
        }
        if (/^[a-z0-9+/=]{200,}$/i.test(text)) {
            return Buffer.from(text, "base64");
        }
        if (text.startsWith("/uploads/")) {
            const localPath = node_path_1.default.resolve(process.cwd(), "public", text.replace(/^\/+/, ""));
            if (node_fs_1.default.existsSync(localPath))
                return localPath;
        }
        if (/^https?:\/\//i.test(text)) {
            const url = new URL(text);
            if (url.pathname.startsWith("/uploads/")) {
                const localPath = node_path_1.default.resolve(process.cwd(), "public", url.pathname.replace(/^\/+/, ""));
                if (node_fs_1.default.existsSync(localPath))
                    return localPath;
            }
            const response = await fetch(text, { method: "GET" });
            if (!response.ok)
                return null;
            const contentType = String(response.headers.get("content-type") || "").toLowerCase();
            if (!contentType.startsWith("image/"))
                return null;
            const ab = await response.arrayBuffer();
            return Buffer.from(ab);
        }
        if (node_fs_1.default.existsSync(text))
            return text;
    }
    catch {
        return null;
    }
    return null;
};
const looksLikeImagePayloadText = (input) => {
    const text = String(input ?? "").trim();
    if (!text)
        return false;
    if (text.startsWith("data:image/"))
        return true;
    if (text.startsWith("/uploads/"))
        return true;
    if (/^https?:\/\//i.test(text))
        return true;
    return /^[a-z0-9+/=]{200,}$/i.test(text);
};
const toSubmissionPdfBuffer = async (params) => {
    const doc = new pdfkit_1.default({ size: "A4", margin: 42 });
    const chunks = [];
    let chineseFontLoaded = false;
    for (const fontPath of getChineseFontCandidates()) {
        if (!node_fs_1.default.existsSync(fontPath))
            continue;
        try {
            doc.font(fontPath);
            chineseFontLoaded = true;
            break;
        }
        catch {
            // try next font candidate
        }
    }
    doc.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const innerW = pageW - 84;
    const labelWidth = 125;
    const firstPageContentTop = 116;
    const normalPageContentTop = 42;
    const drawPageHeader = () => {
        doc
            .fontSize(17)
            .fillColor("#1F2937")
            .text(params.surveyName || `\u95ee\u5377 ${params.surveyId}`, 42, 42, { width: innerW, align: "left" });
        doc
            .fontSize(10)
            .fillColor("#6B7280")
            .text(`\u95ee\u5377ID: ${params.surveyId}    \u63d0\u4ea4ID: ${params.submissionId}`, 42, 68, {
            width: innerW
        });
        doc
            .fontSize(10)
            .fillColor("#6B7280")
            .text(`\u63d0\u4ea4\u65f6\u95f4: ${params.submitTime ? new Date(params.submitTime).toLocaleString("zh-CN") : "-"}`, 42, 84, { width: innerW });
        if (!chineseFontLoaded) {
            doc
                .fontSize(9)
                .fillColor("#DC2626")
                .text("WARNING: CJK font missing, Chinese text may be garbled.", 42, 98, { width: innerW });
        }
        doc.moveTo(42, 104).lineTo(pageW - 42, 104).strokeColor("#E5E7EB").stroke();
        doc.y = firstPageContentTop;
    };
    const ensureBlockSpace = (need = 120) => {
        if (doc.y + need < pageH - 44)
            return;
        doc.addPage();
        doc.y = normalPageContentTop;
    };
    drawPageHeader();
    let index = 0;
    for (const question of params.questions) {
        index += 1;
        if (question.displayOnly)
            continue;
        if (!isAnswerableType(question.type || ""))
            continue;
        const title = String(question.title || question.field || `\u95ee\u9898${index}`).trim();
        const isDisplay = question.displayOnly;
        const displayTypeToken = normalizeTypeToken(question.type || "");
        const isTitleLike = isDisplay && (displayTypeToken.includes("title") || displayTypeToken.includes("text"));
        const isDividerLike = isDisplay && displayTypeToken.includes("divider");
        const isImageDisplay = isDisplay && displayTypeToken.includes("image");
        const rawValue = isDisplay ? undefined : readSubmissionValue(params.answers, question.field);
        const normalized = isDisplay ? "" : normalizeAnswerText(rawValue);
        const answerTextRaw = isDisplay
            ? String(question.displayPayload?.text || title || "").trim()
            : question.kind === "choice" && Array.isArray(rawValue)
                ? rawValue.map(item => `- ${normalizeAnswerText(item)}`).join("\n")
                : normalized;
        const displayText = isDisplay && isImageDisplay ? "" : answerTextRaw;
        const images = isDisplay
            ? toImageList(question.displayPayload?.image || question.displayPayload?.text)
            : toImageList(rawValue);
        const answerTypeToken = normalizeTypeToken(question.type || "");
        const isSignatureOrUploadAnswer = !isDisplay &&
            (question.kind === "upload" || answerTypeToken.includes("sign") || answerTypeToken.includes("upload"));
        const hideRawImageText = isSignatureOrUploadAnswer && images.length > 0 && looksLikeImagePayloadText(rawValue);
        const answerText = hideRawImageText ? "" : answerTextRaw;
        if (isDisplay && !displayText && images.length <= 0 && !title)
            continue;
        if (isDividerLike) {
            ensureBlockSpace(26);
            const dividerY = doc.y + 12;
            doc.moveTo(42, dividerY).lineTo(pageW - 42, dividerY).strokeColor("#DCDFE6").stroke();
            if (displayText) {
                doc
                    .fontSize(10)
                    .fillColor("#909399")
                    .text(displayText, 42, dividerY - 8, { width: innerW, align: "center" });
            }
            doc.y = dividerY + 8;
            continue;
        }
        if (isTitleLike && displayText) {
            const titleH = doc.heightOfString(displayText, { width: innerW, lineGap: 3 });
            ensureBlockSpace(titleH + 14);
            doc.fontSize(14).fillColor("#303133").text(displayText, 42, doc.y + 2, {
                width: innerW,
                lineGap: 3
            });
            doc.y += titleH + 10;
            continue;
        }
        if (isDisplay) {
            const displayTextValue = displayText || "";
            const textWidth = innerW;
            doc.fontSize(12);
            const textHeight = displayTextValue
                ? doc.heightOfString(displayTextValue, { width: textWidth, lineGap: 4 })
                : 0;
            const imgW = 96;
            const imgH = 96;
            const imgGap = 8;
            const cols = Math.max(1, Math.floor((innerW + imgGap) / (imgW + imgGap)));
            const imgRows = Math.ceil(Math.min(images.length, 12) / cols);
            const imgHeight = images.length > 0 ? imgRows * imgH + (imgRows - 1) * imgGap : 0;
            const blockHeight = textHeight + (textHeight > 0 && imgHeight > 0 ? 6 : 0) + imgHeight + 4;
            ensureBlockSpace(blockHeight + 8);
            const x = 42;
            const y = doc.y;
            if (displayTextValue) {
                doc.fontSize(12).fillColor("#303133").text(displayTextValue, x, y, {
                    width: textWidth,
                    lineGap: 4
                });
            }
            if (images.length > 0) {
                let imgX = x;
                let imgY = y + textHeight + (textHeight > 0 ? 8 : 0);
                const imageItems = images.slice(0, 12);
                for (let idx = 0; idx < imageItems.length; idx += 1) {
                    const item = imageItems[idx];
                    try {
                        const imageSource = await resolveImageForPdf(item);
                        if (imageSource) {
                            doc.image(imageSource, imgX, imgY, { fit: [imgW, imgH] });
                        }
                        else {
                            doc.rect(imgX, imgY, imgW, imgH).strokeColor("#D1D5DB").stroke();
                        }
                    }
                    catch {
                        doc.rect(imgX, imgY, imgW, imgH).strokeColor("#D1D5DB").stroke();
                    }
                    if ((idx + 1) % cols === 0) {
                        imgX = x;
                        imgY += imgH + imgGap;
                    }
                    else {
                        imgX += imgW + imgGap;
                    }
                }
            }
            doc.y = y + blockHeight + 2;
            continue;
        }
        const contentWidth = innerW - labelWidth - 20;
        doc.fontSize(11);
        const fallbackText = answerText ? answerText : images.length > 0 ? "" : "\u672a\u4f5c\u7b54";
        const textHeight = fallbackText
            ? doc.heightOfString(fallbackText, {
                width: contentWidth,
                lineGap: 3
            })
            : 0;
        const imageRows = Math.ceil(Math.min(images.length, 8) / 4);
        const imageHeight = images.length > 0 ? imageRows * 66 + (imageRows - 1) * 8 + 12 : 0;
        const blockHeight = Math.max(40, 14 + textHeight + imageHeight + 8);
        ensureBlockSpace(blockHeight + 8);
        const x = 42;
        const y = doc.y;
        const contentX = x + labelWidth;
        const contentW = innerW - labelWidth;
        // Borderless form-like row: left label + right value.
        doc.fontSize(12).fillColor("#606266").text(`${title}`, x, y + 6, {
            width: labelWidth - 12,
            align: "left"
        });
        doc
            .fontSize(11)
            .fillColor("#303133")
            .text(fallbackText, contentX, y + 6, {
            width: contentW - 6,
            lineGap: 3
        });
        if (images.length > 0) {
            let imgX = contentX;
            let imgY = y + 8 + textHeight;
            const imgW = 66;
            const imgH = 66;
            const imageItems = images.slice(0, 8);
            for (let idx = 0; idx < imageItems.length; idx += 1) {
                const item = imageItems[idx];
                try {
                    const imageSource = await resolveImageForPdf(item);
                    if (imageSource) {
                        doc.image(imageSource, imgX, imgY, { fit: [imgW, imgH] });
                    }
                    else {
                        doc.rect(imgX, imgY, imgW, imgH).strokeColor("#D1D5DB").stroke();
                        doc
                            .fontSize(8)
                            .fillColor("#6B7280");
                        doc.text(isDisplay ? "\u56fe\u7247" : "\u56fe\u7247URL", imgX + 6, imgY + 26, {
                            width: imgW - 12,
                            align: "center"
                        });
                    }
                }
                catch {
                    doc.rect(imgX, imgY, imgW, imgH).strokeColor("#D1D5DB").stroke();
                }
                if ((idx + 1) % 4 === 0) {
                    imgX = contentX + 12;
                    imgY += imgH + 8;
                }
                else {
                    imgX += imgW + 8;
                }
            }
        }
        doc
            .moveTo(42, y + blockHeight + 2)
            .lineTo(pageW - 42, y + blockHeight + 2)
            .strokeColor("#E5E7EB")
            .stroke();
        doc.y = y + blockHeight + 8;
    }
    doc.end();
    return await new Promise((resolve, reject) => {
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
    });
};
const zipBuffers = async (files) => {
    const output = new node_stream_1.PassThrough();
    const archive = (0, archiver_1.default)("zip", { zlib: { level: 9 } });
    const chunks = [];
    output.on("data", chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    archive.pipe(output);
    files.forEach(file => archive.append(file.content, { name: file.name }));
    await archive.finalize();
    await new Promise((resolve, reject) => {
        output.on("end", () => resolve());
        output.on("error", reject);
        archive.on("error", reject);
    });
    return Buffer.concat(chunks);
};
router.post("/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "QuerySurveyList");
    try {
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(200, Number(req.body?.pageSize) || 20));
        const keyword = normalizeText(req.body?.keyword, 120);
        const statusInput = normalizeText(req.body?.status, 20);
        const where = {};
        if (keyword) {
            where[sequelize_1.Op.or] = [
                { name: { [sequelize_1.Op.like]: `%${keyword}%` } },
                { description: { [sequelize_1.Op.like]: `%${keyword}%` } }
            ];
        }
        if (statusInput && STATUS_SET.has(statusInput)) {
            where.status = statusInput;
        }
        const { rows, count } = await surveyQuestionnaire_1.default.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        return op.success({
            list: rows.map(item => toPayload(item)),
            total: count,
            currentPage,
            pageSize
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询问卷列表失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "CreateSurvey");
    try {
        const parsed = validateSavePayload(req.body || {});
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const payload = {
            ...parsed.data,
            publishTime: parsed.data.status === "published" ? new Date() : null
        };
        const created = await surveyQuestionnaire_1.default.create(payload);
        return op.success(toPayload(created), "新增成功");
    }
    catch (error) {
        return op.error(`新增问卷失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "UpdateSurvey");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        const parsed = validateSavePayload(req.body || {});
        if (!parsed.ok)
            return op.error(parsed.message, 400);
        const nextStatus = parsed.data.status;
        const payload = {
            ...parsed.data
        };
        if (nextStatus === "published" && !row.publishTime) {
            payload.publishTime = new Date();
        }
        if (nextStatus !== "published") {
            payload.publishTime = null;
        }
        await row.update(payload);
        return op.success(toPayload(row), "更新成功");
    }
    catch (error) {
        return op.error(`更新问卷失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "DeleteSurvey");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        await row.destroy();
        return op.success({ id }, "删除成功");
    }
    catch (error) {
        return op.error(`删除问卷失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/submit", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "SubmitSurvey");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        const schema = normalizeSchema(row.schema);
        const questionCount = countSchemaQuestions(schema);
        if (questionCount <= 0)
            return op.error("问卷暂无可填写题目", 400);
        const answersRaw = req.body?.answers;
        const answers = answersRaw && typeof answersRaw === "object" && !Array.isArray(answersRaw)
            ? answersRaw
            : {};
        const created = await surveySubmission_1.default.create({
            surveyId: id,
            answers,
            submitTime: new Date()
        });
        const nextCount = Number(row.responseCount || 0) + 1;
        await row.update({ responseCount: nextCount });
        return op.success({
            id,
            submissionId: Number(created.id || 0),
            responseCount: nextCount
        }, "提交成功");
    }
    catch (error) {
        return op.error(`提交问卷失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/stats", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "QuerySurveyStats");
    try {
        const [total, draftCount, publishedCount, closedCount, recentRows, allRows] = await Promise.all([
            surveyQuestionnaire_1.default.count(),
            surveyQuestionnaire_1.default.count({ where: { status: "draft" } }),
            surveyQuestionnaire_1.default.count({ where: { status: "published" } }),
            surveyQuestionnaire_1.default.count({ where: { status: "closed" } }),
            surveyQuestionnaire_1.default.findAll({ order: [["updatedAt", "DESC"]], limit: 10 }),
            surveyQuestionnaire_1.default.findAll({ attributes: ["responseCount"] })
        ]);
        const responseTotal = allRows.reduce((sum, row) => sum + Number(row.responseCount || 0), 0);
        const recent = recentRows.map(item => {
            const payload = toPayload(item);
            return {
                id: payload.id,
                name: payload.name,
                status: payload.status,
                questionCount: countSchemaQuestions(payload.schema),
                responseCount: payload.responseCount,
                updateTime: payload.updateTime
            };
        });
        return op.success({
            total,
            draftCount,
            publishedCount,
            closedCount,
            responseTotal,
            recent
        }, "操作成功");
    }
    catch (error) {
        return op.error(`获取统计数据失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/stats/detail", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "QuerySurveyStatsDetail");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        const payload = toPayload(row);
        const questions = extractQuestionsFromSchema(payload.schema);
        const submissions = await surveySubmission_1.default.findAll({
            where: { surveyId: id },
            order: [["id", "DESC"]],
            attributes: ["id", "answers", "submitTime"]
        });
        const questionStats = questions.map(question => {
            if (question.displayOnly) {
                return {
                    field: question.field,
                    title: question.title,
                    type: question.type,
                    kind: question.kind,
                    totalSubmissions: submissions.length,
                    answeredCount: 0,
                    emptyCount: 0,
                    options: [],
                    textSampleCount: 0,
                    textSamples: [],
                    timeSeries: [],
                    displayOnly: true,
                    displayPayload: question.displayPayload
                };
            }
            const answeredValues = [];
            const textSamples = [];
            const numberValues = [];
            const imageSamples = [];
            const optionCounter = new Map();
            const timeCounter = new Map();
            const rangeStartCounter = new Map();
            const rangeEndCounter = new Map();
            const rangePairs = [];
            let emptyCount = 0;
            const switchQuestion = isSwitchType(question.type);
            const uploadQuestion = isUploadType(question.type);
            const rangeQuestion = /range|daterange|datetimerange/i.test(String(question.type || ""));
            submissions.forEach(item => {
                let value = readSubmissionValue(item.answers, question.field);
                if (switchQuestion && (value === undefined || value === null || value === "")) {
                    // Switch field can be omitted when false; treat missing as false for stats.
                    value = false;
                }
                if (isEmptyAnswer(value)) {
                    emptyCount += 1;
                    return;
                }
                answeredValues.push(value);
                if (question.kind === "choice") {
                    const values = switchQuestion
                        ? [normalizeSwitchValue(value)]
                        : Array.isArray(value)
                            ? value
                            : [value];
                    values.forEach(raw => {
                        const key = String(raw ?? "").trim();
                        if (!key)
                            return;
                        optionCounter.set(key, Number(optionCounter.get(key) || 0) + 1);
                    });
                }
                if (question.kind === "text") {
                    const text = Array.isArray(value)
                        ? value.map(item => String(item ?? "").trim()).filter(Boolean).join(" / ")
                        : String(value ?? "").trim();
                    if (text)
                        textSamples.push(text);
                }
                if (question.kind === "date") {
                    if (rangeQuestion) {
                        const rangeValue = parseRangeEndpoints(value);
                        if (!rangeValue)
                            return;
                        const [startRaw, endRaw] = rangeValue;
                        const startKey = normalizeTimeBucketKey(startRaw);
                        const endKey = normalizeTimeBucketKey(endRaw);
                        const startPoint = normalizeTimePointKey(startRaw);
                        const endPoint = normalizeTimePointKey(endRaw);
                        if (startKey) {
                            rangeStartCounter.set(startKey, Number(rangeStartCounter.get(startKey) || 0) + 1);
                        }
                        if (endKey) {
                            rangeEndCounter.set(endKey, Number(rangeEndCounter.get(endKey) || 0) + 1);
                        }
                        if (startPoint && endPoint) {
                            rangePairs.push({ start: startPoint, end: endPoint });
                        }
                    }
                    else {
                        const values = Array.isArray(value) ? value : [value];
                        values.forEach(raw => {
                            const key = normalizeTimeBucketKey(raw);
                            if (!key)
                                return;
                            timeCounter.set(key, Number(timeCounter.get(key) || 0) + 1);
                        });
                    }
                }
                if (question.kind === "number") {
                    const values = Array.isArray(value) ? value : [value];
                    values.forEach(raw => {
                        const parsed = toNumber(raw);
                        if (parsed === null)
                            return;
                        numberValues.push(parsed);
                    });
                }
                if (uploadQuestion || question.kind === "upload") {
                    extractImageUrls(value).forEach(url => {
                        if (!url)
                            return;
                        imageSamples.push(url);
                    });
                }
            });
            const optionStats = question.options.map(option => ({
                label: option.label,
                value: option.value,
                count: Number(optionCounter.get(option.value) || 0)
            }));
            // Include dynamic options that were submitted but not in rule options.
            optionCounter.forEach((count, value) => {
                if (optionStats.some(item => item.value === value))
                    return;
                optionStats.push({ label: value, value, count });
            });
            const timeSeries = [...timeCounter.entries()]
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));
            const rangeStartSeries = [...rangeStartCounter.entries()]
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));
            const rangeEndSeries = [...rangeEndCounter.entries()]
                .map(([date, count]) => ({ date, count }))
                .sort((a, b) => a.date.localeCompare(b.date));
            const numberValidCount = numberValues.length;
            const numberSum = numberValues.reduce((sum, value) => sum + value, 0);
            const numberAvg = numberValidCount > 0 ? Number((numberSum / numberValidCount).toFixed(2)) : null;
            const numberMin = numberValidCount > 0 ? Math.min(...numberValues) : null;
            const numberMax = numberValidCount > 0 ? Math.max(...numberValues) : null;
            const uniqImages = [...new Set(imageSamples)];
            return {
                field: question.field,
                title: question.title,
                type: question.type,
                kind: question.kind,
                totalSubmissions: submissions.length,
                answeredCount: answeredValues.length,
                emptyCount,
                options: question.kind === "choice" ? optionStats : [],
                textSampleCount: question.kind === "text" ? textSamples.length : 0,
                textSamples: question.kind === "text" ? textSamples.slice(0, 10) : [],
                timeSeries: question.kind === "date" ? timeSeries : [],
                rangeSeries: question.kind === "date" && rangeQuestion
                    ? {
                        start: rangeStartSeries,
                        end: rangeEndSeries
                    }
                    : null,
                rangePairs: question.kind === "date" && rangeQuestion ? rangePairs.slice(0, 300) : [],
                numberStats: question.kind === "number"
                    ? {
                        avg: numberAvg,
                        min: numberMin,
                        max: numberMax,
                        validCount: numberValidCount
                    }
                    : null,
                imageSampleCount: uploadQuestion || question.kind === "upload" ? uniqImages.length : 0,
                imageSamples: uploadQuestion || question.kind === "upload" ? uniqImages.slice(0, 50) : [],
                displayOnly: false,
                displayPayload: question.displayPayload
            };
        });
        return op.success({
            survey: {
                id: payload.id,
                name: payload.name,
                status: payload.status,
                responseCount: payload.responseCount,
                updateTime: payload.updateTime
            },
            questionStats
        }, "操作成功");
    }
    catch (error) {
        return op.error(`获取问卷详情统计失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/stats/textAnswers", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "QuerySurveyTextAnswers");
    try {
        const id = Number(req.body?.id);
        const field = String(req.body?.field || "").trim();
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(100, Number(req.body?.pageSize) || 20));
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        if (!field)
            return op.error("缺少有效 field", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        const submissions = await surveySubmission_1.default.findAll({
            where: { surveyId: id },
            order: [["id", "DESC"]],
            attributes: ["id", "answers", "submitTime"]
        });
        const filtered = submissions
            .map(item => {
            const value = readSubmissionValue(item.answers, field);
            if (isEmptyAnswer(value))
                return null;
            const text = Array.isArray(value)
                ? value.map(part => String(part ?? "").trim()).filter(Boolean).join(" / ")
                : String(value ?? "").trim();
            if (!text)
                return null;
            return {
                id: Number(item.id || 0),
                value: text,
                submitTime: item.submitTime
                    ? new Date(item.submitTime).getTime()
                    : Date.now()
            };
        })
            .filter(Boolean);
        const total = filtered.length;
        const list = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        return op.success({
            list,
            total,
            currentPage,
            pageSize
        }, "操作成功");
    }
    catch (error) {
        return op.error(`获取文本填写列表失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/submissions/exportPdf", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "ExportSurveySubmissionsPdf");
    try {
        const id = Number(req.body?.id);
        const submissionId = Number(req.body?.submissionId);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        const payload = toPayload(row);
        const questions = extractQuestionsFromSchema(payload.schema);
        const where = { surveyId: id };
        if (Number.isFinite(submissionId) && submissionId > 0)
            where.id = submissionId;
        const submissions = await surveySubmission_1.default.findAll({
            where,
            order: [["id", "ASC"]],
            attributes: ["id", "answers", "submitTime"]
        });
        if (submissions.length <= 0)
            return op.error("暂无填报数据", 404);
        let pdfBuffer;
        if (Number.isFinite(submissionId) && submissionId > 0) {
            const item = submissions[0];
            pdfBuffer = await toSubmissionPdfBuffer({
                surveyId: id,
                surveyName: payload.name || `问卷-${id}`,
                submissionId: Number(item.id || 0),
                submitTime: item.submitTime,
                answers: item.answers || {},
                questions
            });
        }
        else {
            const pages = submissions.map(item => [
                `提交ID: ${Number(item.id || 0)}`,
                `提交时间: ${item.submitTime ? new Date(item.submitTime).toLocaleString("zh-CN") : "-"}`,
                JSON.stringify(item.answers || {}, null, 2)
            ]);
            pdfBuffer = buildSimplePdf(pages);
        }
        const safeName = toAscii(payload.name || `survey-${id}`) || `survey-${id}`;
        const suffix = Number.isFinite(submissionId) && submissionId > 0
            ? `submission-${submissionId}.pdf`
            : "submissions.pdf";
        return op.success({
            fileName: `${safeName}-${suffix}`,
            contentBase64: pdfBuffer.toString("base64"),
            total: submissions.length
        }, "导出成功");
    }
    catch (error) {
        return op.error(`导出填报PDF失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/submissions/exportZip", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "ExportSurveySubmissionsZip");
    try {
        const id = Number(req.body?.id);
        const submissionIdsRaw = Array.isArray(req.body?.submissionIds) ? req.body.submissionIds : [];
        const submissionIds = submissionIdsRaw
            .map((item) => Number(item))
            .filter((item) => Number.isFinite(item) && item > 0);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("问卷不存在", 404);
        const payload = toPayload(row);
        const questions = extractQuestionsFromSchema(payload.schema);
        const where = { surveyId: id };
        if (submissionIds.length > 0)
            where.id = { [sequelize_1.Op.in]: submissionIds };
        const submissions = await surveySubmission_1.default.findAll({
            where,
            order: [["id", "ASC"]],
            attributes: ["id", "answers", "submitTime"]
        });
        if (submissions.length <= 0)
            return op.error("暂无填报数据", 404);
        const safeName = toAscii(payload.name || `survey-${id}`) || `survey-${id}`;
        const files = [];
        for (const item of submissions) {
            const currentSubmissionId = Number(item.id || 0);
            const pdfBuffer = await toSubmissionPdfBuffer({
                surveyId: id,
                surveyName: payload.name || `问卷-${id}`,
                submissionId: currentSubmissionId,
                submitTime: item.submitTime,
                answers: item.answers || {},
                questions
            });
            files.push({
                name: `${safeName}-submission-${currentSubmissionId}.pdf`,
                content: pdfBuffer
            });
        }
        const zipBuffer = await zipBuffers(files);
        return op.success({
            fileName: `${safeName}-submissions.zip`,
            contentBase64: zipBuffer.toString("base64"),
            total: submissions.length
        }, "导出成功");
    }
    catch (error) {
        return op.error(`导出填报ZIP失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/workflow/template/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "QueryWorkflowTemplateList");
    try {
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(100, Number(req.body?.pageSize) || 20));
        const keyword = String(req.body?.keyword || "").trim();
        const status = String(req.body?.status || "").trim();
        const where = {};
        if (keyword)
            where.name = { [sequelize_1.Op.like]: `%${keyword}%` };
        if (status && WORKFLOW_STATUS_SET.has(status))
            where.status = status;
        const { rows, count } = await surveyWorkflowTemplate_1.default.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const list = rows.map(item => {
            const formSchemaRaw = item.formSchema || {};
            const formSchema = { ...formSchemaRaw };
            delete formSchema.__workflowFlowGraph;
            delete formSchema.__workflowBpmnXml;
            return {
                id: Number(item.id || 0),
                name: String(item.name || ""),
                description: String(item.description || ""),
                status: String(item.status || "enabled"),
                formSchema,
                flowGraph: normalizeFlowGraph(formSchemaRaw.__workflowFlowGraph),
                flowBpmnXml: String(formSchemaRaw.__workflowBpmnXml || ""),
                workflowSteps: Array.isArray(item.workflowSteps) ? item.workflowSteps : [],
                createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
                updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
            };
        });
        return op.success({ list, total: count, currentPage, pageSize }, "操作成功");
    }
    catch (error) {
        return op.error(`查询工作流模板失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/workflow/template/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "CreateWorkflowTemplate");
    try {
        const name = normalizeText(req.body?.name, 120);
        if (!name)
            return op.error("模板名称不能为空", 400);
        const description = normalizeText(req.body?.description, 500);
        const formSchemaInput = normalizeSchema(req.body?.formSchema);
        delete formSchemaInput.__workflowFlowGraph;
        delete formSchemaInput.__workflowBpmnXml;
        const flowGraph = normalizeFlowGraph(req.body?.flowGraph);
        const flowBpmnXml = await (0, bpmnWorkflow_1.ensureNormalizedBpmnXml)({
            rawXml: req.body?.flowBpmnXml,
            flowGraph,
            workflowSteps: req.body?.workflowSteps
        });
        const workflowSteps = await (0, bpmnWorkflow_1.extractWorkflowStepsFromBpmnXml)(flowBpmnXml);
        if (workflowSteps.length <= 0)
            return op.error("流程至少包含一个用户任务节点", 400);
        const formSchema = {
            ...formSchemaInput,
            __workflowFlowGraph: flowGraph,
            __workflowBpmnXml: flowBpmnXml
        };
        const status = WORKFLOW_STATUS_SET.has(String(req.body?.status || "enabled"))
            ? String(req.body?.status)
            : "enabled";
        const created = await surveyWorkflowTemplate_1.default.create({
            name,
            description,
            formSchema,
            workflowSteps,
            status: status
        });
        return op.success({ id: Number(created.id || 0) }, "创建成功");
    }
    catch (error) {
        return op.error(`创建工作流模板失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/workflow/template/update", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "UpdateWorkflowTemplate");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyWorkflowTemplate_1.default.findByPk(id);
        if (!row)
            return op.error("模板不存在", 404);
        const name = normalizeText(req.body?.name, 120);
        if (!name)
            return op.error("模板名称不能为空", 400);
        const description = normalizeText(req.body?.description, 500);
        const formSchemaInput = normalizeSchema(req.body?.formSchema);
        delete formSchemaInput.__workflowFlowGraph;
        delete formSchemaInput.__workflowBpmnXml;
        const flowGraph = normalizeFlowGraph(req.body?.flowGraph);
        const flowBpmnXml = await (0, bpmnWorkflow_1.ensureNormalizedBpmnXml)({
            rawXml: req.body?.flowBpmnXml,
            flowGraph,
            workflowSteps: req.body?.workflowSteps
        });
        const workflowSteps = await (0, bpmnWorkflow_1.extractWorkflowStepsFromBpmnXml)(flowBpmnXml);
        if (workflowSteps.length <= 0)
            return op.error("流程至少包含一个用户任务节点", 400);
        const formSchema = {
            ...formSchemaInput,
            __workflowFlowGraph: flowGraph,
            __workflowBpmnXml: flowBpmnXml
        };
        const status = WORKFLOW_STATUS_SET.has(String(req.body?.status || "enabled"))
            ? String(req.body?.status)
            : "enabled";
        await row.update({ name, description, formSchema, workflowSteps, status });
        return op.success({}, "更新成功");
    }
    catch (error) {
        return op.error(`更新工作流模板失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/workflow/template/delete", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "DeleteWorkflowTemplate");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyWorkflowTemplate_1.default.findByPk(id);
        if (!row)
            return op.error("模板不存在", 404);
        await row.destroy();
        return op.success({}, "删除成功");
    }
    catch (error) {
        return op.error(`删除工作流模板失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/workflow/instance/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "QueryWorkflowInstanceList");
    try {
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(100, Number(req.body?.pageSize) || 20));
        const templateId = Number(req.body?.templateId || 0);
        const status = String(req.body?.status || "").trim();
        const mode = String(req.body?.mode || "all").trim();
        const operator = await resolveOperator(req);
        const where = {};
        if (templateId > 0)
            where.templateId = templateId;
        if (status && WORKFLOW_INSTANCE_STATUS_SET.has(status))
            where.status = status;
        if (mode === "mine" && operator.userId > 0)
            where.submitterId = operator.userId;
        const { rows, count } = await surveyWorkflowInstance_1.default.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const filtered = mode === "todo" && operator.userId > 0
            ? rows.filter(item => {
                const currentApproverIds = Array.isArray(item.currentApproverIds)
                    ? item.currentApproverIds.map((x) => Number(x))
                    : [];
                const currentApproverRoleCodes = Array.isArray(item.currentApproverRoleCodes)
                    ? item.currentApproverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
                    : [];
                const roleHit = currentApproverRoleCodes.length > 0 &&
                    currentApproverRoleCodes.some((code) => operator.roleCodes.includes(code));
                return (String(item.status || "") === "pending" &&
                    ((currentApproverIds.length === 0 && currentApproverRoleCodes.length === 0) ||
                        currentApproverIds.includes(operator.userId) ||
                        roleHit));
            })
            : rows;
        const list = filtered.map(item => ({
            id: Number(item.id || 0),
            templateId: Number(item.templateId || 0),
            templateName: String(item.templateName || ""),
            status: String(item.status || "pending"),
            currentStepIndex: Number(item.currentStepIndex || 0),
            submitterId: Number(item.submitterId || 0),
            submitterName: String(item.submitterName || ""),
            currentApproverIds: Array.isArray(item.currentApproverIds)
                ? item.currentApproverIds
                : [],
            currentApproverRoleCodes: Array.isArray(item.currentApproverRoleCodes)
                ? item.currentApproverRoleCodes
                : [],
            submittedAt: item.submittedAt ? new Date(item.submittedAt).getTime() : Date.now(),
            finishedAt: item.finishedAt ? new Date(item.finishedAt).getTime() : null,
            updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
        }));
        return op.success({ list, total: count, currentPage, pageSize }, "操作成功");
    }
    catch (error) {
        return op.error(`查询工作流实例失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/workflow/instance/detail", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "QueryWorkflowInstanceDetail");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyWorkflowInstance_1.default.findByPk(id);
        if (!row)
            return op.error("实例不存在", 404);
        return op.success({
            id: Number(row.id || 0),
            templateId: Number(row.templateId || 0),
            templateName: String(row.templateName || ""),
            formData: row.formData || {},
            stepsSnapshot: Array.isArray(row.stepsSnapshot) ? row.stepsSnapshot : [],
            currentStepIndex: Number(row.currentStepIndex || 0),
            status: String(row.status || "pending"),
            submitterId: Number(row.submitterId || 0),
            submitterName: String(row.submitterName || ""),
            currentApproverIds: Array.isArray(row.currentApproverIds)
                ? row.currentApproverIds
                : [],
            currentApproverRoleCodes: Array.isArray(row.currentApproverRoleCodes)
                ? row.currentApproverRoleCodes
                : [],
            flowLogs: Array.isArray(row.flowLogs) ? row.flowLogs : [],
            submittedAt: row.submittedAt ? new Date(row.submittedAt).getTime() : Date.now(),
            finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询工作流实例详情失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/workflow/instance/create", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "CreateWorkflowInstance");
    try {
        const templateId = Number(req.body?.templateId);
        if (!Number.isFinite(templateId) || templateId <= 0)
            return op.error("缺少有效 templateId", 400);
        const template = await surveyWorkflowTemplate_1.default.findByPk(templateId);
        if (!template)
            return op.error("模板不存在", 404);
        if (String(template.status || "") !== "enabled")
            return op.error("模板已禁用", 400);
        const formData = normalizeSchema(req.body?.formData);
        const steps = Array.isArray(template.workflowSteps) ? template.workflowSteps : [];
        const firstStep = steps[0] || { name: "提交", approverIds: [], approverRoleCodes: [] };
        const operator = await resolveOperator(req);
        const initialStatus = steps.length <= 0 ? "approved" : "pending";
        const created = await surveyWorkflowInstance_1.default.create({
            templateId: Number(template.id || templateId),
            templateName: String(template.name || ""),
            formData,
            stepsSnapshot: steps,
            currentStepIndex: 0,
            status: initialStatus,
            submitterId: operator.userId,
            submitterName: operator.username,
            currentApproverIds: Array.isArray(firstStep?.approverIds) ? firstStep.approverIds : [],
            currentApproverRoleCodes: Array.isArray(firstStep?.approverRoleCodes)
                ? firstStep.approverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
                : [],
            flowLogs: [
                {
                    action: "submit",
                    operatorId: operator.userId,
                    operatorName: operator.username,
                    time: Date.now(),
                    comment: ""
                }
            ],
            submittedAt: new Date(),
            finishedAt: initialStatus === "approved" ? new Date() : null
        });
        return op.success({ id: Number(created.id || 0) }, "提交成功");
    }
    catch (error) {
        return op.error(`创建工作流实例失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/workflow/instance/action", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流", "ActionWorkflowInstance");
    try {
        const id = Number(req.body?.id);
        const action = String(req.body?.action || "").trim().toLowerCase();
        const comment = normalizeText(req.body?.comment, 500);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        if (!["approve", "reject", "cancel"].includes(action))
            return op.error("无效 action", 400);
        const row = await surveyWorkflowInstance_1.default.findByPk(id);
        if (!row)
            return op.error("实例不存在", 404);
        if (String(row.status || "") !== "pending")
            return op.error("当前状态不可操作", 400);
        const operator = await resolveOperator(req);
        const currentApproverIds = Array.isArray(row.currentApproverIds)
            ? row.currentApproverIds.map((x) => Number(x))
            : [];
        const currentApproverRoleCodes = Array.isArray(row.currentApproverRoleCodes)
            ? row.currentApproverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
            : [];
        const roleHit = currentApproverRoleCodes.length > 0 &&
            currentApproverRoleCodes.some((code) => operator.roleCodes.includes(code));
        if ((currentApproverIds.length > 0 || currentApproverRoleCodes.length > 0) &&
            operator.userId > 0 &&
            !currentApproverIds.includes(operator.userId) &&
            !roleHit) {
            return op.error("无审批权限", 403);
        }
        const steps = Array.isArray(row.stepsSnapshot) ? row.stepsSnapshot : [];
        const flowLogs = Array.isArray(row.flowLogs) ? row.flowLogs : [];
        let status = String(row.status || "pending");
        let currentStepIndex = Number(row.currentStepIndex || 0);
        let nextApproverIds = currentApproverIds;
        let nextApproverRoleCodes = currentApproverRoleCodes;
        let finishedAt = null;
        if (action === "reject") {
            status = "rejected";
            nextApproverIds = [];
            nextApproverRoleCodes = [];
            finishedAt = new Date();
        }
        else if (action === "cancel") {
            status = "cancelled";
            nextApproverIds = [];
            nextApproverRoleCodes = [];
            finishedAt = new Date();
        }
        else {
            const nextIndex = currentStepIndex + 1;
            if (nextIndex >= steps.length) {
                status = "approved";
                nextApproverIds = [];
                nextApproverRoleCodes = [];
                finishedAt = new Date();
            }
            else {
                currentStepIndex = nextIndex;
                nextApproverIds = Array.isArray(steps[nextIndex]?.approverIds) ? steps[nextIndex].approverIds : [];
                nextApproverRoleCodes = Array.isArray(steps[nextIndex]?.approverRoleCodes)
                    ? steps[nextIndex].approverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
                    : [];
            }
        }
        flowLogs.push({
            action,
            operatorId: operator.userId,
            operatorName: operator.username,
            time: Date.now(),
            comment
        });
        await row.update({
            status,
            currentStepIndex,
            currentApproverIds: nextApproverIds,
            currentApproverRoleCodes: nextApproverRoleCodes,
            flowLogs,
            finishedAt
        });
        return op.success({}, "操作成功");
    }
    catch (error) {
        return op.error(`工作流操作失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/submissions/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "问卷调查", "QuerySurveySubmissions");
    try {
        const id = Number(req.body?.id);
        if (!Number.isFinite(id) || id <= 0)
            return op.error("缺少有效 id", 400);
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(100, Number(req.body?.pageSize) || 20));
        const row = await surveyQuestionnaire_1.default.findByPk(id);
        if (!row)
            return op.error("?????", 404);
        const { rows, count } = await surveySubmission_1.default.findAndCountAll({
            where: { surveyId: id },
            order: [["id", "DESC"]],
            attributes: ["id", "answers", "submitTime"],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const list = rows.map(item => {
            const answers = (item.answers || {});
            const preview = JSON.stringify(answers).slice(0, 260);
            return {
                id: Number(item.id || 0),
                submitTime: item.submitTime
                    ? new Date(item.submitTime).getTime()
                    : Date.now(),
                answers,
                preview
            };
        });
        return op.success({
            list,
            total: count,
            currentPage,
            pageSize
        }, "操作成功");
    }
    catch (error) {
        return op.error(`获取问卷填报列表失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
exports.default = router;
