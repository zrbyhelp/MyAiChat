<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import {
  createResourceSystemCategory,
  deleteResourceSystemCategory,
  getResourceSystemCategoryList,
  getResourceSystemEnabledStorageList,
  updateResourceSystemCategory
} from "@/api/resourceSystem";

import AddFill from "~icons/ri/add-circle-line";
import Delete from "~icons/ep/delete";
import EditPen from "~icons/ep/edit-pen";
import Refresh from "~icons/ep/refresh";

defineOptions({
  name: "ResourceSystemCategory"
});

type StorageProvider =
  | "local"
  | "qiniu"
  | "aliyun"
  | "tencent"
  | "minio"
  | "aws";

type FileTypeGroup = "image" | "video" | "text" | "audio";

type CategoryItem = {
  id: number;
  name: string;
  key: string;
  parentId: number;
  storageProvider: StorageProvider;
  storageConfigId: number;
  storageValue: string;
  storageName: string;
  storageProviderLabel: string;
  fileTypeGroup: FileTypeGroup;
  fileSubtypes: string[];
  createTime: number;
  updateTime: number;
  children?: CategoryItem[];
};

type StorageOption = {
  provider: StorageProvider;
  configId: number;
  name: string;
  providerLabel: string;
  value: string;
  isEnabled: boolean;
};

type FileTypeOption = {
  group: FileTypeGroup;
  label: string;
  subtypes: string[];
};

const loading = ref(false);
const dataList = ref<CategoryItem[]>([]);
const tableRef = ref();
const pagination = reactive({
  total: 0,
  pageSize: 10,
  currentPage: 1,
  background: true
});

const queryForm = reactive({
  name: "",
  key: ""
});

const enabledStorageOptions = ref<StorageOption[]>([]);
const fileTypeOptions = ref<FileTypeOption[]>([]);
const storageLoading = ref(false);

const dialogVisible = ref(false);
const dialogTitle = ref("新增类目");
const submitLoading = ref(false);
const isEdit = ref(false);
const formRef = ref();

const form = reactive({
  id: undefined as number | undefined,
  name: "",
  key: "",
  parentId: 0,
  storageValue: "",
  fileTypeGroup: "image" as FileTypeGroup,
  fileSubtypes: [] as string[]
});

const columns: TableColumnList = [
  { label: "ID", prop: "id", width: 100 },
  { label: "类目名称", prop: "name", minWidth: 160 },
  { label: "Key", prop: "key", minWidth: 180 },
  {
    label: "存储位置",
    prop: "storageName",
    minWidth: 220,
    formatter: ({ storageName, storageProviderLabel }) =>
      `${storageProviderLabel || "存储"} / ${storageName || "-"}`
  },
  {
    label: "文件类型",
    prop: "fileTypeGroup",
    minWidth: 260,
    formatter: row => {
      const subtypes = Array.isArray(row.fileSubtypes) ? row.fileSubtypes.join(", ") : "-";
      return `${String(row.fileTypeGroup || "-")} / ${subtypes}`;
    }
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
  { label: "操作", fixed: "right", width: 260, slot: "operation" }
];

const rules = {
  name: [{ required: true, message: "请输入类目名称", trigger: "blur" }],
  key: [{ required: true, message: "请输入 Key", trigger: "blur" }],
  storageValue: [{ required: true, message: "请选择存储位置", trigger: "change" }],
  fileTypeGroup: [{ required: true, message: "请选择文件主类型", trigger: "change" }],
  fileSubtypes: [{ required: true, message: "请至少选择一个子类型", trigger: "change" }]
};

const parentOptions = computed(() => dataList.value);
const defaultStorageValue = computed(
  () =>
    enabledStorageOptions.value.find(item => item.provider === "local")?.value ||
    enabledStorageOptions.value[0]?.value ||
    ""
);

const treeSelectProps = {
  label: "name",
  children: "children",
  value: "id"
} as any;

const subtypeOptions = computed(() => {
  const current = fileTypeOptions.value.find(item => item.group === form.fileTypeGroup);
  return current?.subtypes || [];
});

const resetEditForm = () => {
  form.id = undefined;
  form.name = "";
  form.key = "";
  form.parentId = 0;
  form.storageValue = defaultStorageValue.value;
  form.fileTypeGroup = fileTypeOptions.value[0]?.group || "image";
  form.fileSubtypes = [...(fileTypeOptions.value[0]?.subtypes || [])];
};

const findStorageOption = (value: string) =>
  enabledStorageOptions.value.find(item => item.value === value);

const fetchStorageOptions = async () => {
  storageLoading.value = true;
  try {
    const res = await getResourceSystemEnabledStorageList({});
    if (res.code === 0 && res.data?.list) {
      enabledStorageOptions.value = (res.data.list || []) as StorageOption[];
      if (!form.storageValue) {
        form.storageValue = defaultStorageValue.value;
      }
    }
  } finally {
    storageLoading.value = false;
  }
};

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await getResourceSystemCategoryList({
      ...queryForm,
      currentPage: pagination.currentPage,
      pageSize: pagination.pageSize
    });
    if (res.code === 0 && res.data) {
      dataList.value = (res.data.list || []) as CategoryItem[];
      fileTypeOptions.value = ((res.data as any).fileTypeOptions || []) as FileTypeOption[];
      pagination.total = Number(res.data.total || 0);
      pagination.pageSize = Number(res.data.pageSize || pagination.pageSize);
      pagination.currentPage = Number(res.data.currentPage || pagination.currentPage);
      if (!form.fileTypeGroup && fileTypeOptions.value.length > 0) {
        form.fileTypeGroup = fileTypeOptions.value[0].group;
      }
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

const openAddDialog = async (parentId = 0) => {
  if (enabledStorageOptions.value.length === 0) {
    await fetchStorageOptions();
  }
  resetEditForm();
  form.parentId = Number(parentId) || 0;
  isEdit.value = false;
  dialogTitle.value = "新增类目";
  dialogVisible.value = true;
};

const openEditDialog = async (row: CategoryItem) => {
  if (enabledStorageOptions.value.length === 0) {
    await fetchStorageOptions();
  }
  form.id = row.id;
  form.name = row.name;
  form.key = row.key;
  form.parentId = Number(row.parentId || 0);
  form.storageValue =
    row.storageValue ||
    `${row.storageProvider}:${Number(row.storageConfigId || 0)}` ||
    defaultStorageValue.value;
  form.fileTypeGroup = (row.fileTypeGroup || "image") as FileTypeGroup;
  form.fileSubtypes = Array.isArray(row.fileSubtypes) ? [...row.fileSubtypes] : [];
  isEdit.value = true;
  dialogTitle.value = "编辑类目";
  dialogVisible.value = true;
};

const onDelete = async (row: CategoryItem) => {
  const res = await deleteResourceSystemCategory({ id: row.id });
  if (res.code === 0) {
    message("删除成功", { type: "success" });
    fetchList();
  } else {
    message(res.message || "删除失败", { type: "error" });
  }
};

const onSubmit = async () => {
  await formRef.value.validate();
  const storage = findStorageOption(form.storageValue);
  if (!storage) {
    message("请选择可用的存储位置", { type: "warning" });
    return;
  }

  submitLoading.value = true;
  try {
    const payload = {
      id: form.id,
      name: form.name,
      key: form.key,
      parentId: Number(form.parentId || 0),
      storageProvider: storage.provider,
      storageConfigId: Number(storage.configId || 0),
      fileTypeGroup: form.fileTypeGroup,
      fileSubtypes: Array.isArray(form.fileSubtypes) ? form.fileSubtypes : [],
      triggerTypes: [],
      speed: 3000,
      loop: true,
      direction: "horizontal"
    };

    const res = isEdit.value
      ? await updateResourceSystemCategory(payload)
      : await createResourceSystemCategory(payload);
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

watch(
  () => form.fileTypeGroup,
  value => {
    const hit = fileTypeOptions.value.find(item => item.group === value);
    const allowed = new Set(hit?.subtypes || []);
    const kept = form.fileSubtypes.filter(item => allowed.has(item));
    form.fileSubtypes = kept.length > 0 ? kept : [...(hit?.subtypes || [])];
  }
);

onMounted(async () => {
  await fetchStorageOptions();
  await fetchList();
});
</script>

<template>
  <div class="main">
    <el-form
      :inline="true"
      :model="queryForm"
      class="search-form bg-bg_color w-full pl-8 pt-[12px] overflow-auto"
    >
      <el-form-item label="类目名称">
        <el-input
          v-model="queryForm.name"
          clearable
          placeholder="请输入类目名称"
          class="w-[200px]!"
        />
      </el-form-item>
      <el-form-item label="Key">
        <el-input
          v-model="queryForm.key"
          clearable
          placeholder="请输入 Key"
          class="w-[200px]!"
        />
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
        <el-button :icon="useRenderIcon(Refresh)" @click="fetchList">
          刷新
        </el-button>
      </el-form-item>
    </el-form>

    <PureTableBar
      title="类目管理"
      :columns="columns"
      :isExpandAll="false"
      :tableRef="tableRef?.getTableRef?.()"
      @refresh="fetchList"
      @fullscreen="onFullscreen"
    >
      <template #buttons>
        <el-button
          type="primary"
          :icon="useRenderIcon(AddFill)"
          @click="openAddDialog(0)"
        >
          新增根类目
        </el-button>
      </template>
      <template #default="{ size, dynamicColumns }">
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
          <template #operation="{ row }">
            <el-button
              link
              type="primary"
              :size="size"
              :icon="useRenderIcon(EditPen)"
              @click="openEditDialog(row)"
            >
              编辑
            </el-button>
            <el-button
              link
              type="primary"
              :size="size"
              :icon="useRenderIcon(AddFill)"
              @click="openAddDialog(row.id)"
            >
              新增子类目
            </el-button>
            <el-popconfirm title="确定删除该类目吗？" @confirm="onDelete(row)">
              <template #reference>
                <el-button
                  link
                  type="danger"
                  :size="size"
                  :icon="useRenderIcon(Delete)"
                >
                  删除
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </pure-table>
      </template>
    </PureTableBar>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="130px">
        <el-form-item label="父级类目">
          <el-tree-select
            v-model="form.parentId"
            class="w-full"
            :data="parentOptions"
            :props="treeSelectProps"
            clearable
            check-strictly
            :render-after-expand="false"
            placeholder="不选则为根类目"
          />
        </el-form-item>
        <el-form-item label="类目名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入类目名称" />
        </el-form-item>
        <el-form-item label="Key" prop="key">
          <el-input v-model="form.key" placeholder="请输入 Key" />
        </el-form-item>
        <el-form-item label="存储位置" prop="storageValue">
          <el-select
            v-model="form.storageValue"
            class="w-full"
            placeholder="请选择存储位置"
            :loading="storageLoading"
          >
            <el-option
              v-for="item in enabledStorageOptions"
              :key="item.value"
              :label="`${item.providerLabel} / ${item.name}`"
              :value="item.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="文件主类型" prop="fileTypeGroup">
          <el-select v-model="form.fileTypeGroup" class="w-full" placeholder="请选择文件主类型">
            <el-option
              v-for="item in fileTypeOptions"
              :key="item.group"
              :label="`${item.label} (${item.group})`"
              :value="item.group"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="可上传子类型" prop="fileSubtypes">
          <el-select
            v-model="form.fileSubtypes"
            class="w-full"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="请选择可上传子类型"
          >
            <el-option
              v-for="subtype in subtypeOptions"
              :key="subtype"
              :label="subtype"
              :value="subtype"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="onSubmit">
          保存
        </el-button>
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
