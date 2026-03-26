<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { message } from "@/utils/message";
import {
  deleteI18nCategory,
  getI18nCategoryList,
  saveI18nCategory
} from "@/api/system";

defineOptions({
  name: "SystemI18nCategory"
});

type CategoryRow = {
  id: number;
  name: string;
  key: string;
  languages: string[];
  structure: Record<string, unknown>;
  dictionaryPaths?: Array<{
    path: string;
  }>;
  readonly?: boolean;
  createTime: number;
  updateTime: number;
};

type StructureNode = {
  id: number;
  key: string;
  remark: string;
  children: StructureNode[];
};

type NodeOption = {
  id: number;
  label: string;
};

type QuickLeafRow = {
  id: number;
  key: string;
  remark: string;
};

const BRANCH_REMARK_KEY = "__remark";
const LOCALE_CATEGORY_KEY = "locale";
const LOCALE_DICTIONARY_DISPLAY_PATH = "api/dictionaries/locale";

const FIXED_LANGUAGE_OPTIONS = [
  { label: "中文(简体)", value: "zh-CN" },
  { label: "中文(繁體)", value: "zh-TW" },
  { label: "English", value: "en" },
  { label: "Francais", value: "fr-FR" },
  { label: "Deutsch", value: "de-DE" },
  { label: "Espanol", value: "es-ES" },
  { label: "Japanese", value: "ja-JP" },
  { label: "Korean", value: "ko-KR" },
  { label: "Russian", value: "ru-RU" }
];

const loading = ref(false);
const saving = ref(false);
const tableData = ref<CategoryRow[]>([]);

const dialogVisible = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const editNodeSeed = ref(1);
const structureTree = ref<StructureNode[]>([]);

const quickDialogVisible = ref(false);
const quickSaving = ref(false);
const quickCategory = ref<CategoryRow | null>(null);
const quickNodeSeed = ref(1);
const quickTree = ref<StructureNode[]>([]);
const quickTargetId = ref<number | null>(null);
const quickLeafRows = ref<QuickLeafRow[]>([]);
const quickLeafRowSeed = ref(1);

const form = reactive({
  name: "",
  key: "",
  languages: [] as string[]
});

const dialogTitle = computed(() => (editingId.value ? "编辑分类" : "新增分类"));
const currentDictionaryPath = computed(() => {
  const key = String(form.key || "").trim();
  if (key === LOCALE_CATEGORY_KEY) return LOCALE_DICTIONARY_DISPLAY_PATH;
  return key ? `api/data/dictionaries/${key}` : "api/data/dictionaries/-";
});

const languageLabelMap = computed(() => {
  const map = new Map<string, string>();
  FIXED_LANGUAGE_OPTIONS.forEach(item => map.set(item.value, item.label));
  return map;
});

const rules: FormRules = {
  name: [{ required: true, message: "请输入名称", trigger: "blur" }],
  key: [
    { required: true, message: "请输入key值", trigger: "blur" },
    {
      validator: (_rule, value, callback) => {
        if (!value) return callback();
        if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(String(value))) {
          callback(new Error("key值需字母开头，仅允许字母数字._-"));
          return;
        }
        callback();
      },
      trigger: "blur"
    }
  ],
  languages: [
    {
      type: "array",
      required: true,
      min: 1,
      message: "请至少选择一个语言",
      trigger: "change"
    }
  ]
};

const formatTime = (time: number) => {
  if (!Number.isFinite(Number(time))) return "-";
  return new Date(Number(time)).toLocaleString();
};

const getCategoryDictionaryPath = (row: CategoryRow) => {
  const value = String(row?.dictionaryPaths?.[0]?.path || row?.key || "").trim();
  if (value === LOCALE_CATEGORY_KEY) return LOCALE_DICTIONARY_DISPLAY_PATH;
  return value ? `api/data/dictionaries/${value}` : "api/data/dictionaries/-";
};

const isValidNodeKey = (key: string) => /^[A-Za-z0-9_-]+$/.test(key);

const createEditNode = (key = "", remark = ""): StructureNode => ({
  id: editNodeSeed.value++,
  key,
  remark,
  children: []
});

const createQuickNode = (key = "", remark = ""): StructureNode => ({
  id: quickNodeSeed.value++,
  key,
  remark,
  children: []
});

const buildTreeFromObject = (
  input: Record<string, unknown>,
  createNode: (key?: string, remark?: string) => StructureNode
): StructureNode[] => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  return Object.entries(input)
    .filter(([k]) => k !== BRANCH_REMARK_KEY)
    .map(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const node = createNode(k, "");
      const obj = v as Record<string, unknown>;
      if (obj[BRANCH_REMARK_KEY] !== undefined && obj[BRANCH_REMARK_KEY] !== null) {
        node.remark = String(obj[BRANCH_REMARK_KEY]);
      }
      node.children = buildTreeFromObject(obj, createNode);
      return node;
    }
    return createNode(k, v === null || v === undefined ? "" : String(v));
  });
};

const findNodeById = (nodes: StructureNode[], nodeId: number): StructureNode | null => {
  for (const node of nodes) {
    if (node.id === nodeId) return node;
    const found = findNodeById(node.children, nodeId);
    if (found) return found;
  }
  return null;
};

const collectNodeOptions = (nodes: StructureNode[]): NodeOption[] => {
  const out: NodeOption[] = [];
  const walk = (list: StructureNode[], prefix = "") => {
    list.forEach((node, idx) => {
      const key = String(node.key || "").trim() || `node_${idx + 1}`;
      const label = prefix ? `${prefix}/${key}` : key;
      out.push({ id: node.id, label });
      if (node.children.length > 0) walk(node.children, label);
    });
  };
  walk(nodes);
  return out;
};

const buildObjectFromTree = (nodes: StructureNode[], pathPrefix = ""): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  const sameLevel = new Set<string>();

  for (const node of nodes) {
    const nodeKey = String(node.key || "").trim();
    const nodeRemark = String(node.remark || "").trim();
    if (!nodeKey && !nodeRemark && node.children.length === 0) continue;

    if (!nodeKey) throw new Error("存在空路径节点，请填写路径");
    if (!isValidNodeKey(nodeKey)) throw new Error(`路径节点格式无效: ${nodeKey}`);
    if (nodeKey === BRANCH_REMARK_KEY) {
      throw new Error(`路径节点名不能使用保留字: ${BRANCH_REMARK_KEY}`);
    }
    if (sameLevel.has(nodeKey)) {
      throw new Error(`同级路径重复: ${pathPrefix ? `${pathPrefix}.` : ""}${nodeKey}`);
    }
    sameLevel.add(nodeKey);

    if (node.children.length > 0) {
      const branch = buildObjectFromTree(
        node.children,
        pathPrefix ? `${pathPrefix}.${nodeKey}` : nodeKey
      );
      if (nodeRemark) branch[BRANCH_REMARK_KEY] = nodeRemark;
      result[nodeKey] = branch;
    } else {
      result[nodeKey] = nodeRemark;
    }
  }

  return result;
};

const analyzeStructure = (input: Record<string, unknown>) => {
  let nodeCount = 0;
  let leafCount = 0;
  let remarkCount = 0;
  const walk = (obj: Record<string, unknown>) => {
    Object.entries(obj || {}).forEach(([k, value]) => {
      if (k === BRANCH_REMARK_KEY) {
        if (String(value ?? "").trim()) remarkCount += 1;
        return;
      }
      nodeCount += 1;
      if (value && typeof value === "object" && !Array.isArray(value)) {
        walk(value as Record<string, unknown>);
      } else {
        leafCount += 1;
      }
    });
  };
  walk(input || {});
  return { nodeCount, leafCount, remarkCount };
};

const getStructurePreview = (value: Record<string, unknown>) => {
  const { nodeCount, leafCount, remarkCount } = analyzeStructure(value || {});
  if (nodeCount === 0) return "空结构";
  return `${nodeCount} 个路径节点，${leafCount} 个叶子，${remarkCount} 个枝干备注`;
};

const resetEditTree = () => {
  editNodeSeed.value = 1;
  structureTree.value = [createEditNode("", "")];
};

const loadEditTreeFromStructure = (structure: Record<string, unknown>) => {
  editNodeSeed.value = 1;
  const parsed = buildTreeFromObject(structure || {}, createEditNode);
  structureTree.value = parsed.length > 0 ? parsed : [createEditNode("", "")];
};

const resetQuickRows = () => {
  quickLeafRows.value = [
    {
      id: quickLeafRowSeed.value++,
      key: "",
      remark: ""
    }
  ];
};

const addQuickLeafRow = () => {
  quickLeafRows.value.push({
    id: quickLeafRowSeed.value++,
    key: "",
    remark: ""
  });
};

const removeQuickLeafRow = (id: number) => {
  quickLeafRows.value = quickLeafRows.value.filter(item => item.id !== id);
  if (quickLeafRows.value.length === 0) addQuickLeafRow();
};

const resetQuickState = () => {
  quickCategory.value = null;
  quickTree.value = [];
  quickTargetId.value = null;
  quickNodeSeed.value = 1;
  quickLeafRowSeed.value = 1;
  resetQuickRows();
};

const insertSiblingInList = (list: StructureNode[], nodeId: number): boolean => {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === nodeId) {
      list.splice(i + 1, 0, createEditNode("", ""));
      return true;
    }
    if (insertSiblingInList(list[i].children, nodeId)) return true;
  }
  return false;
};

const removeFromList = (list: StructureNode[], nodeId: number): boolean => {
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].id === nodeId) {
      list.splice(i, 1);
      return true;
    }
    if (removeFromList(list[i].children, nodeId)) return true;
  }
  return false;
};

const addRootNode = () => {
  structureTree.value.push(createEditNode("", ""));
};

const addChildNode = (node: StructureNode) => {
  node.children.push(createEditNode("", ""));
  node.remark = "";
};

const addSiblingNode = (nodeId: number) => {
  void insertSiblingInList(structureTree.value, nodeId);
};

const removeNode = (nodeId: number) => {
  void removeFromList(structureTree.value, nodeId);
  if (structureTree.value.length === 0) {
    structureTree.value.push(createEditNode("", ""));
  }
};

const quickNodeOptions = computed(() => collectNodeOptions(quickTree.value));

const quickTargetLabel = computed(() => {
  if (!quickTargetId.value) return "";
  return quickNodeOptions.value.find(item => item.id === quickTargetId.value)?.label || "";
});

const resetForm = () => {
  editingId.value = null;
  form.name = "";
  form.key = "";
  form.languages = [];
  resetEditTree();
};

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await getI18nCategoryList({});
    if (res.code !== 0 || !res.data) {
      message(res.message || "获取分类列表失败", { type: "error" });
      return;
    }
    tableData.value = Array.isArray(res.data.list) ? res.data.list : [];
  } finally {
    loading.value = false;
  }
};

const openCreate = () => {
  resetForm();
  dialogVisible.value = true;
};

const openEdit = (row: CategoryRow) => {
  editingId.value = row.id;
  form.name = row.name;
  form.key = row.key;
  form.languages = Array.isArray(row.languages) ? [...row.languages] : [];
  loadEditTreeFromStructure(row.structure || {});
  dialogVisible.value = true;
};

const openQuickAdd = (row: CategoryRow) => {
  quickDialogVisible.value = true;
  quickCategory.value = { ...row, languages: [...(row.languages || [])], structure: row.structure || {} };
  quickNodeSeed.value = 1;
  const parsed = buildTreeFromObject(row.structure || {}, createQuickNode);
  quickTree.value = parsed;
  quickTargetId.value = parsed.length > 0 ? collectNodeOptions(parsed)[0]?.id || null : null;
  quickLeafRowSeed.value = 1;
  resetQuickRows();
};

const submitForm = async () => {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }

  let structure: Record<string, unknown>;
  const dictionaryPaths = [{ path: form.key.trim() }];

  try {
    structure = buildObjectFromTree(structureTree.value);
  } catch (error) {
    message(error instanceof Error ? error.message : String(error), { type: "warning" });
    return;
  }

  saving.value = true;
  try {
    const res = await saveI18nCategory({
      id: editingId.value || undefined,
      name: form.name.trim(),
      key: form.key.trim(),
      languages: form.languages,
      structure,
      dictionaryPaths
    });
    if (res.code === 0) {
      message("保存成功", { type: "success" });
      dialogVisible.value = false;
      await fetchList();
      return;
    }
    message(res.message || "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
};

const submitQuickAdd = async () => {
  if (!quickCategory.value) return;
  if (!quickTargetId.value) {
    message("请选择目标节点", { type: "warning" });
    return;
  }
  const target = findNodeById(quickTree.value, quickTargetId.value);
  if (!target) {
    message("目标节点不存在，请重新选择", { type: "warning" });
    quickTargetId.value = null;
    return;
  }

  const rows = quickLeafRows.value
    .map(item => ({
      key: String(item.key || "").trim(),
      remark: String(item.remark || "").trim()
    }))
    .filter(item => item.key || item.remark);

  if (rows.length === 0) {
    message("请先添加至少一条叶子记录", { type: "warning" });
    return;
  }

  const localKeySet = new Set<string>();
  for (const row of rows) {
    if (!row.key) {
      message("存在空叶子键名，请补全后再保存", { type: "warning" });
      return;
    }
    if (!row.remark) {
      message(`叶子键 ${row.key} 缺少备注`, { type: "warning" });
      return;
    }
    if (!isValidNodeKey(row.key)) {
      message(`叶子键格式无效: ${row.key}`, { type: "warning" });
      return;
    }
    if (row.key === BRANCH_REMARK_KEY) {
      message(`叶子键不能使用保留字: ${BRANCH_REMARK_KEY}`, { type: "warning" });
      return;
    }
    if (localKeySet.has(row.key)) {
      message(`重复叶子键: ${row.key}`, { type: "warning" });
      return;
    }
    localKeySet.add(row.key);
  }

  const exists = new Set(target.children.map(item => String(item.key || "").trim()));
  const duplicatedExisting = rows.filter(item => exists.has(item.key)).map(item => item.key);
  if (duplicatedExisting.length > 0) {
    message(`目标节点下已存在: ${duplicatedExisting.join(", ")}`, { type: "warning" });
    return;
  }

  rows.forEach(row => {
    target.children.push(createQuickNode(row.key, row.remark));
  });
  target.remark = "";

  let structure: Record<string, unknown>;
  try {
    structure = buildObjectFromTree(quickTree.value);
  } catch (error) {
    message(error instanceof Error ? error.message : String(error), { type: "warning" });
    return;
  }

  quickSaving.value = true;
  try {
    const res = await saveI18nCategory({
      id: quickCategory.value.id,
      name: quickCategory.value.name,
      key: quickCategory.value.key,
      languages: quickCategory.value.languages,
      structure,
      dictionaryPaths: quickCategory.value.dictionaryPaths || []
    });
    if (res.code === 0) {
      message(`已新增 ${rows.length} 个叶子`, { type: "success" });
      quickDialogVisible.value = false;
      resetQuickState();
      await fetchList();
      return;
    }
    message(res.message || "快速添加失败", { type: "error" });
  } finally {
    quickSaving.value = false;
  }
};

const removeRow = async (row: CategoryRow) => {
  if (row.readonly) {
    message("默认分类不可删除", { type: "warning" });
    return;
  }
  try {
    await ElMessageBox.confirm(`确定删除分类「${row.name}」吗？`, "提示", {
      type: "warning",
      confirmButtonText: "删除",
      cancelButtonText: "取消"
    });
  } catch {
    return;
  }

  const res = await deleteI18nCategory({ id: row.id });
  if (res.code === 0) {
    message("删除成功", { type: "success" });
    await fetchList();
    return;
  }
  message(res.message || "删除失败", { type: "error" });
};


onMounted(() => {
  resetForm();
  resetQuickState();
  void fetchList();
});
</script>

<template>
  <div class="main">
    <el-card shadow="never">
      <template #header>
        <div class="header-row">
          <div class="title">分类管理</div>
          <div class="actions">
            <el-button size="small" @click="fetchList">刷新</el-button>
            <el-button size="small" type="primary" @click="openCreate">新增分类</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="tableData" border stripe>
        <el-table-column type="index" label="#" width="60" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="key" label="key值" min-width="160" />
        <el-table-column label="文件路径" min-width="260">
          <template #default="{ row }">
            <span class="path-preview">{{ getCategoryDictionaryPath(row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="包含语言" min-width="260">
          <template #default="{ row }">
            <el-space wrap>
              <el-tag v-for="lang in row.languages || []" :key="lang" size="small">
                {{ languageLabelMap.get(lang) || lang }}
              </el-tag>
            </el-space>
          </template>
        </el-table-column>
        <el-table-column label="字典结构" min-width="220">
          <template #default="{ row }">
            <span class="structure-preview">{{ getStructurePreview(row.structure || {}) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ formatTime(row.updateTime) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-space>
              <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
              <el-button link type="primary" @click="openQuickAdd(row)">快速加叶子</el-button>
              <el-button v-if="!row.readonly && row.id > 0" link type="danger" @click="removeRow(row)">删除</el-button>
            </el-space>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="980px"
      destroy-on-close
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="92px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" maxlength="80" clearable />
        </el-form-item>
        <el-form-item label="key值" prop="key">
          <el-input v-model="form.key" maxlength="120" placeholder="如：menus" clearable />
        </el-form-item>
        <el-form-item label="文件路径">
          <el-input :model-value="currentDictionaryPath" disabled />
        </el-form-item>
        <el-form-item label="包含语言" prop="languages">
          <el-checkbox-group v-model="form.languages" class="language-checkbox-group">
            <el-checkbox
              v-for="item in FIXED_LANGUAGE_OPTIONS"
              :key="item.value"
              :label="item.value"
            >
              {{ item.label }} ({{ item.value }})
            </el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-form-item label="字典结构">
          <div class="tree-editor">
            <div class="tree-tools">
              <el-button size="small" type="primary" plain @click="addRootNode">
                添加根节点
              </el-button>
            </div>
            <el-tree
              :data="structureTree"
              node-key="id"
              default-expand-all
              :expand-on-click-node="false"
              :props="{ children: 'children' }"
              class="structure-tree"
            >
              <template #default="{ data }">
                <div class="tree-node-row">
                  <el-input
                    v-model="data.key"
                    class="tree-key"
                    placeholder="路径节点，例如 home"
                    clearable
                  />
                  <el-input
                    v-model="data.remark"
                    class="tree-remark"
                    placeholder="备注"
                    clearable
                  />
                  <el-button link type="primary" @click="addChildNode(data)">子级</el-button>
                  <el-button link type="primary" @click="addSiblingNode(data.id)">同级</el-button>
                  <el-button link type="danger" @click="removeNode(data.id)">删除</el-button>
                </div>
              </template>
            </el-tree>
            <div class="tree-tip">
              路径节点按树结构维护，枝干/叶子都可备注。枝干备注会以保留字段
              <code>{{ BRANCH_REMARK_KEY }}</code> 保存。
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="quickDialogVisible"
      title="快速添加叶子"
      width="760px"
      destroy-on-close
      @closed="resetQuickState"
    >
      <el-form label-width="92px">
        <el-form-item label="分类">
          <el-input :model-value="quickCategory ? `${quickCategory.name} (${quickCategory.key})` : ''" disabled />
        </el-form-item>
        <el-form-item label="目标节点">
          <el-select
            v-model="quickTargetId"
            clearable
            filterable
            placeholder="选择目标节点"
            style="width: 100%"
          >
            <el-option
              v-for="item in quickNodeOptions"
              :key="item.id"
              :label="item.label"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="叶子列表">
          <div class="quick-list-box">
            <div class="quick-list-tools">
              <el-button size="small" type="primary" plain @click="addQuickLeafRow">
                添加一条
              </el-button>
            </div>
            <div class="quick-list-rows">
              <div v-for="row in quickLeafRows" :key="row.id" class="quick-list-row">
                <el-input
                  v-model="row.key"
                  placeholder="叶子键名，如 title"
                  class="quick-key"
                  clearable
                />
                <el-input
                  v-model="row.remark"
                  placeholder="备注，如 页面标题"
                  class="quick-remark"
                  clearable
                />
                <el-button link type="danger" @click="removeQuickLeafRow(row.id)">删除</el-button>
              </div>
            </div>
          </div>
        </el-form-item>
        <div class="quick-tip">
          当前目标：{{ quickTargetLabel || "未选择" }}。每条叶子都需要填写键名和备注。
        </div>
      </el-form>
      <template #footer>
        <el-button @click="quickDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="quickSaving" @click="submitQuickAdd">
          添加并保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title {
  font-size: 14px;
  font-weight: 600;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.language-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.structure-preview {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.path-preview {
  color: var(--el-text-color-secondary);
  font-family: Menlo, Consolas, "Courier New", monospace;
  font-size: 12px;
  word-break: break-all;
}

.tree-editor {
  width: 100%;
}

.tree-tools {
  margin-bottom: 8px;
}

.structure-tree {
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  padding: 8px;
}

:deep(.el-tree-node__content) {
  height: auto;
  padding: 4px 0;
}

.tree-node-row {
  display: grid;
  grid-template-columns: 240px 260px 44px 44px 44px;
  gap: 8px;
  align-items: center;
}

.tree-tip {
  margin-top: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.quick-list-box {
  width: 100%;
}

.quick-list-tools {
  margin-bottom: 8px;
}

.quick-list-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-list-row {
  display: grid;
  grid-template-columns: 1fr 1.2fr 44px;
  gap: 8px;
  align-items: center;
}





.quick-tip {
  margin-left: 92px;
  margin-top: -6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

@media (max-width: 960px) {
  .tree-node-row {
    grid-template-columns: 1fr;
  }

  .quick-list-row {
    grid-template-columns: 1fr;
  }
}
</style>
