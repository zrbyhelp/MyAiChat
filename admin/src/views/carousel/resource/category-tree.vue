<script setup lang="ts">
import { ref, watch } from "vue";

type NodeItem = {
  id: number;
  name: string;
  children?: NodeItem[];
};

const props = defineProps<{ treeData: NodeItem[]; treeLoading: boolean }>();
const emit = defineEmits<{
  (e: "tree-select", payload: NodeItem & { selected: boolean }): void;
}>();

const treeRef = ref();
const searchValue = ref("");
const selectedId = ref<number | null>(null);

const defaultProps = {
  children: "children",
  label: "name"
};

const filterNode = (value: string, data: NodeItem) => {
  if (!value) return true;
  return String(data.name || "").includes(value);
};

const nodeClick = (data: NodeItem) => {
  if (selectedId.value === data.id) {
    selectedId.value = null;
    emit("tree-select", { ...data, selected: false });
    return;
  }
  selectedId.value = data.id;
  emit("tree-select", { ...data, selected: true });
};

const onReset = () => {
  const lastId = selectedId.value;
  selectedId.value = null;
  searchValue.value = "";
  if (lastId !== null) {
    emit("tree-select", { id: Number(lastId), name: "", selected: false });
  }
};

const setSelected = (id?: number) => {
  selectedId.value = id ? Number(id) : null;
};

watch(searchValue, val => {
  treeRef.value?.filter(val);
});

defineExpose({ onReset, setSelected });
</script>

<template>
  <div
    v-loading="props.treeLoading"
    class="h-full bg-bg_color overflow-hidden relative"
    :style="{ minHeight: `calc(100vh - 141px)` }"
  >
    <div class="flex items-center h-[34px]">
      <el-input
        v-model="searchValue"
        class="ml-2"
        size="small"
        placeholder="请输入类目名称"
        clearable
      >
        <template #suffix>
          <el-icon class="el-input__icon">
            <IconifyIconOffline
              v-show="searchValue.length === 0"
              icon="ri/search-line"
            />
          </el-icon>
        </template>
      </el-input>
      <el-button text class="mr-2" @click="onReset">重置</el-button>
    </div>
    <el-divider />
    <el-scrollbar height="calc(90vh - 88px)">
      <el-tree
        ref="treeRef"
        :data="props.treeData"
        node-key="id"
        size="small"
        :props="defaultProps"
        default-expand-all
        :expand-on-click-node="false"
        :filter-node-method="filterNode"
        @node-click="nodeClick"
      >
        <template #default="{ node, data }">
          <div
            :class="[
              'rounded-sm',
              'flex',
              'items-center',
              'select-none',
              'hover:text-primary',
              selectedId === data.id ? 'dark:text-primary' : ''
            ]"
            :style="{
              color: selectedId === data.id ? 'var(--el-color-primary)' : '',
              background: selectedId === data.id ? 'var(--el-color-primary-light-7)' : 'transparent'
            }"
          >
            <IconifyIconOffline icon="ri:price-tag-3-line" />
            <span class="w-[120px]! truncate!" :title="node.label">{{ node.label }}</span>
          </div>
        </template>
      </el-tree>
    </el-scrollbar>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-divider) {
  margin: 0;
}

:deep(.el-tree) {
  --el-tree-node-hover-bg-color: transparent;
}
</style>
