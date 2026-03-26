<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import ResourceSystemUploadCropper from "@/components/ResourceSystemUploadCropper/index.vue";
import {
  createResourceSystemResource,
  getResourceSystemCategoryList,
  getResourceSystemResourceList
} from "@/api/resourceSystem";

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
  fileTypeGroup?: "image" | "video" | "text" | "audio";
  fileSubtypes?: string[];
  children?: CategoryItem[];
};

type ResourceItem = {
  id: number;
  name: string;
  image: string;
  fit: ImageFit;
  categoryId?: number;
  categoryName?: string;
  updateTime?: number;
};

const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    currentId?: number;
    title?: string;
    allowVideo?: boolean;
    showCreate?: boolean;
  }>(),
  {
    currentId: 0,
    title: "选择资源系统资源",
    allowVideo: true,
    showCreate: true
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "select", row: ResourceItem): void;
}>();

const loading = ref(false);
const categoryLoading = ref(false);
const queryForm = reactive({
  name: "",
  categoryId: undefined as number | undefined
});
const pagination = reactive({
  total: 0,
  pageSize: 12,
  currentPage: 1
});
const list = ref<ResourceItem[]>([]);
const categoryTreeData = ref<CategoryItem[]>([]);

const addDialogVisible = ref(false);
const addSubmitLoading = ref(false);
const addUploadSourceName = ref("");
const addForm = reactive({
  name: "",
  image: "",
  fit: "cover" as ImageFit,
  categoryId: undefined as number | undefined,
  storageProvider: "local" as StorageProvider,
  storageConfigId: 0,
  fileSize: 0,
  storageObjectKey: ""
});

const isVideoUrl = (url: string) => {
  const clean = String(url || "").split("?")[0].toLowerCase();
  return /\.(mp4|webm|ogg|ogv|mov|avi|mkv|mpeg)$/.test(clean);
};

const resolveMediaType = (url: string) => {
  return isVideoUrl(url) ? "video" : "image";
};

const findCategoryById = (
  list: CategoryItem[],
  id: number
): CategoryItem | undefined => {
  for (const item of list || []) {
    if (Number(item.id) === Number(id)) return item;
    if (Array.isArray(item.children) && item.children.length > 0) {
      const hit = findCategoryById(item.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
};

const uploadAccept = computed(() =>
  {
    const target = findCategoryById(
      categoryTreeData.value,
      Number(addForm.categoryId || 0)
    );
    const subtypes = Array.isArray(target?.fileSubtypes) ? target?.fileSubtypes || [] : [];
    if (subtypes.length > 0) {
      return subtypes.map(ext => `.${String(ext).toLowerCase().replace(/^\\./, "")}`).join(",");
    }
    return props.allowVideo ? "image/*,video/*,audio/*,text/*" : "image/*";
  }
);

const visibleList = computed(() =>
  props.allowVideo
    ? list.value
    : list.value.filter(item => resolveMediaType(item.image) === "image")
);

const resetAddForm = () => {
  addForm.name = "";
  addForm.image = "";
  addForm.fit = "cover";
  addForm.categoryId = queryForm.categoryId ? Number(queryForm.categoryId) : undefined;
  addForm.storageProvider = "local";
  addForm.storageConfigId = 0;
  addForm.fileSize = 0;
  addForm.storageObjectKey = "";
  addUploadSourceName.value = "";
};

const fetchCategories = async () => {
  categoryLoading.value = true;
  try {
    const res = await getResourceSystemCategoryList({
      currentPage: 1,
      pageSize: 9999
    });
    if (res.code === 0 && res.data?.list) {
      categoryTreeData.value = (res.data.list || []) as CategoryItem[];
    } else {
      categoryTreeData.value = [];
    }
  } finally {
    categoryLoading.value = false;
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
      list.value = (res.data.list || []) as ResourceItem[];
      pagination.total = Number(res.data.total || 0);
      pagination.pageSize = Number(res.data.pageSize || pagination.pageSize);
      pagination.currentPage = Number(res.data.currentPage || pagination.currentPage);
    } else {
      list.value = [];
      pagination.total = 0;
    }
  } finally {
    loading.value = false;
  }
};

const onSearch = () => {
  pagination.currentPage = 1;
  fetchList();
};

const onPageChange = (page: number) => {
  pagination.currentPage = page;
  fetchList();
};

const onPageSizeChange = (size: number) => {
  pagination.pageSize = size;
  pagination.currentPage = 1;
  fetchList();
};

const onFilterCategoryChange = () => {
  onSearch();
};

const closeDialog = () => {
  emit("update:modelValue", false);
};

const onPick = (row: ResourceItem) => {
  if (!props.allowVideo && resolveMediaType(row.image) === "video") {
    message("当前仅可选择图片资源", { type: "warning" });
    return;
  }
  emit("select", row);
  closeDialog();
};

const openAddDialog = () => {
  resetAddForm();
  addDialogVisible.value = true;
};

const onAddUploadSuccess = (payload: any) => {
  addForm.image = String(payload?.imageUrl || "");
  addForm.storageProvider = String(payload?.storageProvider || "local") as StorageProvider;
  addForm.storageConfigId = Number(payload?.storageConfigId || 0);
  addForm.fileSize = Number(payload?.fileSize || 0);
  addForm.storageObjectKey = String(payload?.storageObjectKey || "");
  addUploadSourceName.value = String(payload?.fileName || "");
  if (!addForm.name.trim()) {
    const fileName = String(addUploadSourceName.value || "");
    addForm.name = fileName.replace(/\.[^.]+$/, "") || "新资源";
  }
};

const onSubmitAdd = async () => {
  if (!addForm.name.trim()) {
    message("请输入资源名称", { type: "warning" });
    return;
  }
  if (!addForm.image) {
    message("请先上传资源文件", { type: "warning" });
    return;
  }
  if (!props.allowVideo && resolveMediaType(addForm.image) === "video") {
    message("当前仅可保存图片资源", { type: "warning" });
    return;
  }

  addSubmitLoading.value = true;
  try {
    const payload = {
      name: addForm.name.trim(),
      image: addForm.image,
      fit: addForm.fit,
      categoryId: Number(addForm.categoryId || 0),
      triggerType: "",
      triggerUrl: "",
      triggerPagePath: "",
      miniProgramAppId: "",
      miniProgramPagePath: "",
      appPath: "",
      storageProvider: addForm.storageProvider,
      storageConfigId: Number(addForm.storageConfigId || 0),
      fileSize: Number(addForm.fileSize || 0),
      storageObjectKey: addForm.storageObjectKey
    };
    const res = await createResourceSystemResource(payload);
    if (res.code === 0) {
      message("新增成功", { type: "success" });
      addDialogVisible.value = false;
      pagination.currentPage = 1;
      await fetchList();
      await nextTick();
      const created = visibleList.value.find(
        item =>
          item.name === payload.name &&
          Number(item.categoryId || 0) === Number(payload.categoryId || 0)
      );
      if (created) {
        emit("select", created);
        closeDialog();
      }
    } else {
      message(res.message || "新增失败", { type: "error" });
    }
  } finally {
    addSubmitLoading.value = false;
  }
};

watch(
  () => props.modelValue,
  async visible => {
    if (!visible) return;
    await fetchCategories();
    pagination.currentPage = 1;
    fetchList();
  }
);
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="title"
    width="980px"
    destroy-on-close
    @close="closeDialog"
    @update:model-value="val => emit('update:modelValue', val)"
  >
    <div class="picker-toolbar">
      <el-tree-select
        v-model="queryForm.categoryId"
        class="picker-category-select"
        :data="categoryTreeData"
        :props="{ label: 'name', children: 'children' }"
        value-key="id"
        check-strictly
        clearable
        :render-after-expand="false"
        :loading="categoryLoading"
        placeholder="按类目筛选"
        @change="onFilterCategoryChange"
      />
      <el-input
        v-model="queryForm.name"
        placeholder="请输入资源名称"
        clearable
        class="picker-search-input"
        @keyup.enter="onSearch"
      />
      <el-button type="primary" @click="onSearch">查询</el-button>
    </div>

    <div v-loading="loading" class="picker-grid-wrap">
      <div class="picker-grid">
        <div
          v-if="showCreate"
          class="picker-card picker-add-card"
          @click="openAddDialog"
        >
          <div class="picker-card-media picker-add-media">
            <div class="picker-add-icon">+</div>
          </div>
        </div>

        <div
          v-for="item in visibleList"
          :key="item.id"
          class="picker-card"
          :class="{ 'picker-card--active': Number(item.id) === Number(currentId || 0) }"
          @click="onPick(item)"
        >
          <div class="picker-card-media">
            <video
              v-if="resolveMediaType(item.image) === 'video'"
              :src="item.image"
              controls
              preload="metadata"
              class="picker-card-video"
            ></video>
            <el-image
              v-else
              :src="item.image"
              :fit="item.fit || 'cover'"
              class="picker-card-image"
            />
          </div>
          <div class="picker-card-meta">
            <div class="picker-card-name" :title="item.name">{{ item.name || "-" }}</div>
            <div class="picker-card-row">ID：{{ item.id }}</div>
            <div class="picker-card-row">类目：{{ item.categoryName || "-" }}</div>
            <div class="picker-card-row">
              更新时间：{{ dayjs(item.updateTime || Date.now()).format("YYYY-MM-DD HH:mm:ss") }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="visibleList.length === 0" class="picker-empty-wrap">
        <el-empty description="暂无资源" />
      </div>
    </div>

    <template #footer>
      <div class="picker-footer">
        <el-pagination
          background
          layout="total, sizes, prev, pager, next"
          :total="pagination.total"
          :current-page="pagination.currentPage"
          :page-size="pagination.pageSize"
          :page-sizes="[12, 24, 36]"
          @current-change="onPageChange"
          @size-change="onPageSizeChange"
        />
      </div>
    </template>
  </el-dialog>

  <el-dialog
    v-if="showCreate"
    v-model="addDialogVisible"
    title="新增资源"
    width="720px"
    destroy-on-close
  >
    <el-form label-width="120px">
      <el-form-item label="资源名称" required>
        <el-input v-model="addForm.name" placeholder="请输入资源名称" />
      </el-form-item>

      <el-form-item label="归属类目">
        <el-tree-select
          v-model="addForm.categoryId"
          class="w-full"
          :data="categoryTreeData"
          :props="{ label: 'name', children: 'children' }"
          value-key="id"
          check-strictly
          clearable
          :render-after-expand="false"
          placeholder="可不选，不选则归入未分类"
        />
      </el-form-item>

      <el-form-item label="资源文件" required>
        <div class="add-upload-row">
          <video
            v-if="addForm.image && resolveMediaType(addForm.image) === 'video'"
            :src="addForm.image"
            controls
            preload="metadata"
            class="add-upload-preview"
          ></video>
          <el-image
            v-else-if="addForm.image"
            :src="addForm.image"
            :preview-src-list="[addForm.image]"
            :fit="addForm.fit"
            preview-teleported
            :z-index="4000"
            class="add-upload-preview"
          />
          <ResourceSystemUploadCropper
            :accept="uploadAccept"
            :category-id="Number(addForm.categoryId || 0)"
            :allow-video="allowVideo"
            @uploaded="onAddUploadSuccess"
          >
            <template #trigger="{ loading: uploadBusy }">
              <el-button plain :loading="uploadBusy">上传资源</el-button>
            </template>
          </ResourceSystemUploadCropper>
        </div>
      </el-form-item>

      <el-form-item label="缩放方式">
        <el-select v-model="addForm.fit" class="w-[220px]!">
          <el-option label="fill" value="fill" />
          <el-option label="contain" value="contain" />
          <el-option label="cover" value="cover" />
          <el-option label="none" value="none" />
          <el-option label="scale-down" value="scale-down" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="addDialogVisible = false">取消</el-button>
      <el-button type="primary" :loading="addSubmitLoading" @click="onSubmitAdd">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
.picker-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.picker-category-select {
  width: 240px;
}

.picker-search-input {
  width: 260px;
}

.picker-grid-wrap {
  min-height: 420px;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.picker-add-card {
  border-style: dashed;
  align-self: start;
}

.picker-add-card:hover {
  border-color: var(--el-color-primary);
}

.picker-add-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  line-height: 1;
}

.picker-add-media {
  display: flex;
  align-items: center;
  justify-content: center;
}

.picker-add-card .picker-card-media {
  height: 206px;
}

.picker-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  overflow: hidden;
  background: var(--el-bg-color);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.picker-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: 0 8px 22px rgb(15 23 42 / 8%);
}

.picker-card--active {
  border-color: var(--el-color-primary);
  box-shadow: 0 0 0 1px var(--el-color-primary-light-5) inset;
}

.picker-card-media {
  height: 120px;
  background: var(--el-fill-color-light);
}

.picker-card-image,
.picker-card-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picker-card-meta {
  padding: 8px 10px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.picker-card-name {
  font-size: 14px;
  color: var(--el-text-color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-card-row {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.3;
}

.picker-empty-wrap {
  height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.picker-footer {
  display: flex;
  justify-content: flex-end;
}

.add-upload-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.add-upload-preview {
  width: 120px;
  height: 72px;
  border-radius: 4px;
  object-fit: cover;
}
</style>
