<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import ResourceSystemUploadCropper from "@/components/ResourceSystemUploadCropper/index.vue";
import CategoryTree from "./category-tree.vue";
import { deviceDetection } from "@pureadmin/utils";
import {
  getResourceSystemCategoryList,
  getResourceSystemResourceList,
  updateResourceSystemResource,
  deleteResourceSystemResource,
  createResourceSystemResource
} from "@/api/resourceSystem";

import AddFill from "~icons/ri/add-circle-line";
import EditPen from "~icons/ep/edit-pen";
import Delete from "~icons/ep/delete";
import Refresh from "~icons/ep/refresh";
import uploadLine from "~icons/ri/upload-line";

defineOptions({
  name: "ResourceSystemResource"
});

type ImageFit = "fill" | "contain" | "cover" | "none" | "scale-down";
type StorageProvider =
  | "local"
  | "qiniu"
  | "aliyun"
  | "tencent"
  | "minio"
  | "aws";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number;
  fileTypeGroup?: "image" | "video" | "text" | "audio";
  fileSubtypes?: string[];
  children?: CategoryItem[];
};

type ResourceItem = {
  id: number;
  name: string;
  image: string;
  fit: ImageFit;
  categoryId: number;
  categoryName: string;
  storageProvider?: StorageProvider;
  storageConfigId?: number;
  fileSize?: number;
  storageObjectKey?: string;
  createTime: number;
  updateTime: number;
};

const loading = ref(false);
const dataList = ref<ResourceItem[]>([]);
const categories = ref<CategoryItem[]>([]);
const categoryTreeData = ref<CategoryItem[]>([]);
const treeRef = ref();
const treeLoading = ref(false);
const pagination = reactive({
  total: 0,
  pageSize: 10,
  currentPage: 1,
  background: true
});

const queryForm = reactive({
  name: "",
  categoryId: undefined as number | undefined
});

const dialogVisible = ref(false);
const dialogTitle = ref("新增资源");
const submitLoading = ref(false);
const isEdit = ref(false);

const form = reactive({
  id: undefined as number | undefined,
  name: "",
  image: "",
  fit: "cover" as ImageFit,
  categoryId: undefined as number | undefined,
  storageProvider: "local" as StorageProvider,
  storageConfigId: 0,
  fileSize: 0,
  storageObjectKey: ""
});

const flattenCategoryTree = (list: CategoryItem[]): CategoryItem[] => {
  const result: CategoryItem[] = [];
  const walk = (nodes: CategoryItem[]) => {
    nodes.forEach(node => {
      result.push({
        id: Number(node.id),
        name: node.name,
        parentId: Number(node.parentId || 0),
        fileTypeGroup: node.fileTypeGroup,
        fileSubtypes: Array.isArray(node.fileSubtypes) ? [...node.fileSubtypes] : []
      });
      if (Array.isArray(node.children) && node.children.length > 0) {
        walk(node.children);
      }
    });
  };
  walk(list || []);
  return result;
};

const fitOptions: Array<{ label: string; value: ImageFit }> = [
  { label: "fill", value: "fill" },
  { label: "contain", value: "contain" },
  { label: "cover", value: "cover" },
  { label: "none", value: "none" },
  { label: "scale-down", value: "scale-down" }
];

const getFileExt = (value: string) => {
  const clean = String(value || "").split("?")[0].toLowerCase();
  const idx = clean.lastIndexOf(".");
  if (idx < 0 || idx === clean.length - 1) return "";
  return clean.slice(idx + 1);
};

const resolveMediaType = (url: string) => {
  const ext = getFileExt(url);
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp"].includes(ext)) return "image";
  if (["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv", "mpeg"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a", "aac", "flac"].includes(ext)) return "audio";
  if (["txt", "md", "json", "xml", "csv", "html"].includes(ext)) return "text";
  return "file";
};

const getFileTypeLabel = (url: string) => {
  const ext = getFileExt(url);
  return ext ? ext.toUpperCase() : "UNKNOWN";
};

const selectedCategory = computed(() =>
  categories.value.find(item => Number(item.id) === Number(form.categoryId || 0))
);

const uploadAccept = computed(() => {
  const list = Array.isArray(selectedCategory.value?.fileSubtypes)
    ? selectedCategory.value?.fileSubtypes || []
    : [];
  if (!list || list.length === 0) return "image/*,video/*,audio/*,text/*";
  return list.map(ext => `.${String(ext).toLowerCase().replace(/^\\./, "")}`).join(",");
});

const resetUploadMeta = () => {
  form.storageProvider = "local";
  form.storageConfigId = 0;
  form.fileSize = 0;
  form.storageObjectKey = "";
};

const applyUploadMeta = (data?: any) => {
  form.storageProvider = String(data?.storageProvider || "local") as StorageProvider;
  form.storageConfigId = Number(data?.storageConfigId || 0);
  form.fileSize = Number(data?.fileSize || 0);
  form.storageObjectKey = String(data?.storageObjectKey || "");
};

const resetForm = () => {
  form.id = undefined;
  form.name = "";
  form.image = "";
  form.fit = "cover";
  form.categoryId = undefined;
  resetUploadMeta();
};

const fetchCategories = async () => {
  treeLoading.value = true;
  try {
    const res = await getResourceSystemCategoryList({ currentPage: 1, pageSize: 9999 });
    if (res.code === 0 && res.data?.list) {
      categoryTreeData.value = (res.data.list || []) as CategoryItem[];
      categories.value = flattenCategoryTree(categoryTreeData.value);
      const firstId = categories.value[0]?.id;
      if (firstId) {
        queryForm.categoryId = Number(firstId);
        await nextTick();
        treeRef.value?.setSelected?.(Number(firstId));
      } else {
        queryForm.categoryId = undefined;
        treeRef.value?.setSelected?.();
      }
    }
  } finally {
    treeLoading.value = false;
  }
};

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await getResourceSystemResourceList({
      name: queryForm.name,
      categoryId: queryForm.categoryId,
      currentPage: pagination.currentPage,
      pageSize: pagination.pageSize
    });
    if (res.code === 0 && res.data) {
      dataList.value = (res.data.list || []) as ResourceItem[];
      pagination.total = Number(res.data.total || 0);
      pagination.pageSize = Number(res.data.pageSize || pagination.pageSize);
      pagination.currentPage = Number(res.data.currentPage || pagination.currentPage);
    }
  } finally {
    loading.value = false;
  }
};

const handleSizeChange = (val: number) => {
  pagination.pageSize = val;
  pagination.currentPage = 1;
  fetchList();
};

const handleCurrentChange = (val: number) => {
  pagination.currentPage = val;
  fetchList();
};

const openAddDialog = () => {
  resetForm();
  if (queryForm.categoryId) form.categoryId = Number(queryForm.categoryId);
  isEdit.value = false;
  dialogTitle.value = "新增资源";
  dialogVisible.value = true;
};

const openEditDialog = (row: ResourceItem) => {
  form.id = row.id;
  form.name = row.name;
  form.image = row.image;
  form.fit = (row.fit || "cover") as ImageFit;
  form.categoryId = Number(row.categoryId);
  form.storageProvider = (row.storageProvider || "local") as StorageProvider;
  form.storageConfigId = Number(row.storageConfigId || 0);
  form.fileSize = Number(row.fileSize || 0);
  form.storageObjectKey = String(row.storageObjectKey || "");
  isEdit.value = true;
  dialogTitle.value = "编辑资源";
  dialogVisible.value = true;
};

const onDelete = async (row: ResourceItem) => {
  const res = await deleteResourceSystemResource({ id: row.id });
  if (res.code === 0) {
    message("删除成功", { type: "success" });
    fetchList();
  } else {
    message(res.message || "删除失败", { type: "error" });
  }
};

const onCopyImage = async (row: ResourceItem) => {
  const target = String(row.image || "").trim();
  if (!target) {
    message("资源地址为空", { type: "warning" });
    return;
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(target);
      message("资源地址已复制", { type: "success" });
      return;
    }
    const textArea = document.createElement("textarea");
    textArea.value = target;
    textArea.style.position = "fixed";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textArea);
    if (copied) {
      message("资源地址已复制", { type: "success" });
      return;
    }
    message("复制失败，请手动复制", { type: "warning" });
  } catch (error) {
    message("复制失败，请手动复制", { type: "warning" });
  }
};

const validateBeforeSubmit = () => {
  if (!form.name.trim()) return "请输入名称";
  if (!form.image) return "请上传资源文件";

  return "";
};

const onSubmit = async () => {
  const error = validateBeforeSubmit();
  if (error) {
    message(error, { type: "warning" });
    return;
  }

  submitLoading.value = true;
  try {
    const payload = {
      id: form.id,
      name: form.name,
      image: form.image,
      fit: form.fit,
      categoryId: form.categoryId,
      triggerType: "",
      triggerUrl: "",
      triggerPagePath: "",
      miniProgramAppId: "",
      miniProgramPagePath: "",
      appPath: "",
      storageProvider: form.storageProvider,
      storageConfigId: Number(form.storageConfigId || 0),
      fileSize: Number(form.fileSize || 0),
      storageObjectKey: form.storageObjectKey
    };

    const res = isEdit.value ? await updateResourceSystemResource(payload) : await createResourceSystemResource(payload);
    if (res.code === 0) {
      message(isEdit.value ? "更新成功" : "新增成功", { type: "success" });
      dialogVisible.value = false;
      fetchList();
    } else {
      message(res.message || "保存失败", { type: "error" });
    }
  } finally {
    submitLoading.value = false;
  }
};

const onUploadResourceSuccess = (payload: any) => {
  form.image = String(payload?.imageUrl || "");
  applyUploadMeta(payload);
};

watch(
  () => form.categoryId,
  (value, oldValue) => {
    if (!dialogVisible.value) return;
    if (!oldValue || !value || Number(oldValue) === Number(value)) return;
    if (!form.image) return;
    form.image = "";
    resetUploadMeta();
    message("类目已变更，请重新上传资源文件", { type: "warning" });
  }
);

const onTreeSelect = (node: { id: number; selected: boolean }) => {
  queryForm.categoryId = node.selected ? Number(node.id) : undefined;
  pagination.currentPage = 1;
  fetchList();
};

onMounted(async () => {
  await fetchCategories();
  await fetchList();
});
</script>

<template>
  <div :class="['flex', 'justify-between', deviceDetection() && 'flex-wrap']">
    <CategoryTree
      ref="treeRef"
      :class="['mr-2', deviceDetection() ? 'w-full' : 'min-w-[200px]']"
      :treeData="categoryTreeData"
      :treeLoading="treeLoading"
      @tree-select="onTreeSelect"
    />
    <div :class="[deviceDetection() ? ['w-full', 'mt-2'] : ['w-[calc(100%-200px)]', 'h-[calc(100vh-141px)]', 'flex', 'flex-col']]">
      <el-form :inline="true" :model="queryForm" class="search-form bg-bg_color w-full pl-8 pt-[12px] overflow-auto">
        <el-form-item label="名称">
          <el-input v-model="queryForm.name" clearable placeholder="请输入名称" class="w-[200px]!" />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :icon="useRenderIcon('ri:search-line')"
            @click="
              () => {
                pagination.currentPage = 1;
                fetchList();
              }
            "
          >
            查询
          </el-button>
          <el-button :icon="useRenderIcon(Refresh)" @click="fetchList">刷新</el-button>
        </el-form-item>
      </el-form>

      <PureTableBar title="资源管理" :columns="[]" class="resource-table-bar" @refresh="fetchList">
        <template #buttons>
          <el-button type="primary" :icon="useRenderIcon(AddFill)" @click="openAddDialog">新增资源</el-button>
        </template>
        <template #default>
          <div class="resource-content">
            <div v-loading="loading" class="resource-list-panel">
              <div v-if="dataList.length > 0" class="resource-card-grid">
                <div v-for="row in dataList" :key="row.id" class="resource-card">
                  <div class="resource-card-header">
                    <span class="resource-card-tag">{{ row.categoryName || "未分类" }}</span>
                    <span class="resource-card-id">ID: {{ row.id }}</span>
                  </div>
                  <div class="resource-card-media">
                    <video
                      v-if="resolveMediaType(row.image) === 'video'"
                      :src="row.image"
                      controls
                      preload="metadata"
                      class="resource-card-video"
                    ></video>
                    <audio
                      v-else-if="resolveMediaType(row.image) === 'audio'"
                      :src="row.image"
                      controls
                      class="resource-card-audio"
                    ></audio>
                    <div
                      v-else-if="resolveMediaType(row.image) === 'text'"
                      class="resource-card-file"
                    >
                      TEXT
                    </div>
                    <div
                      v-else-if="resolveMediaType(row.image) === 'file'"
                      class="resource-card-file"
                    >
                      FILE
                    </div>
                    <el-image
                      v-else
                      :src="row.image"
                      :fit="row.fit || 'cover'"
                      :preview-src-list="Array.of(row.image)"
                      preview-teleported
                      :z-index="4000"
                      class="resource-card-image"
                    />
                  </div>
                  <div class="resource-card-body">
                    <div class="resource-card-name" :title="row.name">{{ row.name }}</div>
                    <div class="resource-card-type">类型：{{ getFileTypeLabel(row.image) }}</div>
                    <div class="resource-card-time">
                      <IconifyIconOffline icon="ri:calendar-line" />
                      <span>{{ dayjs(row.updateTime || row.createTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
                    </div>
                  </div>
                  <div class="resource-card-actions">
                    <el-button
                      circle
                      size="small"
                      class="resource-action-btn resource-action-btn--edit"
                      :icon="useRenderIcon(EditPen)"
                      @click="openEditDialog(row)"
                    />
                    <el-button
                      circle
                      size="small"
                      class="resource-action-btn resource-action-btn--copy"
                      :icon="useRenderIcon('ri:file-copy-line')"
                      @click="onCopyImage(row)"
                    />
                    <el-popconfirm title="确定删除该资源吗？" @confirm="onDelete(row)">
                      <template #reference>
                        <el-button
                          circle
                          size="small"
                          class="resource-action-btn resource-action-btn--delete"
                          :icon="useRenderIcon(Delete)"
                        />
                      </template>
                    </el-popconfirm>
                  </div>
                </div>
              </div>
              <div v-else class="resource-empty-wrap">
                <el-empty description="暂无数据" />
              </div>
            </div>
            <div class="card-pagination">
              <el-pagination
                background
                layout="total, sizes, prev, pager, next, jumper"
                :total="pagination.total"
                :current-page="pagination.currentPage"
                :page-size="pagination.pageSize"
                :page-sizes="[10, 20, 30, 50]"
                @size-change="handleSizeChange"
                @current-change="handleCurrentChange"
              />
            </div>
          </div>
        </template>
      </PureTableBar>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" destroy-on-close>
      <el-form label-width="130px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="请输入资源名称" />
        </el-form-item>

        <el-form-item label="资源文件" required>
          <div class="flex items-center gap-3">
            <video
              v-if="form.image && resolveMediaType(form.image) === 'video'"
              :src="form.image"
              controls
              preload="metadata"
              style="width: 120px; height: 72px; border-radius: 4px; object-fit: cover"
            ></video>
            <audio
              v-else-if="form.image && resolveMediaType(form.image) === 'audio'"
              :src="form.image"
              controls
              style="width: 240px"
            ></audio>
            <div
              v-else-if="form.image && resolveMediaType(form.image) !== 'image'"
              class="resource-file-preview"
            >
              {{ getFileTypeLabel(form.image) }}
            </div>
            <el-image
              v-else-if="form.image"
              :src="form.image"
              :preview-src-list="Array.of(form.image)"
              :fit="form.fit"
              preview-teleported
              :z-index="4000"
              style="width: 120px; height: 72px; border-radius: 4px"
            />
            <ResourceSystemUploadCropper
              :accept="uploadAccept"
              :category-id="Number(form.categoryId || 0)"
              @uploaded="onUploadResourceSuccess"
            >
              <template #trigger>
                <el-button plain>
                  <IconifyIconOffline :icon="uploadLine" />
                  <span class="ml-2">上传资源</span>
                </el-button>
              </template>
            </ResourceSystemUploadCropper>
          </div>
        </el-form-item>

        <el-form-item label="缩放方式">
          <el-select v-model="form.fit" class="w-[220px]!">
            <el-option v-for="item in fitOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="归属类目">
          <el-tree-select
            v-model="form.categoryId"
            class="w-full"
            :data="categoryTreeData"
            :props="{ label: 'name', children: 'children' }"
            value-key="id"
            check-strictly
            :render-after-expand="false"
            clearable
            placeholder="可不选，不选则归入未分类"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-dropdown-menu__item i) {
  margin: 0;
}

:deep(.el-button:focus-visible) {
  outline: none;
}

.main-content {
  margin: 24px 24px 0 !important;
}

.search-form {
  :deep(.el-form-item) {
    margin-bottom: 12px;
  }
}

.resource-table-bar {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.resource-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.resource-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.resource-list-panel {
  flex: 1;
  min-height: 260px;
  padding: 12px 4px 0;
  overflow: auto;
}

.resource-empty-wrap {
  height: 100%;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.resource-card {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f2f5fa;
  box-shadow: 0 3px 12px rgb(15 23 42 / 6%);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.resource-card-header {
  height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4ebf3;
}

.resource-card-tag {
  max-width: 112px;
  height: 22px;
  padding: 0 10px;
  border-radius: 6px;
  border: 1px solid #f6cf9d;
  display: inline-flex;
  align-items: center;
  color: #d97706;
  background: #fff3e8;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.resource-card-id {
  color: #7b8794;
  font-size: 12px;
  line-height: 1;
}

.resource-card-media {
  height: 112px;
  margin: 8px 12px 0;
  border-radius: 0;
  overflow: hidden;
  background: #d8e1ec;
  border-bottom: 1px solid #e4ebf3;
}

.resource-card-image,
.resource-card-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resource-card-audio {
  width: 100%;
  margin-top: 40px;
}

.resource-card-file {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: #475569;
}

.resource-card-body {
  padding: 10px 12px 8px;
  background: #f6f8fb;
}

.resource-card-name {
  font-size: 18px;
  font-weight: 600;
  color: #1f2937;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

.resource-card-time {
  margin-top: 6px;
  font-size: 13px;
  color: #7b8794;
  display: flex;
  align-items: center;
  gap: 6px;
}

.resource-card-type {
  margin-top: 6px;
  font-size: 12px;
  color: #8b97a7;
}

.resource-card-actions {
  padding: 8px 12px 10px;
  margin-top: auto;
  display: flex;
  justify-content: center;
  gap: 14px;
  border-top: 1px solid #e4ebf3;
  background: #fff;
}

.resource-action-btn {
  width: 30px;
  height: 30px;
  border: 0 !important;
  box-shadow: 0 2px 8px rgb(15 23 42 / 10%);
}

.resource-action-btn :deep(.el-icon) {
  font-size: 16px;
}

.resource-action-btn--edit {
  color: #3b82f6;
  background: #dbeafe;
}

.resource-action-btn--copy {
  color: #22a35b;
  background: #dcfce7;
}

.resource-action-btn--delete {
  color: #ef4444;
  background: #fee2e2;
}

.card-pagination {
  flex-shrink: 0;
  border-top: 1px solid var(--el-border-color-lighter);
  padding: 12px 2px 0;
  display: flex;
  justify-content: flex-end;
}

.resource-file-preview {
  width: 120px;
  height: 72px;
  border-radius: 4px;
  border: 1px dashed var(--el-border-color);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-secondary);
}
</style>
