import { MessagePlugin } from 'tdesign-vue-next'
import { nextTick, ref, type Ref } from 'vue'

import { getModelConfigs, getSession } from '@/lib/api'
import { isSignedInNow, waitForAuthReady } from '@/lib/auth'
import type { AIModelConfigItem, ChatSessionDetail, ChatSessionSummary } from '@/types/ai'

interface UseChatInitializerOptions {
  routeName: () => string
  isAuthLoaded: Ref<boolean | undefined>
  isSignedIn: Ref<boolean | undefined>
  sessionHistory: Ref<ChatSessionSummary[]>
  getStoredActiveSessionId: () => string
  initDebug: (message: string, extra?: Record<string, unknown>) => void
  applyModelConfigs: (configs: AIModelConfigItem[], activeId: string) => void
  loadCapabilities: () => Promise<void>
  loadRobotTemplates: () => Promise<void>
  refreshSessionHistory: () => Promise<void>
  hydrateSession: (session: ChatSessionDetail) => Promise<void>
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
      options.initDebug('request getModelConfigs')
      const { configs, activeModelConfigId: activeId } = await getModelConfigs()
      options.initDebug('getModelConfigs success', {
        configCount: configs.length,
        activeId,
      })
      options.applyModelConfigs(configs, activeId)
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
          options.initDebug('request getSession', { sessionId: initialSessionId })
          const response = await getSession(initialSessionId)
          await options.hydrateSession(response.session)
          options.initDebug('getSession success', { sessionId: initialSessionId })
        } catch {
          options.initDebug('getSession failed, fallback createNewChat', { sessionId: initialSessionId })
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
