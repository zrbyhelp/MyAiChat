<script setup lang="ts">
import { onMounted, ref } from "vue";
import dayjs from "dayjs";
import { message } from "@/utils/message";
import { getSurveyStats } from "@/api/survey";

defineOptions({
  name: "SurveyStats"
});

type SurveyStatsItem = {
  id: number;
  name: string;
  status: "draft" | "published" | "closed";
  questionCount: number;
  responseCount: number;
  updateTime: number;
};

type SurveyStatsPayload = {
  total: number;
  draftCount: number;
  publishedCount: number;
  closedCount: number;
  responseTotal: number;
  recent: SurveyStatsItem[];
};

const loading = ref(false);
const stats = ref<SurveyStatsPayload>({
  total: 0,
  draftCount: 0,
  publishedCount: 0,
  closedCount: 0,
  responseTotal: 0,
  recent: []
});

const formatTime = (value: number) =>
  value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "-";

const statusText = (status: "draft" | "published" | "closed") => {
  if (status === "published") return "已发布";
  if (status === "closed") return "已关闭";
  return "草稿";
};

const statusTagType = (status: "draft" | "published" | "closed") => {
  if (status === "published") return "success";
  if (status === "closed") return "info";
  return "warning";
};

const fetchStats = async () => {
  loading.value = true;
  try {
    const res = await getSurveyStats({});
    if (res.code === 0 && res.data) {
      stats.value = {
        total: Number(res.data.total || 0),
        draftCount: Number(res.data.draftCount || 0),
        publishedCount: Number(res.data.publishedCount || 0),
        closedCount: Number(res.data.closedCount || 0),
        responseTotal: Number(res.data.responseTotal || 0),
        recent: Array.isArray(res.data.recent) ? res.data.recent : []
      };
      return;
    }
    message(res.message || "获取统计数据失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  void fetchStats();
});
</script>

<template>
  <div class="main survey-stats-page" v-loading="loading">
    <div class="stats-grid">
      <el-card shadow="never" class="stats-card">
        <div class="stats-label">问卷总数</div>
        <div class="stats-value">{{ stats.total }}</div>
      </el-card>
      <el-card shadow="never" class="stats-card">
        <div class="stats-label">已发布问卷</div>
        <div class="stats-value">{{ stats.publishedCount }}</div>
      </el-card>
      <el-card shadow="never" class="stats-card">
        <div class="stats-label">草稿问卷</div>
        <div class="stats-value">{{ stats.draftCount }}</div>
      </el-card>
      <el-card shadow="never" class="stats-card">
        <div class="stats-label">累计回收</div>
        <div class="stats-value">{{ stats.responseTotal }}</div>
      </el-card>
    </div>

    <el-card shadow="never" class="mt-3">
      <template #header>
        <div class="table-header">
          <span class="font-medium">最近更新问卷</span>
          <el-button link type="primary" @click="fetchStats">刷新</el-button>
        </div>
      </template>

      <el-table :data="stats.recent" border>
        <el-table-column prop="name" label="问卷名称" min-width="220" />
        <el-table-column label="状态" width="120">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)">
              {{ statusText(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="questionCount" label="题目数" width="90" />
        <el-table-column prop="responseCount" label="回收数" width="90" />
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.updateTime) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped lang="scss">
.survey-stats-page {
  min-height: calc(100vh - 140px);
}

.stats-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

.stats-card {
  min-height: 120px;
}

.stats-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.stats-value {
  margin-top: 12px;
  font-size: 32px;
  font-weight: 700;
  line-height: 1;
}

.table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
</style>
