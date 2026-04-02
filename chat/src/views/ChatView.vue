<template>
  <div class="main" :style="mainStyle">
    <PrimaryNav
      v-model="activePrimaryTab"
      :show-document-generation-indicator="documentGenerationIndicatorVisible"
      :document-generation-task="documentGenerationTask"
      @open-document-generation="handleOpenDocumentGeneration"
    />
    <AgentTab v-if="activePrimaryTab === 'agent'" />
    <DiscoverTab v-else-if="activePrimaryTab === 'discover'" />
    <MineTab v-else />
  </div>
</template>

<script setup lang="ts">
import PrimaryNav from '@/components/chat/PrimaryNav.vue'
import { useDocumentGenerationManager } from '@/hooks/chat-view/useDocumentGenerationManager'
import { useWindowSize } from '@/hooks/useWindowSize'
import { computed, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const AgentTab = defineAsyncComponent(() => import('@/components/tabs/AgentTab.vue'))
const DiscoverTab = defineAsyncComponent(() => import('@/components/tabs/DiscoverTab.vue'))
const MineTab = defineAsyncComponent(() => import('@/components/tabs/MineTab.vue'))

const router = useRouter()
const route = useRoute()
const { width: windowWidth, height: windowHeight } = useWindowSize()
const {
  documentGenerationTask,
  documentGenerationIndicatorVisible,
  reopenDocumentGenerationDialog,
} = useDocumentGenerationManager()

const mainStyle = computed(() => ({
  width: windowWidth.value > 0 ? `${windowWidth.value}px` : '100vw',
  height: windowHeight.value > 0 ? `${windowHeight.value}px` : '100vh',
}))

const activePrimaryTab = computed<'agent' | 'discover' | 'mine'>({
  get: () => {
    if (route.name === 'agent' || route.name === 'mine') {
      return route.name
    }
    return 'agent'
  },
  set: (value) => {
    if (route.name === value) {
      return
    }
    void router.push({ name: value })
  },
})

async function handleOpenDocumentGeneration() {
  if (route.name !== 'agent') {
    await router.push({ name: 'agent' })
  }
  reopenDocumentGenerationDialog()
}
</script>

<style src="./ChatView.css"></style>
