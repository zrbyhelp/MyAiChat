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
  ChatSessionMessage,
  NumericComputationItem,
  SessionRobotState,
  SessionMemoryState,
  SessionUsageState,
  MemorySchemaState,
  RobotWorldGraph,
  StructuredMemoryState,
  SuggestionOption,
} from '@/types/ai'

interface UseChatStreamingOptions {
  beginInteractionLock: () => void
  sessionId: Ref<string>
  activeModelConfig: ComputedRef<AIModelConfigItem>
  currentModelLabel: ComputedRef<string>
  modelConfigs: Ref<AIModelConfigItem[]>
  sessionRobot: SessionRobotState
  currentSessionMemory: SessionMemoryState
  currentMemorySchema: MemorySchemaState
  currentStructuredMemory: StructuredMemoryState
  currentNumericState: Ref<Record<string, unknown>>
  currentSessionWorldGraph: Ref<RobotWorldGraph | null>
  rawChatMessages: Ref<ChatRenderMessage[]>
  effectiveStream: ComputedRef<boolean>
  effectiveThinking: ComputedRef<boolean>
  cloneNumericComputationItems: (items?: NumericComputationItem[] | null) => NumericComputationItem[]
  applyNumericState: (value?: Record<string, unknown> | null) => void
  applySessionUsage: (usage?: Partial<SessionUsageState> | null) => void
  applyStructuredMemory: (memory?: Partial<StructuredMemoryState> | null) => void
  applySessionWorldGraph: (graph?: RobotWorldGraph | null) => void
  serializeChatMessages: (messages: ChatRenderMessage[]) => ChatSessionMessage[]
  completeChatResponse: () => void
  syncChatResponse: (options?: { refreshSession?: boolean }) => void
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

export function useChatStreaming(options: UseChatStreamingOptions) {
  function formatChatErrorMessage(error?: unknown) {
    const robotName = String(options.sessionRobot.name || '').trim() || '当前智能体'
    const rawMessage = error instanceof Error ? String(error.message || '').trim() : ''
    if (/连接中断|请求失败/.test(rawMessage) && rawMessage.includes(`智能体「${robotName}」`)) {
      return rawMessage.startsWith('聊天失败：') ? rawMessage : `聊天失败：${rawMessage}`
    }
    if (/terminated|abort|aborted|UND_ERR_SOCKET|socket|stream/i.test(rawMessage)) {
      return `聊天失败：智能体「${robotName}」连接中断`
    }
    if (rawMessage) {
      return `聊天失败：智能体「${robotName}」请求失败`
    }
    return `聊天失败：智能体「${robotName}」请求失败`
  }

  function resolveModelConfig(modelConfigId?: string | null) {
    const targetId = String(modelConfigId || '').trim()
    if (!targetId) {
      return options.activeModelConfig.value
    }

    return (
      options.modelConfigs.value.find((item) => item.id === targetId) ??
      options.activeModelConfig.value
    )
  }

  function buildAuxiliaryModelConfig(
    kind: 'memory' | 'numeric_computation' | 'world_graph',
    modelConfigId?: string | null,
  ) {
    const targetId = String(modelConfigId || '').trim()
    const resolved = resolveModelConfig(targetId)

    return {
      kind,
      model_config_id: targetId,
      provider: resolved.provider,
      base_url: resolved.baseUrl,
      api_key: resolved.apiKey,
      model: resolved.model,
      temperature: typeof resolved.temperature === 'number' ? resolved.temperature : 0.7,
      fallback_to_primary: !targetId || resolved.id === options.activeModelConfig.value.id,
    }
  }

  const chatServiceConfig = computed<ChatServiceConfig>(() => ({
    endpoint: '/api/chat/stream',
    stream: true,
    onRequest: async (params) => {
      options.beginInteractionLock()
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
          modelConfigs: options.modelConfigs.value,
          persistToServer: options.currentSessionMemory.persistToServer,
          systemPrompt: options.sessionRobot.systemPrompt,
          robot: {
            id: options.sessionRobot.id,
            name: options.sessionRobot.name,
            avatar: options.sessionRobot.avatar,
            commonPrompt: options.sessionRobot.commonPrompt,
            systemPrompt: options.sessionRobot.systemPrompt,
            memoryModelConfigId: options.sessionRobot.memoryModelConfigId,
            numericComputationModelConfigId: options.sessionRobot.numericComputationModelConfigId,
            worldGraphModelConfigId: options.sessionRobot.worldGraphModelConfigId,
            numericComputationEnabled: options.sessionRobot.numericComputationEnabled,
            numericComputationPrompt: options.sessionRobot.numericComputationPrompt,
            numericComputationItems: options.cloneNumericComputationItems(options.sessionRobot.numericComputationItems),
            structuredMemoryInterval: options.sessionRobot.structuredMemoryInterval,
            structuredMemoryHistoryLimit: options.sessionRobot.structuredMemoryHistoryLimit,
          },
          auxiliaryModelConfigs: {
            memory: buildAuxiliaryModelConfig('memory', options.sessionRobot.memoryModelConfigId),
            numericComputation: buildAuxiliaryModelConfig(
              'numeric_computation',
              options.sessionRobot.numericComputationModelConfigId,
            ),
            worldGraph: buildAuxiliaryModelConfig('world_graph', options.sessionRobot.worldGraphModelConfigId),
          },
          sessionSnapshot: {
            id: options.sessionId.value,
            title: '',
            preview: '',
            createdAt: '',
            updatedAt: '',
            persistToServer: options.currentSessionMemory.persistToServer,
            robot: {
              ...options.sessionRobot,
            },
            modelConfigId: options.activeModelConfig.value.id,
            modelLabel: options.currentModelLabel.value,
            threadId: options.sessionId.value,
            messages: options.serializeChatMessages(options.rawChatMessages.value),
            memory: options.currentSessionMemory,
            memorySchema: options.currentMemorySchema,
            structuredMemory: options.currentStructuredMemory,
            numericState: options.currentNumericState.value,
            worldGraph: options.currentSessionWorldGraph.value,
            usage: {
              promptTokens: 0,
              completionTokens: 0,
            },
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
        options.completeChatResponse()
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
        if (options.currentAssistantLoadingText.value) {
          options.currentAssistantLoadingText.value = ''
          nextTick(() => {
            options.applyChatMessages(options.chatMessages.value)
          })
        }
        return { type: 'markdown', strategy: 'merge', data: payload.text }
      }
      if (payload.type === 'ui_loading' && payload.message) {
        options.currentAssistantLoadingText.value = payload.message || '正在生成交互 UI'
        nextTick(() => {
          options.applyChatMessages(options.chatMessages.value)
        })
        return null
      }
      if (payload.type === 'suggestion' && payload.items?.length) {
        options.currentAssistantLoadingText.value = ''
        options.pendingAssistantSuggestions.value = payload.items
        options.pendingAssistantForm.value = null
        nextTick(() => {
          options.flushPendingAssistantStructuredContent()
        })
        return null
      }
      if (payload.type === 'form' && payload.form?.fields?.length) {
        options.currentAssistantLoadingText.value = ''
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
        nextTick(() => {
          options.applyChatMessages(options.chatMessages.value)
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
      if (payload.type === 'structured_memory' && payload.memory) {
        options.applyStructuredMemory(payload.memory)
        return null
      }
      if (payload.type === 'numeric_state_updated' && payload.state) {
        options.applyNumericState(payload.state)
        return null
      }
      if (payload.type === 'session_world_graph') {
        options.applySessionWorldGraph(payload.graph || null)
        return null
      }
      if (payload.type === 'done') {
        nextTick(() => {
          options.completeChatResponse()
        })
      }
      if (payload.type === 'background_done') {
        nextTick(() => {
          options.syncChatResponse({
            refreshSession: options.currentSessionMemory.persistToServer,
          })
        })
      }
      return null
    },
    onAbort: async () => {
      options.completeChatResponse()
    },
    onError: (error) => {
      options.completeChatResponse()
      MessagePlugin.error(formatChatErrorMessage(error))
    },
  }))

  return {
    chatServiceConfig,
  }
}
