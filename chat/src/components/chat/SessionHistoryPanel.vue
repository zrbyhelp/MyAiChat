<template>
  <div class="session-history-panel">
    <div class="side-shell">
      <div class="side-action" @click="emit('new-chat')">新聊天</div>
      <div class="side-action" @click="emit('go-robots')">设置机器人</div>
      <div class="side-placeholder">
        <div class="side-meta">当前机器人：{{ currentRobotLabel }}</div>
        <div class="side-meta">当前模型：{{ currentModelLabel }}</div>
      </div>
      <div class="history-title">历史聊天列表</div>
    </div>

    <div class="history-scroll-area">
      <div class="history-sticky-actions">
        <TButton theme="primary" variant="outline" block @click="emit('new-chat')">
          新增聊天
        </TButton>
      </div>
      <div v-if="sessionHistory.length" class="history-list">
        <div
          v-for="item in sessionHistory"
          :key="item.id"
          class="history-item"
          :class="{ active: item.id === sessionId }"
          @click="emit('open-session', item.id)"
        >
          <div class="history-item-head">
            <div class="history-item-title">{{ item.title || '新对话' }}</div>
            <div class="history-item-time">
              {{ formatSessionTime(item.updatedAt || item.createdAt) }}
            </div>
          </div>
          <div class="history-item-preview">{{ item.preview || item.robotName || '暂无消息' }}</div>
          <div class="history-item-foot">
            <div class="history-item-usage">
              <span class="usage-chip">↑{{ item.usage.promptTokens }}</span>
              <span class="usage-chip">↓{{ item.usage.completionTokens }}</span>
            </div>
            <TButton
              variant="text"
              size="small"
              theme="danger"
              class="history-delete-button"
              :loading="deletingSessionId === item.id"
              @click.stop="emit('delete-session', item.id)"
            >
              删除
            </TButton>
          </div>
        </div>
      </div>
      <div v-else class="history-empty">暂无历史聊天</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button as TButton } from 'tdesign-vue-next'

import type { ChatSessionSummary } from '@/types/ai'

defineProps<{
  currentRobotLabel: string
  currentModelLabel: string
  sessionHistory: ChatSessionSummary[]
  sessionId: string
  deletingSessionId: string
}>()

const emit = defineEmits<{
  (event: 'new-chat'): void
  (event: 'go-robots'): void
  (event: 'open-session', id: string): void
  (event: 'delete-session', id: string): void
}>()

function formatSessionTime(value: string) {
  if (!value) {
    return '刚刚'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '刚刚'
  }

  const now = Date.now()
  const diff = now - date.getTime()
  if (diff < 60 * 1000) {
    return '刚刚'
  }
  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 1000))}分钟前`
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / (60 * 60 * 1000))}小时前`
  }
  return date.toLocaleDateString()
}
</script>

<style scoped>
.session-history-panel {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.side-shell {
  flex: 0 0 auto;
  border-bottom: 1px solid #eff1f5;
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.side-action {
  cursor: pointer;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: #25324a;
  transition:
    background-color 0.18s ease,
    color 0.18s ease;
}

.side-action:hover {
  background: #eef3ff;
  color: #1f4dc9;
}

.side-placeholder {
  margin-top: 6px;
  padding: 10px;
  color: #7a8395;
  line-height: 1.8;
  border-radius: 10px;
  background: linear-gradient(135deg, #f6f9ff 0%, #f4f7fb 100%);
  border: 1px solid #e5ecfb;
}

.side-meta {
  font-size: 12px;
}

.history-title {
  padding: 12px 4px 0;
  font-size: 13px;
  font-weight: 600;
  color: #4b5568;
}

.history-scroll-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-sticky-actions {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 2px 0 10px;
  background: linear-gradient(180deg, #fff 70%, rgba(255, 255, 255, 0));
}

.history-item {
  padding: 10px;
  border-radius: 12px;
  border: 1px solid #e7ebf3;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.history-item.active {
  border-color: #aac4fb;
  background: linear-gradient(135deg, #f5f9ff 0%, #f0f6ff 100%);
}

.history-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.history-item-title {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-time {
  flex: 0 0 auto;
  font-size: 11px;
  color: #7f8aa3;
}

.history-delete-button {
  opacity: 0;
  transition: opacity 0.18s ease;
}

.history-item:hover .history-delete-button,
.history-item.active .history-delete-button {
  opacity: 1;
}

.history-item-foot {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.history-item-usage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.usage-chip {
  font-size: 11px;
  line-height: 1;
  color: #4f5f7e;
  background: #f1f4f9;
  border: 1px solid #e0e7f2;
  border-radius: 999px;
  padding: 4px 7px;
}

.history-item-preview,
.history-empty {
  font-size: 12px;
  color: #667085;
  line-height: 1.5;
}

.history-item-preview {
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.history-empty {
  padding: 14px 10px;
  text-align: center;
}
</style>
