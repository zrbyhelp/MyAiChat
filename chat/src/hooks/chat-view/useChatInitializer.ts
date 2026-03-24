import { MessagePlugin } from 'tdesign-vue-next'
import { nextTick, ref, type Ref } from 'vue'

import { isSignedInNow, waitForAuthReady } from '@/lib/auth'
import type { ChatSessionSummary } from '@/types/ai'

interface UseChatInitializerOptions {
  routeName: () => string
  isAuthLoaded: Ref<boolean | undefined>
  isSignedIn: Ref<boolean | undefined>
  sessionHistory: Ref<ChatSessionSummary[]>
  getStoredActiveSessionId: () => string
  initDebug: (message: string, extra?: Record<string, unknown>) => void
  loadModelConfigs: () => Promise<void>
  loadCapabilities: () => Promise<void>
  loadRobotTemplates: () => Promise<void>
  refreshSessionHistory: () => Promise<void>
  openSessionById: (sessionId: string) => Promise<boolean>
  createNewChat: () => Promise<void>
}

export function useChatInitializer(options: UseChatInitializerOptions) {
  const hasInitializedAgent = ref(false)
  const isInitializingAgent = ref(false)

  async function initializePage() {
    if (isInitializingAgent.value) {
      options.initDebug('initializePage skipped: already running')
      return false
    }

    isInitializingAgent.value = true
    try {
      options.initDebug('initializePage start', {
        route: options.routeName(),
        authLoaded: Boolean(options.isAuthLoaded.value),
        signedIn: isSignedInNow(),
        hasInitialized: hasInitializedAgent.value,
      })
      await waitForAuthReady()
      if (!isSignedInNow()) {
        options.initDebug('initializePage stop: not signed in after auth ready', {
          authLoaded: Boolean(options.isAuthLoaded.value),
          signedIn: isSignedInNow(),
        })
        return false
      }
      options.initDebug('request loadModelConfigs')
      await options.loadModelConfigs()
      options.initDebug('loadModelConfigs success')
      await options.loadCapabilities()
      options.initDebug('loadCapabilities success')
      await options.loadRobotTemplates()
      options.initDebug('loadRobotTemplates success')
      await options.refreshSessionHistory()
      options.initDebug('refreshSessionHistory success', {
        sessionCount: options.sessionHistory.value.length,
      })

      const storedSessionId = options.getStoredActiveSessionId()
      const initialSessionId = storedSessionId || options.sessionHistory.value[0]?.id
      options.initDebug('resolve initial session', {
        storedSessionId,
        initialSessionId: initialSessionId || '',
      })
      if (initialSessionId) {
        try {
          options.initDebug('request open session', { sessionId: initialSessionId })
          const opened = await options.openSessionById(initialSessionId)
          if (!opened) {
            throw new Error('open session failed')
          }
          options.initDebug('open session success', { sessionId: initialSessionId })
        } catch {
          options.initDebug('open session failed, fallback createNewChat', { sessionId: initialSessionId })
          await options.createNewChat()
        }
      } else {
        options.initDebug('no session found, createNewChat')
        await options.createNewChat()
      }
      options.initDebug('initializePage success')
      return true
    } catch (error) {
      options.initDebug('initializePage failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      MessagePlugin.error(error instanceof Error ? error.message : '初始化失败')
      return false
    } finally {
      isInitializingAgent.value = false
      options.initDebug('initializePage end', {
        hasInitialized: hasInitializedAgent.value,
        isInitializing: isInitializingAgent.value,
      })
    }
  }

  async function ensureAgentInitialized() {
    options.initDebug('ensureAgentInitialized check', {
      route: options.routeName(),
      hasInitialized: hasInitializedAgent.value,
      signedIn: Boolean(options.isSignedIn.value),
      authLoaded: Boolean(options.isAuthLoaded.value),
    })
    if (hasInitializedAgent.value || !options.isSignedIn.value) {
      options.initDebug('ensureAgentInitialized skipped', {
        hasInitialized: hasInitializedAgent.value,
        signedIn: Boolean(options.isSignedIn.value),
      })
      return
    }

    if (await initializePage()) {
      hasInitializedAgent.value = true
      options.initDebug('ensureAgentInitialized marked initialized')
      await nextTick()
    }
  }

  return {
    hasInitializedAgent,
    isInitializingAgent,
    ensureAgentInitialized,
  }
}
