import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useChatStreaming } from './useChatStreaming'
import type { ChatRenderMessage } from './useChatView.types'
import type { RobotWorldGraph } from '@/types/ai'

function createStreamingTestContext() {
  const beginInteractionLock = vi.fn()
  const applyChatMessages = vi.fn()
  const completeChatResponse = vi.fn()
  const syncChatResponse = vi.fn()
  const flushPendingAssistantStructuredContent = vi.fn()
  const flushPendingAssistantMemoryStatus = vi.fn()
  const applyNumericState = vi.fn()
  const applySessionUsage = vi.fn()
  const applyStructuredMemory = vi.fn()
  const applyStoryOutline = vi.fn()
  const applySessionWorldGraph = vi.fn()
  const cloneNumericComputationItems = vi.fn().mockReturnValue([])
  const serializeChatMessages = vi.fn().mockReturnValue([])
  const currentStoryOutline = ref('')
  const currentSessionWorldGraph = ref<RobotWorldGraph | null>(null)
  const chatMessages = ref<ChatRenderMessage[]>([
    {
      id: 'assistant-1',
      role: 'assistant',
      content: [{ type: 'markdown', data: '已有内容' }],
    },
  ])
  const currentAssistantLoadingText = ref('')
  const currentMemoryStatusText = ref('')
  const pendingAssistantSuggestions = ref(null)
  const pendingAssistantForm = ref(null)
  const pendingAssistantMemoryStatus = ref(null)

  const { chatServiceConfig } = useChatStreaming({
    beginInteractionLock,
    sessionId: ref('session-1'),
    activeModelConfig: computed(() => ({
      id: 'model-1',
      name: 'Model 1',
      provider: 'openai',
      baseUrl: 'https://example.com',
      apiKey: 'test-key',
      model: 'gpt-test',
      description: '',
      temperature: 0.7,
      tags: [],
      persistToServer: false,
    })),
    currentModelLabel: computed(() => 'Model 1'),
    modelConfigs: ref([]),
    sessionRobot: {
      id: 'robot-1',
      name: '测试智能体',
      avatar: '',
      commonPrompt: '',
      systemPrompt: '',
      memoryModelConfigId: '',
      outlineModelConfigId: '',
      knowledgeRetrievalModelConfigId: '',
      numericComputationModelConfigId: '',
      worldGraphModelConfigId: '',
      numericComputationEnabled: false,
      numericComputationPrompt: '',
      numericComputationItems: [],
      structuredMemoryInterval: 3,
      structuredMemoryHistoryLimit: 12,
    },
    currentSessionMemory: {
      summary: '',
      updatedAt: '',
      sourceMessageCount: 0,
      persistToServer: true,
      threshold: 20,
      recentMessageLimit: 10,
      structuredMemoryInterval: 3,
      structuredMemoryHistoryLimit: 12,
      prompt: '',
    },
    currentMemorySchema: {
      categories: [],
    },
    currentStructuredMemory: {
      updatedAt: '',
      categories: [],
    },
    currentNumericState: ref({}),
    currentStoryOutline,
    currentSessionWorldGraph,
    rawChatMessages: ref([]),
    effectiveStream: computed(() => true),
    effectiveThinking: computed(() => false),
    cloneNumericComputationItems,
    applyNumericState,
    applySessionUsage,
    applyStructuredMemory,
    applyStoryOutline,
    applySessionWorldGraph,
    serializeChatMessages,
    completeChatResponse,
    syncChatResponse,
    currentAssistantLoadingText,
    currentMemoryStatusText,
    pendingAssistantSuggestions,
    pendingAssistantForm,
    pendingAssistantMemoryStatus,
    chatMessages,
    applyChatMessages,
    flushPendingAssistantStructuredContent,
    flushPendingAssistantMemoryStatus,
  })

  return {
    chatServiceConfig,
    chatMessages,
    currentAssistantLoadingText,
    currentMemoryStatusText,
    applyChatMessages,
    applyStoryOutline,
    completeChatResponse,
    syncChatResponse,
  }
}

describe('useChatStreaming', () => {
  it('refreshes chat messages when ui loading event arrives', async () => {
    const { chatServiceConfig, chatMessages, currentAssistantLoadingText, applyChatMessages } =
      createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'ui_loading',
        message: '正在生成交互 UI',
      },
    } as never)

    await Promise.resolve()

    expect(currentAssistantLoadingText.value).toBe('正在生成交互 UI')
    expect(applyChatMessages).toHaveBeenCalledWith(chatMessages.value)
  })

  it('shows world graph context loading through the shared ui loading channel', async () => {
    const { chatServiceConfig, chatMessages, currentAssistantLoadingText, applyChatMessages } =
      createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'ui_loading',
        message: '正在分析世界图谱',
      },
    } as never)

    await Promise.resolve()

    expect(currentAssistantLoadingText.value).toBe('正在分析世界图谱')
    expect(applyChatMessages).toHaveBeenCalledWith(chatMessages.value)
  })

  it('replaces the previous stage when loading switches from ui loading to memory status', async () => {
    const { chatServiceConfig, currentAssistantLoadingText, currentMemoryStatusText } =
      createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'ui_loading',
        message: '正在写回世界图谱',
      },
    } as never)

    await Promise.resolve()

    expect(currentAssistantLoadingText.value).toBe('正在写回世界图谱')
    expect(currentMemoryStatusText.value).toBe('')

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'memory_status',
        status: 'running',
        message: '正在保存会话到数据库',
      },
    } as never)

    await Promise.resolve()

    expect(currentAssistantLoadingText.value).toBe('')
    expect(currentMemoryStatusText.value).toBe('正在保存会话到数据库')
  })

  it('clears loading text when the first response text chunk arrives', async () => {
    vi.useFakeTimers()
    const { chatServiceConfig, currentAssistantLoadingText, applyChatMessages } =
      createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'ui_loading',
        message: '正在分析世界图谱',
      },
    } as never)
    await Promise.resolve()
    applyChatMessages.mockClear()

    const result = chatServiceConfig.value.onMessage?.({
      data: {
        type: 'text',
        text: '正文开始',
      },
    } as never)

    await Promise.resolve()
    await vi.runAllTimersAsync()

    expect(result).toMatchObject({ type: 'markdown', data: '正文开始' })
    expect(currentAssistantLoadingText.value).toBe('')
    expect(applyChatMessages).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('completes the visible response and syncs session state on done', async () => {
    const { chatServiceConfig, completeChatResponse, syncChatResponse } = createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'done',
      },
    } as never)

    await Promise.resolve()

    expect(completeChatResponse).toHaveBeenCalledTimes(1)
    expect(syncChatResponse).toHaveBeenCalledWith({ refreshSession: true })
  })

  it('keeps background_done as a compatibility fallback for legacy servers', async () => {
    const { chatServiceConfig, syncChatResponse } = createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'background_done',
      },
    } as never)

    await Promise.resolve()

    expect(syncChatResponse).toHaveBeenCalledWith({ refreshSession: true })
  })

  it('stores internal story outline updates without rendering them as chat content', async () => {
    const { chatServiceConfig, applyStoryOutline } = createStreamingTestContext()

    const result = chatServiceConfig.value.onMessage?.({
      data: {
        type: 'story_outline',
        storyOutline: '本轮先推进角色冲突，再落到对话回应。',
      },
    } as never)

    await Promise.resolve()

    expect(result).toBeNull()
    expect(applyStoryOutline).toHaveBeenCalledWith('本轮先推进角色冲突，再落到对话回应。')
  })

  it('does not sync the final session twice when background_done arrives before done', async () => {
    const { chatServiceConfig, completeChatResponse, syncChatResponse } = createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'background_done',
      },
    } as never)

    await Promise.resolve()

    expect(syncChatResponse).toHaveBeenCalledWith({ refreshSession: true })
    expect(completeChatResponse).not.toHaveBeenCalled()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'done',
      },
    } as never)

    await Promise.resolve()

    expect(completeChatResponse).toHaveBeenCalledTimes(1)
    expect(syncChatResponse).toHaveBeenCalledTimes(1)
  })
})
