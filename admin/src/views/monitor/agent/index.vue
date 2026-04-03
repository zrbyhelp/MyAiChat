<script setup lang="ts">
import dayjs from "dayjs";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import {
  clearAgentMonitor,
  getAgentMonitorChatSessions,
  getAgentMonitorChatUsers,
  getAgentMonitorReplies,
  getAgentMonitorReplyDetail,
  getAgentMonitorStatus,
  getAgentMonitorStepDetail,
  startAgentMonitor,
  stopAgentMonitor,
  type AgentMonitorStatus
} from "@/api/system";

import Refresh from "~icons/ep/refresh";
import VideoPlay from "~icons/ep/video-play";
import VideoPause from "~icons/ep/video-pause";
import Delete from "~icons/ep/delete";
import Tickets from "~icons/ri/ticket-2-line";
import Radar from "~icons/ri/radar-line";
import NodeTree from "~icons/ri/node-tree";

defineOptions({
  name: "AgentMonitor"
});

type ChatUserOption = {
  userId: string;
  userLabel: string;
  userEmail?: string;
  sessionCount: number;
  lastActiveAt: string;
};

type ChatSessionOption = {
  sessionId: string;
  sessionTitle: string;
  threadId: string;
  preview: string;
  updatedAt: string;
};

type ReplyRow = {
  replyId: string;
  sessionId: string;
  sessionTitle: string;
  threadId: string;
  summary: string;
  promptPreview: string;
  assistantMessagePreview: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  stepCount: number;
};

const filters = reactive({
  targetUserId: "",
  targetSessionId: ""
});

const status = ref<AgentMonitorStatus>({
  enabled: false,
  startedAt: "",
  stoppedAt: "",
  targetUserId: "",
  targetUserLabel: "",
  targetSessionId: "",
  targetSessionTitle: "",
  stats: {
    userCount: 0,
    sessionCount: 0,
    replyCount: 0,
    stepCount: 0
  }
});

const chatUsers = ref<ChatUserOption[]>([]);
const chatSessions = ref<ChatSessionOption[]>([]);
const replyRows = ref<ReplyRow[]>([]);
const replyDetail = ref<any>(null);
const stepDetail = ref<any>(null);

const loading = reactive({
  status: false,
  users: false,
  sessions: false,
  replies: false,
  action: false,
  replyDetail: false,
  stepDetail: false
});

const detailVisible = ref(false);
const detailTab = ref("process");

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const selectedUser = computed(() => chatUsers.value.find(item => item.userId === filters.targetUserId) || null);
const selectedSession = computed(() => chatSessions.value.find(item => item.sessionId === filters.targetSessionId) || null);
const prettyReplySnapshot = computed(() =>
  formatJson({
    requestSnapshot: replyDetail.value?.requestSnapshot,
    responseSnapshot: replyDetail.value?.responseSnapshot
  })
);
const prettyStepRequest = computed(() => formatJson(stepDetail.value?.requestSnapshot));
const prettyStepResponse = computed(() => formatJson(stepDetail.value?.responseSnapshot));

function formatDateTime(value?: string) {
  if (!value) return "--";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH:mm:ss") : "--";
}

function formatJson(value: any) {
  if (value === undefined) return "暂无数据";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "暂无数据");
  }
}

function syncRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    void refreshRuntime(false);
  }, 4000);
}

async function fetchStatus(showLoading = true) {
  if (showLoading) loading.status = true;
  try {
    const res = await getAgentMonitorStatus();
    if (res.code === 0 && res.data) {
      status.value = {
        enabled: Boolean(res.data.enabled),
        startedAt: String(res.data.startedAt || ""),
        stoppedAt: String(res.data.stoppedAt || ""),
        targetUserId: String(res.data.targetUserId || ""),
        targetUserLabel: String(res.data.targetUserLabel || ""),
        targetSessionId: String(res.data.targetSessionId || ""),
        targetSessionTitle: String(res.data.targetSessionTitle || ""),
        stats: {
          userCount: Number(res.data.stats?.userCount || 0),
          sessionCount: Number(res.data.stats?.sessionCount || 0),
          replyCount: Number(res.data.stats?.replyCount || 0),
          stepCount: Number(res.data.stats?.stepCount || 0)
        }
      };
    }
  } finally {
    loading.status = false;
  }
}

async function fetchChatUsers() {
  loading.users = true;
  try {
    const res = await getAgentMonitorChatUsers();
    if (res.code === 0 && res.data) {
      chatUsers.value = (res.data.list || []) as ChatUserOption[];
    }
  } finally {
    loading.users = false;
  }
}

async function fetchChatSessions() {
  if (!filters.targetUserId) {
    chatSessions.value = [];
    return;
  }
  loading.sessions = true;
  try {
    const res = await getAgentMonitorChatSessions({ userId: filters.targetUserId });
    if (res.code === 0 && res.data) {
      chatSessions.value = (res.data.list || []) as ChatSessionOption[];
    }
  } finally {
    loading.sessions = false;
  }
}

async function fetchReplies(showLoading = true) {
  if (!status.value.targetUserId || !status.value.targetSessionId) {
    replyRows.value = [];
    return;
  }
  if (showLoading) loading.replies = true;
  try {
    const res = await getAgentMonitorReplies({
      userId: status.value.targetUserId,
      sessionId: status.value.targetSessionId
    });
    if (res.code === 0 && res.data) {
      replyRows.value = (res.data.list || []) as ReplyRow[];
    }
  } finally {
    if (showLoading) loading.replies = false;
  }
}

async function refreshRuntime(showLoading = true) {
  await fetchStatus(showLoading);
  await fetchReplies(showLoading);
  if (replyDetail.value?.replyId) {
    await openReplyDetail(replyDetail.value.replyId, false, showLoading);
  }
}

async function handleUserChange() {
  filters.targetSessionId = "";
  chatSessions.value = [];
  await fetchChatSessions();
}

async function handleStart() {
  if (!filters.targetUserId) {
    message("请先选择聊天用户", { type: "warning" });
    return;
  }
  if (!filters.targetSessionId) {
    message("请先选择聊天会话", { type: "warning" });
    return;
  }

  loading.action = true;
  try {
    const res = await startAgentMonitor({
      targetUserId: filters.targetUserId,
      targetUserLabel: selectedUser.value?.userLabel || "",
      targetSessionId: filters.targetSessionId,
      targetSessionTitle: selectedSession.value?.sessionTitle || ""
    });
    if (res.code !== 0) throw new Error(res.message || "开始监控失败");
    replyRows.value = [];
    replyDetail.value = null;
    stepDetail.value = null;
    detailVisible.value = false;
    message("已开始监控当前用户会话", { type: "success" });
    await refreshRuntime(false);
  } catch (error) {
    message(error instanceof Error ? error.message : "开始监控失败", { type: "error" });
  } finally {
    loading.action = false;
  }
}

async function handleStop() {
  loading.action = true;
  try {
    const res = await stopAgentMonitor();
    if (res.code !== 0) throw new Error(res.message || "停止监控失败");
    message("已停止监控", { type: "success" });
    await refreshRuntime(false);
  } catch (error) {
    message(error instanceof Error ? error.message : "停止监控失败", { type: "error" });
  } finally {
    loading.action = false;
  }
}

async function handleClear() {
  loading.action = true;
  try {
    const res = await clearAgentMonitor();
    if (res.code !== 0) throw new Error(res.message || "清空失败");
    replyRows.value = [];
    replyDetail.value = null;
    stepDetail.value = null;
    detailVisible.value = false;
    message("监控数据已清空", { type: "success" });
    await refreshRuntime(false);
  } catch (error) {
    message(error instanceof Error ? error.message : "清空失败", { type: "error" });
  } finally {
    loading.action = false;
  }
}

async function handleRefresh() {
  await fetchChatUsers();
  await fetchChatSessions();
  await refreshRuntime(false);
}

async function openReplyDetail(replyId: string, openDrawer = true, showLoading = true) {
  if (showLoading) loading.replyDetail = true;
  if (openDrawer) {
    detailVisible.value = true;
    detailTab.value = "process";
    stepDetail.value = null;
  }
  try {
    const res = await getAgentMonitorReplyDetail({ replyId });
    if (res.code === 0 && res.data) {
      replyDetail.value = res.data;
    } else {
      message(res.message || "获取回复详情失败", { type: "error" });
    }
  } finally {
    if (showLoading) loading.replyDetail = false;
  }
}

async function openStepDetail(stepId: string, showLoading = true) {
  if (showLoading) loading.stepDetail = true;
  detailTab.value = "step";
  try {
    const res = await getAgentMonitorStepDetail({ stepId });
    if (res.code === 0 && res.data) {
      stepDetail.value = res.data;
    } else {
      message(res.message || "获取步骤详情失败", { type: "error" });
    }
  } finally {
    if (showLoading) loading.stepDetail = false;
  }
}

onMounted(async () => {
  await fetchChatUsers();
  if (filters.targetUserId) {
    await fetchChatSessions();
  }
  await refreshRuntime();
  syncRefreshTimer();
});

onBeforeUnmount(() => {
  if (refreshTimer) clearInterval(refreshTimer);
});
</script>

<template>
  <div class="agent-monitor-page">
    <section class="hero-panel">
      <div class="hero-copy">
        <p class="hero-kicker">AGENT MONITOR</p>
        <h1>先锁定用户与会话，再监控每次回复</h1>
        <p class="hero-text">
          当前只采集你手动开始监控之后的新数据。监控链路包含向量检索、GraphRAG 检索、图谱上下文召回、主回复、结构化记忆与世界图谱后台任务。
        </p>
      </div>
      <div class="hero-metrics">
        <div class="metric-card">
          <component :is="useRenderIcon(Tickets)" />
          <strong>{{ status.stats.replyCount }}</strong>
          <span>回复分组</span>
        </div>
        <div class="metric-card">
          <component :is="useRenderIcon(NodeTree)" />
          <strong>{{ status.stats.stepCount }}</strong>
          <span>执行步骤</span>
        </div>
        <div class="metric-card">
          <component :is="useRenderIcon(Radar)" />
          <strong>{{ status.enabled ? "监控中" : "已停止" }}</strong>
          <span>{{ status.targetSessionTitle || "未锁定会话" }}</span>
        </div>
      </div>
    </section>

    <section class="toolbar-card">
      <div class="selector-row">
        <el-select
          v-model="filters.targetUserId"
          filterable
          clearable
          placeholder="请选择聊天用户"
          class="selector-item"
          :loading="loading.users"
          @change="handleUserChange"
        >
          <el-option
            v-for="item in chatUsers"
            :key="item.userId"
            :label="`${item.userLabel}${item.userEmail ? `（${item.userEmail}）` : ''}`"
            :value="item.userId"
          />
        </el-select>

        <el-select
          v-model="filters.targetSessionId"
          filterable
          clearable
          placeholder="请选择聊天会话"
          class="selector-item"
          :loading="loading.sessions"
        >
          <el-option
            v-for="item in chatSessions"
            :key="item.sessionId"
            :label="item.sessionTitle"
            :value="item.sessionId"
          />
        </el-select>

        <el-button
          type="primary"
          :icon="useRenderIcon(VideoPlay)"
          :loading="loading.action"
          @click="handleStart"
        >
          开始监控
        </el-button>
        <el-button :icon="useRenderIcon(VideoPause)" :loading="loading.action" @click="handleStop">
          停止监控
        </el-button>
        <el-button :icon="useRenderIcon(Refresh)" @click="handleRefresh">刷新</el-button>
        <el-popconfirm title="确认清空当前内存中的监控数据吗？" @confirm="handleClear">
          <template #reference>
            <el-button :icon="useRenderIcon(Delete)" type="danger" plain :loading="loading.action">
              清空数据
            </el-button>
          </template>
        </el-popconfirm>
      </div>

      <div class="status-strip">
        <span class="status-pill" :class="{ active: status.enabled }">
          {{ status.enabled ? "监控中" : "已停止" }}
        </span>
        <span>当前用户：{{ status.targetUserLabel || "--" }}</span>
        <span>当前会话：{{ status.targetSessionTitle || "--" }}</span>
        <span>开始时间：{{ formatDateTime(status.startedAt) }}</span>
      </div>
    </section>

    <section class="table-card">
      <div class="table-head">
        <div>
          <h2>回复分组</h2>
          <p>先以表格查看每次回复，再点击详情进入完整流程。</p>
        </div>
        <div class="table-summary">
          <span>{{ replyRows.length }} 条</span>
        </div>
      </div>

      <el-table v-loading="loading.replies" :data="replyRows" border stripe class="reply-table">
        <el-table-column label="时间" min-width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="回复分组" prop="summary" min-width="220" show-overflow-tooltip />
        <el-table-column label="用户输入" prop="promptPreview" min-width="220" show-overflow-tooltip />
        <el-table-column label="回复预览" prop="assistantMessagePreview" min-width="260" show-overflow-tooltip />
        <el-table-column label="步骤数" prop="stepCount" width="100" align="center" />
        <el-table-column label="状态" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === 'failed' ? 'danger' : row.status === 'running' ? 'warning' : 'success'" effect="light">
              {{ row.status === "failed" ? "失败" : row.status === "running" ? "执行中" : "完成" }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right" align="center">
          <template #default="{ row }">
            <el-button type="primary" link @click="openReplyDetail(row.replyId)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty
        v-if="!loading.replies && replyRows.length === 0"
        :description="status.enabled ? '当前会话还没有新的监控数据' : '请选择用户和会话后开始监控'"
      />
    </section>

    <el-drawer v-model="detailVisible" title="回复流程详情" size="58%" destroy-on-close>
      <div class="detail-wrap" v-loading="loading.replyDetail">
        <template v-if="replyDetail">
          <div class="detail-header">
            <div>
              <h3>{{ replyDetail.summary }}</h3>
              <p>
                {{ formatDateTime(replyDetail.createdAt) }} · {{ replyDetail.sessionTitle }} · Thread:
                {{ replyDetail.threadId || "--" }}
              </p>
            </div>
            <el-tag :type="replyDetail.status === 'failed' ? 'danger' : replyDetail.status === 'running' ? 'warning' : 'success'">
              {{ replyDetail.status }}
            </el-tag>
          </div>

          <el-tabs v-model="detailTab">
            <el-tab-pane label="流程步骤" name="process">
              <div class="process-list">
                <button
                  v-for="step in replyDetail.steps || []"
                  :key="step.stepId"
                  class="process-item"
                  :class="{ failed: step.status === 'failed' }"
                  @click="openStepDetail(step.stepId)"
                >
                  <span class="process-index">{{ step.sequence }}</span>
                  <div class="process-body">
                    <div class="process-title">{{ step.summary }}</div>
                    <div class="process-meta">
                      <span>{{ step.stage }}</span>
                      <span>{{ formatDateTime(step.createdAt) }}</span>
                    </div>
                  </div>
                </button>
              </div>
            </el-tab-pane>

            <el-tab-pane label="整组快照" name="snapshot">
              <pre class="json-panel">{{ prettyReplySnapshot }}</pre>
            </el-tab-pane>

            <el-tab-pane label="当前步骤" name="step">
              <div v-loading="loading.stepDetail">
                <template v-if="stepDetail">
                  <div class="step-header">
                    <el-tag>{{ stepDetail.stage }}</el-tag>
                    <span>顺序 {{ stepDetail.sequence }}</span>
                    <span>{{ formatDateTime(stepDetail.createdAt) }}</span>
                  </div>
                  <div class="step-title">{{ stepDetail.summary }}</div>
                  <el-tabs>
                    <el-tab-pane label="请求快照">
                      <pre class="json-panel">{{ prettyStepRequest }}</pre>
                    </el-tab-pane>
                    <el-tab-pane label="响应快照">
                      <pre class="json-panel">{{ prettyStepResponse }}</pre>
                    </el-tab-pane>
                  </el-tabs>
                </template>
                <el-empty v-else description="请先点击某个步骤查看上下文" />
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
        <el-empty v-else description="暂无回复详情" />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped lang="scss">
.agent-monitor-page {
  min-height: 100%;
  padding: 20px;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 25%),
    linear-gradient(180deg, #f5f7fb 0%, #edf2f8 100%);
}

.hero-panel,
.toolbar-card,
.table-card {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.08);
}

.hero-panel {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 24px 28px;
  background:
    linear-gradient(135deg, rgba(12, 74, 110, 0.96), rgba(15, 118, 110, 0.92)),
    linear-gradient(180deg, #0f172a, #164e63);
  color: #f8fafc;
}

.hero-kicker {
  margin: 0 0 8px;
  letter-spacing: 0.28em;
  font-size: 12px;
  color: rgba(226, 232, 240, 0.74);
}

.hero-copy h1 {
  margin: 0;
  font-size: 30px;
}

.hero-text {
  max-width: 820px;
  margin: 12px 0 0;
  line-height: 1.7;
  color: rgba(226, 232, 240, 0.86);
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  min-width: 360px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.12);
}

.metric-card strong {
  font-size: 24px;
}

.toolbar-card,
.table-card {
  margin-top: 18px;
  padding: 20px;
}

.selector-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.selector-item {
  width: 300px;
}

.status-strip {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 14px;
  color: #64748b;
  font-size: 13px;
}

.status-pill {
  padding: 5px 12px;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.16);
  color: #475569;
  font-weight: 700;
}

.status-pill.active {
  background: rgba(16, 185, 129, 0.14);
  color: #047857;
}

.table-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.table-head h2 {
  margin: 0;
  font-size: 20px;
  color: #0f172a;
}

.table-head p {
  margin: 6px 0 0;
  color: #64748b;
}

.table-summary {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
}

.reply-table {
  width: 100%;
}

.detail-wrap {
  min-height: 240px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.detail-header h3 {
  margin: 0;
  color: #0f172a;
}

.detail-header p {
  margin: 8px 0 0;
  color: #64748b;
}

.process-list {
  display: grid;
  gap: 10px;
}

.process-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  background: rgba(248, 250, 252, 0.9);
  text-align: left;
  cursor: pointer;
}

.process-item.failed {
  border-color: rgba(239, 68, 68, 0.28);
}

.process-index {
  display: inline-flex;
  width: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: rgba(14, 165, 233, 0.12);
  color: #0369a1;
  font-weight: 700;
  flex-shrink: 0;
}

.process-item.failed .process-index {
  background: rgba(239, 68, 68, 0.14);
  color: #dc2626;
}

.process-title,
.step-title {
  color: #0f172a;
  font-weight: 700;
}

.process-meta,
.step-header {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 8px;
  color: #64748b;
  font-size: 12px;
}

.json-panel {
  margin: 0;
  padding: 16px;
  border-radius: 18px;
  background: #0f172a;
  color: #e2e8f0;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: calc(100vh - 360px);
  overflow: auto;
  font-size: 12px;
  line-height: 1.7;
}

@media (max-width: 1200px) {
  .hero-panel {
    flex-direction: column;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
    min-width: 0;
  }
}
</style>
