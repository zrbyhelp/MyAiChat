"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const sequelize_1 = require("sequelize");
const surveyWorkflowTemplate_1 = __importDefault(require("../models/surveyWorkflowTemplate"));
const surveyWorkflowInstance_1 = __importDefault(require("../models/surveyWorkflowInstance"));
const user_1 = __importDefault(require("../models/user"));
const userRole_1 = __importDefault(require("../models/userRole"));
const role_1 = __importDefault(require("../models/role"));
const operationLogger_1 = require("../services/operationLogger");
const bpmnWorkflow_1 = require("../services/bpmnWorkflow");
const router = express_1.default.Router();
const TEMPLATE_STATUS_SET = new Set(["enabled", "disabled"]);
const INSTANCE_STATUS_SET = new Set(["pending", "approved", "rejected", "cancelled"]);
const parseUserIdFromAccessToken = (authorization) => {
    const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
    const parts = token.split("_");
    if (parts.length < 3 || parts[0] !== "atk")
        return null;
    const userId = Number(parts[1]);
    return Number.isFinite(userId) && userId > 0 ? userId : null;
};
const normalizeText = (input, maxLength) => String(input ?? "").trim().slice(0, maxLength);
const normalizeSchema = (input) => {
    if (!input)
        return {};
    if (typeof input === "string") {
        try {
            const parsed = JSON.parse(input);
            return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    return typeof input === "object" && !Array.isArray(input) ? input : {};
};
const normalizeFlowGraph = (input) => ({
    nodes: Array.isArray(input?.nodes) ? input.nodes : [],
    edges: Array.isArray(input?.edges) ? input.edges : []
});
const resolveOperator = async (req) => {
    const authHeader = String(req.headers?.authorization || "");
    const userId = parseUserIdFromAccessToken(authHeader);
    if (!userId)
        return { userId: 0, username: "unknown", roleCodes: [] };
    const user = await user_1.default.findByPk(userId);
    const userRoles = await userRole_1.default.findAll({ where: { userId }, attributes: ["roleId"] });
    const roleIds = userRoles
        .map(item => Number(item.roleId))
        .filter(x => Number.isFinite(x) && x > 0);
    const roles = roleIds.length > 0
        ? await role_1.default.findAll({ where: { id: roleIds, status: 1 }, attributes: ["code"] })
        : [];
    return {
        userId,
        username: String(user?.username || `user-${userId}`),
        roleCodes: roles.map(item => String(item.code || "")).filter(Boolean)
    };
};
router.post("/template/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "ListTemplate");
    try {
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(100, Number(req.body?.pageSize) || 20));
        const keyword = normalizeText(req.body?.keyword, 120);
        const status = normalizeText(req.body?.status, 20);
        const where = {};
        if (keyword)
            where.name = { [sequelize_1.Op.like]: `%${keyword}%` };
        if (status && TEMPLATE_STATUS_SET.has(status))
            where.status = status;
        const { rows, count } = await surveyWorkflowTemplate_1.default.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const list = rows.map(item => {
            const schemaRaw = (item.formSchema || {});
            const schema = { ...schemaRaw };
            delete schema.__wf_bpmn_xml;
            delete schema.__wf_flow_graph;
            delete schema.__wf_versions;
            return {
                id: Number(item.id || 0),
                name: String(item.name || ""),
                description: String(item.description || ""),
                status: String(item.status || "enabled"),
                formSchema: schema,
                flowBpmnXml: String(schemaRaw.__wf_bpmn_xml || ""),
                flowGraph: normalizeFlowGraph(schemaRaw.__wf_flow_graph),
                versionCount: Array.isArray(schemaRaw.__wf_versions)
                    ? schemaRaw.__wf_versions.length
                    : 0,
                workflowSteps: Array.isArray(item.workflowSteps) ? item.workflowSteps : [],
                createTime: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
                updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
            };
        });
        return op.success({ list, total: count, currentPage, pageSize }, "操作成功");
    }
    catch (error) {
        return op.error(`查询模板失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/template/save", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "SaveTemplate");
    try {
        const id = Number(req.body?.id || 0);
        const name = normalizeText(req.body?.name, 120);
        if (!name)
            return op.error("模板名称不能为空", 400);
        const description = normalizeText(req.body?.description, 500);
        const status = TEMPLATE_STATUS_SET.has(String(req.body?.status || "enabled"))
            ? String(req.body?.status)
            : "enabled";
        const formSchemaInput = normalizeSchema(req.body?.formSchema);
        delete formSchemaInput.__wf_bpmn_xml;
        delete formSchemaInput.__wf_flow_graph;
        const flowGraph = normalizeFlowGraph(req.body?.flowGraph);
        const flowBpmnXml = await (0, bpmnWorkflow_1.ensureNormalizedBpmnXml)({
            rawXml: req.body?.flowBpmnXml,
            flowGraph
        });
        const workflowSteps = await (0, bpmnWorkflow_1.extractWorkflowStepsFromBpmnXml)(flowBpmnXml);
        if (workflowSteps.length <= 0)
            return op.error("流程至少需要一个用户任务节点", 400);
        const formSchema = {
            ...formSchemaInput,
            __wf_bpmn_xml: flowBpmnXml,
            __wf_flow_graph: flowGraph
        };
        if (id > 0) {
            const row = await surveyWorkflowTemplate_1.default.findByPk(id);
            if (!row)
                return op.error("模板不存在", 404);
            const prevSchema = (row.formSchema || {});
            const prevXml = String(prevSchema.__wf_bpmn_xml || "");
            const prevVersions = Array.isArray(prevSchema.__wf_versions) ? prevSchema.__wf_versions : [];
            const nextVersions = prevXml
                ? [
                    ...prevVersions,
                    { xml: prevXml, time: Date.now(), by: Number((await resolveOperator(req)).userId || 0) }
                ].slice(-10)
                : prevVersions;
            formSchema.__wf_versions = nextVersions;
            await row.update({ name, description, status, formSchema, workflowSteps });
            return op.success({ id }, "保存成功");
        }
        const created = await surveyWorkflowTemplate_1.default.create({
            name,
            description,
            status: status,
            formSchema,
            workflowSteps
        });
        return op.success({ id: Number(created.id || 0) }, "创建成功");
    }
    catch (error) {
        return op.error(`保存模板失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/template/validate", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "ValidateTemplate");
    try {
        const flowGraph = normalizeFlowGraph(req.body?.flowGraph);
        const flowBpmnXml = await (0, bpmnWorkflow_1.ensureNormalizedBpmnXml)({
            rawXml: req.body?.flowBpmnXml,
            flowGraph
        });
        const workflowSteps = await (0, bpmnWorkflow_1.extractWorkflowStepsFromBpmnXml)(flowBpmnXml);
        if (workflowSteps.length <= 0)
            return op.error("流程至少需要一个用户任务节点", 400);
        return op.success({
            ok: true,
            flowBpmnXml,
            stepCount: workflowSteps.length
        }, "校验通过");
    }
    catch (error) {
        return op.error(`流程校验失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/template/remove", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "RemoveTemplate");
    try {
        const id = Number(req.body?.id || 0);
        if (id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyWorkflowTemplate_1.default.findByPk(id);
        if (!row)
            return op.error("模板不存在", 404);
        await row.destroy();
        return op.success({}, "删除成功");
    }
    catch (error) {
        return op.error(`删除模板失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/instance/start", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "StartInstance");
    try {
        const templateId = Number(req.body?.templateId || 0);
        if (templateId <= 0)
            return op.error("缺少有效 templateId", 400);
        const template = await surveyWorkflowTemplate_1.default.findByPk(templateId);
        if (!template)
            return op.error("模板不存在", 404);
        if (String(template.status || "") !== "enabled")
            return op.error("模板未启用", 400);
        const steps = Array.isArray(template.workflowSteps) ? template.workflowSteps : [];
        if (steps.length <= 0)
            return op.error("模板审批步骤为空", 400);
        const operator = await resolveOperator(req);
        const formData = normalizeSchema(req.body?.formData);
        const firstStep = steps[0] || { approverIds: [], approverRoleCodes: [] };
        const runtimeState = await (0, bpmnWorkflow_1.buildInitialRuntimeState)(String(template.formSchema?.__wf_bpmn_xml || ""), formData);
        const aggregated = (0, bpmnWorkflow_1.aggregateApproversFromRuntime)(runtimeState);
        const created = await surveyWorkflowInstance_1.default.create({
            templateId,
            templateName: String(template.name || ""),
            formData,
            stepsSnapshot: runtimeState,
            currentStepIndex: 0,
            status: runtimeState.pendingTasks?.length > 0 ? "pending" : "approved",
            submitterId: operator.userId,
            submitterName: operator.username,
            currentApproverIds: aggregated.approverIds,
            currentApproverRoleCodes: aggregated.approverRoleCodes,
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
            finishedAt: null
        });
        return op.success({ id: Number(created.id || 0) }, "提交成功");
    }
    catch (error) {
        return op.error(`发起流程失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
router.post("/instance/list", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "ListInstance");
    try {
        const currentPage = Math.max(1, Number(req.body?.currentPage) || 1);
        const pageSize = Math.max(1, Math.min(100, Number(req.body?.pageSize) || 20));
        const mode = normalizeText(req.body?.mode, 20) || "all";
        const status = normalizeText(req.body?.status, 20);
        const operator = await resolveOperator(req);
        const where = {};
        if (status && INSTANCE_STATUS_SET.has(status))
            where.status = status;
        if (mode === "mine" && operator.userId > 0)
            where.submitterId = operator.userId;
        const { rows, count } = await surveyWorkflowInstance_1.default.findAndCountAll({
            where,
            order: [["id", "DESC"]],
            offset: (currentPage - 1) * pageSize,
            limit: pageSize
        });
        const filtered = mode === "todo"
            ? rows.filter(item => {
                if (String(item.status || "") !== "pending")
                    return false;
                const ids = Array.isArray(item.currentApproverIds)
                    ? item.currentApproverIds.map((x) => Number(x))
                    : [];
                const roleCodes = Array.isArray(item.currentApproverRoleCodes)
                    ? item.currentApproverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
                    : [];
                const roleHit = roleCodes.some((code) => operator.roleCodes.includes(code));
                return ((ids.length === 0 && roleCodes.length === 0) ||
                    ids.includes(operator.userId) ||
                    roleHit);
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
            submittedAt: item.submittedAt ? new Date(item.submittedAt).getTime() : Date.now(),
            finishedAt: item.finishedAt ? new Date(item.finishedAt).getTime() : null,
            updateTime: item.updatedAt ? new Date(item.updatedAt).getTime() : Date.now()
        }));
        return op.success({ list, total: count, currentPage, pageSize }, "操作成功");
    }
    catch (error) {
        return op.error(`查询实例失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/instance/detail", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "DetailInstance");
    try {
        const id = Number(req.body?.id || 0);
        if (id <= 0)
            return op.error("缺少有效 id", 400);
        const row = await surveyWorkflowInstance_1.default.findByPk(id);
        if (!row)
            return op.error("实例不存在", 404);
        const template = await surveyWorkflowTemplate_1.default.findByPk(Number(row.templateId || 0));
        const templateSchemaRaw = (template?.formSchema || {});
        const templateSchema = { ...templateSchemaRaw };
        delete templateSchema.__wf_bpmn_xml;
        delete templateSchema.__wf_flow_graph;
        delete templateSchema.__wf_versions;
        return op.success({
            id: Number(row.id || 0),
            templateId: Number(row.templateId || 0),
            templateName: String(row.templateName || ""),
            formSchema: templateSchema,
            formData: row.formData || {},
            stepsSnapshot: Array.isArray(row.stepsSnapshot) ? row.stepsSnapshot : [],
            currentStepIndex: Number(row.currentStepIndex || 0),
            status: String(row.status || "pending"),
            submitterId: Number(row.submitterId || 0),
            submitterName: String(row.submitterName || ""),
            currentApproverIds: Array.isArray(row.currentApproverIds) ? row.currentApproverIds : [],
            currentApproverRoleCodes: Array.isArray(row.currentApproverRoleCodes)
                ? row.currentApproverRoleCodes
                : [],
            pendingTasks: Array.isArray(row.stepsSnapshot?.pendingTasks)
                ? row.stepsSnapshot.pendingTasks
                : [],
            flowLogs: Array.isArray(row.flowLogs) ? row.flowLogs : [],
            submittedAt: row.submittedAt ? new Date(row.submittedAt).getTime() : Date.now(),
            finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null
        }, "操作成功");
    }
    catch (error) {
        return op.error(`查询详情失败: ${error instanceof Error ? error.message : String(error)}`, 500);
    }
});
router.post("/instance/action", async (req, res) => {
    const op = (0, operationLogger_1.createOperationLogger)(req, res, "表单工作流V2", "ActionInstance");
    try {
        const id = Number(req.body?.id || 0);
        const action = normalizeText(req.body?.action, 20).toLowerCase();
        const comment = normalizeText(req.body?.comment, 500);
        const taskId = normalizeText(req.body?.taskId, 120);
        const transferToUserIds = Array.isArray(req.body?.transferToUserIds)
            ? req.body.transferToUserIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
            : [];
        const addSignUserIds = Array.isArray(req.body?.addSignUserIds)
            ? req.body.addSignUserIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
            : [];
        const addSignRoleCodes = Array.isArray(req.body?.addSignRoleCodes)
            ? req.body.addSignRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
            : [];
        if (id <= 0)
            return op.error("缺少有效 id", 400);
        if (!["approve", "reject", "cancel", "transfer", "add_sign", "cc", "retry"].includes(action)) {
            return op.error("无效操作", 400);
        }
        const row = await surveyWorkflowInstance_1.default.findByPk(id);
        if (!row)
            return op.error("实例不存在", 404);
        const rowStatus = String(row.status || "");
        if (action !== "retry" && rowStatus !== "pending")
            return op.error("当前状态不可操作", 400);
        if (action === "retry" && !["rejected", "cancelled"].includes(rowStatus)) {
            return op.error("仅驳回或撤销的流程可重试", 400);
        }
        const operator = await resolveOperator(req);
        const submitterId = Number(row.submitterId || 0);
        if (action === "cancel" && operator.userId !== submitterId)
            return op.error("仅提交人可撤销", 403);
        if (["reject", "transfer"].includes(action) && !comment)
            return op.error("该操作必须填写审批意见", 400);
        const runtimeState = (row.stepsSnapshot || {});
        if (!runtimeState || runtimeState.version !== "bpmn-v2") {
            return op.error("流程运行态异常，请重试发起流程", 500);
        }
        const runtimeResult = await (0, bpmnWorkflow_1.applyRuntimeAction)({
            state: runtimeState,
            formData: normalizeSchema(row.formData),
            action: action,
            operator,
            taskId: taskId || undefined,
            transferToUserIds,
            addSignUserIds,
            addSignRoleCodes
        });
        const nextStatus = runtimeResult.status;
        const aggregated = (0, bpmnWorkflow_1.aggregateApproversFromRuntime)(runtimeResult.state);
        const finishedAt = nextStatus === "approved" || nextStatus === "rejected" || nextStatus === "cancelled"
            ? new Date()
            : null;
        const logs = Array.isArray(row.flowLogs) ? row.flowLogs : [];
        logs.push({
            action,
            operatorId: operator.userId,
            operatorName: operator.username,
            time: Date.now(),
            comment,
            taskId: taskId || "",
            message: runtimeResult.message
        });
        await row.update({
            status: nextStatus,
            currentStepIndex: Number(runtimeResult.state.stepCount || 0),
            currentApproverIds: aggregated.approverIds,
            currentApproverRoleCodes: aggregated.approverRoleCodes,
            stepsSnapshot: runtimeResult.state,
            flowLogs: logs,
            finishedAt
        });
        return op.success({}, "操作成功");
    }
    catch (error) {
        return op.error(`流程操作失败: ${error instanceof Error ? error.message : String(error)}`, 400);
    }
});
exports.default = router;
