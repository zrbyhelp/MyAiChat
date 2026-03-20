<template>
  <div class="primary-nav">
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
</template>

<script setup lang="ts">
import { Tooltip as TTooltip } from 'tdesign-vue-next'
import { ChatBubbleIcon, ExploreIcon, UserIcon } from 'tdesign-icons-vue-next'

defineProps<{
  modelValue: 'agent' | 'discover' | 'mine'
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: 'agent' | 'discover' | 'mine'): void
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
}
</style>
