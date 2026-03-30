import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useChatSession } from './useChatSession'
import type { ChatSessionSummary } from '@/types/ai'

const {
  deleteSession,
  getSession,
  getSessions,
  deleteLocalSession,
  getLocalSession,
  listLocalSessions,
  error,
} = vi.hoisted(() => ({
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  getSessions: vi.fn(),
  deleteLocalSession: vi.fn(),
  getLocalSession: vi.fn(),
  listLocalSessions: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/api', () => ({
  deleteSession,
  getSession,
  getSessions,
}))

vi.mock('@/lib/local-db', () => ({
  deleteLocalSession,
  getLocalSession,
  listLocalSessions,
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
    deleteLocalSession.mockReset()
    getLocalSession.mockReset()
    listLocalSessions.mockReset()
    error.mockReset()
  })

  it('deduplicates sessions with the same id and keeps the server copy visible', async () => {
    getSessions.mockResolvedValue({
      sessions: [
        createSummary({
          id: 'shared-session',
          title: '服务端会话',
          updatedAt: '2026-03-30T02:00:00.000Z',
          persistToServer: true,
        }),
      ],
    })
    listLocalSessions.mockResolvedValue([
      createSummary({
        id: 'shared-session',
        title: '本地残留会话',
        updatedAt: '2026-03-30T01:00:00.000Z',
        persistToServer: false,
      }),
      createSummary({
        id: 'local-only',
        title: '本地会话',
        updatedAt: '2026-03-30T03:00:00.000Z',
        persistToServer: false,
      }),
    ])

    const sessionManager = createSessionManager()
    await sessionManager.refreshSessionHistory()

    expect(sessionManager.sessionHistory.value.map((item) => item.id)).toEqual([
      'local-only',
      'shared-session',
    ])
    expect(sessionManager.sessionHistory.value).toHaveLength(2)
    expect(sessionManager.sessionHistory.value.find((item) => item.id === 'shared-session')).toMatchObject({
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

  it('batch deletes duplicate server and local copies cleanly', async () => {
    let serverSessions = [
      createSummary({
        id: 'shared-session',
        title: '服务端会话',
        persistToServer: true,
      }),
    ]
    let localSessions = [
      createSummary({
        id: 'shared-session',
        title: '本地残留会话',
        persistToServer: false,
      }),
    ]

    getSessions.mockImplementation(async () => ({ sessions: serverSessions }))
    listLocalSessions.mockImplementation(async () => localSessions)
    deleteSession.mockImplementation(async (sessionId: string) => {
      serverSessions = serverSessions.filter((item) => item.id !== sessionId)
      return {}
    })
    deleteLocalSession.mockImplementation(async (sessionId: string) => {
      localSessions = localSessions.filter((item) => item.id !== sessionId)
    })

    const sessionManager = createSessionManager()
    await sessionManager.refreshSessionHistory()
    sessionManager.toggleHistorySelectionMode()
    sessionManager.toggleSessionSelection('shared-session', true)

    const deleted = await sessionManager.handleBatchDeleteSessions()

    expect(deleted).toBe(true)
    expect(deleteSession).toHaveBeenCalledWith('shared-session')
    expect(deleteLocalSession).toHaveBeenCalledWith('shared-session')
    expect(sessionManager.sessionHistory.value).toEqual([])
    expect(sessionManager.historySelectionMode.value).toBe(false)
    expect(sessionManager.selectedSessionIds.value).toEqual([])
    expect(confirmSpy).toHaveBeenCalledWith('确认批量删除选中的 1 个会话吗？')
  })
})
