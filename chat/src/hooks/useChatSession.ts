import { ref } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

import { deleteSession, getSession, getSessions } from '@/lib/api'
import type { ChatSessionDetail, ChatSessionSummary } from '@/types/ai'

const ACTIVE_SESSION_STORAGE_KEY = 'myaichat.active-session-id'

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getStoredActiveSessionId() {
  return typeof window !== 'undefined'
    ? window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || ''
    : ''
}

function storeActiveSessionId(value: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, value)
  }
}

interface UseChatSessionOptions {
  onHydrateSession: (session: ChatSessionDetail) => Promise<void>
  onCreateNewChat: () => Promise<void>
}

export function useChatSession(options: UseChatSessionOptions) {
  const sessionId = ref(createSessionId())
  const sessionHistory = ref<ChatSessionSummary[]>([])
  const deletingSessionId = ref('')
  const batchDeletingSessionIds = ref<string[]>([])
  const historySelectionMode = ref(false)
  const selectedSessionIds = ref<string[]>([])

  async function refreshSessionHistory() {
    const response = await getSessions()
    sessionHistory.value = response.sessions
    if (!historySelectionMode.value) {
      selectedSessionIds.value = []
      return
    }
    const existingIds = new Set(response.sessions.map((item) => item.id))
    selectedSessionIds.value = selectedSessionIds.value.filter((id) => existingIds.has(id))
  }

  function exitHistorySelectionMode() {
    historySelectionMode.value = false
    selectedSessionIds.value = []
  }

  function toggleHistorySelectionMode() {
    historySelectionMode.value = !historySelectionMode.value
    if (!historySelectionMode.value) {
      selectedSessionIds.value = []
    }
  }

  function toggleSessionSelection(targetSessionId: string) {
    if (!targetSessionId) {
      return
    }
    const current = new Set(selectedSessionIds.value)
    if (current.has(targetSessionId)) {
      current.delete(targetSessionId)
    } else {
      current.add(targetSessionId)
    }
    selectedSessionIds.value = Array.from(current)
  }

  async function openHistorySession(targetSessionId: string) {
    if (!targetSessionId || targetSessionId === sessionId.value) {
      return false
    }

    try {
      const response = await getSession(targetSessionId)
      await options.onHydrateSession(response.session)
      return true
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '加载历史聊天失败')
      return false
    }
  }

  async function handleDeleteSession(targetSessionId: string) {
    if (
      !targetSessionId ||
      deletingSessionId.value ||
      batchDeletingSessionIds.value.length
    ) {
      return false
    }
    if (typeof window !== 'undefined' && !window.confirm('确认删除这个会话吗？')) {
      return false
    }

    deletingSessionId.value = targetSessionId
    const remainingSessions = sessionHistory.value.filter((item) => item.id !== targetSessionId)
    const nextSessionId =
      sessionId.value === targetSessionId ? remainingSessions[0]?.id || '' : sessionId.value

    try {
      await deleteSession(targetSessionId)
      await refreshSessionHistory()

      if (sessionId.value === targetSessionId) {
        if (nextSessionId) {
          const response = await getSession(nextSessionId)
          await options.onHydrateSession(response.session)
        } else {
          await options.onCreateNewChat()
        }
      }
      return true
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '删除会话失败')
      return false
    } finally {
      deletingSessionId.value = ''
    }
  }

  async function handleBatchDeleteSessions() {
    if (
      !historySelectionMode.value ||
      !selectedSessionIds.value.length ||
      deletingSessionId.value ||
      batchDeletingSessionIds.value.length
    ) {
      return false
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`确认批量删除选中的 ${selectedSessionIds.value.length} 个会话吗？`)
    ) {
      return false
    }

    const targetIds = [...selectedSessionIds.value]
    const targetIdSet = new Set(targetIds)
    batchDeletingSessionIds.value = targetIds

    try {
      for (const targetSessionId of targetIds) {
        await deleteSession(targetSessionId)
      }

      await refreshSessionHistory()

      if (targetIdSet.has(sessionId.value)) {
        const nextSessionId = sessionHistory.value.find((item) => !targetIdSet.has(item.id))?.id || ''
        if (nextSessionId) {
          const response = await getSession(nextSessionId)
          await options.onHydrateSession(response.session)
        } else {
          await options.onCreateNewChat()
        }
      }

      exitHistorySelectionMode()
      return true
    } catch (error) {
      MessagePlugin.error(error instanceof Error ? error.message : '批量删除会话失败')
      return false
    } finally {
      batchDeletingSessionIds.value = []
    }
  }

  return {
    sessionId,
    sessionHistory,
    deletingSessionId,
    batchDeletingSessionIds,
    historySelectionMode,
    selectedSessionIds,
    createSessionId,
    getStoredActiveSessionId,
    storeActiveSessionId,
    refreshSessionHistory,
    exitHistorySelectionMode,
    toggleHistorySelectionMode,
    toggleSessionSelection,
    openHistorySession,
    handleDeleteSession,
    handleBatchDeleteSessions,
  }
}
