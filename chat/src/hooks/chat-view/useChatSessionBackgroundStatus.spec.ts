import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useChatSessionBackgroundStatus } from './useChatSessionBackgroundStatus'

const { getSessionBackgroundStatus } = vi.hoisted(() => ({
  getSessionBackgroundStatus: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  getSessionBackgroundStatus,
}))

describe('useChatSessionBackgroundStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads current session background status immediately', async () => {
    getSessionBackgroundStatus.mockResolvedValueOnce({
      status: {
        sessionId: 'session-1',
        status: 'queued',
        pendingTaskCount: 2,
        currentTask: '',
        lastError: '',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    })

    const { sessionBackgroundStatus } = useChatSessionBackgroundStatus({
      sessionId: ref('session-1'),
      enabled: computed(() => true),
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(getSessionBackgroundStatus).toHaveBeenCalledWith('session-1')
    expect(sessionBackgroundStatus.value.status).toBe('queued')
    expect(sessionBackgroundStatus.value.pendingTaskCount).toBe(2)
  })

  it('calls onCompleted once for a newly completed background run', async () => {
    const onCompleted = vi.fn()
    getSessionBackgroundStatus.mockResolvedValueOnce({
      status: {
        sessionId: 'session-2',
        status: 'completed',
        pendingTaskCount: 0,
        currentTask: '',
        lastError: '',
        updatedAt: '2026-04-01T00:00:00.000Z',
      },
    })

    useChatSessionBackgroundStatus({
      sessionId: ref('session-2'),
      enabled: computed(() => true),
      onCompleted,
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(onCompleted).toHaveBeenCalledTimes(1)
  })
})
