"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractWorkflowStepsFromBpmnXml = exports.ensureNormalizedBpmnXml = exports.applyRuntimeAction = exports.selectOperableTask = exports.aggregateApproversFromRuntime = exports.buildInitialRuntimeState = exports.flowGraphToBpmnXml = exports.isLikelyBpmnXml = void 0;
const bpmn_engine_1 = require("bpmn-engine");
const { BpmnModdle } = require("bpmn-moddle");
const moddle = new BpmnModdle();
const xmlEscape = (input) => String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
const normalizeNodeText = (node, fallback = "审批") => {
    if (!node)
        return fallback;
    if (typeof node.text === "string" && node.text.trim())
        return node.text.trim();
    if (node.text && typeof node.text === "object" && String(node.text.value || "").trim()) {
        return String(node.text.value || "").trim();
    }
    return fallback;
};
const safeNodeId = (rawId, prefix, idx) => {
    const base = String(rawId || `${prefix}_${idx + 1}`).replace(/[^A-Za-z0-9_\-.]/g, "_");
    if (!base)
        return `${prefix}_${idx + 1}`;
    return /^[A-Za-z_]/.test(base) ? base : `${prefix}_${base}`;
};
const parseTaskMeta = (input) => {
    if (!input || typeof input !== "string")
        return { approverIds: [], approverRoleCodes: [] };
    try {
        const parsed = JSON.parse(input);
        return {
            approverIds: Array.isArray(parsed?.approverIds)
                ? parsed.approverIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
                : [],
            approverRoleCodes: Array.isArray(parsed?.approverRoleCodes)
                ? parsed.approverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
                : []
        };
    }
    catch {
        return { approverIds: [], approverRoleCodes: [] };
    }
};
const normalizeFlowGraph = (input) => ({
    nodes: Array.isArray(input?.nodes) ? input.nodes : [],
    edges: Array.isArray(input?.edges) ? input.edges : []
});
const isLikelyBpmnXml = (input) => {
    const xml = String(input || "").trim();
    if (!xml)
        return false;
    return xml.includes("<bpmn:definitions") || xml.includes("<definitions");
};
exports.isLikelyBpmnXml = isLikelyBpmnXml;
const flowGraphToBpmnXml = (graphInput) => {
    const graph = normalizeFlowGraph(graphInput);
    const xmlHeader = `<?xml version=\"1.0\" encoding=\"UTF-8\"?>`;
    const definitionsOpen = `<bpmn:definitions xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" ` +
        `xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" ` +
        `id=\"Definitions_1\" targetNamespace=\"http://example.com/workflow\">`;
    const processOpen = `<bpmn:process id=\"Process_1\" isExecutable=\"true\">`;
    const edgesNormalized = graph.edges.map((edge, edgeIdx) => ({
        id: safeNodeId(edge?.id, "Flow", edgeIdx),
        sourceNodeId: safeNodeId(edge?.sourceNodeId, "Node", edgeIdx),
        targetNodeId: safeNodeId(edge?.targetNodeId, "Node", edgeIdx),
        condition: String(edge?.properties?.condition || "").trim()
    }));
    const nodes = graph.nodes.map((node, idx) => {
        const nodeId = safeNodeId(node?.id, "Node", idx);
        const type = String(node?.type || "");
        const name = normalizeNodeText(node, type === "bpmn:startEvent" ? "开始" : type === "bpmn:endEvent" ? "结束" : "审批");
        const outgoing = edgesNormalized.filter((edge) => edge.sourceNodeId === nodeId);
        const incoming = edgesNormalized.filter((edge) => edge.targetNodeId === nodeId);
        const incomingXml = incoming.map((edge) => `<bpmn:incoming>${xmlEscape(edge.id)}</bpmn:incoming>`).join("");
        const outgoingXml = outgoing.map((edge) => `<bpmn:outgoing>${xmlEscape(edge.id)}</bpmn:outgoing>`).join("");
        if (type === "bpmn:startEvent") {
            return `<bpmn:startEvent id=\"${xmlEscape(nodeId)}\" name=\"${xmlEscape(name)}\">${incomingXml}${outgoingXml}</bpmn:startEvent>`;
        }
        if (type === "bpmn:endEvent") {
            return `<bpmn:endEvent id=\"${xmlEscape(nodeId)}\" name=\"${xmlEscape(name)}\">${incomingXml}${outgoingXml}</bpmn:endEvent>`;
        }
        if (type === "bpmn:exclusiveGateway" || type === "bpmn:parallelGateway" || type === "bpmn:inclusiveGateway") {
            const tag = type === "bpmn:parallelGateway" ? "parallelGateway" : type === "bpmn:inclusiveGateway" ? "inclusiveGateway" : "exclusiveGateway";
            const defaultFlowId = String(node?.properties?.defaultFlowId || "").trim();
            const defaultAttr = defaultFlowId ? ` default=\"${xmlEscape(defaultFlowId)}\"` : "";
            return `<bpmn:${tag} id=\"${xmlEscape(nodeId)}\" name=\"${xmlEscape(name)}\"${defaultAttr}>${incomingXml}${outgoingXml}</bpmn:${tag}>`;
        }
        const meta = {
            approverIds: Array.isArray(node?.properties?.approverIds)
                ? node.properties.approverIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
                : [],
            approverRoleCodes: Array.isArray(node?.properties?.approverRoleCodes)
                ? node.properties.approverRoleCodes.map((x) => String(x || "").trim()).filter(Boolean)
                : []
        };
        const metaText = xmlEscape(JSON.stringify(meta));
        return `<bpmn:userTask id=\"${xmlEscape(nodeId)}\" name=\"${xmlEscape(name)}\">${incomingXml}${outgoingXml}<bpmn:documentation>${metaText}</bpmn:documentation></bpmn:userTask>`;
    });
    const edges = edgesNormalized.map((edge) => {
        const cond = edge.condition
            ? `<bpmn:conditionExpression xsi:type=\"bpmn:tFormalExpression\">\${${xmlEscape(edge.condition)}}</bpmn:conditionExpression>`
            : "";
        return `<bpmn:sequenceFlow id=\"${xmlEscape(edge.id)}\" sourceRef=\"${xmlEscape(edge.sourceNodeId)}\" targetRef=\"${xmlEscape(edge.targetNodeId)}\">${cond}</bpmn:sequenceFlow>`;
    });
    return [xmlHeader, definitionsOpen, processOpen, ...nodes, ...edges, `</bpmn:process>`, `</bpmn:definitions>`].join("");
};
exports.flowGraphToBpmnXml = flowGraphToBpmnXml;
const stepsToBpmnXml = (stepsInput) => {
    const steps = Array.isArray(stepsInput) ? stepsInput : [];
    const nodes = [
        { id: "Start_1", type: "bpmn:startEvent", text: { value: "开始" } },
        { id: "End_1", type: "bpmn:endEvent", text: { value: "结束" } }
    ];
    const edges = [];
    let prevId = "Start_1";
    steps.forEach((step, idx) => {
        const id = `UserTask_${idx + 1}`;
        nodes.push({
            id,
            type: "bpmn:userTask",
            text: { value: String(step?.name || `审批${idx + 1}`) },
            properties: {
                approverIds: Array.isArray(step?.approverIds) ? step.approverIds : [],
                approverRoleCodes: Array.isArray(step?.approverRoleCodes) ? step.approverRoleCodes : []
            }
        });
        edges.push({ id: `Flow_${idx + 1}`, sourceNodeId: prevId, targetNodeId: id });
        prevId = id;
    });
    edges.push({ id: `Flow_End`, sourceNodeId: prevId, targetNodeId: "End_1" });
    return (0, exports.flowGraphToBpmnXml)({ nodes, edges });
};
const readConditionExpression = (flow) => {
    const cond = flow?.conditionExpression;
    if (!cond)
        return "";
    const text = String(cond?.body || cond?.$body || "").trim();
    if (!text)
        return "";
    return text.replace(/^\$\{/, "").replace(/\}$/, "").trim();
};
const buildBpmnModel = async (xmlInput) => {
    const xml = String(xmlInput || "").trim();
    if (!xml)
        throw new Error("BPMN XML 不能为空");
    const parsed = await moddle.fromXML(xml);
    const definitions = parsed.rootElement;
    const processes = Array.isArray(definitions?.rootElements)
        ? definitions.rootElements.filter((item) => item?.$type === "bpmn:Process")
        : [];
    const process = processes[0];
    if (!process)
        throw new Error("缺少 bpmn:Process");
    const flowElements = Array.isArray(process?.flowElements) ? process.flowElements : [];
    const nodes = {};
    const edges = {};
    flowElements
        .filter((element) => String(element?.$type || "") !== "bpmn:SequenceFlow")
        .forEach((node) => {
        const id = String(node?.id || "").trim();
        if (!id)
            return;
        const docs = Array.isArray(node?.documentation) ? node.documentation : [];
        const docText = String(docs?.[0]?.text || docs?.[0]?.$body || "");
        const meta = parseTaskMeta(docText);
        nodes[id] = {
            id,
            type: String(node?.$type || ""),
            name: String(node?.name || "").trim() || "审批",
            defaultFlowId: node?.default ? String(node.default?.id || node.default || "") : "",
            incoming: [],
            outgoing: [],
            approverIds: meta.approverIds,
            approverRoleCodes: meta.approverRoleCodes
        };
    });
    flowElements
        .filter((element) => String(element?.$type || "") === "bpmn:SequenceFlow")
        .forEach((flow, idx) => {
        const id = String(flow?.id || `Flow_${idx + 1}`);
        const source = String(flow?.sourceRef?.id || flow?.sourceRef || "");
        const target = String(flow?.targetRef?.id || flow?.targetRef || "");
        if (!source || !target || !nodes[source] || !nodes[target])
            return;
        edges[id] = {
            id,
            source,
            target,
            condition: readConditionExpression(flow)
        };
        nodes[source].outgoing.push(id);
        nodes[target].incoming.push(id);
    });
    const startNodeIds = Object.values(nodes)
        .filter(node => node.type === "bpmn:StartEvent")
        .map(node => node.id);
    const endNodeIds = Object.values(nodes)
        .filter(node => node.type === "bpmn:EndEvent")
        .map(node => node.id);
    return { xml, nodes, edges, startNodeIds, endNodeIds };
};
const evaluateExpression = (expr, formData) => {
    const source = String(expr || "").trim();
    if (!source)
        return true;
    try {
        // eslint-disable-next-line no-new-func
        const fn = new Function("form", `return !!(${source});`);
        return Boolean(fn(formData || {}));
    }
    catch {
        return false;
    }
};
const chooseOutgoingEdgeIds = (node, edges, formData) => {
    if (!Array.isArray(node.outgoing) || node.outgoing.length <= 0)
        return [];
    if (node.type === "bpmn:ExclusiveGateway") {
        const matched = node.outgoing.filter(edgeId => evaluateExpression(edges[edgeId]?.condition || "", formData));
        if (matched.length > 0)
            return [matched[0]];
        if (node.defaultFlowId && edges[node.defaultFlowId])
            return [node.defaultFlowId];
        return [node.outgoing[0]];
    }
    if (node.type === "bpmn:InclusiveGateway") {
        const matched = node.outgoing.filter(edgeId => evaluateExpression(edges[edgeId]?.condition || "", formData));
        if (matched.length > 0)
            return matched;
        if (node.defaultFlowId && edges[node.defaultFlowId])
            return [node.defaultFlowId];
        return [node.outgoing[0]];
    }
    return node.outgoing.slice();
};
const validateBpmnModel = (model) => {
    const errors = [];
    if (model.startNodeIds.length <= 0)
        errors.push("流程缺少开始节点");
    if (model.endNodeIds.length <= 0)
        errors.push("流程缺少结束节点");
    Object.values(model.nodes)
        .filter(node => node.type === "bpmn:UserTask")
        .forEach(node => {
        if (node.outgoing.length <= 0) {
            errors.push(`用户任务[${node.name}]未连接后续节点`);
        }
    });
    if (model.startNodeIds.length > 0) {
        const visited = new Set();
        const stack = [...model.startNodeIds];
        while (stack.length > 0) {
            const nodeId = String(stack.shift() || "");
            if (!nodeId || visited.has(nodeId))
                continue;
            visited.add(nodeId);
            const node = model.nodes[nodeId];
            if (!node)
                continue;
            node.outgoing.forEach(edgeId => {
                const target = model.edges[edgeId]?.target;
                if (target && !visited.has(target))
                    stack.push(target);
            });
        }
        const unreachable = Object.keys(model.nodes).filter(id => !visited.has(id));
        if (unreachable.length > 0)
            errors.push(`存在不可达节点: ${unreachable.join(", ")}`);
    }
    return { ok: errors.length <= 0, errors };
};
const expandFromNodes = (model, inputNodeIds, formData, state) => {
    const queue = [...inputNodeIds];
    const nextPending = [];
    const reachedEndNodeIds = [];
    const visitCount = {};
    while (queue.length > 0) {
        const nodeId = String(queue.shift() || "");
        if (!nodeId)
            continue;
        visitCount[nodeId] = (visitCount[nodeId] || 0) + 1;
        if (visitCount[nodeId] > 64)
            continue;
        const node = model.nodes[nodeId];
        if (!node)
            continue;
        if (node.type === "bpmn:UserTask") {
            if (!state.doneNodeIds.includes(node.id)) {
                nextPending.push({
                    nodeId: node.id,
                    name: node.name || "审批",
                    approverIds: Array.isArray(node.approverIds) ? node.approverIds : [],
                    approverRoleCodes: Array.isArray(node.approverRoleCodes) ? node.approverRoleCodes : [],
                    status: "pending",
                    assigneeType: "normal",
                    createdAt: Date.now()
                });
            }
            continue;
        }
        if (node.type === "bpmn:EndEvent") {
            reachedEndNodeIds.push(node.id);
            continue;
        }
        if (node.type === "bpmn:ParallelGateway" && node.incoming.length > 1) {
            const arrived = Number(state.arrivedGatewayCounter[node.id] || 0) + 1;
            state.arrivedGatewayCounter[node.id] = arrived;
            if (arrived < node.incoming.length) {
                continue;
            }
            state.arrivedGatewayCounter[node.id] = 0;
        }
        const edgeIds = chooseOutgoingEdgeIds(node, model.edges, formData);
        edgeIds.forEach(edgeId => {
            const target = model.edges[edgeId]?.target;
            if (target)
                queue.push(target);
        });
    }
    return { nextPending, reachedEndNodeIds };
};
const buildInitialRuntimeState = async (xmlInput, formDataInput) => {
    const model = await buildBpmnModel(xmlInput);
    const validation = validateBpmnModel(model);
    if (!validation.ok) {
        throw new Error(validation.errors[0] || "流程校验失败");
    }
    const state = {
        version: "bpmn-v2",
        bpmnXml: model.xml,
        pendingTasks: [],
        doneNodeIds: [],
        arrivedGatewayCounter: {},
        stepCount: 0
    };
    const expanded = expandFromNodes(model, model.startNodeIds, formDataInput || {}, state);
    state.pendingTasks = expanded.nextPending;
    return state;
};
exports.buildInitialRuntimeState = buildInitialRuntimeState;
const aggregateApproversFromRuntime = (state) => {
    const ids = Array.from(new Set((state.pendingTasks || [])
        .filter(task => task.status === "pending")
        .flatMap(task => (Array.isArray(task.approverIds) ? task.approverIds : []))
        .map(x => Number(x))
        .filter(x => Number.isFinite(x) && x > 0)));
    const roleCodes = Array.from(new Set((state.pendingTasks || [])
        .filter(task => task.status === "pending")
        .flatMap(task => (Array.isArray(task.approverRoleCodes) ? task.approverRoleCodes : []))
        .map(x => String(x || "").trim())
        .filter(Boolean)));
    return { approverIds: ids, approverRoleCodes: roleCodes };
};
exports.aggregateApproversFromRuntime = aggregateApproversFromRuntime;
const selectOperableTask = (state, operator, taskId) => {
    const pending = (state.pendingTasks || []).filter(task => task.status === "pending");
    const isAllowed = (task) => {
        const ids = Array.isArray(task.approverIds) ? task.approverIds : [];
        const roles = Array.isArray(task.approverRoleCodes) ? task.approverRoleCodes : [];
        if (ids.length === 0 && roles.length === 0)
            return true;
        if (ids.includes(operator.userId))
            return true;
        return roles.some(code => operator.roleCodes.includes(code));
    };
    if (taskId) {
        const target = pending.find(task => String(task.nodeId) === String(taskId));
        if (!target)
            return null;
        return isAllowed(target) ? target : null;
    }
    const firstAllowed = pending.find(task => isAllowed(task));
    return firstAllowed || null;
};
exports.selectOperableTask = selectOperableTask;
const applyRuntimeAction = async (input) => {
    const state = input.state;
    const model = await buildBpmnModel(state.bpmnXml);
    const action = input.action;
    const now = Date.now();
    if (action === "cc") {
        return { state, status: "pending", message: "已抄送" };
    }
    if (action === "retry") {
        if ((state.pendingTasks || []).some(task => task.status === "pending")) {
            return { state, status: "pending", message: "当前仍有待办，无法重试" };
        }
        const resetState = await (0, exports.buildInitialRuntimeState)(state.bpmnXml, input.formData || {});
        return { state: resetState, status: "pending", message: "已重新发起" };
    }
    const task = (0, exports.selectOperableTask)(state, input.operator, input.taskId);
    if (!task && ["approve", "reject", "transfer", "add_sign"].includes(action)) {
        return { state, status: "pending", message: "无可操作任务或无权限" };
    }
    if (action === "cancel") {
        return { state, status: "cancelled", message: "已撤销" };
    }
    if (action === "transfer") {
        const ids = Array.isArray(input.transferToUserIds)
            ? input.transferToUserIds.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0)
            : [];
        if (!task || ids.length <= 0)
            return { state, status: "pending", message: "缺少转办人" };
        task.approverIds = ids;
        task.approverRoleCodes = [];
        task.assigneeType = "transfer";
        return { state, status: "pending", message: "转办成功" };
    }
    if (action === "add_sign") {
        const ids = Array.isArray(input.addSignUserIds)
            ? input.addSignUserIds.map(x => Number(x)).filter(x => Number.isFinite(x) && x > 0)
            : [];
        const roles = Array.isArray(input.addSignRoleCodes)
            ? input.addSignRoleCodes.map(x => String(x || "").trim()).filter(Boolean)
            : [];
        if (!task || (ids.length <= 0 && roles.length <= 0)) {
            return { state, status: "pending", message: "缺少加签对象" };
        }
        const addSignTask = {
            nodeId: `${task.nodeId}__addsign__${now}`,
            name: `${task.name}-加签`,
            approverIds: ids,
            approverRoleCodes: roles,
            status: "pending",
            assigneeType: "add-sign",
            createdAt: now
        };
        state.pendingTasks.push(addSignTask);
        return { state, status: "pending", message: "加签成功" };
    }
    if (action === "reject") {
        if (task) {
            task.status = "rejected";
            task.finishedAt = now;
            task.finishBy = { userId: input.operator.userId, username: input.operator.username };
        }
        return { state, status: "rejected", message: "已驳回" };
    }
    if (action === "approve") {
        if (!task)
            return { state, status: "pending", message: "无可审批任务" };
        task.status = "done";
        task.finishedAt = now;
        task.finishBy = { userId: input.operator.userId, username: input.operator.username };
        if (!task.nodeId.includes("__addsign__")) {
            if (!state.doneNodeIds.includes(task.nodeId))
                state.doneNodeIds.push(task.nodeId);
            const node = model.nodes[task.nodeId];
            if (node) {
                const targets = chooseOutgoingEdgeIds(node, model.edges, input.formData || {})
                    .map(edgeId => model.edges[edgeId]?.target)
                    .filter(Boolean);
                const expanded = expandFromNodes(model, targets, input.formData || {}, state);
                const pendingMap = new Map();
                state.pendingTasks
                    .filter(item => item.status === "pending")
                    .forEach(item => pendingMap.set(item.nodeId, item));
                expanded.nextPending.forEach(item => {
                    if (!pendingMap.has(item.nodeId))
                        pendingMap.set(item.nodeId, item);
                });
                state.pendingTasks = Array.from(pendingMap.values());
            }
        }
        else {
            state.pendingTasks = state.pendingTasks.filter(item => item.status === "pending");
        }
        state.stepCount += 1;
        const stillPending = state.pendingTasks.filter(item => item.status === "pending");
        if (stillPending.length > 0)
            return { state, status: "pending", message: "审批通过，流转到下一节点" };
        return { state, status: "approved", message: "流程完成" };
    }
    return { state, status: "pending", message: "未执行任何动作" };
};
exports.applyRuntimeAction = applyRuntimeAction;
const ensureNormalizedBpmnXml = async (input) => {
    const xmlRaw = String(input?.rawXml || "").trim();
    const generatedXml = xmlRaw && (0, exports.isLikelyBpmnXml)(xmlRaw)
        ? xmlRaw
        : Array.isArray(input?.flowGraph?.nodes) && Array.isArray(input?.flowGraph?.edges)
            ? (0, exports.flowGraphToBpmnXml)(input.flowGraph)
            : stepsToBpmnXml(input?.workflowSteps);
    await moddle.fromXML(generatedXml);
    new bpmn_engine_1.Engine({ source: generatedXml });
    const model = await buildBpmnModel(generatedXml);
    const validation = validateBpmnModel(model);
    if (!validation.ok)
        throw new Error(validation.errors[0] || "流程校验失败");
    return generatedXml;
};
exports.ensureNormalizedBpmnXml = ensureNormalizedBpmnXml;
const extractWorkflowStepsFromBpmnXml = async (xmlInput) => {
    const model = await buildBpmnModel(xmlInput);
    const visited = new Set();
    const result = [];
    const walk = (nodeId) => {
        if (!nodeId || visited.has(nodeId))
            return;
        visited.add(nodeId);
        const node = model.nodes[nodeId];
        if (!node)
            return;
        if (node.type === "bpmn:UserTask") {
            result.push({
                name: node.name || "审批",
                approverIds: Array.isArray(node.approverIds) ? node.approverIds : [],
                approverRoleCodes: Array.isArray(node.approverRoleCodes) ? node.approverRoleCodes : []
            });
        }
        const edges = chooseOutgoingEdgeIds(node, model.edges, {});
        edges.forEach(edgeId => {
            const target = model.edges[edgeId]?.target;
            if (target)
                walk(target);
        });
    };
    model.startNodeIds.forEach(id => walk(id));
    if (result.length <= 0) {
        Object.values(model.nodes)
            .filter(node => node.type === "bpmn:UserTask")
            .forEach(node => {
            result.push({
                name: node.name || "审批",
                approverIds: node.approverIds,
                approverRoleCodes: node.approverRoleCodes
            });
        });
    }
    return result;
};
exports.extractWorkflowStepsFromBpmnXml = extractWorkflowStepsFromBpmnXml;
