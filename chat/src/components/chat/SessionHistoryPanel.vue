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
          <div class="history-item-preview">{{ item.preview || item.robotName || '暂无消息' }}</div>
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
}

.side-action {
  cursor: pointer;
  padding: 10px 8px;
}

.side-placeholder {
  padding: 10px 8px;
  color: #8b8b8b;
  line-height: 1.8;
}

.side-meta {
  font-size: 12px;
}

.history-title {
  padding: 12px 8px 8px;
  font-size: 13px;
  color: #666;
}

.history-scroll-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  padding: 10px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.history-item.active {
  background: #f5f9ff;
}

.history-item-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.history-item-title {
  font-size: 13px;
  color: #222;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-delete-button {
  flex: 0 0 auto;
  margin: -4px -6px 0 0;
}

.history-item-preview,
.history-empty {
  font-size: 12px;
  color: #8b8b8b;
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
  padding: 8px;
}
</style>
