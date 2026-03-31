import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatSession } from './useChatSession'
import type { ChatSessionSummary } from '@/types/ai'

const {
  deleteSession,
  getSession,
  getSessions,
  error,
} = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  getSessions: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  deleteSession,
  getSession,
  getSessions,
}))

vi.mock('tdesign-vue-next', () => ({
  MessagePlugin: {
    error,
  },
}))

function createSummary(overrides: Partial<ChatSessionSummary> = {}): ChatSessionSummary {
  return {
    id: overrides.id || 'session-1',
    title: overrides.title || '测试会话',
    preview: overrides.preview || '测试内容',
    createdAt: overrides.createdAt || '2026-03-30T00:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-03-30T00:00:00.000Z',
    persistToServer: overrides.persistToServer ?? true,
    robotName: overrides.robotName || '测试智能体',
    modelConfigId: overrides.modelConfigId || 'model-1',
    modelLabel: overrides.modelLabel || '模型 1',
    usage: overrides.usage || {
      promptTokens: 0,
      completionTokens: 0,
    },
  }
}

function createSessionManager() {
  return useChatSession({
    onHydrateSession: vi.fn(async () => {}),
    onCreateNewChat: vi.fn(async () => {}),
  })
}

describe('useChatSession', () => {
  let confirmSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    deleteSession.mockReset()
    getSession.mockReset()
    getSessions.mockReset()
    error.mockReset()
  })

  it('loads session history only from the server', async () => {
    getSessions.mockResolvedValue({
      sessions: [
        createSummary({
          id: 'session-2',
          title: '较新的会话',
          updatedAt: '2026-03-30T02:00:00.000Z',
          persistToServer: true,
        }),
        createSummary({
          id: 'session-1',
          title: '服务端会话',
          updatedAt: '2026-03-30T01:00:00.000Z',
          persistToServer: true,
        }),
      ],
    })

    const sessionManager = createSessionManager()
    await sessionManager.refreshSessionHistory()

    expect(sessionManager.sessionHistory.value.map((item) => item.id)).toEqual(['session-2', 'session-1'])
    expect(sessionManager.sessionHistory.value).toHaveLength(2)
    expect(sessionManager.sessionHistory.value.find((item) => item.id === 'session-1')).toMatchObject({
      title: '服务端会话',
      persistToServer: true,
    })
  })

  it('accepts explicit selection state without flipping twice', () => {
    const sessionManager = createSessionManager()

    sessionManager.toggleSessionSelection('shared-session', true)
    sessionManager.toggleSessionSelection('shared-session', true)
    sessionManager.toggleSessionSelection('shared-session', false)

    expect(sessionManager.selectedSessionIds.value).toEqual([])
  })

  it('batch deletes selected server sessions', async () => {
    let serverSessions = [
      createSummary({
        id: 'server-session',
        title: '服务端会话',
        persistToServer: true,
      }),
    ]

    getSessions.mockImplementation(async () => ({ sessions: serverSessions }))
    deleteSession.mockImplementation(async (sessionId: string) => {
      serverSessions = serverSessions.filter((item) => item.id !== sessionId)
      return {}
    })

    const sessionManager = createSessionManager()
    await sessionManager.refreshSessionHistory()
    sessionManager.toggleHistorySelectionMode()
    sessionManager.toggleSessionSelection('server-session', true)

    const deleted = await sessionManager.handleBatchDeleteSessions()

    expect(deleted).toBe(true)
    expect(deleteSession).toHaveBeenCalledWith('server-session')
    expect(sessionManager.sessionHistory.value).toEqual([])
    expect(sessionManager.historySelectionMode.value).toBe(false)
    expect(sessionManager.selectedSessionIds.value).toEqual([])
    expect(confirmSpy).toHaveBeenCalledWith('确认批量删除选中的 1 个会话吗？')
  })
})
