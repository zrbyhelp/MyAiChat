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

  async function refreshSessionHistory() {
    const response = await getSessions()
    sessionHistory.value = response.sessions
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
    if (!targetSessionId || deletingSessionId.value) {
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

  return {
    sessionId,
    sessionHistory,
    deletingSessionId,
    createSessionId,
    getStoredActiveSessionId,
    storeActiveSessionId,
    refreshSessionHistory,
    openHistorySession,
    handleDeleteSession,
  }
}

