import { onMounted, onUnmounted, watch, type Ref } from 'vue'

interface UseChatViewBootstrapOptions {
  activePrimaryTab: Ref<'agent' | 'discover' | 'mine'>
  isAuthLoaded: Ref<boolean | undefined>
  isSignedIn: Ref<boolean | undefined>
  hasInitializedAgent: Ref<boolean>
  ensureAgentInitialized: () => Promise<void>
  syncViewportMode: () => void
  initDebug: (message: string, extra?: Record<string, unknown>) => void
  routeName: () => string
}

export function useChatViewBootstrap(options: UseChatViewBootstrapOptions) {
  onMounted(async () => {
    options.syncViewportMode()
    window.addEventListener('resize', options.syncViewportMode)
    options.initDebug('onMounted')
    await options.ensureAgentInitialized()
  })

  watch(
    options.activePrimaryTab,
    async () => {
      options.initDebug('activePrimaryTab changed', {
        route: options.routeName(),
        tab: options.activePrimaryTab.value,
      })
      await options.ensureAgentInitialized()
    },
    { immediate: false },
  )

  watch(
    [options.isAuthLoaded, options.isSignedIn],
    async ([loaded, signedIn], previous) => {
      const [previousLoaded, previousSignedIn] = previous ?? []
      options.initDebug('auth watch fired', {
        loaded,
        signedIn,
        previousLoaded: previousLoaded ?? null,
        previousSignedIn: previousSignedIn ?? null,
        route: options.routeName(),
      })

      if (!loaded) {
        return
      }

      if (!signedIn) {
        options.hasInitializedAgent.value = false
        options.initDebug('auth watch reset initialized: signed out')
        return
      }

      if (!previousLoaded || !previousSignedIn) {
        options.initDebug('auth watch trigger ensureAgentInitialized')
        await options.ensureAgentInitialized()
      }
    },
    { immediate: true },
  )

  onUnmounted(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('resize', options.syncViewportMode)
  })
}
