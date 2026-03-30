import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { useChatStreaming } from './useChatStreaming'
import type { ChatRenderMessage } from './useChatView.types'
import type { RobotWorldGraph } from '@/types/ai'

function createStreamingTestContext() {
  const beginInteractionLock = vi.fn()
  const applyChatMessages = vi.fn()
  const finalizeChatResponse = vi.fn()
  const flushPendingAssistantStructuredContent = vi.fn()
  const flushPendingAssistantMemoryStatus = vi.fn()
  const applyNumericState = vi.fn()
  const applySessionUsage = vi.fn()
  const applyStructuredMemory = vi.fn()
  const applySessionWorldGraph = vi.fn()
  const cloneNumericComputationItems = vi.fn().mockReturnValue([])
  const serializeChatMessages = vi.fn().mockReturnValue([])
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
      numericComputationModelConfigId: '',
      formOptionModelConfigId: '',
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
      persistToServer: false,
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
    currentSessionWorldGraph,
    rawChatMessages: ref([]),
    effectiveStream: computed(() => true),
    effectiveThinking: computed(() => false),
    cloneNumericComputationItems,
    applyNumericState,
    applySessionUsage,
    applyStructuredMemory,
    applySessionWorldGraph,
    serializeChatMessages,
    finalizeChatResponse,
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
    applyChatMessages,
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

  it('clears loading text when the first response text chunk arrives', async () => {
    const { chatServiceConfig, chatMessages, currentAssistantLoadingText, applyChatMessages } =
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

    expect(result).toMatchObject({ type: 'markdown', data: '正文开始' })
    expect(currentAssistantLoadingText.value).toBe('')
    expect(applyChatMessages).toHaveBeenCalledWith(chatMessages.value)
  })
})
