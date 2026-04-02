<template>
  <div class="primary-nav">
    <div class="primary-nav-actions">
      <TTooltip content="智能体" placement="right">
        <button
          class="primary-nav-item"
          :class="{ active: modelValue === 'agent' }"
          aria-label="智能体"
          @click="emit('update:modelValue', 'agent')"
        >
          <ChatBubbleIcon class="primary-nav-icon" />
        </button>
      </TTooltip>

      <TTooltip content="发现" placement="right">
        <button
          class="primary-nav-item"
          :class="{ active: modelValue === 'discover' }"
          aria-label="发现"
          @click="emit('update:modelValue', 'discover')"
        >
          <ExploreIcon class="primary-nav-icon" />
        </button>
      </TTooltip>

      <TTooltip content="我的" placement="right">
        <button
          class="primary-nav-item"
          :class="{ active: modelValue === 'mine' }"
          aria-label="我的"
          @click="emit('update:modelValue', 'mine')"
        >
          <UserIcon class="primary-nav-icon" />
        </button>
      </TTooltip>
    </div>

    <button
      v-if="showDocumentGenerationIndicator && documentGenerationTask"
      type="button"
      class="primary-nav-status-card"
      :class="{ 'is-canceling': documentGenerationTask.status === 'canceling' }"
      @click="emit('open-document-generation')"
    >
      <span class="primary-nav-status-head">
        <span class="primary-nav-status-badge">
          <span class="primary-nav-status-dot"></span>
          <span>{{ documentGenerationTask.status === 'canceling' ? '取消中' : '生成中' }}</span>
        </span>
        <span class="primary-nav-status-progress">{{ Math.round(documentGenerationTask.progress || 0) }}%</span>
      </span>
      <span class="primary-nav-status-file">{{ documentGenerationTask.sourceName || '未命名文档' }}</span>
      <span class="primary-nav-status-message">{{ documentGenerationTask.message || '文档生成任务进行中' }}</span>
      <span class="primary-nav-status-wave" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { Tooltip as TTooltip } from 'tdesign-vue-next'
import { ChatBubbleIcon, ExploreIcon, UserIcon } from 'tdesign-icons-vue-next'

import type { RobotGenerationTask } from '@/types/ai'

defineProps<{
  modelValue: 'agent' | 'discover' | 'mine'
  showDocumentGenerationIndicator: boolean
  documentGenerationTask: RobotGenerationTask | null
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: 'agent' | 'discover' | 'mine'): void
  (event: 'open-document-generation'): void
}>()
</script>

<style scoped>
.primary-nav {
  width: 64px;
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #ececec;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 8px;
  gap: 8px;
}

.primary-nav-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.primary-nav-item {
  border: 1px solid transparent;
  border-radius: 10px;
  background: #f3f4f6;
  color: #333;
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
}

.primary-nav-icon {
  width: 20px;
  height: 20px;
}

.primary-nav-item.active {
  background: #e8f0ff;
  border-color: #b7cdfd;
  color: #2458d6;
}

.primary-nav-status-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding: 12px 10px;
  border: 1px solid #d6e1d6;
  border-radius: 18px;
  background:
    radial-gradient(circle at top left, rgba(195, 244, 211, 0.72), transparent 48%),
    linear-gradient(180deg, #f7fbf5 0%, #edf7ef 100%);
  color: #163322;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(53, 94, 60, 0.08);
}

.primary-nav-status-card.is-canceling {
  border-color: #ecd9b0;
  background:
    radial-gradient(circle at top left, rgba(255, 231, 177, 0.72), transparent 48%),
    linear-gradient(180deg, #fffaf0 0%, #fff3d6 100%);
  color: #6b4d12;
}

.primary-nav-status-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
}

.primary-nav-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.primary-nav-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: currentColor;
  animation: primary-nav-pulse 1.2s ease-in-out infinite;
}

.primary-nav-status-progress {
  color: rgba(22, 51, 34, 0.72);
}

.primary-nav-status-card.is-canceling .primary-nav-status-progress {
  color: rgba(107, 77, 18, 0.72);
}

.primary-nav-status-file {
  font-size: 12px;
  line-height: 1.4;
  font-weight: 700;
  word-break: break-word;
}

.primary-nav-status-message {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(22, 51, 34, 0.75);
}

.primary-nav-status-card.is-canceling .primary-nav-status-message {
  color: rgba(107, 77, 18, 0.8);
}

.primary-nav-status-wave {
  height: 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: end;
  gap: 4px;
}

.primary-nav-status-wave span {
  display: block;
  border-radius: 999px;
  background: rgba(28, 108, 54, 0.7);
  animation: primary-nav-wave 1s ease-in-out infinite;
}

.primary-nav-status-card.is-canceling .primary-nav-status-wave span {
  background: rgba(160, 110, 11, 0.72);
}

.primary-nav-status-wave span:nth-child(1) {
  height: 6px;
  animation-delay: 0s;
}

.primary-nav-status-wave span:nth-child(2) {
  height: 12px;
  animation-delay: 0.1s;
}

.primary-nav-status-wave span:nth-child(3) {
  height: 9px;
  animation-delay: 0.2s;
}

.primary-nav-status-wave span:nth-child(4) {
  height: 14px;
  animation-delay: 0.3s;
}

@keyframes primary-nav-pulse {
  0%, 100% {
    transform: scale(0.85);
    opacity: 0.55;
  }

  50% {
    transform: scale(1.1);
    opacity: 1;
  }
}

@keyframes primary-nav-wave {
  0%, 100% {
    transform: scaleY(0.65);
    opacity: 0.55;
  }

  50% {
    transform: scaleY(1.08);
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .primary-nav {
    width: auto;
    height: 54px;
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom));
    z-index: 11;
    border-right: 0;
    border: 1px solid #e6e8ee;
    border-radius: 14px;
    flex-direction: row;
    justify-content: space-between;
    padding: 7px;
    gap: 6px;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(12px);
    box-shadow: 0 6px 22px rgba(24, 39, 75, 0.08);
  }

  .primary-nav-actions {
    flex: 1;
    flex-direction: row;
    width: 100%;
    justify-content: space-between;
    gap: 6px;
  }

  .primary-nav-item {
    flex: 1;
    width: auto;
    height: 38px;
    border-radius: 10px;
    background: transparent;
    color: #6b7280;
  }

  .primary-nav-item.active {
    background: #e9f0ff;
    border-color: #c3d4ff;
    color: #2a5bd7;
  }

  .primary-nav-icon {
    width: 17px;
    height: 17px;
  }

  .primary-nav-status-card {
    display: none;
  }
}
</style>
