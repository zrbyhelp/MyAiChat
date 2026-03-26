<script setup lang="ts">
import "@logicflow/core/dist/style/index.css";
import "@logicflow/extension/lib/style/index.css";

import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import LogicFlow from "@logicflow/core";
import { BpmnElement, Menu, Snapshot } from "@logicflow/extension";
import { message } from "@/utils/message";
import { getRoleList, getUserList } from "@/api/system";
import {
  fwInstanceAction,
  fwInstanceDetail,
  fwInstanceList,
  fwInstanceStart,
  fwTemplateList,
  fwTemplateRemove,
  fwTemplateSave,
  fwTemplateValidate
} from "@/api/formWorkflow";
import { BpmnNode } from "@/components/ReFlowChart/src/config";
import { Control } from "@/components/ReFlowChart";

defineOptions({ name: "SurveyWorkflow" });

let lfPluginInited = false;
const ensureLfPlugins = () => {
  if (lfPluginInited) return;
  LogicFlow.use(Snapshot);
  LogicFlow.use(BpmnElement);
  LogicFlow.use(Menu);
  lfPluginInited = true;
};

type TemplateRow = {
  id: number;
  name: string;
  description: string;
  status: "enabled" | "disabled";
  formSchema: Record<string, unknown>;
  flowGraph: Record<string, unknown>;
  flowBpmnXml?: string;
  workflowSteps: Array<{ name: string; approverIds: number[]; approverRoleCodes?: string[] }>;
  updateTime: number;
};
type SurveySchema = { rule: any[]; option: Record<string, unknown> };

type InstanceRow = {
  id: number;
  templateId: number;
  templateName: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  currentStepIndex: number;
  submitterName: string;
  submittedAt: number;
  finishedAt: number | null;
};

type FlowNode = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  text?: string | { value?: string };
  properties?: Record<string, any>;
};

type FlowEdge = {
  id?: string;
  sourceNodeId: string;
  targetNodeId: string;
  type?: string;
  properties?: Record<string, any>;
};

type FlowGraphData = {
  nodes: FlowNode[];
  edges: FlowEdge[];
};

const activeTab = ref<"template" | "instance">("template");
const loading = ref(false);
const templateList = ref<TemplateRow[]>([]);
const instanceList = ref<InstanceRow[]>([]);
const templatePagination = reactive({ total: 0, currentPage: 1, pageSize: 10 });
const instancePagination = reactive({ total: 0, currentPage: 1, pageSize: 10 });
const instanceMode = ref<"all" | "mine" | "todo">("todo");

const templateDialogVisible = ref(false);
const templateSubmitting = ref(false);
const validateLoading = ref(false);
const xmlDialogVisible = ref(false);
const xmlEditMode = ref<"import" | "export">("export");
const xmlDraft = ref("");
const importedXmlOverride = ref("");
const templateForm = reactive({
  id: 0,
  name: "",
  description: "",
  status: "enabled" as "enabled" | "disabled"
});
const isTemplateEdit = computed(() => templateForm.id > 0);
const designerRef = ref<any>(null);
const pendingSchema = ref<SurveySchema>({ rule: [], option: {} });
const templateDesignStep = ref<"form" | "flow" | "meta">("form");
const flowInited = ref(false);
const pendingFlowGraph = ref<FlowGraphData>({ nodes: [], edges: [] });

const flowContainerRef = ref<HTMLDivElement | null>(null);
const flowLf = ref<any>(null);
const designerStats = reactive({
  nodeCount: 0,
  edgeCount: 0,
  taskCount: 0
});
const selectedTaskNodeId = ref("");
const selectedTaskName = ref("");
const selectedTaskApproverIds = ref<number[]>([]);
const selectedTaskRoleCodes = ref<string[]>([]);
const selectedNodeType = ref("");
const gatewayDefaultEdgeId = ref("");
const gatewayEdgeConfigs = ref<Array<{ edgeId: string; label: string; condition: string }>>([]);
const userOptions = ref<Array<{ label: string; value: number }>>([]);
const roleOptions = ref<Array<{ label: string; value: string }>>([]);
const designerConfig = {
  showAi: false,
  showJsonPreview: true,
  showPreviewBtn: true,
  showSaveBtn: false
};
const flowNodeList = BpmnNode;
const toolboxKeyword = ref("");
const toolboxGroups = computed(() => {
  const keyword = String(toolboxKeyword.value || "").trim().toLowerCase();
  const toGroup = (type: string) => {
    if (type.includes("start")) return "开始结束";
    if (type.includes("end")) return "开始结束";
    if (type.includes("user")) return "审批节点";
    if (type.includes("gateway")) return "网关";
    return "其他";
  };
  const mapped = flowNodeList
    .filter(item => {
      if (!keyword) return true;
      return (
        String(item.text || "").toLowerCase().includes(keyword) ||
        String(item.type || "").toLowerCase().includes(keyword)
      );
    })
    .map(item => ({ ...item, group: toGroup(String(item.type || "")) }));
  const groupOrder = ["开始结束", "审批节点", "网关", "其他"];
  return groupOrder
    .map(group => ({
      group,
      items: mapped.filter(item => item.group === group)
    }))
    .filter(group => group.items.length > 0);
});

const launchDialogVisible = ref(false);
const launchTemplateId = ref(0);
const launchFormSchema = ref<any>({ rule: [], option: {} });
const launchFormApi = ref<any>(null);
const launchFormKey = ref(0);
const launchSubmitting = ref(false);

const detailDialogVisible = ref(false);
const detailLoading = ref(false);
const detailData = ref<any>(null);
const detailFormSchema = ref<SurveySchema>({ rule: [], option: {} });
const detailFormApi = ref<any>(null);
const detailFormKey = ref(0);
const actionSubmitting = ref(false);
const actionComment = ref("");
const selectedPendingTaskId = ref("");
const transferUserIds = ref<number[]>([]);
const addSignUserIds = ref<number[]>([]);
const addSignRoleCodes = ref<string[]>([]);

const formatTime = (v?: number | null) => (v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-");
const statusTagType = (s: string) =>
  s === "approved" ? "success" : s === "rejected" ? "danger" : s === "cancelled" ? "info" : "warning";
const statusLabel = (s: string) =>
  s === "approved" ? "已通过" : s === "rejected" ? "已驳回" : s === "cancelled" ? "已撤销" : "审批中";

const createEmptySchema = (): SurveySchema => ({ rule: [], option: {} });
const normalizeSchema = (input: any): SurveySchema => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return createEmptySchema();
  const schema = input as Record<string, unknown>;
  const rule = Array.isArray(schema.rule) ? (schema.rule as any[]) : Array.isArray((schema as any).rules) ? ((schema as any).rules as any[]) : [];
  const option = schema.option && typeof schema.option === "object" && !Array.isArray(schema.option) ? (schema.option as Record<string, unknown>) : {};
  return { rule, option };
};
const patchUploadRule = (schemaInput: SurveySchema): SurveySchema => {
  const schema = JSON.parse(JSON.stringify(schemaInput || createEmptySchema()));
  const patchRules = (rules: any[]) => {
    rules.forEach(rule => {
      if (!rule || typeof rule !== "object") return;
      const mergedType = `${String(rule.type || rule.name || "").toLowerCase()}:${String(rule?.props?.type || "").toLowerCase()}`;
      if (/upload/.test(mergedType)) {
        const props = rule?.props && typeof rule.props === "object" ? rule.props : {};
        const categoryId = Number(props.categoryId || props.resourceCategoryId || 0);
        const action = `/api/resource-system/resource/upload${categoryId > 0 ? `?categoryId=${categoryId}` : ""}`;
        rule.props = { ...props, action, autoUpload: true };
      }
      if (Array.isArray(rule.children)) patchRules(rule.children);
      if (Array.isArray(rule.control)) patchRules(rule.control);
    });
  };
  patchRules(Array.isArray(schema.rule) ? schema.rule : []);
  return {
    rule: Array.isArray(schema.rule) ? schema.rule : [],
    option: { ...(schema.option || {}), submitBtn: false, resetBtn: false }
  };
};
const applyDesignerSchema = (schemaInput: any) => {
  const schema = normalizeSchema(schemaInput);
  const d = designerRef.value;
  if (!d) return;
  d.setRule?.(schema.rule);
  d.setOption?.(schema.option);
};
const getDesignerSchema = (): SurveySchema => {
  const d = designerRef.value;
  if (!d) return createEmptySchema();
  return {
    rule: Array.isArray(d.getRule?.()) ? d.getRule() : [],
    option: d.getOption?.() && typeof d.getOption() === "object" ? d.getOption() : {}
  };
};
const countSchemaFields = (schemaInput: SurveySchema): number => {
  const walk = (rules: any[]): number =>
    rules.reduce((sum, item) => sum + (String(item?.field || "").trim() ? 1 : 0) + (Array.isArray(item?.children) ? walk(item.children) : 0), 0);
  return walk(Array.isArray(schemaInput?.rule) ? schemaInput.rule : []);
};
const ensureFormDesigned = (): boolean => {
  pendingSchema.value = getDesignerSchema();
  if (countSchemaFields(pendingSchema.value) <= 0) {
    message("请先在表单设计中至少添加一个可填写字段", { type: "warning" });
    return false;
  }
  return true;
};
const formFieldHints = computed(() => {
  const fields: string[] = [];
  const walk = (rules: any[]) => {
    rules.forEach(item => {
      if (!item || typeof item !== "object") return;
      const field = String(item.field || "").trim();
      if (field) fields.push(field);
      if (Array.isArray(item.children)) walk(item.children);
      if (Array.isArray(item.control)) walk(item.control);
    });
  };
  walk(Array.isArray(pendingSchema.value?.rule) ? pendingSchema.value.rule : []);
  return Array.from(new Set(fields));
});
const gotoFlowStep = async () => {
  if (!ensureFormDesigned()) return;
  templateDesignStep.value = "flow";
  await nextTick();
  if (!flowInited.value) {
    await initFlowDesigner(pendingFlowGraph.value);
    flowInited.value = true;
  } else {
    refreshDesignerStats();
  }
};
const resetToDefaultFlow = async () => {
  importedXmlOverride.value = "";
  await initFlowDesigner(buildDefaultFlowGraph());
  flowInited.value = true;
  message("已重置为基础流程（开始 -> 审批 -> 结束）", { type: "success" });
};
const gotoFormStep = () => {
  templateDesignStep.value = "form";
};
const gotoMetaStep = () => {
  if (!flowInited.value) return message("请先完成流程设计", { type: "warning" });
  templateDesignStep.value = "meta";
};
const gotoFlowFromMetaStep = () => {
  templateDesignStep.value = "flow";
};

const normalizeFlowGraph = (graph: any): FlowGraphData => ({
  nodes: Array.isArray(graph?.nodes) ? graph.nodes : [],
  edges: Array.isArray(graph?.edges) ? graph.edges : []
});

const readNodeText = (node: any): string => {
  if (!node) return "";
  if (typeof node.text === "string") return node.text.trim();
  if (node.text && typeof node.text === "object") return String(node.text?.value || "").trim();
  return "";
};

const xmlEscape = (input: any) =>
  String(input || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const graphToBpmnXml = (graphInput: any) => {
  const graph = normalizeFlowGraph(graphInput);
  const safeId = (value: any, prefix: string, idx: number) => {
    const base = String(value || `${prefix}_${idx + 1}`).replace(/[^A-Za-z0-9_\-.]/g, "_");
    return /^[A-Za-z_]/.test(base) ? base : `${prefix}_${base}`;
  };
  const edges = graph.edges.map((edge: any, idx: number) => ({
    id: safeId(edge?.id, "Flow", idx),
    sourceNodeId: safeId(edge?.sourceNodeId, "Node", idx),
    targetNodeId: safeId(edge?.targetNodeId, "Node", idx),
    condition: String(edge?.properties?.condition || "").trim()
  }));
  const nodeXml = graph.nodes.map((node: any, idx: number) => {
    const nodeId = safeId(node?.id, "Node", idx);
    const type = String(node?.type || "");
    const name = xmlEscape(readNodeText(node) || (type === "bpmn:startEvent" ? "开始" : type === "bpmn:endEvent" ? "结束" : "审批"));
    const incoming = edges
      .filter((edge: any) => edge.targetNodeId === nodeId)
      .map((edge: any) => `<bpmn:incoming>${xmlEscape(edge.id)}</bpmn:incoming>`)
      .join("");
    const outgoing = edges
      .filter((edge: any) => edge.sourceNodeId === nodeId)
      .map((edge: any) => `<bpmn:outgoing>${xmlEscape(edge.id)}</bpmn:outgoing>`)
      .join("");
    if (type === "bpmn:startEvent") return `<bpmn:startEvent id=\"${xmlEscape(nodeId)}\" name=\"${name}\">${incoming}${outgoing}</bpmn:startEvent>`;
    if (type === "bpmn:endEvent") return `<bpmn:endEvent id=\"${xmlEscape(nodeId)}\" name=\"${name}\">${incoming}${outgoing}</bpmn:endEvent>`;
    if (type === "bpmn:exclusiveGateway" || type === "bpmn:parallelGateway" || type === "bpmn:inclusiveGateway") {
      const tag = type === "bpmn:parallelGateway" ? "parallelGateway" : type === "bpmn:inclusiveGateway" ? "inclusiveGateway" : "exclusiveGateway";
      const defaultFlowId = String(node?.properties?.defaultFlowId || "").trim();
      const defaultAttr = defaultFlowId ? ` default=\"${xmlEscape(defaultFlowId)}\"` : "";
      return `<bpmn:${tag} id=\"${xmlEscape(nodeId)}\" name=\"${name}\"${defaultAttr}>${incoming}${outgoing}</bpmn:${tag}>`;
    }
    const meta = {
      approverIds: Array.isArray(node?.properties?.approverIds)
        ? node.properties.approverIds.map((x: any) => Number(x)).filter((x: number) => x > 0)
        : [],
      approverRoleCodes: Array.isArray(node?.properties?.approverRoleCodes)
        ? node.properties.approverRoleCodes.map((x: any) => String(x || "").trim()).filter(Boolean)
        : []
    };
    return `<bpmn:userTask id=\"${xmlEscape(nodeId)}\" name=\"${name}\">${incoming}${outgoing}<bpmn:documentation>${xmlEscape(JSON.stringify(meta))}</bpmn:documentation></bpmn:userTask>`;
  });
  const edgeXml = edges.map(
    (edge: any) =>
      `<bpmn:sequenceFlow id=\"${xmlEscape(edge.id)}\" sourceRef=\"${xmlEscape(edge.sourceNodeId)}\" targetRef=\"${xmlEscape(edge.targetNodeId)}\">${edge.condition ? `<bpmn:conditionExpression xsi:type=\"bpmn:tFormalExpression\">\${${xmlEscape(edge.condition)}}</bpmn:conditionExpression>` : ""}</bpmn:sequenceFlow>`
  );
  return [
    `<?xml version=\"1.0\" encoding=\"UTF-8\"?>`,
    `<bpmn:definitions xmlns:xsi=\"http://www.w3.org/2001/XMLSchema-instance\" xmlns:bpmn=\"http://www.omg.org/spec/BPMN/20100524/MODEL\" id=\"Definitions_1\" targetNamespace=\"http://example.com/workflow\">`,
    `<bpmn:process id=\"Process_1\" isExecutable=\"true\">`,
    ...nodeXml,
    ...edgeXml,
    `</bpmn:process>`,
    `</bpmn:definitions>`
  ].join("");
};

const parseBpmnXmlToGraph = (xml: string): FlowGraphData => {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const get = (selector: string) => Array.from(doc.querySelectorAll(selector));
  const readFlowCondition = (el: Element) => {
    const children = Array.from(el.children || []);
    const condEl = children.find(child => String((child as any).localName || "").toLowerCase().includes("conditionexpression"));
    const raw = String(condEl?.textContent || "").trim();
    return raw.replace(/^\$\{/, "").replace(/\}$/, "");
  };
  const byId = new Map<string, FlowNode>();
  const nodes: FlowNode[] = [];
  const makeNode = (el: Element, type: string, fallbackName: string) => {
    const id = String(el.getAttribute("id") || "").trim();
    if (!id) return;
    const name = String(el.getAttribute("name") || fallbackName).trim() || fallbackName;
    const docText = String(el.querySelector("documentation")?.textContent || "");
    let meta: any = {};
    try {
      meta = docText ? JSON.parse(docText) : {};
    } catch {
      meta = {};
    }
    const node: FlowNode = {
      id,
      type,
      text: { value: name },
      properties: {
        approverIds: Array.isArray(meta?.approverIds) ? meta.approverIds : [],
        approverRoleCodes: Array.isArray(meta?.approverRoleCodes) ? meta.approverRoleCodes : [],
        defaultFlowId: String(el.getAttribute("default") || "").trim()
      }
    };
    byId.set(id, node);
    nodes.push(node);
  };
  get("startEvent").forEach(el => makeNode(el, "bpmn:startEvent", "开始"));
  get("userTask").forEach(el => makeNode(el, "bpmn:userTask", "审批"));
  get("exclusiveGateway").forEach(el => makeNode(el, "bpmn:exclusiveGateway", "网关"));
  get("parallelGateway").forEach(el => makeNode(el, "bpmn:parallelGateway", "并行网关"));
  get("inclusiveGateway").forEach(el => makeNode(el, "bpmn:inclusiveGateway", "包容网关"));
  get("endEvent").forEach(el => makeNode(el, "bpmn:endEvent", "结束"));

  const edges: FlowEdge[] = get("sequenceFlow")
    .map(el => ({
      id: String(el.getAttribute("id") || ""),
      sourceNodeId: String(el.getAttribute("sourceRef") || ""),
      targetNodeId: String(el.getAttribute("targetRef") || ""),
      type: "bpmn:sequenceFlow",
      properties: {
        condition: readFlowCondition(el)
      }
    }))
    .filter(edge => edge.sourceNodeId && edge.targetNodeId && byId.has(edge.sourceNodeId) && byId.has(edge.targetNodeId));

  const outgoing = new Map<string, string[]>();
  edges.forEach(edge => {
    const list = outgoing.get(edge.sourceNodeId) || [];
    list.push(edge.targetNodeId);
    outgoing.set(edge.sourceNodeId, list);
  });
  const indegree = new Map<string, number>();
  nodes.forEach(node => indegree.set(node.id, 0));
  edges.forEach(edge => indegree.set(edge.targetNodeId, (indegree.get(edge.targetNodeId) || 0) + 1));
  const queue = nodes.filter(node => (indegree.get(node.id) || 0) <= 0).map(node => node.id);
  const level = new Map<string, number>();
  queue.forEach(id => level.set(id, 0));
  while (queue.length > 0) {
    const id = String(queue.shift() || "");
    const next = outgoing.get(id) || [];
    next.forEach(target => {
      const nextLevel = Math.max(Number(level.get(target) || 0), Number(level.get(id) || 0) + 1);
      level.set(target, nextLevel);
      const d = (indegree.get(target) || 0) - 1;
      indegree.set(target, d);
      if (d <= 0) queue.push(target);
    });
  }
  const columns = new Map<number, FlowNode[]>();
  nodes.forEach(node => {
    const l = Number(level.get(node.id) || 0);
    const col = columns.get(l) || [];
    col.push(node);
    columns.set(l, col);
  });
  Array.from(columns.keys()).forEach(l => {
    const col = columns.get(l) || [];
    col.forEach((node, idx) => {
      node.x = 140 + l * 220;
      node.y = 120 + idx * 120;
    });
  });
  return { nodes, edges };
};

const buildDefaultFlowGraph = (): FlowGraphData => ({
  nodes: [
    { id: "start-1", type: "bpmn:startEvent", x: 120, y: 160, text: { value: "开始" } },
    {
      id: "task-1",
      type: "bpmn:userTask",
      x: 360,
      y: 160,
      text: { value: "一级审批" },
      properties: { approverIds: [], approverRoleCodes: [] }
    },
    { id: "end-1", type: "bpmn:endEvent", x: 600, y: 160, text: { value: "结束" } }
  ],
  edges: [
    { sourceNodeId: "start-1", targetNodeId: "task-1", type: "bpmn:sequenceFlow" },
    { sourceNodeId: "task-1", targetNodeId: "end-1", type: "bpmn:sequenceFlow" }
  ]
});

const clearNodeConfig = () => {
  selectedTaskNodeId.value = "";
  selectedNodeType.value = "";
  selectedTaskName.value = "";
  selectedTaskApproverIds.value = [];
  selectedTaskRoleCodes.value = [];
  gatewayDefaultEdgeId.value = "";
  gatewayEdgeConfigs.value = [];
};

const isGatewayType = (type: string) =>
  ["bpmn:exclusiveGateway", "bpmn:parallelGateway", "bpmn:inclusiveGateway"].includes(String(type || ""));

const refreshGatewayEdgeConfigs = (nodeId: string) => {
  const graph = readFlowGraph();
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const nodeMap = new Map<string, any>();
  nodes.forEach(node => nodeMap.set(String(node.id || ""), node));
  const node = nodeMap.get(String(nodeId || ""));
  if (!node) {
    gatewayDefaultEdgeId.value = "";
    gatewayEdgeConfigs.value = [];
    return;
  }
  gatewayDefaultEdgeId.value = String(node?.properties?.defaultFlowId || "").trim();
  gatewayEdgeConfigs.value = edges
    .filter(edge => String(edge?.sourceNodeId || "") === String(nodeId || ""))
    .map(edge => {
      const targetNode = nodeMap.get(String(edge?.targetNodeId || ""));
      return {
        edgeId: String(edge?.id || ""),
        label: `${readNodeText(targetNode) || String(edge?.targetNodeId || "")} (${String(edge?.targetNodeId || "")})`,
        condition: String(edge?.properties?.condition || "").trim()
      };
    });
};

const refreshDesignerStats = () => {
  const graph = readFlowGraph();
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  designerStats.nodeCount = nodes.length;
  designerStats.edgeCount = edges.length;
  designerStats.taskCount = nodes.filter(node => String(node?.type || "") === "bpmn:userTask").length;
};

const dragToolNode = (item: any) => {
  if (!flowLf.value?.dnd?.startDrag) return;
  flowLf.value.dnd.startDrag({
    type: item.type
  });
};

const toolboxIconClass = (type: string) => {
  const v = String(type || "");
  if (v.includes("start")) return "toolbox-shape-start";
  if (v.includes("end")) return "toolbox-shape-end";
  if (v.includes("user")) return "toolbox-shape-task";
  if (v.includes("gateway")) return "toolbox-shape-gateway";
  return "toolbox-shape-default";
};

const syncNodeConfig = () => {
  if (!flowLf.value || !selectedTaskNodeId.value) return;
  flowLf.value.updateText(selectedTaskNodeId.value, selectedTaskName.value || "审批");
  if (selectedNodeType.value === "bpmn:userTask") {
    flowLf.value.setProperties(selectedTaskNodeId.value, {
      approverIds: selectedTaskApproverIds.value,
      approverRoleCodes: selectedTaskRoleCodes.value
    });
  }
};

const syncGatewayConfig = () => {
  if (!flowLf.value || !selectedTaskNodeId.value || !isGatewayType(selectedNodeType.value)) return;
  flowLf.value.setProperties(selectedTaskNodeId.value, {
    defaultFlowId: gatewayDefaultEdgeId.value
  });
  gatewayEdgeConfigs.value.forEach(item => {
    if (!item.edgeId) return;
    flowLf.value.setProperties(item.edgeId, {
      condition: item.condition
    });
  });
};

const selectTaskNode = (node: any) => {
  if (!node) {
    clearNodeConfig();
    return;
  }
  selectedNodeType.value = String(node.type || "");
  selectedTaskNodeId.value = String(node.id || "");
  selectedTaskName.value = readNodeText(node) || "审批";
  if (selectedNodeType.value === "bpmn:userTask") {
    selectedTaskApproverIds.value = Array.isArray(node?.properties?.approverIds)
      ? node.properties.approverIds.map((x: any) => Number(x)).filter((x: number) => x > 0)
      : [];
    selectedTaskRoleCodes.value = Array.isArray(node?.properties?.approverRoleCodes)
      ? node.properties.approverRoleCodes.map((x: any) => String(x || "").trim()).filter(Boolean)
      : [];
    gatewayDefaultEdgeId.value = "";
    gatewayEdgeConfigs.value = [];
    return;
  }
  selectedTaskApproverIds.value = [];
  selectedTaskRoleCodes.value = [];
  if (isGatewayType(selectedNodeType.value)) {
    refreshGatewayEdgeConfigs(selectedTaskNodeId.value);
  } else {
    gatewayDefaultEdgeId.value = "";
    gatewayEdgeConfigs.value = [];
  }
};

const initFlowDesigner = async (graphInput: any) => {
  ensureLfPlugins();
  await nextTick();
  if (!flowContainerRef.value) return;
  if (flowLf.value?.destroy) flowLf.value.destroy();
  const lf = new LogicFlow({
    container: flowContainerRef.value,
    grid: true,
    keyboard: { enabled: true },
    background: { color: "#f7f9ff" }
  });
  lf.setDefaultEdgeType("bpmn:sequenceFlow");
  lf.on("node:click", ({ data }: any) => selectTaskNode(data));
  lf.on("blank:click", () => {
    clearNodeConfig();
    refreshDesignerStats();
  });
  lf.on("node:add", ({ data }: any) => {
    if (data?.type === "bpmn:userTask") {
      lf.setProperties(data.id, { approverIds: [], approverRoleCodes: [] });
    }
    if (isGatewayType(String(data?.type || ""))) {
      lf.setProperties(data.id, { defaultFlowId: "" });
    }
    const nodes = (lf.getGraphData()?.nodes || []).filter((x: any) => String(x.id || "") === String(data.id || ""));
    selectTaskNode(nodes[0]);
    refreshDesignerStats();
  });
  lf.on("node:delete", refreshDesignerStats);
  lf.on("edge:add", () => {
    refreshDesignerStats();
    if (isGatewayType(selectedNodeType.value)) refreshGatewayEdgeConfigs(selectedTaskNodeId.value);
  });
  lf.on("edge:delete", () => {
    refreshDesignerStats();
    if (isGatewayType(selectedNodeType.value)) refreshGatewayEdgeConfigs(selectedTaskNodeId.value);
  });
  lf.on("history:change", refreshDesignerStats);
  const graph = normalizeFlowGraph(graphInput);
  lf.render(graph.nodes.length > 0 ? graph : buildDefaultFlowGraph());
  flowLf.value = lf;
  clearNodeConfig();
  refreshDesignerStats();
};

const destroyFlowDesigner = () => {
  if (flowLf.value?.destroy) flowLf.value.destroy();
  flowLf.value = null;
  clearNodeConfig();
};
const onTemplateDialogClosed = () => {
  destroyFlowDesigner();
  flowInited.value = false;
  templateDesignStep.value = "form";
};
const onTemplateDialogOpened = async () => {
  await nextTick();
  applyDesignerSchema(pendingSchema.value);
  window.dispatchEvent(new Event("resize"));
};

const readFlowGraph = (): FlowGraphData => {
  if (!flowLf.value?.getGraphData) return buildDefaultFlowGraph();
  return normalizeFlowGraph(flowLf.value.getGraphData());
};

const queryTemplateList = async () => {
  loading.value = true;
  try {
    const res = await fwTemplateList({
      currentPage: templatePagination.currentPage,
      pageSize: templatePagination.pageSize
    });
    if (res.code !== 0 || !res.data) throw new Error(res.message || "获取模板失败");
    templateList.value = (res.data.list || []) as TemplateRow[];
    templatePagination.total = Number(res.data.total || 0);
  } catch (error: any) {
    message(error?.message || "获取模板失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};

const queryInstanceList = async () => {
  loading.value = true;
  try {
    const res = await fwInstanceList({
      mode: instanceMode.value,
      currentPage: instancePagination.currentPage,
      pageSize: instancePagination.pageSize
    });
    if (res.code !== 0 || !res.data) throw new Error(res.message || "获取实例失败");
    instanceList.value = (res.data.list || []) as InstanceRow[];
    instancePagination.total = Number(res.data.total || 0);
  } catch (error: any) {
    message(error?.message || "获取实例失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};

const openCreateTemplate = async () => {
  templateForm.id = 0;
  templateForm.name = "";
  templateForm.description = "";
  templateForm.status = "enabled";
  pendingSchema.value = createEmptySchema();
  pendingFlowGraph.value = buildDefaultFlowGraph();
  templateDesignStep.value = "form";
  flowInited.value = false;
  importedXmlOverride.value = "";
  templateDialogVisible.value = true;
  destroyFlowDesigner();
};

const openEditTemplate = async (row: TemplateRow) => {
  templateForm.id = row.id;
  templateForm.name = row.name || "";
  templateForm.description = row.description || "";
  templateForm.status = row.status || "enabled";
  pendingSchema.value = normalizeSchema(row.formSchema);
  pendingFlowGraph.value = normalizeFlowGraph(row.flowGraph || buildDefaultFlowGraph());
  templateDesignStep.value = "form";
  flowInited.value = false;
  importedXmlOverride.value = String(row.flowBpmnXml || "");
  templateDialogVisible.value = true;
  destroyFlowDesigner();
};

const openExportXml = () => {
  const flowGraph = readFlowGraph();
  xmlDraft.value = graphToBpmnXml(flowGraph);
  xmlEditMode.value = "export";
  xmlDialogVisible.value = true;
};

const openImportXml = () => {
  xmlDraft.value = importedXmlOverride.value || "";
  xmlEditMode.value = "import";
  xmlDialogVisible.value = true;
};

const applyImportXml = async () => {
  const xml = String(xmlDraft.value || "").trim();
  if (!xml) return message("请输入 BPMN XML", { type: "warning" });
  try {
    const graph = parseBpmnXmlToGraph(xml);
    importedXmlOverride.value = xml;
    await initFlowDesigner(graph);
    xmlDialogVisible.value = false;
    message("XML 导入成功", { type: "success" });
  } catch (error: any) {
    message(error?.message || "XML 导入失败", { type: "error" });
  }
};

const validateTemplateFlow = async () => {
  validateLoading.value = true;
  try {
    const flowGraph = readFlowGraph();
    const xml = importedXmlOverride.value || graphToBpmnXml(flowGraph);
    const res = await fwTemplateValidate({ flowGraph, flowBpmnXml: xml });
    if (res.code !== 0) throw new Error(res.message || "校验失败");
    message(`校验通过，用户任务 ${Number(res.data?.stepCount || 0)} 个`, { type: "success" });
  } catch (error: any) {
    message(error?.message || "校验失败", { type: "error" });
  } finally {
    validateLoading.value = false;
  }
};

const saveTemplate = async () => {
  if (!templateForm.name.trim()) return message("请输入模板名称", { type: "warning" });
  if (!ensureFormDesigned()) return;
  if (!flowInited.value) return message("请先完成流程设计", { type: "warning" });
  templateSubmitting.value = true;
  try {
    const flowGraph = readFlowGraph();
    const xml = importedXmlOverride.value || graphToBpmnXml(flowGraph);
    const valid = await fwTemplateValidate({ flowGraph, flowBpmnXml: xml });
    if (valid.code !== 0) throw new Error(valid.message || "流程校验失败");
    const payload = {
      id: templateForm.id || undefined,
      name: templateForm.name.trim(),
      description: templateForm.description.trim(),
      status: templateForm.status,
      formSchema: pendingSchema.value,
      flowGraph,
      flowBpmnXml: xml
    };
    const res = await fwTemplateSave(payload);
    if (res.code !== 0) throw new Error(res.message || "保存失败");
    templateDialogVisible.value = false;
    destroyFlowDesigner();
    message("保存成功", { type: "success" });
    await queryTemplateList();
  } catch (error: any) {
    message(error?.message || "保存失败", { type: "error" });
  } finally {
    templateSubmitting.value = false;
  }
};

const removeTemplate = async (row: TemplateRow) => {
  const res = await fwTemplateRemove({ id: row.id });
  if (res.code !== 0) return message(res.message || "删除失败", { type: "error" });
  message("删除成功", { type: "success" });
  await queryTemplateList();
};

const openLaunchDialog = (row: TemplateRow) => {
  launchTemplateId.value = row.id;
  launchFormSchema.value = patchUploadRule(normalizeSchema(row.formSchema));
  launchFormApi.value = null;
  launchFormKey.value += 1;
  launchDialogVisible.value = true;
};

const submitLaunch = async () => {
  if (!launchTemplateId.value) return;
  launchSubmitting.value = true;
  try {
    const api = launchFormApi.value;
    if (api?.validate) await api.validate();
    const formData = api?.formData ? api.formData() : api?.getValue ? api.getValue() : {};
    const res = await fwInstanceStart({ templateId: launchTemplateId.value, formData });
    if (res.code !== 0) throw new Error(res.message || "提交失败");
    launchDialogVisible.value = false;
    message("提交成功", { type: "success" });
    activeTab.value = "instance";
    await queryInstanceList();
  } catch (error: any) {
    message(error?.message || "提交失败", { type: "error" });
  } finally {
    launchSubmitting.value = false;
  }
};

const openDetail = async (row: InstanceRow) => {
  detailDialogVisible.value = true;
  detailLoading.value = true;
  detailData.value = null;
  detailFormSchema.value = createEmptySchema();
  detailFormApi.value = null;
  actionComment.value = "";
  selectedPendingTaskId.value = "";
  transferUserIds.value = [];
  addSignUserIds.value = [];
  addSignRoleCodes.value = [];
  try {
    const res = await fwInstanceDetail({ id: row.id });
    if (res.code !== 0 || !res.data) throw new Error(res.message || "获取详情失败");
    detailData.value = res.data;
    detailFormSchema.value = patchUploadRule(normalizeSchema((res.data as any).formSchema));
    detailFormKey.value += 1;
    await nextTick();
    const api = detailFormApi.value;
    if (api?.setValue) api.setValue((res.data as any).formData || {});
  } catch (error: any) {
    detailDialogVisible.value = false;
    message(error?.message || "获取详情失败", { type: "error" });
  } finally {
    detailLoading.value = false;
  }
};

const doAction = async (action: "approve" | "reject" | "cancel" | "transfer" | "add_sign" | "cc" | "retry") => {
  if (!detailData.value?.id) return;
  actionSubmitting.value = true;
  try {
    const res = await fwInstanceAction({
      id: detailData.value.id,
      action,
      taskId: selectedPendingTaskId.value || undefined,
      comment: actionComment.value,
      transferToUserIds: transferUserIds.value,
      addSignUserIds: addSignUserIds.value,
      addSignRoleCodes: addSignRoleCodes.value
    });
    if (res.code !== 0) throw new Error(res.message || "操作失败");
    message("操作成功", { type: "success" });
    await openDetail(detailData.value as any);
    await queryInstanceList();
  } catch (error: any) {
    message(error?.message || "操作失败", { type: "error" });
  } finally {
    actionSubmitting.value = false;
  }
};

onMounted(async () => {
  const [userRes, roleRes] = await Promise.all([getUserList({ currentPage: 1, pageSize: 300 }), getRoleList({})]);
  userOptions.value =
    userRes.code === 0 && userRes.data
      ? (userRes.data.list || []).map((item: any) => ({
          label: String(item.nickname || item.username || `用户${item.id}`),
          value: Number(item.id || 0)
        }))
      : [];
  roleOptions.value =
    roleRes.code === 0 && roleRes.data
      ? (roleRes.data.list || [])
          .map((item: any) => ({ label: String(item.name || item.code || ""), value: String(item.code || "").trim() }))
          .filter((item: any) => item.value)
      : [];
  await Promise.all([queryTemplateList(), queryInstanceList()]);
});

onBeforeUnmount(() => {
  destroyFlowDesigner();
});
</script>

<template>
  <div class="main wf-v2-page">
    <el-card shadow="never" v-loading="loading">
      <template #header>
        <div class="header-row">
          <div class="title-group">
            <h3>自定义表单工作流</h3>
            <span>全新实现（V2）</span>
          </div>
          <el-button type="primary" @click="openCreateTemplate">新建模板</el-button>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="wf-tabs">
        <el-tab-pane label="模板管理" name="template">
          <el-table :data="templateList" border>
            <el-table-column prop="name" label="模板名称" min-width="180" />
            <el-table-column prop="status" label="状态" width="90" />
            <el-table-column label="步骤数" width="80">
              <template #default="{ row }">{{ (row.workflowSteps || []).length }}</template>
            </el-table-column>
            <el-table-column label="更新时间" width="170">
              <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="240">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEditTemplate(row)">编辑</el-button>
                <el-button link type="success" @click="openLaunchDialog(row)">发起</el-button>
                <el-popconfirm title="确认删除该模板？" @confirm="removeTemplate(row)">
                  <template #reference><el-button link type="danger">删除</el-button></template>
                </el-popconfirm>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="templatePagination.currentPage"
              layout="total, prev, pager, next"
              :total="templatePagination.total"
              :page-size="templatePagination.pageSize"
              @current-change="queryTemplateList"
            />
          </div>
        </el-tab-pane>

        <el-tab-pane label="流程实例" name="instance">
          <div class="instance-tools">
            <el-segmented
              v-model="instanceMode"
              :options="[
                { label: '我的待办', value: 'todo' },
                { label: '我提交的', value: 'mine' },
                { label: '全部', value: 'all' }
              ]"
              @change="queryInstanceList"
            />
          </div>
          <el-table :data="instanceList" border>
            <el-table-column prop="templateName" label="模板" min-width="180" />
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="submitterName" label="提交人" width="110" />
            <el-table-column label="提交时间" width="170">
              <template #default="{ row }">{{ formatTime(row.submittedAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row }">
                <el-button link type="primary" @click="openDetail(row)">详情</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="pager">
            <el-pagination
              v-model:current-page="instancePagination.currentPage"
              layout="total, prev, pager, next"
              :total="instancePagination.total"
              :page-size="instancePagination.pageSize"
              @current-change="queryInstanceList"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-dialog v-model="templateDialogVisible" :title="isTemplateEdit ? '编辑模板' : '新建模板'" width="1220px" append-to-body @opened="onTemplateDialogOpened" @closed="onTemplateDialogClosed">
      <el-form label-width="88px">
        <div class="designer-headline">
          <div class="headline-copy">
            <h4>流程设计工作台</h4>
            <p>拖拽节点设计审批路径，右侧配置审批人和角色，保存前执行结构校验。</p>
          </div>
          <div class="headline-metrics">
            <div class="metric-card">
              <span>节点</span>
              <strong>{{ designerStats.nodeCount }}</strong>
            </div>
            <div class="metric-card">
              <span>连线</span>
              <strong>{{ designerStats.edgeCount }}</strong>
            </div>
            <div class="metric-card">
              <span>审批任务</span>
              <strong>{{ designerStats.taskCount }}</strong>
            </div>
          </div>
        </div>
        <el-steps :active="templateDesignStep === 'form' ? 0 : templateDesignStep === 'flow' ? 1 : 2" simple class="template-steps">
          <el-step title="1. 表单设计" />
          <el-step title="2. 流程设计" />
          <el-step title="3. 基本信息" />
        </el-steps>
        <template v-if="templateDesignStep === 'form'">
          <div class="designer-right-title" style="margin-bottom: 8px">表单设计</div>
          <fc-designer ref="designerRef" class="form-designer-shell" height="680px" :config="designerConfig" />
        </template>
        <el-form-item v-else-if="templateDesignStep === 'flow'" label="流程图设计">
          <div class="flow-hint">
            可用表单字段：{{ formFieldHints.length > 0 ? formFieldHints.join("、") : "暂无（请返回上一步添加字段）" }}
          </div>
          <div class="designer-wrap">
            <div class="designer-sidebar">
              <div class="toolbox-title">1) 添加节点</div>
              <el-input v-model="toolboxKeyword" size="small" placeholder="搜索节点" clearable class="toolbox-search" />
              <div class="toolbox-groups">
                <div class="toolbox-help">按住节点拖到中间画布</div>
                <div v-for="group in toolboxGroups" :key="group.group" class="toolbox-group">
                  <div class="toolbox-group-title">{{ group.group }}</div>
                  <div class="toolbox-items">
                    <button
                      v-for="item in group.items"
                      :key="item.type"
                      type="button"
                      class="toolbox-item"
                      @mousedown="dragToolNode(item)"
                    >
                      <span class="toolbox-shape" :class="toolboxIconClass(item.type)" />
                      <span>{{ item.text }}</span>
                    </button>
                  </div>
                </div>
              </div>
              <div class="toolbox-title">2) 常用操作</div>
              <div class="simple-actions">
                <el-button size="small" @click="resetToDefaultFlow">重置基础流程</el-button>
                <el-button size="small" :loading="validateLoading" @click="validateTemplateFlow">校验流程</el-button>
              </div>
              <el-collapse class="advanced-actions">
                <el-collapse-item title="高级操作（XML导入导出）" name="advanced">
                  <div class="simple-actions">
                    <el-button size="small" @click="openExportXml">导出XML</el-button>
                    <el-button size="small" @click="openImportXml">导入XML</el-button>
                  </div>
                </el-collapse-item>
              </el-collapse>
            </div>
            <div class="designer-left">
              <Control v-if="flowLf" class="designer-control" :lf="flowLf" />
              <div ref="flowContainerRef" class="designer-canvas" />
            </div>
            <div class="designer-right">
              <div class="designer-right-title">3) 节点配置</div>
              <template v-if="selectedTaskNodeId">
                <el-form v-if="selectedNodeType === 'bpmn:userTask'" label-position="top" class="node-config-form">
                  <el-form-item label="节点标题"><el-input v-model="selectedTaskName" @change="syncNodeConfig" @blur="syncNodeConfig" /></el-form-item>
                  <el-form-item label="审批人"><el-select v-model="selectedTaskApproverIds" multiple filterable collapse-tags collapse-tags-tooltip @change="syncNodeConfig"><el-option v-for="user in userOptions" :key="user.value" :label="user.label" :value="user.value" /></el-select></el-form-item>
                  <el-form-item label="审批角色"><el-select v-model="selectedTaskRoleCodes" multiple filterable collapse-tags collapse-tags-tooltip @change="syncNodeConfig"><el-option v-for="role in roleOptions" :key="role.value" :label="role.label" :value="role.value" /></el-select></el-form-item>
                </el-form>
                <el-form v-else-if="selectedNodeType === 'bpmn:exclusiveGateway' || selectedNodeType === 'bpmn:parallelGateway' || selectedNodeType === 'bpmn:inclusiveGateway'" label-position="top" class="node-config-form">
                  <el-form-item label="网关标题">
                    <el-input v-model="selectedTaskName" @change="syncNodeConfig" @blur="syncNodeConfig" />
                  </el-form-item>
                  <el-form-item label="默认分支（排他/包容网关可选）">
                    <el-select v-model="gatewayDefaultEdgeId" clearable placeholder="未设置" @change="syncGatewayConfig">
                      <el-option v-for="edge in gatewayEdgeConfigs" :key="edge.edgeId" :label="edge.label" :value="edge.edgeId" />
                    </el-select>
                  </el-form-item>
                  <div class="gateway-edge-title">分支条件</div>
                  <div v-if="gatewayEdgeConfigs.length <= 0" class="gateway-empty">先从网关拉出连线后再配置条件</div>
                  <div v-for="edge in gatewayEdgeConfigs" :key="edge.edgeId" class="gateway-edge-row">
                    <div class="gateway-edge-label">{{ edge.label }}</div>
                    <el-input
                      v-model="edge.condition"
                      placeholder="例如：amount > 10000（字段名来自上方提示）"
                      @change="syncGatewayConfig"
                      @blur="syncGatewayConfig"
                    />
                  </div>
                </el-form>
                <div v-else class="empty-tip">当前节点无需配置审批信息</div>
              </template>
              <template v-else>
                <div class="empty-tip">先点击画布中的节点，再在这里配置参数</div>
              </template>
            </div>
          </div>
        </el-form-item>
        <template v-else>
          <div class="designer-right-title" style="margin-bottom: 8px">基本信息</div>
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="模板名称" required><el-input v-model="templateForm.name" maxlength="120" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="状态"><el-radio-group v-model="templateForm.status"><el-radio-button label="enabled">启用</el-radio-button><el-radio-button label="disabled">禁用</el-radio-button></el-radio-group></el-form-item></el-col>
          </el-row>
          <el-form-item label="模板描述"><el-input v-model="templateForm.description" type="textarea" :rows="5" maxlength="500" show-word-limit /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button v-if="templateDesignStep === 'flow'" @click="gotoFormStep">上一步</el-button>
        <el-button v-if="templateDesignStep === 'meta'" @click="gotoFlowFromMetaStep">上一步</el-button>
        <el-button v-if="templateDesignStep === 'form'" type="primary" @click="gotoFlowStep">下一步：流程设计</el-button>
        <el-button v-else-if="templateDesignStep === 'flow'" type="primary" @click="gotoMetaStep">下一步：基本信息</el-button>
        <el-button v-else type="primary" :loading="templateSubmitting" @click="saveTemplate">保存模板</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="xmlDialogVisible" :title="xmlEditMode === 'import' ? '导入 BPMN XML' : '导出 BPMN XML'" width="900px" append-to-body>
      <el-input v-model="xmlDraft" type="textarea" :rows="16" />
      <template #footer>
        <el-button @click="xmlDialogVisible = false">关闭</el-button>
        <el-button v-if="xmlEditMode === 'import'" type="primary" @click="applyImportXml">应用导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="launchDialogVisible" title="发起流程" width="860px" append-to-body>
      <form-create :key="launchFormKey" v-model:api="launchFormApi" :rule="launchFormSchema.rule" :option="launchFormSchema.option" />
      <template #footer>
        <el-button @click="launchDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="launchSubmitting" @click="submitLaunch">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailDialogVisible" title="流程实例详情" width="900px" append-to-body>
      <div v-loading="detailLoading">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="实例ID">{{ detailData?.id || '-' }}</el-descriptions-item>
          <el-descriptions-item label="模板">{{ detailData?.templateName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(detailData?.status || '') }}</el-descriptions-item>
        </el-descriptions>
        <el-divider content-position="left">表单内容</el-divider>
        <form-create
          :key="detailFormKey"
          v-model:api="detailFormApi"
          :rule="detailFormSchema.rule"
          :option="detailFormSchema.option"
        />
        <el-divider content-position="left">原始表单数据</el-divider>
        <pre class="json-box">{{ JSON.stringify(detailData?.formData || {}, null, 2) }}</pre>
        <el-divider content-position="left">流转日志</el-divider>
        <pre class="json-box">{{ JSON.stringify(detailData?.flowLogs || [], null, 2) }}</pre>
        <el-divider v-if="detailData?.status === 'pending'" content-position="left">审批操作</el-divider>
        <div v-if="detailData?.status === 'pending'" class="action-panel">
          <el-form label-width="96px">
            <el-form-item label="待办任务">
              <el-select v-model="selectedPendingTaskId" clearable placeholder="自动匹配当前可审批任务">
                <el-option
                  v-for="task in detailData?.pendingTasks || []"
                  :key="String(task?.nodeId || '')"
                  :label="`${task?.name || '-'} (${task?.nodeId || '-'})`"
                  :value="String(task?.nodeId || '')"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="审批意见">
              <el-input v-model="actionComment" type="textarea" :rows="2" />
            </el-form-item>
            <el-form-item label="转办给">
              <el-select v-model="transferUserIds" multiple filterable collapse-tags collapse-tags-tooltip>
                <el-option v-for="user in userOptions" :key="user.value" :label="user.label" :value="user.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="加签用户">
              <el-select v-model="addSignUserIds" multiple filterable collapse-tags collapse-tags-tooltip>
                <el-option v-for="user in userOptions" :key="user.value" :label="user.label" :value="user.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="加签角色">
              <el-select v-model="addSignRoleCodes" multiple filterable collapse-tags collapse-tags-tooltip>
                <el-option v-for="role in roleOptions" :key="role.value" :label="role.label" :value="role.value" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>
      </div>
      <template #footer>
        <el-button @click="detailDialogVisible = false">关闭</el-button>
        <el-button v-if="detailData?.status === 'pending'" type="warning" plain :loading="actionSubmitting" @click="doAction('cc')">抄送</el-button>
        <el-button v-if="detailData?.status === 'pending'" type="info" plain :loading="actionSubmitting" @click="doAction('transfer')">转办</el-button>
        <el-button v-if="detailData?.status === 'pending'" type="primary" plain :loading="actionSubmitting" @click="doAction('add_sign')">加签</el-button>
        <el-button v-if="detailData?.status === 'pending'" type="info" plain :loading="actionSubmitting" @click="doAction('cancel')">撤销</el-button>
        <el-button v-if="detailData?.status === 'pending'" type="danger" plain :loading="actionSubmitting" @click="doAction('reject')">驳回</el-button>
        <el-button v-if="detailData?.status === 'pending'" type="success" :loading="actionSubmitting" @click="doAction('approve')">通过</el-button>
        <el-button v-if="detailData?.status === 'rejected' || detailData?.status === 'cancelled'" type="primary" :loading="actionSubmitting" @click="doAction('retry')">重试</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.wf-v2-page {
  min-height: calc(100vh - 130px);
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.title-group {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.title-group h3 {
  margin: 0;
  font-size: 18px;
}
.title-group span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.wf-tabs {
  margin-top: 6px;
}
.instance-tools {
  margin-bottom: 10px;
  display: flex;
  justify-content: flex-end;
}
.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.designer-headline {
  margin-bottom: 10px;
  padding: 12px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background:
    radial-gradient(circle at 12% 20%, rgb(250 236 210 / 70%), transparent 30%),
    radial-gradient(circle at 86% 18%, rgb(217 237 255 / 85%), transparent 35%),
    linear-gradient(135deg, #fffef9 0%, #f8fbff 100%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.template-steps {
  margin: 6px 0 14px;
}
.flow-hint {
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px dashed #d7e4ef;
  border-radius: 6px;
  font-size: 12px;
  color: #5d748a;
  background: #f8fbff;
}
.headline-copy h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #31495f;
}
.headline-copy p {
  margin: 4px 0 0;
  font-size: 12px;
  color: #637487;
}
.headline-metrics {
  display: flex;
  gap: 8px;
}
.metric-card {
  min-width: 86px;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid #d7e7f6;
  background: rgb(255 255 255 / 75%);
  text-align: center;
}
.metric-card span {
  display: block;
  font-size: 11px;
  color: #68839b;
}
.metric-card strong {
  display: block;
  margin-top: 3px;
  font-size: 18px;
  color: #1f3f59;
  line-height: 1;
}
.designer-wrap {
  width: 100%;
  min-height: 540px;
  display: grid;
  grid-template-columns: 240px 1fr 320px;
  gap: 12px;
}
.designer-sidebar {
  border: 1px solid #dce5ed;
  border-radius: 10px;
  background: #fff;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.designer-left {
  position: relative;
  border: 1px solid #d6e2ee;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}
.designer-canvas {
  width: 100%;
  height: 536px;
}
.designer-control {
  position: absolute;
  right: 14px;
  top: 10px;
  z-index: 11;
}
.designer-toolbox {
  border: 1px solid #d4e1ee;
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.toolbox-title {
  padding: 4px 2px;
  font-size: 12px;
  font-weight: 700;
  color: #37556f;
}
.toolbox-search {
  padding: 0;
}
.toolbox-groups {
  padding: 0;
  max-height: 280px;
  overflow: auto;
}
.toolbox-help {
  margin: 8px 0;
  padding: 6px;
  border: 1px dashed #d6e3ef;
  border-radius: 6px;
  font-size: 11px;
  color: #6f8497;
  background: #f7fbff;
}
.toolbox-group + .toolbox-group {
  margin-top: 8px;
}
.toolbox-group-title {
  margin-bottom: 5px;
  font-size: 11px;
  color: #6a7f94;
}
.toolbox-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.toolbox-item {
  width: 100%;
  border: 1px solid #dfe8f1;
  border-radius: 6px;
  background: #f9fbff;
  color: #2f4f67;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 8px;
  cursor: grab;
  transition: all 0.15s ease;
}
.toolbox-item:hover {
  border-color: #9dc2e2;
  background: #f0f7ff;
}
.simple-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.advanced-actions {
  border-top: 1px dashed #d9e4ef;
  padding-top: 8px;
}
.toolbox-shape {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  display: inline-block;
  position: relative;
}
.toolbox-shape-default {
  border-radius: 50%;
  background: linear-gradient(135deg, #79a9d0 0%, #3d6f98 100%);
}
.toolbox-shape-start {
  border-radius: 50%;
  border: 2px solid #40936f;
  background: #d9f3e7;
}
.toolbox-shape-end {
  border-radius: 50%;
  border: 2px solid #b74646;
  background: #f7dddd;
  box-shadow: inset 0 0 0 2px #f7dddd;
}
.toolbox-shape-task {
  width: 16px;
  height: 12px;
  border: 1.5px solid #4f7ea4;
  border-radius: 3px;
  background: #e9f3fd;
  margin-top: 1px;
}
.toolbox-shape-gateway {
  width: 12px;
  height: 12px;
  margin-left: 1px;
  margin-top: 1px;
  transform: rotate(45deg);
  border: 1.5px solid #8a65a8;
  background: #f1e8f8;
}
.designer-right {
  border: 1px solid #dce5ed;
  border-radius: 10px;
  padding: 12px;
  background: linear-gradient(180deg, #fff 0%, #fdfefe 100%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 80%);
}
.designer-right-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 700;
  color: #2f485e;
}
.form-designer-shell {
  min-height: 680px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.designer-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px dashed #d7e2ec;
}
.node-config-form {
  padding: 10px;
  border: 1px solid #e4ebf2;
  border-radius: 8px;
  background: #fbfdff;
}
.gateway-edge-title {
  margin: 6px 0;
  font-size: 12px;
  color: #60778e;
}
.gateway-empty {
  padding: 8px;
  border: 1px dashed #d7e4ef;
  border-radius: 6px;
  font-size: 12px;
  color: #6f8598;
  background: #f7fbff;
}
.gateway-edge-row + .gateway-edge-row {
  margin-top: 8px;
}
.gateway-edge-label {
  margin-bottom: 4px;
  font-size: 12px;
  color: #3a5974;
}
.empty-tip {
  color: var(--el-text-color-secondary);
  line-height: 1.6;
  padding: 14px 10px;
  border: 1px dashed #d6e4f1;
  border-radius: 8px;
  background: #f9fbff;
}
.action-panel {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
}
.json-box {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: #fff;
}
@media (max-width: 1200px) {
  .designer-headline {
    flex-direction: column;
    align-items: flex-start;
  }
  .designer-wrap {
    grid-template-columns: 1fr;
  }
}
</style>
