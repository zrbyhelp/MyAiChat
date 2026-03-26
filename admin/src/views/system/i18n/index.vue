<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { message } from "@/utils/message";
import { ElMessageBox } from "element-plus";
import {
  getI18nFileList,
  getI18nFileContent,
  saveI18nFileContent,
  uploadI18nFile,
  downloadI18nFile,
  getI18nCategoryList
} from "@/api/system";

defineOptions({
  name: "SystemI18nLanguage"
});

type I18nFileItem = {
  filename: string;
  ext: string;
  size: number;
  updateTime: number;
};

type I18nEntry = {
  id: number;
  key: string;
  value: string;
};

type I18nCategoryItem = {
  id: number;
  name: string;
  key: string;
  structure?: Record<string, unknown>;
};

const listLoading = ref(false);
const contentLoading = ref(false);
const saving = ref(false);
const categoryLoading = ref(false);
const filterKeyword = ref("");
const categoryList = ref<I18nCategoryItem[]>([]);
const activeCategoryKey = ref("");
const fileList = ref<I18nFileItem[]>([]);
const activeFilename = ref("");
const entries = ref<I18nEntry[]>([]);
const originSnapshot = ref("[]");
const idSeed = ref(1);
const BRANCH_REMARK_KEY = "__remark";

const hasActiveFile = computed(() => Boolean(activeFilename.value));
const activeExt = computed(() => {
  const filename = String(activeFilename.value || "");
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
});
const filteredEntries = computed(() => {
  const kw = String(filterKeyword.value || "").toLowerCase().trim();
  if (!kw) return entries.value;
  return entries.value.filter(item => {
    const k = String(item.key || "").toLowerCase();
    const v = String(item.value || "").toLowerCase();
    return k.includes(kw) || v.includes(kw);
  });
});
const activeCategoryStructure = computed<Record<string, unknown>>(() => {
  const key = String(activeCategoryKey.value || "");
  const hit = categoryList.value.find(item => item.key === key);
  return (hit?.structure as Record<string, unknown>) || {};
});
const getKeyRemark = (key: string) => {
  const segments = getKeySegments(key);
  if (segments.length === 0) return "";
  let cursor: any = activeCategoryStructure.value;
  for (const seg of segments) {
    if (!cursor || typeof cursor !== "object") return "";
    cursor = cursor[seg];
  }
  if (cursor === undefined || cursor === null) return "";
  if (cursor && typeof cursor === "object" && !Array.isArray(cursor)) {
    if (BRANCH_REMARK_KEY in cursor) return String(cursor[BRANCH_REMARK_KEY] ?? "");
    return "";
  }
  return String(cursor);
};
const hasChanges = computed(
  () => hasActiveFile.value && snapshotEntries() !== originSnapshot.value
);

const formatSize = (size: number) => {
  const n = Number(size || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const formatTime = (time: number) => {
  if (!Number.isFinite(Number(time))) return "-";
  return new Date(Number(time)).toLocaleString();
};

const normalizeFilename = (input: string) => String(input || "").trim();

const isValidFilename = (filename: string) => {
  if (!filename) return false;
  if (filename.includes("/") || filename.includes("\\")) return false;
  if (!/^[A-Za-z0-9._-]+$/.test(filename)) return false;
  const lower = filename.toLowerCase();
  return lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".json");
};

const normalizeEntryKey = (key: string) => String(key || "").trim();
const getKeySegments = (key: string) =>
  normalizeEntryKey(key)
    .split(".")
    .map(seg => seg.trim())
    .filter(Boolean);
const isValidEntryKey = (key: string) => {
  if (!key) return false;
  if (key.includes("..")) return false;
  const segments = key.split(".");
  return segments.every(seg => /^[A-Za-z0-9_-]+$/.test(seg));
};

const isSafeSegment = (seg: string) => !["__proto__", "prototype", "constructor"].includes(seg);

const addEntry = (key = "", value = "") => {
  entries.value.push({
    id: idSeed.value++,
    key,
    value
  });
};

const removeEntry = (id: number) => {
  entries.value = entries.value.filter(item => item.id !== id);
};

const clearEditor = () => {
  activeFilename.value = "";
  entries.value = [];
  originSnapshot.value = snapshotEntries();
};

const snapshotEntries = () =>
  JSON.stringify(
    entries.value.map(item => ({
      key: String(item.key ?? ""),
      value: String(item.value ?? "")
    }))
  );

const flattenObject = (input: any, prefix = "", output: Array<{ key: string; value: string }> = []) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return output;
  for (const [k, v] of Object.entries(input)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flattenObject(v, key, output);
    else output.push({ key, value: v === null || v === undefined ? "" : String(v) });
  }
  return output;
};

const parseYamlScalar = (raw: string) => {
  const value = String(raw ?? "");
  if (!value) return "";
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
};

const parseYamlToEntries = (content: string) => {
  const lines = String(content || "").split(/\r?\n/);
  const stack: string[] = [];
  const out: Array<{ key: string; value: string }> = [];

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("-")) {
      throw new Error(`Line ${i + 1} contains array syntax; form mode does not support lists`);
    }
    const match = rawLine.match(/^(\s*)([^:\s][^:]*?)\s*:\s*(.*)$/);
    if (!match) {
      throw new Error(`Line ${i + 1} format is invalid`);
    }
    const indent = match[1].replace(/\t/g, "  ").length;
    const level = Math.floor(indent / 2);
    const currentKey = String(match[2] || "").trim();
    const rest = String(match[3] || "");

    while (stack.length > level) stack.pop();

    if (rest === "") {
      stack[level] = currentKey;
      continue;
    }

    const fullKey = [...stack.slice(0, level), currentKey].join(".");
    out.push({
      key: fullKey,
      value: parseYamlScalar(rest.trim())
    });
  }
  return out;
};

const loadEntriesFromContent = (content: string, ext: string) => {
  const normalizedExt = String(ext || "").toLowerCase();
  let parsed: Array<{ key: string; value: string }> = [];

  if (normalizedExt === ".json") {
    const data = JSON.parse(String(content || "{}"));
    parsed = flattenObject(data);
  } else if (normalizedExt === ".yaml" || normalizedExt === ".yml") {
    parsed = parseYamlToEntries(content);
  } else {
    throw new Error("仅支持 yaml / yml / json 文件");
  }

  entries.value = [];
  parsed.forEach(item => addEntry(item.key, item.value));
  if (entries.value.length === 0) addEntry("", "");
  originSnapshot.value = snapshotEntries();
};

const buildObjectFromEntries = (source: I18nEntry[]) => {
  const result: Record<string, any> = {};
  for (const row of source) {
    const key = normalizeEntryKey(row.key);
    const value = String(row.value ?? "");
    const segments = key.split(".");
    let cursor: Record<string, any> = result;
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      if (!isSafeSegment(seg)) throw new Error(`Invalid key segment ${seg}`);
      if (i === segments.length - 1) {
        cursor[seg] = value;
      } else {
        if (!cursor[seg] || typeof cursor[seg] !== "object" || Array.isArray(cursor[seg])) {
          cursor[seg] = {};
        }
        cursor = cursor[seg];
      }
    }
  }
  return result;
};

const formatYamlScalar = (value: string) => {
  const text = String(value ?? "");
  if (text === "") return "''";
  if (/^[0-9]+(\.[0-9]+)?$/.test(text)) return `'${text}'`;
  if (/^(true|false|null|yes|no|on|off)$/i.test(text)) return `'${text}'`;
  if (/[#:]/.test(text) || /^\s|\s$/.test(text)) return `'${text.replace(/'/g, "''")}'`;
  return text;
};

const dumpYamlObject = (input: Record<string, any>, level = 0): string => {
  const indent = "  ".repeat(level);
  const lines: string[] = [];
  for (const key of Object.keys(input)) {
    const value = input[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${indent}${key}:`);
      lines.push(dumpYamlObject(value, level + 1));
    } else {
      lines.push(`${indent}${key}: ${formatYamlScalar(String(value ?? ""))}`);
    }
  }
  return lines.join("\n");
};

const buildContentFromEntries = (source: I18nEntry[], ext: string) => {
  const obj = buildObjectFromEntries(source);
  const normalizedExt = String(ext || "").toLowerCase();
  if (normalizedExt === ".json") return `${JSON.stringify(obj, null, 2)}\n`;
  if (normalizedExt === ".yaml" || normalizedExt === ".yml") return `${dumpYamlObject(obj)}\n`;
  throw new Error("仅支持 yaml / yml / json 文件");
};

const normalizeEntriesBeforeSave = () => {
  const cleaned = entries.value
    .map(item => ({
      id: item.id,
      key: normalizeEntryKey(item.key),
      value: String(item.value ?? "")
    }))
    .filter(item => item.key || item.value);

  if (cleaned.length === 0) throw new Error("Keep at least one entry");

  const keySet = new Set<string>();
  for (const item of cleaned) {
    if (!item.key) throw new Error("Key is empty, please fix");
    if (!isValidEntryKey(item.key)) {
      throw new Error(`Invalid key format: ${item.key} (example: menus.pureHome)`);
    }
    if (keySet.has(item.key)) throw new Error(`Duplicate key: ${item.key}`);
    keySet.add(item.key);
  }
  return cleaned;
};

const previousCategoryKey = ref("");

const requireActiveCategory = (showMessage = true) => {
  const key = String(activeCategoryKey.value || "").trim();
  if (!key && showMessage) {
    message("请先选择分类", { type: "warning" });
  }
  return key;
};

const fetchCategoryList = async (keepCurrent = true) => {
  categoryLoading.value = true;
  try {
    const res = await getI18nCategoryList({});
    if (res.code !== 0 || !res.data || !Array.isArray(res.data.list)) {
      message(res.message || "获取分类列表失败", { type: "error" });
      return false;
    }
    const list = (res.data.list as I18nCategoryItem[])
      .map(item => ({
        id: Number(item.id),
        name: String(item.name || "").trim(),
        key: String(item.key || "").trim(),
        structure: (item as any).structure || {}
      }))
      .filter(item => item.id > 0 && item.key);
    categoryList.value = list;
    if (list.length === 0) {
      activeCategoryKey.value = "";
      previousCategoryKey.value = "";
      fileList.value = [];
      clearEditor();
      return false;
    }
    const hasCurrent = keepCurrent && list.some(item => item.key === activeCategoryKey.value);
    const nextKey = hasCurrent ? activeCategoryKey.value : list[0].key;
    activeCategoryKey.value = nextKey;
    previousCategoryKey.value = nextKey;
    return true;
  } finally {
    categoryLoading.value = false;
  }
};

const onCategoryChange = async (nextKey: string) => {
  const prevKey = String(previousCategoryKey.value || "").trim();
  const normalized = String(nextKey || "").trim();
  if (normalized === prevKey) return;

  if (hasChanges.value) {
    try {
      await ElMessageBox.confirm(
        "当前存在未保存的修改，确定放弃并切换分类吗？",
        "提示",
        {
          type: "warning",
          confirmButtonText: "切换分类",
          cancelButtonText: "取消"
        }
      );
    } catch {
      activeCategoryKey.value = prevKey;
      return;
    }
  }

  previousCategoryKey.value = normalized;
  clearEditor();
  await fetchList(false);
};

const fetchList = async (keepCurrent = true) => {
  const categoryKey = requireActiveCategory(false);
  if (!categoryKey) {
    fileList.value = [];
    clearEditor();
    return;
  }
  listLoading.value = true;
  try {
    const res = await getI18nFileList({ categoryKey });
    if (res.code !== 0 || !Array.isArray(res.data)) {
      message(res.message || "获取词典文件列表失败", { type: "error" });
      return;
    }
    fileList.value = res.data as I18nFileItem[];
    if (fileList.value.length === 0) {
      clearEditor();
      return;
    }
    const target = keepCurrent
      ? fileList.value.find(item => item.filename === activeFilename.value)
      : null;
    const nextFilename = (target || fileList.value[0]).filename;
    if (nextFilename !== activeFilename.value) {
      await openFile(nextFilename);
    }
  } finally {
    listLoading.value = false;
  }
};

const openFile = async (filename: string) => {
  if (!filename || filename === activeFilename.value) return;
  const categoryKey = requireActiveCategory();
  if (!categoryKey) return;
  if (hasChanges.value) {
    message("存在未保存的修改，请先保存后再切换文件", { type: "warning" });
    return;
  }
  contentLoading.value = true;
  try {
    const res = await getI18nFileContent({ filename, categoryKey });
    if (res.code !== 0 || !res.data) {
      message(res.message || "读取文件失败", { type: "error" });
      return;
    }
    const targetFilename = String(res.data.filename || filename);
    const ext = `.${targetFilename.split(".").pop()}`.toLowerCase();
    loadEntriesFromContent(String(res.data.content || ""), ext);
    activeFilename.value = targetFilename;
  } catch (error) {
    message(`解析文件失败：${error instanceof Error ? error.message : String(error)}`, {
      type: "error"
    });
  } finally {
    contentLoading.value = false;
  }
};

const saveCurrent = async () => {
  const categoryKey = requireActiveCategory();
  if (!categoryKey) return;
  if (!hasActiveFile.value) {
    message("请先选择文件", { type: "warning" });
    return;
  }
  if (!hasChanges.value) {
    message("当前无变化", { type: "info" });
    return;
  }

  saving.value = true;
  try {
    const normalizedEntries = normalizeEntriesBeforeSave();
    const builtContent = buildContentFromEntries(normalizedEntries as any, activeExt.value);
    const res = await saveI18nFileContent({
      filename: activeFilename.value,
      categoryKey,
      content: builtContent
    });
    if (res.code === 0) {
      entries.value = normalizedEntries.map(item => ({ ...item }));
      originSnapshot.value = snapshotEntries();
      message("保存成功", { type: "success" });
      await fetchList(true);
      return;
    }
    message(res.message || "保存失败", { type: "error" });
  } catch (error) {
    message(error instanceof Error ? error.message : String(error), { type: "error" });
  } finally {
    saving.value = false;
  }
};

const doDownload = async () => {
  const categoryKey = requireActiveCategory();
  if (!categoryKey) return;
  if (!hasActiveFile.value) {
    message("请先选择文件", { type: "warning" });
    return;
  }
  const blob = await downloadI18nFile({ filename: activeFilename.value, categoryKey });
  if (!(blob instanceof Blob)) {
    message("下载失败：返回格式异常", { type: "error" });
    return;
  }
  if (blob.type.includes("application/json")) {
    const text = await blob.text();
    try {
      const data = JSON.parse(text);
      message(data?.message || "下载失败", { type: "error" });
      return;
    } catch {
      message("下载失败", { type: "error" });
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = activeFilename.value;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const beforeUpload = async (rawFile: File) => {
  const categoryKey = requireActiveCategory();
  if (!categoryKey) return false;
  const filename = normalizeFilename(rawFile.name);
  if (!isValidFilename(filename)) {
    message("仅支持 .yaml/.yml/.json 文件名", { type: "warning" });
    return false;
  }
  const text = await rawFile.text();
  const res = await uploadI18nFile({ filename, categoryKey, content: text });
  if (res.code === 0) {
    message("上传成功", { type: "success" });
    clearEditor();
    await fetchList(true);
    await openFile(filename);
  } else {
    message(res.message || "上传失败", { type: "error" });
  }
  return false;
};

onMounted(() => {
  void (async () => {
    const ok = await fetchCategoryList(false);
    if (!ok) return;
    await fetchList(false);
  })();
});
</script>

<template>
  <div class="main">
    <div class="i18n-page">
      <el-card shadow="never" class="i18n-file-list">
        <template #header>
          <div class="file-selector-header">
            <div class="file-selector-title">词典文件</div>
            <div class="file-selector-row">
              <span class="file-selector-label">分类</span>
              <el-select
                v-model="activeCategoryKey"
                size="small"
                filterable
                :loading="categoryLoading"
                placeholder="请先选择分类"
                class="file-selector-select"
                @change="onCategoryChange"
              >
                <el-option
                  v-for="item in categoryList"
                  :key="item.key"
                  :label="`${item.name} (${item.key})`"
                  :value="item.key"
                />
              </el-select>
            </div>
          </div>
        </template>
        <el-scrollbar class="file-scrollbar" v-loading="listLoading">
          <div
            v-for="item in fileList"
            :key="item.filename"
            :class="['file-item', item.filename === activeFilename ? 'active' : '']"
            @click="openFile(item.filename)"
          >
            <div class="file-name">{{ item.filename }}</div>
            <div class="file-meta">
              <span>{{ formatSize(item.size) }}</span>
              <span>{{ formatTime(item.updateTime) }}</span>
            </div>
          </div>
          <el-empty v-if="!listLoading && fileList.length === 0" description="暂无词典文件" :image-size="80" />
        </el-scrollbar>
      </el-card>

      <el-card shadow="never" class="i18n-editor">
        <template #header>
          <div class="header-row">
            <span>词典表单 {{ activeFilename ? `(${activeFilename})` : "" }}</span>
            <div class="action-buttons">
              <el-input
                v-model="filterKeyword"
                size="small"
                placeholder="过滤 key / 内容"
                clearable
                class="filter-input"
              />

              <el-upload
                action="#"
                :show-file-list="false"
                :before-upload="beforeUpload"
                accept=".yaml,.yml,.json"
              >
                <el-button size="small">上传</el-button>
              </el-upload>
              <el-button size="small" :disabled="!hasActiveFile" @click="doDownload">下载</el-button>
              <el-button size="small" type="primary" :loading="saving" :disabled="!hasActiveFile" @click="saveCurrent">
                保存
              </el-button>
            </div>
          </div>
        </template>

        <el-scrollbar class="editor-scrollbar" v-loading="contentLoading">
          <div v-if="filteredEntries.length === 0" class="empty-row">
            <el-empty description="请选择词典文件后编辑" :image-size="80" />
          </div>
          <div v-else class="entry-list">
            <div v-for="(row, idx) in filteredEntries" :key="row.id" class="entry-row">
              <div class="entry-index">{{ idx + 1 }}</div>
              <div class="entry-key readonly-key">{{ row.key }}</div>
              <el-input
                v-model="row.value"
                placeholder="请输入词条值"
                class="entry-value"
                clearable
              />
              <div class="key-hint" v-if="row.key && getKeyRemark(row.key)">
                <span class="key-hint-text">{{ getKeyRemark(row.key) }}</span>
              </div>
            </div>
          </div>
        </el-scrollbar>

        <div class="status-row">
          <span>状态：{{ hasChanges ? "存在未保存修改" : "已保存" }}</span>
          <span>条目数：{{ filteredEntries.length }} / {{ entries.length }}</span>
        </div>
      </el-card>
    </div>
  </div>
</template>

<style scoped lang="scss">
.main {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.main-content {
  height: calc(100vh - 120px);
  min-height: 0;
  padding: 16px 24px 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.i18n-page {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-input {
  width: 200px;
}

.file-selector-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.file-selector-title {
  font-weight: 600;
  line-height: 1.4;
}

.file-selector-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-selector-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  white-space: nowrap;
}

.file-selector-select {
  width: 100%;
  min-width: 0;
}

.i18n-file-list,
.i18n-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

:deep(.i18n-file-list .el-card__header),
:deep(.i18n-editor .el-card__header) {
  flex: 0 0 auto;
}

:deep(.i18n-file-list .el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

:deep(.i18n-editor .el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.file-scrollbar,
.editor-scrollbar {
  flex: 1;
  min-height: 0;
}

.file-scrollbar :deep(.el-scrollbar__wrap),
.editor-scrollbar :deep(.el-scrollbar__wrap) {
  overflow-x: hidden;
}

.file-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
}

.file-item:hover {
  background: var(--el-fill-color-lighter);
}

.file-item.active {
  border-color: var(--el-color-primary-light-5);
  background: var(--el-color-primary-light-9);
}

.file-name {
  font-weight: 600;
  line-height: 1.4;
}

.file-meta {
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.entry-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-right: 0;
  overflow-x: hidden;
}

.entry-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1.2fr) minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 4px 8px;
  align-items: start;
  width: 100%;
}

.entry-row :deep(.el-input) {
  min-width: 0;
}

.entry-index {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  align-self: center;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;
}

.entry-value {
  grid-column: 3 / 4;
  grid-row: 1 / 2;
}

.readonly-key {
  height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-light);
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.key-hint {
  grid-column: 2 / 4;
  grid-row: 2 / 3;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.key-hint-label {
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}

.key-hint-text {
  color: var(--el-text-color-regular);
}

.entry-index {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;
}

.empty-row {
  padding: 32px 0;
}

.status-row {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 960px) {
  .i18n-page {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, 36%) minmax(0, 1fr);
  }

  .entry-row {
    grid-template-columns: 32px 1fr;
  }

  .entry-value {
    grid-column: 2 / 3;
  }
}
</style>



