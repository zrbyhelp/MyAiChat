import type { AIMessageContent, ChatServiceConfig, SSEChunkData } from '@tdesign-vue-next/chat'
import { MessagePlugin } from 'tdesign-vue-next'
import { computed, nextTick, type ComputedRef, type Ref } from 'vue'

import type {
  ChatRenderMessage,
  MemoryStatusState,
  NormalizedStreamPayload,
} from '@/hooks/chat-view/useChatView.types'
import type {
  AIFormSchema,
  AIModelConfigItem,
  NumericComputationItem,
  SessionRobotState,
  SessionUsageState,
  StructuredMemoryState,
  SuggestionOption,
} from '@/types/ai'

interface UseChatStreamingOptions {
  sessionId: Ref<string>
  activeModelConfig: ComputedRef<AIModelConfigItem>
  currentModelLabel: ComputedRef<string>
  sessionRobot: SessionRobotState
  effectiveStream: ComputedRef<boolean>
  effectiveThinking: ComputedRef<boolean>
  cloneNumericComputationItems: (items?: NumericComputationItem[] | null) => NumericComputationItem[]
  applySessionUsage: (usage?: Partial<SessionUsageState> | null) => void
  applyStructuredMemory: (memory?: Partial<StructuredMemoryState> | null) => void
  finalizeChatResponse: (options?: { refreshSession?: boolean }) => void
  currentAssistantLoadingText: Ref<string>
  currentMemoryStatusText: Ref<string>
  pendingAssistantSuggestions: Ref<SuggestionOption[] | null>
  pendingAssistantForm: Ref<AIFormSchema | null>
  pendingAssistantMemoryStatus: Ref<MemoryStatusState | null>
  chatMessages: Ref<ChatRenderMessage[]>
  applyChatMessages: (messages: ChatRenderMessage[]) => void
  flushPendingAssistantStructuredContent: () => void
  flushPendingAssistantMemoryStatus: () => void
}

function createThinkingChunk(text: string, done = false): AIMessageContent {
  return {
    type: 'thinking',
    strategy: 'merge',
    status: done ? 'complete' : 'streaming',
    data: {
      title: done ? '深度思考已完成' : '思考中',
      text,
    },
  } as AIMessageContent
}

function createAgentStatusChunk(title: string, text: string): AIMessageContent {
  return {
    type: 'thinking',
    strategy: 'merge',
    status: 'streaming',
    data: {
      title,
      text: `${text}\n`,
    },
  } as AIMessageContent
}

export function useChatStreaming(options: UseChatStreamingOptions) {
  const chatServiceConfig = computed<ChatServiceConfig>(() => ({
    endpoint: '/api/chat/stream',
    stream: true,
    onRequest: async (params) => {
      return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: options.sessionId.value,
          provider: options.activeModelConfig.value.provider,
          baseUrl: options.activeModelConfig.value.baseUrl,
          apiKey: options.activeModelConfig.value.apiKey,
          model: options.activeModelConfig.value.model,
          modelConfigId: options.activeModelConfig.value.id,
          modelLabel: options.currentModelLabel.value,
          systemPrompt: options.sessionRobot.systemPrompt,
          robot: {
            name: options.sessionRobot.name,
            avatar: options.sessionRobot.avatar,
            systemPrompt: options.sessionRobot.systemPrompt,
            numericComputationEnabled: options.sessionRobot.numericComputationEnabled,
            numericComputationPrompt: options.sessionRobot.numericComputationPrompt,
            numericComputationItems: options.cloneNumericComputationItems(options.sessionRobot.numericComputationItems),
            structuredMemoryInterval: options.sessionRobot.structuredMemoryInterval,
            structuredMemoryHistoryLimit: options.sessionRobot.structuredMemoryHistoryLimit,
          },
          stream: options.effectiveStream.value,
          thinking: options.effectiveThinking.value,
          temperature: options.activeModelConfig.value.temperature,
          prompt: params.prompt ?? '',
        }),
      }
    },
    onMessage: (chunk: SSEChunkData): AIMessageContent | null => {
      const payload = chunk.data as NormalizedStreamPayload
      if (payload.type === 'error') {
        options.finalizeChatResponse()
        MessagePlugin.error(payload.message || '聊天失败')
        return null
      }
      if (payload.type === 'reasoning' && payload.text) {
        return createThinkingChunk(payload.text)
      }
      if (payload.type === 'reasoning_done' && payload.text) {
        return createThinkingChunk(payload.text, true)
      }
      if (payload.type === 'text' && payload.text) {
        return { type: 'markdown', strategy: 'merge', data: payload.text }
      }
      if (payload.type === 'ui_loading' && payload.message) {
        options.currentAssistantLoadingText.value = payload.message || '正在生成交互 UI'
        options.applyChatMessages(options.chatMessages.value)
        return null
      }
      if (payload.type === 'suggestion' && payload.items?.length) {
        options.currentAssistantLoadingText.value = ''
        options.applyChatMessages(options.chatMessages.value)
        options.pendingAssistantSuggestions.value = payload.items
        options.pendingAssistantForm.value = null
        nextTick(() => {
          options.flushPendingAssistantStructuredContent()
        })
        return null
      }
      if (payload.type === 'form' && payload.form?.fields?.length) {
        options.currentAssistantLoadingText.value = ''
        options.applyChatMessages(options.chatMessages.value)
        if (!options.pendingAssistantSuggestions.value?.length) {
          options.pendingAssistantForm.value = payload.form
        }
        nextTick(() => {
          options.flushPendingAssistantStructuredContent()
        })
        return null
      }
      if (payload.type === 'memory_status' && payload.message) {
        options.pendingAssistantMemoryStatus.value = {
          status: payload.status || 'running',
          text: payload.message,
        }
        options.currentMemoryStatusText.value = payload.message
        options.applyChatMessages(options.chatMessages.value)
        nextTick(() => {
          options.flushPendingAssistantMemoryStatus()
        })
        return null
      }
      if (payload.type === 'usage') {
        options.applySessionUsage({
          promptTokens: payload.promptTokens,
          completionTokens: payload.completionTokens,
        })
        return null
      }
      if (payload.type === 'agent_turn' && payload.message) {
        return null
      }
      if (payload.type === 'tool_status') {
        const summary = payload.toolType === 'tool_call'
          ? `调用工具 ${payload.tool || ''} ${payload.query || payload.url || ''}`.trim()
          : `工具结果 ${payload.tool || ''} 已返回`
        return createAgentStatusChunk('Tool', summary)
      }
      if (payload.type === 'structured_memory' && payload.memory) {
        options.applyStructuredMemory(payload.memory)
        return null
      }
      if (payload.type === 'done') {
        nextTick(() => {
          options.finalizeChatResponse({ refreshSession: true })
        })
      }
      return null
    },
    onAbort: async () => {
      options.finalizeChatResponse()
    },
    onError: (error) => {
      options.finalizeChatResponse()
      MessagePlugin.error(error instanceof Error ? error.message : '聊天失败')
    },
  }))

  return {
    chatServiceConfig,
  }
}
