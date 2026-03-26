<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { http } from "@/utils/http";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { createSurvey, deleteSurvey, exportSurveySubmissionsPdf, exportSurveySubmissionsZip, getSurveyList, getSurveyStatsDetail, getSurveySubmissionsList, getSurveyTextAnswers, submitSurvey, updateSurvey } from "@/api/survey";
import ResourceSystemPicker from "@/components/ResourceSystemPicker/index.vue";
import QuestionStatChart from "./components/QuestionStatChart.vue";
import AddFill from "~icons/ri/add-circle-line";
import EditPen from "~icons/ep/edit-pen";
import Delete from "~icons/ep/delete";
import Refresh from "~icons/ep/refresh";

defineOptions({ name: "SurveyList" });

type SurveyStatus = "draft" | "published" | "closed";
type SurveySchema = { rule: any[]; option: Record<string, unknown> };
type ImageFit = "fill" | "contain" | "cover" | "none" | "scale-down";
type SurveyRow = { id: number; name: string; description: string; status: SurveyStatus; schema: Record<string, unknown>; responseCount: number; publishTime: number | null; createTime: number; updateTime: number };
type SurveyQuestionStats = {
  field: string;
  title: string;
  type: string;
  kind: "choice" | "text" | "number" | "boolean" | "date" | "upload" | "other";
  totalSubmissions: number;
  answeredCount: number;
  emptyCount: number;
  options: Array<{ label: string; value: string; count: number }>;
  textSampleCount: number;
  textSamples?: string[];
  timeSeries?: Array<{ date: string; count: number }>;
  rangeSeries?: {
    start: Array<{ date: string; count: number }>;
    end: Array<{ date: string; count: number }>;
  } | null;
  rangePairs?: Array<{ start: string; end: string }>;
  numberStats?: { avg: number | null; min: number | null; max: number | null; validCount: number } | null;
  imageSampleCount?: number;
  imageSamples?: string[];
  displayOnly?: boolean;
  displayPayload?: { text?: string; image?: string };
};
type ResourceSystemPickerItem = { id: number; image: string; fit: ImageFit };

const STATUS_OPTIONS: Array<{ label: string; value: SurveyStatus }> = [
  { label: "鑽夌", value: "draft" },
  { label: "已发布", value: "published" },
  { label: "已关闭", value: "closed" }
];

const router = useRouter();
const loading = ref(false);
const submitLoading = ref(false);
const tableData = ref<SurveyRow[]>([]);
const tableRef = ref();
const queryForm = reactive({ keyword: "", status: "" });
const pagination = reactive({ total: 0, pageSize: 10, currentPage: 1, background: true });
const columns: TableColumnList = [
  { label: "问卷名称", prop: "name", minWidth: 180 },
  { label: "描述", prop: "description", minWidth: 260, showOverflowTooltip: true },
  { label: "状态", prop: "status", width: 120, slot: "status" },
  { label: "题目数", prop: "questionCount", width: 100, slot: "questionCount" },
  { label: "回收数", prop: "responseCount", width: 100, slot: "responseCount" },
  { label: "更新时间", prop: "updateTime", width: 180, slot: "updateTime" },
  { label: "操作", fixed: "right", width: 430, slot: "operation" }
];

const designerDialogVisible = ref(false);
const metaDialogVisible = ref(false);
const designerDialogTitle = ref("创建问卷");
const isEdit = ref(false);
const designerRef = ref<any>();
const pendingSchema = ref<SurveySchema | null>(null);
const activeDesignerRule = ref<any>(null);
const imageResourcePickerVisible = ref(false);
const form = reactive({ id: undefined as number | undefined, name: "", description: "", status: "draft" as SurveyStatus });

const fillDialogVisible = ref(false);
const fillDialogLoading = ref(false);
const fillFormApi = ref<any>(null);
const fillSurveyId = ref(0);
const fillSurveyTitle = ref("");
const fillSurveySchema = ref<SurveySchema>({ rule: [], option: {} });
const fillFormKey = ref(0);

const statsDialogVisible = ref(false);
const statsDialogLoading = ref(false);
const exportPdfLoading = ref(false);
const activeStatsRow = ref<SurveyRow | null>(null);
const questionStats = ref<SurveyQuestionStats[]>([]);
const textAnswersVisible = ref(false);
const textAnswersLoading = ref(false);
const textAnswersTitle = ref("");
const textAnswerField = ref("");
const textAnswersList = ref<Array<{ id: number; value: string; submitTime: number }>>([]);
const textAnswersPagination = reactive({ total: 0, currentPage: 1, pageSize: 20 });
type SubmissionRow = { id: number; submitTime: number; preview: string; answers: Record<string, unknown> };
const submissionListVisible = ref(false);
const submissionListLoading = ref(false);
const submissionList = ref<SubmissionRow[]>([]);
const submissionListPagination = reactive({ total: 0, currentPage: 1, pageSize: 20 });

const designerConfig = {
  showAi: false,
  showJsonPreview: true,
  showPreviewBtn: true,
  showSaveBtn: false,
  componentRule: {
    elImage: rule => {
      const src = String(rule?.props?.src || "").trim();
      return [{ type: "elButton", title: "图片选择", props: { type: src ? "default" : "primary", plain: !src }, style: { width: "120px", height: "72px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", borderRadius: "4px", border: "1px solid var(--el-border-color)", backgroundColor: src ? "transparent" : "var(--el-fill-color-lighter)", backgroundImage: src ? `url(\"${src}\")` : "none", backgroundSize: "cover", backgroundPosition: "center", color: src ? "#fff" : "var(--el-text-color-secondary)" }, children: [src ? "点击更换" : "选择图片"], on: { click: () => openActiveImagePicker() } }];
    }
  },
  beforeActiveRule: ({ rule }) => (activeDesignerRule.value = rule)
};

const createEmptySchema = (): SurveySchema => ({ rule: [], option: {} });
const normalizeSchema = (input: any): SurveySchema => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return createEmptySchema();
  const schema = input as Record<string, unknown>;
  const rule = Array.isArray(schema.rule) ? (schema.rule as any[]) : Array.isArray(schema.rules) ? (schema.rules as any[]) : [];
  const option = schema.option && typeof schema.option === "object" && !Array.isArray(schema.option) ? (schema.option as Record<string, unknown>) : {};
  return { rule, option };
};
const toFillSchema = (schemaInput: SurveySchema): SurveySchema => {
  const schema = JSON.parse(JSON.stringify(schemaInput));
  const patchRules = (rules: any[]) => {
    rules.forEach(rule => {
      if (!rule || typeof rule !== "object") return;
      const mergedType = `${String(rule.type || rule.name || "").toLowerCase()}:${String(rule?.props?.type || "").toLowerCase()}`;
      if (/upload/.test(mergedType)) {
        const props = rule?.props && typeof rule.props === "object" ? rule.props : {};
        const categoryId = Number(props.categoryId || props.resourceCategoryId || 0);
        const action = `/api/resource-system/resource/upload${categoryId > 0 ? `?categoryId=${categoryId}` : ""}`;
        rule.props = {
          ...props,
          action,
          autoUpload: true,
          httpRequest: async (options: any) => {
            try {
              const maybeRaw = options?.file?.raw;
              const file = maybeRaw instanceof File ? maybeRaw : options?.file;
              if (!(file instanceof File)) throw new Error("无效文件");
              const res: any = await http.request("post", action, {
                data: await file.arrayBuffer(),
                headers: { "Content-Type": file.type || "application/octet-stream" }
              });
              const imageUrl = String(res?.data?.imageUrl || res?.data?.mediaUrl || res?.data?.url || "").trim();
              if (Number(res?.code) !== 0 || !imageUrl) throw new Error(res?.message || "上传失败");
              options?.onSuccess?.({ url: imageUrl, name: file.name }, options?.file);
            } catch (error: any) {
              options?.onError?.(error);
            }
          }
        };
      }
      if (Array.isArray(rule.children)) patchRules(rule.children);
      if (Array.isArray(rule.control)) patchRules(rule.control);
    });
  };
  patchRules(Array.isArray(schema.rule) ? schema.rule : []);
  return { rule: schema.rule || [], option: { ...(schema.option || {}), submitBtn: false, resetBtn: false } };
};
const countSchemaQuestions = (schemaInput: any): number => {
  const schema = normalizeSchema(schemaInput);
  const walk = (rules: any[]): number => rules.reduce((sum, item) => sum + 1 + (Array.isArray(item?.children) ? walk(item.children) : 0), 0);
  return walk(schema.rule);
};

const questionCountMap = computed(() => {
  const map = new Map<number, number>();
  tableData.value.forEach(item => map.set(item.id, countSchemaQuestions(item.schema)));
  return map;
});

const getStatusLabel = (status: SurveyStatus) => STATUS_OPTIONS.find(item => item.value === status)?.label || "-";
const statusTagType = (status: SurveyStatus) => (status === "published" ? "success" : status === "closed" ? "info" : "warning");
const formatTime = (value?: number | null) => (value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-");
const getQuestionKindLabel = (kind: SurveyQuestionStats["kind"]) => (kind === "choice" ? "选择题" : kind === "text" ? "文本题" : kind === "number" ? "数字题" : kind === "date" ? "时间题" : kind === "boolean" ? "布尔题" : "其他");
const getRate = (count: number, total: number) => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);
const hasTimeSeries = (item: SurveyQuestionStats) => Array.isArray(item.timeSeries) && item.timeSeries.length > 0;
const hasRangeSeries = (item: SurveyQuestionStats) =>
  Array.isArray(item.rangeSeries?.start) &&
  item.rangeSeries!.start.length > 0 &&
  Array.isArray(item.rangeSeries?.end) &&
  item.rangeSeries!.end.length > 0;
const hasRangePairs = (item: SurveyQuestionStats) =>
  Array.isArray(item.rangePairs) && (item.rangePairs || []).length > 0;
const isSwitchQuestion = (item: SurveyQuestionStats) => item.kind === "choice" && /switch|boolean|bool/i.test(String(item.type || ""));
const isColorQuestion = (item: SurveyQuestionStats) =>
  item.kind === "choice" && /color/i.test(String(item.type || ""));
const isUploadQuestion = (item: SurveyQuestionStats) =>
  item.kind === "upload" || /upload/i.test(String(item.type || ""));
const isSignatureQuestion = (item: SurveyQuestionStats) =>
  item.kind === "upload" && /sign|signature/i.test(String(item.type || ""));
const getDisplayRenderType = (item: SurveyQuestionStats) => {
  const type = String(item.type || "").toLowerCase();
  if (type.includes("image")) return "image";
  if (type.includes("divider")) return "divider";
  if (type.includes("alert")) return "alert";
  if (type.includes("button")) return "button";
  if (type.includes("html")) return "html";
  return "text";
};
const getTextPreview = (item: SurveyQuestionStats) => {
  const list = Array.isArray(item.textSamples) ? item.textSamples : [];
  if (list.length === 0) return "";
  return list.slice(0, 3).join("\n");
};
const getFieldSlotName = (field: string) => `field-${String(field || "").trim()}`;
const hasFieldSlot = (item: SurveyQuestionStats) =>
  !!String(item.field || "").trim() && !String(item.field || "").startsWith("__display_");
const statsRenderSchema = computed(() => {
  const schema = normalizeSchema(activeStatsRow.value?.schema || {});
  return toFillSchema(schema);
});
const getSortedOptions = (item: SurveyQuestionStats) => {
  const raw = [...(item.options || [])];
  if (!isSwitchQuestion(item)) return raw.sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
  const map = new Map<string, { label: string; value: string; count: number }>();
  raw.forEach(opt => map.set(String(opt.value).toLowerCase(), { label: String(opt.value).toLowerCase() === "false" ? "关闭" : String(opt.value).toLowerCase() === "true" ? "开启" : opt.label, value: String(opt.value), count: Number(opt.count || 0) }));
  if (!map.has("true")) map.set("true", { label: "开启", value: "true", count: 0 });
  if (!map.has("false")) map.set("false", { label: "关闭", value: "false", count: 0 });
  return [...map.values()].sort((a, b) => Number(b.count || 0) - Number(a.count || 0));
};

const applyDesignerSchema = (schemaInput: any) => {
  const schema = normalizeSchema(schemaInput);
  const d = designerRef.value;
  if (!d) return;
  d.setRule?.(schema.rule);
  d.setOption?.(schema.option);
};
const isActiveImageRule = computed(() => String(activeDesignerRule.value?.type || "") === "elImage");
const activeImageResourceId = computed(() => Number(activeDesignerRule.value?.props?.resourceSystemResourceId || 0));
const syncActiveImageRule = (patch: Record<string, unknown>) => {
  const d = designerRef.value;
  const r = activeDesignerRule.value;
  if (!d || !r || String(r?.type || "") !== "elImage") return;
  r.props = { ...(r.props || {}), ...patch };
  const rules = Array.isArray(d.getRule?.()) ? d.getRule() : [];
  d.setRule?.([...rules]);
  d.triggerActive?.(r);
};
const refreshActiveImageConfigPanel = () => {
  const d = designerRef.value;
  const factory = designerConfig.componentRule?.elImage;
  if (!d?.setComponentRuleConfig || typeof factory !== "function") return;
  d.setComponentRuleConfig("elImage", factory, false);
};
const openActiveImagePicker = () => {
  if (!isActiveImageRule.value) return message("请先选中图片组件", { type: "warning" });
  imageResourcePickerVisible.value = true;
};
const onSelectActiveImageResource = (row: ResourceSystemPickerItem) => {
  const src = String(row?.image || "").trim();
  if (!src) return message("所选资源地址为空", { type: "warning" });
  syncActiveImageRule({ src, resourceSystemResourceId: Number(row?.id || 0), fit: (row?.fit || "cover") as ImageFit });
  nextTick(() => refreshActiveImageConfigPanel());
};
const getDesignerSchema = (): SurveySchema => {
  const d = designerRef.value;
  if (!d) return createEmptySchema();
  return { rule: Array.isArray(d.getRule?.()) ? d.getRule() : [], option: d.getOption?.() && typeof d.getOption() === "object" ? d.getOption() : {} };
};

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await getSurveyList({ keyword: queryForm.keyword.trim(), status: queryForm.status, currentPage: pagination.currentPage, pageSize: pagination.pageSize });
    if (res.code === 0 && res.data) {
      tableData.value = (res.data.list || []) as SurveyRow[];
      pagination.total = Number(res.data.total || 0);
      pagination.pageSize = Number(res.data.pageSize || pagination.pageSize);
      pagination.currentPage = Number(res.data.currentPage || pagination.currentPage);
      return;
    }
    message(res.message || "获取问卷列表失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};
const search = () => { pagination.currentPage = 1; void fetchList(); };
const resetSearch = () => { queryForm.keyword = ""; queryForm.status = ""; pagination.currentPage = 1; void fetchList(); };
const handleSizeChange = (value: number) => { pagination.pageSize = value; pagination.currentPage = 1; void fetchList(); };
const handleCurrentChange = (value: number) => { pagination.currentPage = value; void fetchList(); };
const onFullscreen = () => tableRef.value?.setAdaptive?.();

const openCreate = async () => {
  form.id = undefined; form.name = ""; form.description = ""; form.status = "draft";
  pendingSchema.value = createEmptySchema();
  isEdit.value = false;
  designerDialogTitle.value = "创建问卷";
  designerDialogVisible.value = true;
  metaDialogVisible.value = false;
  await nextTick();
  applyDesignerSchema(pendingSchema.value);
};
const openEdit = async (row: SurveyRow) => {
  form.id = row.id; form.name = String(row.name || ""); form.description = String(row.description || ""); form.status = row.status || "draft";
  pendingSchema.value = normalizeSchema(row.schema);
  isEdit.value = true;
  designerDialogTitle.value = "编辑问卷";
  designerDialogVisible.value = true;
  metaDialogVisible.value = false;
  await nextTick();
  applyDesignerSchema(pendingSchema.value);
};
const openMetaDialog = () => {
  const schema = getDesignerSchema();
  if (countSchemaQuestions(schema) === 0) return message("问卷至少需要一个题目", { type: "warning" });
  pendingSchema.value = schema;
  metaDialogVisible.value = true;
};
const saveSurvey = async () => {
  const name = form.name.trim();
  if (!name) return message("请输入问卷名称", { type: "warning" });
  submitLoading.value = true;
  try {
    const payload = { id: form.id, name, description: form.description.trim(), status: form.status, schema: pendingSchema.value || getDesignerSchema() };
    const res = isEdit.value ? await updateSurvey(payload) : await createSurvey(payload);
    if (res.code === 0) {
      message(isEdit.value ? "更新成功" : "创建成功", { type: "success" });
      metaDialogVisible.value = false;
      designerDialogVisible.value = false;
      await fetchList();
      return;
    }
    message(res.message || "淇濆瓨澶辫触", { type: "error" });
  } finally {
    submitLoading.value = false;
  }
};
const removeSurvey = async (row: SurveyRow) => {
  const res = await deleteSurvey({ id: row.id });
  if (res.code === 0) { message("删除成功", { type: "success" }); await fetchList(); return; }
  message(res.message || "删除失败", { type: "error" });
};
const updateStatus = async (row: SurveyRow, status: SurveyStatus) => {
  const res = await updateSurvey({ id: row.id, name: row.name, description: row.description, status, schema: normalizeSchema(row.schema) });
  if (res.code === 0) { message("状态更新成功", { type: "success" }); await fetchList(); return; }
  message(res.message || "状态更新失败", { type: "error" });
};

const openTestFill = (row: SurveyRow) => {
  fillSurveyId.value = Number(row.id || 0);
  fillSurveyTitle.value = String(row.name || "问卷");
  fillSurveySchema.value = toFillSchema(normalizeSchema(row.schema));
  fillFormApi.value = null;
  fillFormKey.value += 1;
  fillDialogVisible.value = true;
};
const submitTestFill = async () => {
  const api = fillFormApi.value;
  if (!api) return message("表单尚未就绪，请稍后重试", { type: "warning" });
  fillDialogLoading.value = true;
  try {
    if (typeof api.validate === "function") await api.validate();
    const values = typeof api.formData === "function" ? api.formData() : typeof api.getValue === "function" ? api.getValue() : {};
    const surveyId = Number(fillSurveyId.value || 0);
    if (!surveyId) return message("问卷ID无效，无法提交", { type: "warning" });
    const res = await submitSurvey({ id: surveyId, answers: values });
    if (res.code !== 0) return message(res.message || "提交失败", { type: "error" });
    message("提交成功", { type: "success" });
    if (typeof api.resetFields === "function") api.resetFields();
    fillFormApi.value = null; fillSurveySchema.value = createEmptySchema(); fillSurveyId.value = 0; fillSurveyTitle.value = ""; fillFormKey.value += 1;
    fillDialogVisible.value = false;
    await fetchList();
  } catch {
    message("请先完成必填项后再提交", { type: "warning" });
  } finally {
    fillDialogLoading.value = false;
  }
};

const openStatsDialog = (row: SurveyRow) => {
  activeStatsRow.value = row;
  questionStats.value = [];
  textAnswersVisible.value = false;
  textAnswersList.value = [];
  textAnswersPagination.total = 0;
  textAnswersPagination.currentPage = 1;
  statsDialogVisible.value = true;
  void loadStatsDetail();
};
const loadStatsDetail = async () => {
  const surveyId = Number(activeStatsRow.value?.id || 0);
  if (!surveyId) return;
  statsDialogLoading.value = true;
  try {
    const res = await getSurveyStatsDetail({ id: surveyId });
    if (res.code === 0 && res.data) { questionStats.value = Array.isArray((res.data as any).questionStats) ? ((res.data as any).questionStats as SurveyQuestionStats[]) : []; return; }
    message(res.message || "获取问卷统计详情失败", { type: "error" });
  } finally {
    statsDialogLoading.value = false;
  }
};
const openTextAnswers = (item: SurveyQuestionStats) => {
  textAnswerField.value = String(item.field || "");
  textAnswersTitle.value = String(item.title || item.field || "");
  textAnswersPagination.currentPage = 1;
  textAnswersVisible.value = true;
  void fetchTextAnswers();
};
const fetchTextAnswers = async () => {
  const surveyId = Number(activeStatsRow.value?.id || 0);
  const field = String(textAnswerField.value || "").trim();
  if (!surveyId || !field) return;
  textAnswersLoading.value = true;
  try {
    const res = await getSurveyTextAnswers({ id: surveyId, field, currentPage: textAnswersPagination.currentPage, pageSize: textAnswersPagination.pageSize });
    if (res.code === 0 && res.data) { textAnswersList.value = (res.data.list || []) as Array<{ id: number; value: string; submitTime: number }>; textAnswersPagination.total = Number(res.data.total || 0); return; }
    message(res.message || "获取填写列表失败", { type: "error" });
  } finally {
    textAnswersLoading.value = false;
  }
};
const onTextAnswersPageChange = (value: number) => { textAnswersPagination.currentPage = value; void fetchTextAnswers(); };
const goStatsPage = () => { const id = Number(activeStatsRow.value?.id || 0); void router.push({ path: "/survey/stats", query: id > 0 ? { surveyId: String(id) } : {} }); statsDialogVisible.value = false; };
const downloadBlobFile = (fileName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || `survey-${Date.now()}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
const base64ToBlob = (contentBase64: string, mimeType: string): Blob => {
  const binary = window.atob(contentBase64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
};
const exportFilledReportsPdf = async (row: SubmissionRow) => {
  exportPdfLoading.value = true;
  try {
    const surveyId = Number(activeStatsRow.value?.id || 0);
    if (!surveyId) return message("问卷ID无效", { type: "warning" });
    const res = await exportSurveySubmissionsPdf({ id: surveyId, submissionId: row.id });
    if (res.code !== 0 || !res.data?.contentBase64) {
      throw new Error(res.message || "下载PDF失败");
    }
    const blob = base64ToBlob(String(res.data.contentBase64), "application/pdf");
    const fileName = String(res.data.fileName || `submission-${row.id}.pdf`);
    downloadBlobFile(fileName, blob);
    message("PDF下载成功", { type: "success" });
  } catch (error: any) {
    message(error?.message || "下载PDF失败", { type: "error" });
  } finally {
    exportPdfLoading.value = false;
  }
};
const exportFilledReportsZip = async () => {
  exportPdfLoading.value = true;
  try {
    const surveyId = Number(activeStatsRow.value?.id || 0);
    if (!surveyId) return message("问卷ID无效", { type: "warning" });
    const res = await exportSurveySubmissionsZip({ id: surveyId });
    if (res.code !== 0 || !res.data?.contentBase64) {
      throw new Error(res.message || "下载ZIP失败");
    }
    const zipBlob = base64ToBlob(String(res.data.contentBase64), "application/zip");
    const fileName = String(res.data.fileName || `survey-${surveyId}-submissions.zip`);
    downloadBlobFile(fileName, zipBlob);
    message("ZIP下载成功", { type: "success" });
  } catch (error: any) {
    message(error?.message || "下载ZIP失败", { type: "error" });
  } finally {
    exportPdfLoading.value = false;
  }
};
const fetchSubmissionList = async () => {
  const surveyId = Number(activeStatsRow.value?.id || 0);
  if (!surveyId) return;
  submissionListLoading.value = true;
  try {
    const res = await getSurveySubmissionsList({
      id: surveyId,
      currentPage: submissionListPagination.currentPage,
      pageSize: submissionListPagination.pageSize
    });
    if (res.code === 0 && res.data) {
      submissionList.value = (res.data.list || []) as SubmissionRow[];
      submissionListPagination.total = Number(res.data.total || 0);
      return;
    }
    message(res.message || "获取填报列表失败", { type: "error" });
  } finally {
    submissionListLoading.value = false;
  }
};
const openSubmissionList = () => {
  submissionListPagination.currentPage = 1;
  submissionListVisible.value = true;
  void fetchSubmissionList();
};
const onSubmissionListPageChange = (value: number) => {
  submissionListPagination.currentPage = value;
  void fetchSubmissionList();
};

onMounted(() => void fetchList());
</script>

<template>
  <div class="main survey-list-page">
    <el-form :inline="true" :model="queryForm" class="search-form bg-bg_color w-full pl-8 pt-[12px] overflow-auto">
      <el-form-item label="关键字">
        <el-input
          v-model="queryForm.keyword"
          placeholder="按名称或描述搜索"
          clearable
          class="w-[260px]!"
          @keyup.enter="search"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-select v-model="queryForm.status" clearable placeholder="全部" class="w-[160px]!">
          <el-option v-for="status in STATUS_OPTIONS" :key="status.value" :label="status.label" :value="status.value" />
        </el-select>
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :icon="useRenderIcon('ri:search-line')" @click="search">查询</el-button>
        <el-button :icon="useRenderIcon(Refresh)" @click="resetSearch">重置</el-button>
      </el-form-item>
    </el-form>

    <PureTableBar title="问卷调查列表" :columns="columns" :tableRef="tableRef?.getTableRef?.()" @refresh="fetchList" @fullscreen="onFullscreen">
      <template #buttons>
        <el-button type="primary" :icon="useRenderIcon(AddFill)" @click="openCreate">创建问卷调查</el-button>
      </template>
      <template #default="{ size, dynamicColumns }">
        <pure-table ref="tableRef" row-key="id" align-whole="center" table-layout="auto" :loading="loading" :size="size" adaptive :adaptiveConfig="{ offsetBottom: 108 }" :data="tableData" :columns="dynamicColumns" :pagination="{ ...pagination, size }" :header-cell-style="{ background: 'var(--el-fill-color-light)', color: 'var(--el-text-color-primary)' }" @page-size-change="handleSizeChange" @page-current-change="handleCurrentChange">
          <template #status="{ row }"><el-tag :type="statusTagType(row.status)">{{ getStatusLabel(row.status) }}</el-tag></template>
          <template #questionCount="{ row }">{{ questionCountMap.get(row.id) || 0 }}</template>
          <template #responseCount="{ row }">{{ Number(row.responseCount || 0) }}</template>
          <template #updateTime="{ row }">{{ formatTime(row.updateTime) }}</template>
          <template #operation="{ row }">
            <el-button link type="primary" :size="size" :icon="useRenderIcon(EditPen)" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" :size="size" @click="openTestFill(row)">测试填写</el-button>
            <el-button link type="primary" :size="size" @click="openStatsDialog(row)">统计</el-button>
            <el-button v-if="row.status !== 'published'" link type="success" :size="size" @click="updateStatus(row, 'published')">发布</el-button>
            <el-button v-if="row.status !== 'closed'" link type="warning" :size="size" @click="updateStatus(row, 'closed')">关闭</el-button>
            <el-popconfirm title="确认删除该问卷吗？" @confirm="removeSurvey(row)">
              <template #reference>
                <el-button link type="danger" :size="size" :icon="useRenderIcon(Delete)">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </pure-table>
      </template>
    </PureTableBar>

    <el-dialog v-model="designerDialogVisible" :title="designerDialogTitle" width="1200px" append-to-body>
      <fc-designer ref="designerRef" class="designer-shell" height="680px" :config="designerConfig" />
      <template #footer>
        <el-button @click="designerDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="openMetaDialog">下一步</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="metaDialogVisible" title="问卷信息" width="520px" append-to-body>
      <el-form label-width="88px">
        <el-form-item label="问卷名称" required>
          <el-input v-model="form.name" maxlength="120" show-word-limit placeholder="请输入问卷名称" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="请输入问卷描述" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio-button label="draft">草稿</el-radio-button>
            <el-radio-button label="published">发布</el-radio-button>
            <el-radio-button label="closed">关闭</el-radio-button>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="metaDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="saveSurvey">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="fillDialogVisible" :title="`测试填写 - ${fillSurveyTitle || '-'}`" width="860px" append-to-body>
      <div class="fill-shell" v-loading="fillDialogLoading">
        <form-create :key="fillFormKey" v-model:api="fillFormApi" :rule="fillSurveySchema.rule" :option="fillSurveySchema.option" />
      </div>
      <template #footer>
        <el-button @click="fillDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="fillDialogLoading" @click="submitTestFill">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="statsDialogVisible" title="问卷统计" width="980px" append-to-body>
      <div v-loading="statsDialogLoading">
        <el-descriptions :column="4" border>
          <el-descriptions-item label="问卷ID">{{ Number(activeStatsRow?.id || 0) || "-" }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag v-if="activeStatsRow" :type="statusTagType(activeStatsRow.status)">
              {{ activeStatsRow ? getStatusLabel(activeStatsRow.status) : "-" }}
            </el-tag>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="回收数">{{ Number(activeStatsRow?.responseCount || 0) }}</el-descriptions-item>
          <el-descriptions-item label="更新时间">{{ activeStatsRow ? formatTime(activeStatsRow.updateTime) : "-" }}</el-descriptions-item>
        </el-descriptions>

        <el-divider content-position="left">题目统计（与填写页同结构）</el-divider>
        <div class="question-stats-page">
          <div v-if="questionStats.length === 0" class="question-stats-empty">暂无题目统计数据</div>

          <form-create
            v-else
            :rule="statsRenderSchema.rule"
            :option="statsRenderSchema.option"
            class="stats-form-shell"
          >
            <template
              v-for="(row, index) in questionStats.filter(hasFieldSlot)"
              :key="`${row.field}-${index}`"
              v-slot:[getFieldSlotName(row.field)]
            >
              <div v-if="isSwitchQuestion(row) || isColorQuestion(row)" class="question-choice-body">
                <QuestionStatChart mode="pie" :options="getSortedOptions(row)" />
              </div>

              <div v-else-if="row.kind === 'choice'" class="question-choice-body">
                <div v-for="opt in getSortedOptions(row)" :key="`${row.field}-${opt.value}`" class="choice-item">
                  <div class="choice-label">{{ opt.label }}</div>
                  <div class="choice-progress">
                    <el-progress
                      :stroke-width="16"
                      :text-inside="true"
                      :show-text="true"
                      :percentage="getRate(opt.count, row.totalSubmissions)"
                    />
                  </div>
                  <div class="choice-count">{{ opt.count }}（{{ getRate(opt.count, row.totalSubmissions) }}%）</div>
                </div>
                <div v-if="!row.options || row.options.length === 0" class="choice-empty">暂无选项统计</div>
              </div>

              <div v-else-if="row.kind === 'date'" class="question-text-body">
                <QuestionStatChart
                  v-if="hasRangePairs(row)"
                  mode="timeSegments"
                  :pairs="row.rangePairs || []"
                />
                <QuestionStatChart
                  v-else-if="hasRangeSeries(row)"
                  mode="timeRange"
                  :range-start="row.rangeSeries?.start || []"
                  :range-end="row.rangeSeries?.end || []"
                />
                <QuestionStatChart v-else-if="hasTimeSeries(row)" mode="time" :series="row.timeSeries || []" />
                <div v-else class="choice-empty">暂无时间分布数据</div>
              </div>

              <div v-else-if="row.kind === 'text'" class="question-text-body">
                <el-button link type="primary" @click="openTextAnswers(row)">
                  查看填写列表（{{ Number(row.textSampleCount || 0) }}）
                </el-button>
              </div>

              <div v-else-if="row.kind === 'number'" class="question-text-body">
                <el-descriptions :column="3" border size="small">
                  <el-descriptions-item label="平均分">
                    {{ row.numberStats?.avg ?? "-" }}
                  </el-descriptions-item>
                  <el-descriptions-item label="最高分">
                    {{ row.numberStats?.max ?? "-" }}
                  </el-descriptions-item>
                  <el-descriptions-item label="最低分">
                    {{ row.numberStats?.min ?? "-" }}
                  </el-descriptions-item>
                </el-descriptions>
              </div>

              <div v-else-if="isUploadQuestion(row)" class="question-text-body">
                <el-button v-if="isSignatureQuestion(row)" link type="primary" @click="openTextAnswers(row)">
                  查看填写列表（{{ Number(row.answeredCount || 0) }}）
                </el-button>
                <template v-else>
                  <div class="upload-preview-grid" v-if="(row.imageSamples || []).length > 0">
                    <el-image
                      v-for="(img, imgIndex) in row.imageSamples || []"
                      :key="`${row.field}-${imgIndex}`"
                      :src="img"
                      fit="cover"
                      class="upload-preview-item"
                      :preview-src-list="row.imageSamples || []"
                      preview-teleported
                    />
                  </div>
                  <div v-else class="choice-empty">暂无图片数据</div>
                </template>
              </div>

              <div v-else class="question-other-body">
                <el-tag type="success">作答 {{ Number(row.answeredCount || 0) }}</el-tag>
                <el-tag type="warning">未作答 {{ Number(row.emptyCount || 0) }}</el-tag>
              </div>
            </template>
          </form-create>
        </div>
      </div>

      <template #footer>
        <el-button @click="statsDialogVisible = false">关闭</el-button>
        <el-button type="primary" plain @click="openSubmissionList">查看填报列表</el-button>
        <el-button type="primary" @click="goStatsPage">进入统计页</el-button>
      </template>
    </el-dialog>


    <el-dialog v-model="submissionListVisible" title="填报列表" width="900px" append-to-body>
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 16px;">
          <span>填报列表</span>
          <el-button type="primary" plain :loading="exportPdfLoading" @click="exportFilledReportsZip()">批量下载全部PDF</el-button>
        </div>
      </template>
      <el-table v-loading="submissionListLoading" :data="submissionList" border max-height="520">
        <el-table-column prop="id" label="提交ID" width="100" />
        <el-table-column label="提交时间" width="180">
          <template #default="{ row }">{{ formatTime(row.submitTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" :loading="exportPdfLoading" @click="exportFilledReportsPdf(row)">下载PDF</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="text-answer-pagination">
        <el-pagination
          v-model:current-page="submissionListPagination.currentPage"
          layout="total, prev, pager, next"
          :total="submissionListPagination.total"
          :page-size="submissionListPagination.pageSize"
          @current-change="onSubmissionListPageChange"
        />
      </div>
    </el-dialog>
    <el-dialog v-model="textAnswersVisible" :title="`填写列表（${textAnswersTitle || '-'})`" width="820px" append-to-body>
      <el-table v-loading="textAnswersLoading" :data="textAnswersList" border max-height="520">
        <el-table-column prop="id" label="提交ID" width="100" />
        <el-table-column prop="value" label="填写内容" min-width="460" show-overflow-tooltip />
        <el-table-column label="提交时间" width="180"><template #default="{ row }">{{ formatTime(row.submitTime) }}</template></el-table-column>
      </el-table>
      <div class="text-answer-pagination"><el-pagination v-model:current-page="textAnswersPagination.currentPage" layout="total, prev, pager, next" :total="textAnswersPagination.total" :page-size="textAnswersPagination.pageSize" @current-change="onTextAnswersPageChange" /></div>
    </el-dialog>

    <ResourceSystemPicker v-model="imageResourcePickerVisible" title="选择图片资源" :current-id="activeImageResourceId" :allow-video="false" @select="onSelectActiveImageResource" />
  </div>
</template>

<style scoped lang="scss">
.survey-list-page { min-height: calc(100vh - 140px); }
.search-form { :deep(.el-form-item) { margin-bottom: 12px; } }
.designer-shell { border: 1px solid var(--el-border-color-lighter); border-radius: 8px; overflow: hidden; }
.fill-shell { min-height: 360px; max-height: 62vh; overflow: auto; padding: 8px 10px 4px; }
.question-stats-page { display: flex; flex-direction: column; gap: 12px; max-height: 58vh; overflow: auto; padding-right: 4px; }
.question-stats-empty { color: var(--el-text-color-secondary); text-align: center; padding: 20px 0; }
.stats-form-shell { padding: 2px 4px 8px; }
.stats-form-shell :deep(.el-form-item__content) { width: 100%; display: block; }
.stats-form-item { margin-bottom: 18px; }
.stats-form-label { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-weight: 600; color: var(--el-text-color-primary); }
.question-index { margin-right: 6px; }
.answer-shell { border: 1px solid var(--el-border-color-lighter); background: var(--el-fill-color-blank); border-radius: 8px; padding: 12px; }
.question-choice-body,.question-text-body,.question-display-body { display: flex; flex-direction: column; gap: 8px; }
.question-choice-body,.question-text-body,.question-display-body { width: 100%; }
.question-choice-body :deep(.question-stat-chart) { width: 100%; min-height: 220px; }
.display-text { padding: 10px; border-radius: 8px; background: var(--el-fill-color-lighter); color: var(--el-text-color-regular); line-height: 1.6; }
.display-image { width: 100%; max-height: 220px; border-radius: 8px; border: 1px solid var(--el-border-color-lighter); }
.display-divider { margin: 8px 0; }
.display-html { padding: 10px; border-radius: 8px; border: 1px solid var(--el-border-color-lighter); background: #fff; line-height: 1.6; }
.choice-item { display: grid; grid-template-columns: 150px 1fr 132px; align-items: center; gap: 10px; }
.choice-item { width: 100%; }
.choice-progress :deep(.el-progress) { width: 100%; }
.choice-label { color: var(--el-text-color-primary); }
.choice-count { color: var(--el-text-color-secondary); text-align: right; }
.choice-empty { color: var(--el-text-color-secondary); }
.text-samples { display: flex; flex-direction: column; gap: 6px; }
.text-sample-item { padding: 8px 10px; border-radius: 8px; background: var(--el-fill-color-lighter); color: var(--el-text-color-regular); }
.question-other-body { display: flex; gap: 8px; }
.upload-preview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; }
.upload-preview-item { width: 100%; height: 92px; border-radius: 6px; border: 1px solid var(--el-border-color-lighter); }
.text-answer-pagination { margin-top: 12px; display: flex; justify-content: flex-end; }
</style>

