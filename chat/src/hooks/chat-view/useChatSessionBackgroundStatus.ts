import { getSessionBackgroundStatus } from '@/lib/api'
import type { SessionBackgroundStatus } from '@/types/ai'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

interface UseChatSessionBackgroundStatusOptions {
  sessionId: Ref<string>
  enabled?: Ref<boolean>
  onCompleted?: () => void | Promise<void>
}

const POLL_INTERVAL_MS = 1500

function createIdleBackgroundStatus(sessionId = ''): SessionBackgroundStatus {
  return {
    sessionId: String(sessionId || '').trim(),
    status: 'idle',
    pendingTaskCount: 0,
    currentTask: '',
    lastError: '',
    updatedAt: '',
  }
}

export function useChatSessionBackgroundStatus(options: UseChatSessionBackgroundStatusOptions) {
  const sessionBackgroundStatus = ref<SessionBackgroundStatus>(createIdleBackgroundStatus(options.sessionId.value))
  let pollTimer: number | null = null
  let lastCompletedAt = ''

  function clearPollTimer() {
    if (pollTimer !== null) {
      window.clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function schedulePoll() {
    clearPollTimer()
    const status = sessionBackgroundStatus.value.status
    if (!['queued', 'memory_processing', 'graph_writeback_processing', 'completed'].includes(status)) {
      return
    }
    pollTimer = window.setTimeout(() => {
      void refreshSessionBackgroundStatus()
    }, POLL_INTERVAL_MS)
  }

  async function refreshSessionBackgroundStatus() {
    clearPollTimer()
    const targetSessionId = String(options.sessionId.value || '').trim()
    const enabled = options.enabled ? options.enabled.value : true

    if (!enabled || !targetSessionId) {
      sessionBackgroundStatus.value = createIdleBackgroundStatus(targetSessionId)
      return sessionBackgroundStatus.value
    }

    try {
      const response = await getSessionBackgroundStatus(targetSessionId)
      sessionBackgroundStatus.value = response.status || createIdleBackgroundStatus(targetSessionId)
      if (
        sessionBackgroundStatus.value.status === 'completed'
        && sessionBackgroundStatus.value.updatedAt
        && sessionBackgroundStatus.value.updatedAt !== lastCompletedAt
      ) {
        lastCompletedAt = sessionBackgroundStatus.value.updatedAt
        try {
          await options.onCompleted?.()
        } catch {
          // Ignore refresh failures and keep polling state consistent.
        }
      }
    } catch {
      sessionBackgroundStatus.value = createIdleBackgroundStatus(targetSessionId)
    }

    schedulePoll()
    return sessionBackgroundStatus.value
  }

  watch(
    () => [options.sessionId.value, options.enabled ? options.enabled.value : true],
    () => {
      lastCompletedAt = ''
      void refreshSessionBackgroundStatus()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    clearPollTimer()
  })

  return {
    sessionBackgroundStatus,
    refreshSessionBackgroundStatus,
  }
}
