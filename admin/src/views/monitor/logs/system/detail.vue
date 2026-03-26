<script setup lang="ts">
import { computed } from "vue";
import "vue-json-pretty/lib/styles.css";
import VueJsonPretty from "vue-json-pretty";
import { transformI18n, $t } from "@/plugins/i18n";

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
});

const row = computed(() => (props.data?.[0] as any) || {});
const descriptionsData = computed(() => [row.value]);
const tabs = computed(() => [
  { title: transformI18n($t("monitor.detailData")), name: "detail", data: row.value.detail ?? {} }
]);

const columns = [
  { label: transformI18n($t("monitor.time")), prop: "requestTime" },
  { label: transformI18n($t("monitor.source")), prop: "source" },
  { label: transformI18n($t("monitor.description")), prop: "message" }
];
</script>

<template>
  <div class="system-log-detail">
    <el-scrollbar>
      <PureDescriptions border :data="descriptionsData" :columns="columns" :column="1" />
    </el-scrollbar>
    <el-tabs model-value="detail" type="border-card" class="mt-4">
      <el-tab-pane
        v-for="item in tabs"
        :key="item.name"
        :name="item.name"
        :label="item.title"
      >
        <el-scrollbar max-height="65vh">
          <vue-json-pretty :data="item.data" />
        </el-scrollbar>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style lang="scss" scoped>
.system-log-detail {
  min-width: 320px;
  max-height: 72vh;
  overflow: auto;
}
</style>
