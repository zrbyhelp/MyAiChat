import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import type { ChatPromptSource } from '@/hooks/chat-view/replyMode'
import { useChatStreaming } from './useChatStreaming'
import type { ChatRenderMessage } from './useChatView.types'
import type { ReplyMode, RobotWorldGraph, StoryOutlineState } from '@/types/ai'

function createStreamingTestContext(options?: {
  replyMode?: ReplyMode
  pendingSendSource?: ChatPromptSource
}) {
  const beginInteractionLock = vi.fn()
  const applyChatMessages = vi.fn()
  const completeChatResponse = vi.fn()
  const syncChatResponse = vi.fn()
  const flushPendingAssistantStructuredContent = vi.fn()
  const flushPendingAssistantMemoryStatus = vi.fn()
  const applySessionUsage = vi.fn()
  const applyStructuredMemory = vi.fn()
  const applyStoryOutline = vi.fn()
  const applySessionWorldGraph = vi.fn()
  const serializeChatMessages = vi.fn().mockReturnValue([])
  const currentStoryOutline = ref<StoryOutlineState>({
    storyDraft: {
      characters: [],
      items: [],
      organizations: [],
      locations: [],
      events: [],
    },
    retrievalQuery: '',
  })
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
  const currentReplyMode = ref<ReplyMode>(options?.replyMode || 'default')
  const consumePendingSendSource = vi.fn(() => options?.pendingSendSource || 'manual')

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
      worldGraphModelConfigId: '',
    },
    currentSessionMemory: {
      summary: '',
      updatedAt: '',
      sourceMessageCount: 0,
      persistToServer: true,
      threshold: 20,
      recentMessageLimit: 10,
      prompt: '',
    },
    currentMemorySchema: {
      categories: [],
    },
    currentStructuredMemory: {
      updatedAt: '',
      longTermMemory: '',
      shortTermMemory: '',
    },
    currentStoryOutline,
    currentSessionWorldGraph,
    currentReplyMode,
    rawChatMessages: ref([]),
    effectiveStream: computed(() => true),
    effectiveThinking: computed(() => false),
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
    consumePendingSendSource,
    flushPendingAssistantStructuredContent,
    flushPendingAssistantMemoryStatus,
  })

  return {
    chatServiceConfig,
    consumePendingSendSource,
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
  it('keeps the raw prompt unchanged in default manual mode', async () => {
    const { chatServiceConfig, consumePendingSendSource } = createStreamingTestContext()

    const request = await chatServiceConfig.value.onRequest?.({ prompt: '原始输入' } as never)
    const body = JSON.parse(String(request?.body || '{}'))

    expect(body.prompt).toBe('原始输入')
    expect(body.originalPrompt).toBe('原始输入')
    expect(body.replyMode).toBe('default')
    expect(consumePendingSendSource).toHaveBeenCalledTimes(1)
  })

  it('prefixes the prompt for manual story guidance mode while keeping the original prompt', async () => {
    const { chatServiceConfig } = createStreamingTestContext({
      replyMode: 'story_guidance',
      pendingSendSource: 'manual',
    })

    const request = await chatServiceConfig.value.onRequest?.({ prompt: '让她先离开祭坛' } as never)
    const body = JSON.parse(String(request?.body || '{}'))

    expect(body.originalPrompt).toBe('让她先离开祭坛')
    expect(body.replyMode).toBe('story_guidance')
    expect(body.prompt).toContain('请将以下输入严格视为作者对剧情走向的幕后引导')
    expect(body.prompt).toContain('让她先离开祭坛')
  })

  it('does not prefix suggestion or form sends even when the reply mode is not default', async () => {
    const suggestionContext = createStreamingTestContext({
      replyMode: 'protagonist_speech',
      pendingSendSource: 'suggestion',
    })
    const suggestionRequest = await suggestionContext.chatServiceConfig.value.onRequest?.({
      prompt: '建议按钮内容',
    } as never)
    const suggestionBody = JSON.parse(String(suggestionRequest?.body || '{}'))

    expect(suggestionBody.prompt).toBe('建议按钮内容')
    expect(suggestionBody.originalPrompt).toBe('建议按钮内容')
    expect(suggestionBody.replyMode).toBe('protagonist_speech')

    const formContext = createStreamingTestContext({
      replyMode: 'story_guidance',
      pendingSendSource: 'form',
    })
    const formRequest = await formContext.chatServiceConfig.value.onRequest?.({
      prompt: '表单提交内容',
    } as never)
    const formBody = JSON.parse(String(formRequest?.body || '{}'))

    expect(formBody.prompt).toBe('表单提交内容')
    expect(formBody.originalPrompt).toBe('表单提交内容')
    expect(formBody.replyMode).toBe('story_guidance')
  })

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

  it('does not refresh chat messages again when the same ui loading text repeats', async () => {
    const { chatServiceConfig, chatMessages, applyChatMessages } = createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'ui_loading',
        message: '正在分析世界图谱',
      },
    } as never)

    await Promise.resolve()
    expect(applyChatMessages).toHaveBeenCalledTimes(1)
    expect(applyChatMessages).toHaveBeenCalledWith(chatMessages.value)

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'ui_loading',
        message: '正在分析世界图谱',
      },
    } as never)

    await Promise.resolve()
    expect(applyChatMessages).toHaveBeenCalledTimes(1)
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

  it('does not refresh chat messages again when the same memory status repeats', async () => {
    const { chatServiceConfig, applyChatMessages } = createStreamingTestContext()

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'memory_status',
        status: 'running',
        message: '正在保存会话到数据库',
      },
    } as never)

    await Promise.resolve()
    expect(applyChatMessages).toHaveBeenCalledTimes(1)

    chatServiceConfig.value.onMessage?.({
      data: {
        type: 'memory_status',
        status: 'running',
        message: '正在保存会话到数据库',
      },
    } as never)

    await Promise.resolve()
    expect(applyChatMessages).toHaveBeenCalledTimes(1)
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
