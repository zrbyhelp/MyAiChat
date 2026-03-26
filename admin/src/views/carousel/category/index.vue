<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import {
  getCarouselCategoryList,
  createCarouselCategory,
  updateCarouselCategory,
  deleteCarouselCategory
} from "@/api/carousel";

import AddFill from "~icons/ri/add-circle-line";
import EditPen from "~icons/ep/edit-pen";
import Delete from "~icons/ep/delete";
import Refresh from "~icons/ep/refresh";

defineOptions({
  name: "CarouselCategory"
});

type Direction = "horizontal" | "vertical";
type TriggerType = "url" | "page" | "miniProgram" | "app";

type CategoryItem = {
  id: number;
  name: string;
  key: string;
  parentId: number;
  triggerTypes: TriggerType[];
  speed: number;
  loop: boolean;
  direction: Direction;
  createTime: number;
  updateTime: number;
  children?: CategoryItem[];
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

const dialogVisible = ref(false);
const dialogTitle = ref("新增类目");
const submitLoading = ref(false);
const formRef = ref();
const isEdit = ref(false);

const form = reactive({
  id: undefined as number | undefined,
  name: "",
  key: "",
  parentId: 0,
  triggerTypes: [] as TriggerType[],
  speed: 3000,
  loop: true,
  direction: "horizontal" as Direction
});

const triggerOptions = [
  { label: "跳转URL", value: "url" },
  { label: "跳转页面", value: "page" },
  { label: "跳转小程序", value: "miniProgram" },
  { label: "跳转App", value: "app" }
];

const columns: TableColumnList = [
  { label: "ID", prop: "id", width: 100 },
  { label: "类目名称", prop: "name", minWidth: 220 },
  { label: "Key值", prop: "key", minWidth: 160 },
  {
    label: "触发事件",
    prop: "triggerTypes",
    minWidth: 200,
    formatter: ({ triggerTypes }) => {
      const labels = (triggerTypes || []).map((type: TriggerType) => {
        if (type === "url") return "URL";
        if (type === "page") return "页面";
        if (type === "app") return "App";
        return "小程序";
      });
      return labels.join("、") || "-";
    }
  },
  {
    label: "轮播设置",
    prop: "speed",
    minWidth: 260,
    formatter: (row: CategoryItem) => {
      const dirText = row.direction === "vertical" ? "竖向" : "横向";
      return `速度:${row.speed}ms / 循环:${row.loop ? "是" : "否"} / 方向:${dirText}`;
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
  key: [{ required: true, message: "请输入key值", trigger: "blur" }],
  speed: [
    {
      validator: (_rule, value, callback) => {
        const num = Number(value);
        if (!Number.isFinite(num) || num <= 0) {
          callback(new Error("轮播速度必须大于0"));
          return;
        }
        callback();
      },
      trigger: "change"
    }
  ],
  direction: [{ required: true, message: "请选择滚动方向", trigger: "change" }]
};

const parentOptions = computed(() => dataList.value);

const resetEditForm = () => {
  form.id = undefined;
  form.name = "";
  form.key = "";
  form.parentId = 0;
  form.triggerTypes = [];
  form.speed = 3000;
  form.loop = true;
  form.direction = "horizontal";
};

const fetchList = async () => {
  loading.value = true;
  try {
    const res = await getCarouselCategoryList({
      ...queryForm,
      currentPage: pagination.currentPage,
      pageSize: pagination.pageSize
    });
    if (res.code === 0 && res.data) {
      dataList.value = (res.data.list || []) as CategoryItem[];
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

const openAddDialog = (parentId = 0) => {
  resetEditForm();
  form.parentId = Number(parentId) || 0;
  isEdit.value = false;
  dialogTitle.value = "新增类目";
  dialogVisible.value = true;
};

const openEditDialog = (row: CategoryItem) => {
  form.id = row.id;
  form.name = row.name;
  form.key = row.key;
  form.parentId = Number(row.parentId || 0);
  form.triggerTypes = [...(row.triggerTypes || [])];
  form.speed = Number(row.speed) || 3000;
  form.loop = Boolean(row.loop);
  form.direction = row.direction === "vertical" ? "vertical" : "horizontal";
  isEdit.value = true;
  dialogTitle.value = "编辑类目";
  dialogVisible.value = true;
};

const onDelete = async (row: CategoryItem) => {
  const res = await deleteCarouselCategory({ id: row.id });
  if (res.code === 0) {
    message("删除成功", { type: "success" });
    fetchList();
  } else {
    message(res.message || "删除失败", { type: "error" });
  }
};

const onSubmit = async () => {
  await formRef.value.validate();
  submitLoading.value = true;
  try {
    const payload = {
      id: form.id,
      name: form.name,
      key: form.key,
      parentId: Number(form.parentId || 0),
      triggerTypes: form.triggerTypes,
      speed: form.speed,
      loop: form.loop,
      direction: form.direction
    };

    const res = isEdit.value
      ? await updateCarouselCategory(payload)
      : await createCarouselCategory(payload);

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

onMounted(() => {
  fetchList();
});
</script>

<template>
  <div class="main">
    <el-form :inline="true" :model="queryForm" class="search-form bg-bg_color w-full pl-8 pt-[12px] overflow-auto">
      <el-form-item label="类目名称">
        <el-input v-model="queryForm.name" clearable placeholder="请输入类目名称" class="w-[200px]!" />
      </el-form-item>
      <el-form-item label="Key值">
        <el-input v-model="queryForm.key" clearable placeholder="请输入Key值" class="w-[200px]!" />
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
      title="类目管理"
      :columns="columns"
      :isExpandAll="false"
      :tableRef="tableRef?.getTableRef?.()"
      @refresh="fetchList"
      @fullscreen="onFullscreen"
    >
      <template #buttons>
        <el-button type="primary" :icon="useRenderIcon(AddFill)" @click="openAddDialog(0)">新增根类目</el-button>
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
          <template #operation="{ row }">
            <el-button link type="primary" :size="size" :icon="useRenderIcon(EditPen)" @click="openEditDialog(row)">编辑</el-button>
            <el-button link type="primary" :size="size" :icon="useRenderIcon(AddFill)" @click="openAddDialog(row.id)">新增子类目</el-button>
            <el-popconfirm title="确定删除该类目吗？" @confirm="onDelete(row)">
              <template #reference>
                <el-button link type="danger" :size="size" :icon="useRenderIcon(Delete)">删除</el-button>
              </template>
            </el-popconfirm>
          </template>
        </pure-table>
      </template>
    </PureTableBar>

    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="130px">
        <el-form-item label="父级类目">
          <el-tree-select
            v-model="form.parentId"
            class="w-full"
            :data="parentOptions"
            :props="{ label: 'name', children: 'children' }"
            value-key="id"
            clearable
            check-strictly
            :render-after-expand="false"
            placeholder="不选则为根类目"
          />
        </el-form-item>
        <el-form-item label="类目名称" prop="name">
          <el-input v-model="form.name" placeholder="请输入类目名称" />
        </el-form-item>
        <el-form-item label="Key值" prop="key">
          <el-input v-model="form.key" placeholder="请输入Key值" />
        </el-form-item>
        <el-form-item label="可触发事件">
          <el-checkbox-group v-model="form.triggerTypes">
            <el-checkbox v-for="item in triggerOptions" :key="item.value" :value="item.value">{{ item.label }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>

        <el-divider content-position="left">轮播设置</el-divider>

        <el-form-item label="轮播速度(ms)" prop="speed">
          <el-input-number v-model="form.speed" :min="1" :step="100" controls-position="right" />
        </el-form-item>

        <el-form-item label="是否循环">
          <el-switch v-model="form.loop" />
        </el-form-item>

        <el-form-item label="滚动方式" prop="direction">
          <el-radio-group v-model="form.direction">
            <el-radio value="horizontal">横向</el-radio>
            <el-radio value="vertical">竖向</el-radio>
          </el-radio-group>
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
