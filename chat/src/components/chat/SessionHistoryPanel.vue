<template>
  <div class="session-history-panel">
    <div class="side-shell">
      <div class="history-sticky-actions">
        <TButton theme="primary" variant="outline" block @click="emit('new-chat')">
          新增聊天
        </TButton>
      </div>
       <div class="history-sticky-actions">
       <TButton theme="primary" variant="outline" block @click="emit('go-robots')">
          设置智能体
        </TButton>
      </div>
      <div class="side-placeholder">
        <div class="side-meta">当前智能体：{{ currentRobotLabel }}</div>
        <div class="side-meta">当前模型：{{ currentModelLabel }}</div>
      </div>
      <div class="history-title">历史聊天列表</div>
    </div>

    <div class="history-scroll-area">

      <div v-if="sessionHistory.length" class="history-list">
        <TCard
          v-for="item in sessionHistory"
          :key="item.id"
          class="history-item"
          :class="{ active: item.id === sessionId }"
          :title="item.title || '新对话'"
          hoverShadow
          @click="emit('open-session', item.id)"
        >
          <template #subtitle>
            <div class="history-item-subtitle">
              <div class="history-item-time">
                {{ formatSessionTime(item.updatedAt || item.createdAt) }}
              </div>
              <div class="history-item-usage">
                <span class="usage-chip">↑ {{ formatUsageToken(item.usage.promptTokens) }}</span>
                <span class="usage-chip">↓ {{ formatUsageToken(item.usage.completionTokens) }}</span>
              </div>
            </div>
          </template>
          <div class="history-item-preview" :title="item.preview || item.robotName || '暂无消息'">
            {{ item.preview || item.robotName || '暂无消息' }}
          </div>
          <template #actions>
            <TDropdown
              trigger="click"
              placement="bottom-right"
              :options="historyActionOptions"
              @click="(data) => handleHistoryAction(item.id, data.value)"
            >
              <TButton variant="text" shape="square" size="small" class="history-action-button" @click.stop>
                <template #icon>
                  <MoreIcon />
                </template>
              </TButton>
            </TDropdown>
          </template>
        </TCard>
      </div>
      <div v-else class="history-empty">暂无历史聊天</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { millify } from 'millify'
import { MoreIcon } from 'tdesign-icons-vue-next'
import { Button as TButton, Card as TCard, Dropdown as TDropdown } from 'tdesign-vue-next'

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

const historyActionOptions = [
  {
    content: '删除',
    value: 'delete',
  },
]

function handleHistoryAction(id: string, action?: string | number | Record<string, unknown>) {
  if (String(action || '') === 'delete') {
    emit('delete-session', id)
  }
}

function formatUsageToken(value: number) {
  if (!Number.isFinite(value)) {
    return '0'
  }

  return millify(value, {
    precision: 1,
    lowercase: false,
  })
}

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
  cursor: pointer;
}

.history-item :deep(.t-card__header),
.history-item :deep(.t-card__body) {
  min-width: 0;
}

.history-item :deep(.t-card__header) {
  padding-bottom: 14px;
}

.history-item :deep(.t-card__body) {
  padding-top: 0;
  padding-bottom: 26px;
}

.history-item.active {
  border-color: #aac4fb;
}

.history-item :deep(.t-card__title) {
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item-subtitle {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.history-item-time {
  font-size: 11px;
  color: #7f8aa3;
}

.history-action-button {
  color: #6b7280;
}

.history-item-usage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.usage-chip {
  font-size: 11px;
  line-height: 1.2;
  color: #7f8aa3;
}

.history-item-preview,
.history-empty {
  font-size: 12px;
  color: #667085;
  line-height: 1.5;
}

.history-item-preview {
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
