import { MessagePlugin } from 'tdesign-vue-next'
import { computed, ref, type ComputedRef, type Ref } from 'vue'

import type { AIRobotCard } from '@/types/ai'
import { useWindowSize } from '@/hooks/useWindowSize'

interface UseChatViewUiControllerOptions {
  mobileBreakpoint: number
  robotTemplates: Ref<AIRobotCard[]>
  selectedNewChatRobotId: Ref<string>
  selectedNewChatRobot: ComputedRef<AIRobotCard | null>
  showThinkingToggle: ComputedRef<boolean>
  thinkingEnabled: Ref<boolean>
  onCreateNewChat: (robot?: AIRobotCard | null) => Promise<void>
  onOpenAgentManageDialog: () => void
  onOpenHistorySession: (targetSessionId: string) => Promise<boolean>
  onDeleteSession: (targetSessionId: string) => Promise<unknown>
  onToggleHistorySelectionMode: () => void
  onToggleSessionSelection: (targetSessionId: string, selected?: boolean) => void
  onBatchDeleteSessions: () => Promise<unknown>
}

export function useChatViewUiController(options: UseChatViewUiControllerOptions) {
  const { width } = useWindowSize()
  const isMobile = computed(() => width.value <= options.mobileBreakpoint)
  const sidebarDrawerVisible = ref(false)
  const newChatVisible = ref(false)

  function openNewChatDialog() {
    if (options.robotTemplates.value.length) {
      options.selectedNewChatRobotId.value =
        options.selectedNewChatRobotId.value || options.robotTemplates.value[0]!.id
      newChatVisible.value = true
      return
    }
    MessagePlugin.warning('暂无智能体卡片，请先去“设置智能体”中新增')
  }

  async function confirmStartNewChat() {
    if (!options.selectedNewChatRobot.value) {
      MessagePlugin.warning('请先选择一个智能体')
      return
    }
    await options.onCreateNewChat(options.selectedNewChatRobot.value)
    newChatVisible.value = false
    sidebarDrawerVisible.value = false
  }

  function handleNewChatEntry() {
    sidebarDrawerVisible.value = false
    openNewChatDialog()
  }

  function handleGoToRobotPage() {
    sidebarDrawerVisible.value = false
    options.onOpenAgentManageDialog()
  }

  function switchThinking() {
    if (options.showThinkingToggle.value) {
      options.thinkingEnabled.value = !options.thinkingEnabled.value
    }
  }

  async function openHistorySession(targetSessionId: string) {
    const opened = await options.onOpenHistorySession(targetSessionId)
    if (opened) {
      sidebarDrawerVisible.value = false
    }
  }

  async function handleDeleteSession(targetSessionId: string) {
    await options.onDeleteSession(targetSessionId)
  }

  function toggleHistorySelectionMode() {
    options.onToggleHistorySelectionMode()
  }

  function toggleSessionSelection(targetSessionId: string, selected?: boolean) {
    options.onToggleSessionSelection(targetSessionId, selected)
  }

  async function handleBatchDeleteSessions() {
    await options.onBatchDeleteSessions()
  }

  return {
    isMobile,
    sidebarDrawerVisible,
    newChatVisible,
    openNewChatDialog,
    confirmStartNewChat,
    handleNewChatEntry,
    handleGoToRobotPage,
    switchThinking,
    openHistorySession,
    handleDeleteSession,
    toggleHistorySelectionMode,
    toggleSessionSelection,
    handleBatchDeleteSessions,
  }
}
