<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import ResourceSystemSelectField from "@/components/ResourceSystemSelectField/index.vue";
import CategoryTree from "./category-tree.vue";
import { deviceDetection } from "@pureadmin/utils";
import {
  getCarouselCategoryList,
  getCarouselResourceList,
  createCarouselResource,
  updateCarouselResource,
  deleteCarouselResource
} from "@/api/carousel";

import AddFill from "~icons/ri/add-circle-line";
import EditPen from "~icons/ep/edit-pen";
import Delete from "~icons/ep/delete";
import Refresh from "~icons/ep/refresh";

defineOptions({
  name: "CarouselResource"
});

type TriggerType = "url" | "page" | "miniProgram" | "app";
type ImageFit = "fill" | "contain" | "cover" | "none" | "scale-down";

type CategoryItem = {
  id: number;
  name: string;
  parentId?: number;
  triggerTypes: TriggerType[];
  children?: CategoryItem[];
};

type ResourceItem = {
  id: number;
  name: string;
  image: string;
  fit: ImageFit;
  categoryId: number;
  categoryName: string;
  resourceSystemResourceId: number;
  resourceSystemResourceName?: string;
  triggerType: TriggerType | "";
  triggerUrl: string;
  triggerPagePath: string;
  miniProgramAppId: string;
  miniProgramPagePath: string;
  appPath: string;
  createTime: number;
  updateTime: number;
};

const loading = ref(false);
const dataList = ref<ResourceItem[]>([]);
const categories = ref<CategoryItem[]>([]);
const categoryTreeData = ref<CategoryItem[]>([]);
const treeRef = ref();
const tableRef = ref();
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
  resourceSystemResourceId: 0,
  fit: "cover" as ImageFit,
  categoryId: undefined as number | undefined,
  triggerType: "" as TriggerType | "",
  triggerUrl: "",
  triggerPagePath: "",
  miniProgramAppId: "",
  miniProgramPagePath: "",
  appPath: ""
});

const flattenCategoryTree = (list: CategoryItem[]): CategoryItem[] => {
  const result: CategoryItem[] = [];
  const walk = (nodes: CategoryItem[]) => {
    nodes.forEach(node => {
      result.push({
        id: Number(node.id),
        name: node.name,
        parentId: Number(node.parentId || 0),
        triggerTypes: Array.isArray(node.triggerTypes) ? node.triggerTypes : []
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

const isVideoUrl = (url: string) => {
  const clean = String(url || "").split("?")[0].toLowerCase();
  return /\.(mp4|webm|ogg|ogv|mov|avi|mkv|mpeg)$/.test(clean);
};

const resolveMediaType = (url: string) => {
  return isVideoUrl(url) ? "video" : "image";
};

const triggerLabelMap: Record<TriggerType, string> = {
  url: "跳转URL",
  page: "跳转页面",
  miniProgram: "跳转小程序",
  app: "跳转App"
};

const categoryTriggerTypes = computed<TriggerType[]>(() => {
  const category = categories.value.find(item => Number(item.id) === Number(form.categoryId));
  return category?.triggerTypes || [];
});

const columns: TableColumnList = [
  { label: "ID", prop: "id", width: 80 },
  { label: "资源库ID", prop: "resourceSystemResourceId", width: 100 },
  { label: "资源", prop: "image", minWidth: 120, slot: "image" },
  { label: "名称", prop: "name", minWidth: 140 },
  { label: "归属类目", prop: "categoryName", minWidth: 120 },
  { label: "缩放方式", prop: "fit", minWidth: 120 },
  {
    label: "触发事件",
    prop: "triggerType",
    minWidth: 120,
    formatter: ({ triggerType }) => (triggerType ? triggerLabelMap[triggerType] : "-")
  },
  {
    label: "创建时间",
    prop: "createTime",
    minWidth: 170,
    formatter: ({ createTime }) => dayjs(createTime).format("YYYY-MM-DD HH:mm:ss")
  },
  {
    label: "更新时间",
    prop: "updateTime",
    minWidth: 170,
    formatter: ({ updateTime }) => dayjs(updateTime).format("YYYY-MM-DD HH:mm:ss")
  },
  { label: "操作", fixed: "right", width: 180, slot: "operation" }
];

const resetForm = () => {
  form.id = undefined;
  form.name = "";
  form.image = "";
  form.resourceSystemResourceId = 0;
  form.fit = "cover";
  form.categoryId = undefined;
  form.triggerType = "";
  form.triggerUrl = "";
  form.triggerPagePath = "";
  form.miniProgramAppId = "";
  form.miniProgramPagePath = "";
  form.appPath = "";
};

const fetchCategories = async () => {
  treeLoading.value = true;
  try {
    const res = await getCarouselCategoryList({ currentPage: 1, pageSize: 9999 });
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
    const res = await getCarouselResourceList({
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

function onFullscreen() {
  tableRef.value?.setAdaptive?.();
}

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
  form.resourceSystemResourceId = Number(row.resourceSystemResourceId || 0);
  form.fit = (row.fit || "cover") as ImageFit;
  form.categoryId = Number(row.categoryId);
  form.triggerType = (row.triggerType || "") as TriggerType | "";
  form.triggerUrl = row.triggerUrl || "";
  form.triggerPagePath = row.triggerPagePath || "";
  form.miniProgramAppId = row.miniProgramAppId || "";
  form.miniProgramPagePath = row.miniProgramPagePath || "";
  form.appPath = row.appPath || "";
  isEdit.value = true;
  dialogTitle.value = "编辑资源";
  dialogVisible.value = true;
};

const onDelete = async (row: ResourceItem) => {
  const res = await deleteCarouselResource({ id: row.id });
  if (res.code === 0) {
    message("删除成功", { type: "success" });
    fetchList();
  } else {
    message(res.message || "删除失败", { type: "error" });
  }
};

const onCategoryChange = () => {
  if (form.triggerType && !categoryTriggerTypes.value.includes(form.triggerType as TriggerType)) {
    form.triggerType = "";
  }
};

const onTriggerTypeChange = () => {
  form.triggerUrl = "";
  form.triggerPagePath = "";
  form.miniProgramAppId = "";
  form.miniProgramPagePath = "";
  form.appPath = "";
};

const validateBeforeSubmit = () => {
  if (!form.name.trim()) return "请输入名称";
  if (!form.resourceSystemResourceId) return "请选择资源系统资源";
  if (!form.image) return "所选资源无可用地址，请重新选择";
  if (!form.categoryId) return "请选择归属类目";

  if (form.triggerType === "url" && !form.triggerUrl.trim()) return "请填写URL";
  if (form.triggerType === "page" && !form.triggerPagePath.trim()) return "请填写页面路径";
  if (form.triggerType === "miniProgram") {
    if (!form.miniProgramAppId.trim()) return "请填写小程序AppID";
    if (!form.miniProgramPagePath.trim()) return "请填写小程序页面路径";
  }
  if (form.triggerType === "app" && !form.appPath.trim()) return "请填写App跳转路径";

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
      resourceSystemResourceId: Number(form.resourceSystemResourceId || 0),
      fit: form.fit,
      categoryId: form.categoryId,
      triggerType: form.triggerType,
      triggerUrl: form.triggerUrl,
      triggerPagePath: form.triggerPagePath,
      miniProgramAppId: form.miniProgramAppId,
      miniProgramPagePath: form.miniProgramPagePath,
      appPath: form.appPath
    };

    const res = isEdit.value ? await updateCarouselResource(payload) : await createCarouselResource(payload);
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
    <div :class="[deviceDetection() ? ['w-full', 'mt-2'] : 'w-[calc(100%-200px)]']">
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

      <PureTableBar
        title="资源管理"
        :columns="columns"
        :tableRef="tableRef?.getTableRef?.()"
        @refresh="fetchList"
        @fullscreen="onFullscreen"
      >
      <template #buttons>
        <el-button type="primary" :icon="useRenderIcon(AddFill)" @click="openAddDialog">新增资源</el-button>
      </template>
      <template v-slot="{ size, dynamicColumns }">
        <pure-table
          ref="tableRef"
          row-key="id"
          align-whole="center"
          table-layout="auto"
          :loading="loading"
          :size="size"
          adaptive
          :adaptiveConfig="{ offsetBottom: 108 }"
          :data="dataList"
          :columns="dynamicColumns"
          :pagination="{ ...pagination, size }"
          :header-cell-style="{
            background: 'var(--el-fill-color-light)',
            color: 'var(--el-text-color-primary)'
          }"
          @page-size-change="handleSizeChange"
          @page-current-change="handleCurrentChange"
        >
          <template #image="{ row }">
            <video
              v-if="resolveMediaType(row.image) === 'video'"
              :src="row.image"
              controls
              preload="metadata"
              style="width: 72px; height: 44px; border-radius: 4px; object-fit: cover"
            ></video>
            <el-image
              v-else
              :src="row.image"
              :fit="row.fit || 'cover'"
              :preview-src-list="Array.of(row.image)"
              preview-teleported
              :z-index="4000"
              style="width: 72px; height: 44px; border-radius: 4px"
            />
          </template>
          <template #operation="{ row }">
            <el-button link type="primary" :size="size" :icon="useRenderIcon(EditPen)" @click="openEditDialog(row)">编辑</el-button>
            <el-popconfirm title="确定删除该资源吗？" @confirm="onDelete(row)">
              <template #reference>
                <el-button link type="danger" :size="size" :icon="useRenderIcon(Delete)">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </pure-table>
      </template>
      </PureTableBar>
    </div>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" destroy-on-close>
      <el-form label-width="130px">
        <el-form-item label="名称" required>
          <el-input
            v-model="form.name"
            placeholder="请输入资源名称"
          />
        </el-form-item>

        <el-form-item label="资源系统资源" required>
          <ResourceSystemSelectField
            v-model="form.image"
            v-model:resource-id="form.resourceSystemResourceId"
            v-model:fit="form.fit"
          />
        </el-form-item>

        <el-form-item label="缩放方式">
          <el-select v-model="form.fit" class="w-[220px]!">
            <el-option v-for="item in fitOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="归属类目" required>
          <el-tree-select
            v-model="form.categoryId"
            class="w-full"
            :data="categoryTreeData"
            :props="{ label: 'name', children: 'children' }"
            value-key="id"
            check-strictly
            :render-after-expand="false"
            placeholder="请选择类目"
            @change="onCategoryChange"
          />
        </el-form-item>

        <el-form-item label="触发事件">
          <el-select v-model="form.triggerType" clearable placeholder="可不选" class="w-[260px]!" @change="onTriggerTypeChange">
            <el-option
              v-for="type in categoryTriggerTypes"
              :key="type"
              :label="triggerLabelMap[type]"
              :value="type"
            />
          </el-select>
        </el-form-item>

        <el-form-item v-if="form.triggerType === 'url'" label="URL" required>
          <el-input v-model="form.triggerUrl" placeholder="https://example.com" />
        </el-form-item>

        <el-form-item v-if="form.triggerType === 'page'" label="页面路径" required>
          <el-input v-model="form.triggerPagePath" placeholder="/pages/detail?id=1" />
        </el-form-item>

        <el-form-item v-if="form.triggerType === 'miniProgram'" label="小程序AppID" required>
          <el-input v-model="form.miniProgramAppId" placeholder="wx1234567890" />
        </el-form-item>

        <el-form-item v-if="form.triggerType === 'miniProgram'" label="小程序页面路径" required>
          <el-input v-model="form.miniProgramPagePath" placeholder="pages/home/index" />
        </el-form-item>

        <el-form-item v-if="form.triggerType === 'app'" label="App跳转路径" required>
          <el-input v-model="form.appPath" placeholder="myapp://path/to/page" />
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
</style>
