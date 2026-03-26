<script setup lang="ts">
import { computed } from "vue";
import { useWindowSize } from "@vueuse/core";
import "vue-json-pretty/lib/styles.css";
import VueJsonPretty from "vue-json-pretty";
import { transformI18n, $t } from "@/plugins/i18n";

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
});

const { width } = useWindowSize();
const row = computed(() => (props.data?.[0] as any) || {});
const descriptionsData = computed(() => [row.value]);
const descriptionColumn = computed(() => {
  if (width.value < 768) return 1;
  if (width.value < 1200) return 2;
  return 4;
});
const detailMaxHeight = computed(() => (width.value < 768 ? "calc(100vh - 320px)" : "65vh"));

const tabs = computed(() => [
  { title: transformI18n($t("monitor.requestParams")), name: "requestBody", data: row.value.requestBody },
  { title: transformI18n($t("monitor.responseData")), name: "responseBody", data: row.value.responseBody }
]);

const columns = [
  { label: "ID", prop: "id" },
  { label: transformI18n($t("monitor.operator")), prop: "username" },
  { label: transformI18n($t("monitor.summary")), prop: "summary" },
  { label: transformI18n($t("monitor.requestMethod")), prop: "method" },
  { label: transformI18n($t("monitor.operationIp")), prop: "ip" },
  { label: transformI18n($t("monitor.status")), prop: "status" },
  { label: transformI18n($t("monitor.operationTime")), prop: "operatingTime" }
];
</script>

<template>
  <div class="operation-log-detail">
    <el-scrollbar>
      <PureDescriptions border :data="descriptionsData" :columns="columns" :column="descriptionColumn" />
    </el-scrollbar>
    <el-tabs model-value="requestBody" type="border-card" class="mt-4">
      <el-tab-pane
        v-for="item in tabs"
        :key="item.name"
        :name="item.name"
        :label="item.title"
      >
        <el-scrollbar :max-height="detailMaxHeight">
          <vue-json-pretty :data="item.data" />
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style lang="scss" scoped>
.operation-log-detail {
  min-width: 340px;
  max-height: 72vh;
  overflow: auto;

  :deep(.el-tabs__content) {
    padding: 10px;
  }
}

@media (max-width: 767px) {
  .operation-log-detail {
    min-width: 280px;
    max-height: calc(100vh - 180px);

    :deep(.el-tabs__header) {
      margin-bottom: 8px;
    }

    :deep(.el-tabs__item) {
      padding: 0 10px;
      font-size: 12px;
    }

    :deep(.vjs-tree-node) {
      font-size: 12px;
      line-height: 1.4;
    }
  }
}
</style>
