<template>
  <div class="world-graph-view">
    <RobotWorldGraphWorkspace v-if="currentRobot" :current-robot="currentRobot" @close="handleClose" />
    <div v-else class="world-graph-state">
      <div class="world-graph-state-card">
        <strong>{{ loading ? '正在打开世界图谱...' : '无法打开世界图谱' }}</strong>
        <span>{{ loading ? '正在读取智能体信息' : stateMessage }}</span>
        <TButton v-if="!loading" theme="primary" @click="handleClose">返回</TButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button as TButton } from 'tdesign-vue-next'

import RobotWorldGraphWorkspace from '@/components/chat/RobotWorldGraphDialog.vue'
import { getRobots } from '@/lib/api'
import type { AIRobotCard } from '@/types/ai'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const stateMessage = ref('')
const currentRobot = ref<AIRobotCard | null>(null)

async function loadRobot() {
  const robotId = String(route.params.robotId || '').trim()
  currentRobot.value = null
  stateMessage.value = ''

  if (!robotId) {
    stateMessage.value = '缺少智能体 ID'
    return
  }

  loading.value = true
  try {
    const response = await getRobots()
    currentRobot.value = response.robots.find((item) => item.id === robotId) ?? null
    if (!currentRobot.value) {
      stateMessage.value = '未找到对应的智能体'
    }
  } catch (error) {
    stateMessage.value = error instanceof Error ? error.message : '读取智能体失败'
  } finally {
    loading.value = false
  }
}

function handleClose() {
  if (window.history.state?.back) {
    void router.back()
    return
  }
  void router.push({ name: 'agent' })
}

watch(() => route.params.robotId, () => { void loadRobot() }, { immediate: true })
</script>

<style scoped>
.world-graph-view {
  width: 100vw;
  height: 100vh;
  background: #f3f3f3;
}

.world-graph-state {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  padding: 24px;
}

.world-graph-state-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: min(420px, 100%);
  padding: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
}

.world-graph-state-card strong {
  color: #111827;
  font-size: 20px;
  font-weight: 600;
}

.world-graph-state-card span {
  color: #6b7280;
  font-size: 14px;
  line-height: 1.6;
}
</style>
