import type { AIRobotCard, ChatSessionDetail } from '@/types/ai'

type RefreshCurrentSessionState = () => Promise<void>
type SyncCurrentSessionMeta = () => Promise<void>
type HydrateSession = (session: ChatSessionDetail) => Promise<void>
type CreateNewChat = (robot?: AIRobotCard | null) => Promise<void>

interface ChatSessionLifecycleHandlers {
  refreshCurrentSessionState: RefreshCurrentSessionState
  syncCurrentSessionMeta: SyncCurrentSessionMeta
  hydrateSession: HydrateSession
  createNewChat: CreateNewChat
}

export function useChatSessionLifecycleDelegate() {
  let handlers: ChatSessionLifecycleHandlers = {
    refreshCurrentSessionState: async () => {},
    syncCurrentSessionMeta: async () => {},
    hydrateSession: async () => {},
    createNewChat: async () => {},
  }

  function bindLifecycle(nextHandlers: ChatSessionLifecycleHandlers) {
    handlers = nextHandlers
  }

  async function refreshCurrentSessionState() {
    await handlers.refreshCurrentSessionState()
  }

  async function syncCurrentSessionMeta() {
    await handlers.syncCurrentSessionMeta()
  }

  async function hydrateSession(session: ChatSessionDetail) {
    await handlers.hydrateSession(session)
  }

  async function createNewChat(robot?: AIRobotCard | null) {
    await handlers.createNewChat(robot)
  }

  return {
    bindLifecycle,
    refreshCurrentSessionState,
    syncCurrentSessionMeta,
    hydrateSession,
    createNewChat,
  }
}
