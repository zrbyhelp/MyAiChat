import { nextTick, type Ref } from 'vue'

import { getSession, upsertSession } from '@/lib/api'
import type {
  AIModelConfigItem,
  AIRobotCard,
  ChatSessionDetail,
  MemorySchemaState,
  NumericComputationItem,
  SessionMemoryState,
  SessionRobotState,
  SessionUsageState,
  StructuredMemoryState,
} from '@/types/ai'

import type { ChatRenderMessage } from './useChatView.types'

interface UseChatSessionLifecycleOptions {
  sessionId: Ref<string>
  createSessionId: () => string
  storeActiveSessionId: (value: string) => void
  refreshSessionHistory: () => Promise<void>
  sessionRobot: SessionRobotState
  currentSessionMemory: SessionMemoryState
  currentMemorySchema: MemorySchemaState
  activeModelConfig: Ref<AIModelConfigItem>
  currentModelLabel: Ref<string>
  activeModelConfigId: Ref<string>
  modelConfigs: Ref<AIModelConfigItem[]>
  cloneNumericComputationItems: (items?: NumericComputationItem[] | null) => NumericComputationItem[]
  applySessionMemory: (memory?: Partial<SessionMemoryState> | null) => void
  applyMemorySchema: (schema?: Partial<MemorySchemaState> | null) => void
  applyStructuredMemory: (memory?: Partial<StructuredMemoryState> | null) => void
  applySessionUsage: (usage?: Partial<SessionUsageState> | null) => void
  applyChatMessages: (messages: ChatRenderMessage[]) => void
  loadCapabilities: () => Promise<void>
  normalizeSessionMessages: (session: ChatSessionDetail) => ChatRenderMessage[]
  defaultStructuredMemoryInterval: number
  defaultStructuredMemoryHistoryLimit: number
  defaultMemorySchema: MemorySchemaState
  defaultSessionMemory: SessionMemoryState
  defaultStructuredMemory: StructuredMemoryState
  defaultSessionUsage: SessionUsageState
}

export function useChatSessionLifecycle(options: UseChatSessionLifecycleOptions) {
  async function refreshCurrentSessionState() {
    if (!options.sessionId.value) {
      return
    }

    try {
      const response = await getSession(options.sessionId.value)
      options.applySessionMemory(response.session.memory)
      options.applyMemorySchema(response.session.memorySchema)
      options.applyStructuredMemory(response.session.structuredMemory)
      options.applySessionUsage(response.session.usage)
    } catch {
      // 忽略短暂刷新失败，保留当前状态。
    }
  }

  async function syncCurrentSessionMeta() {
    const response = await upsertSession({
      id: options.sessionId.value,
      robot: {
        name: options.sessionRobot.name,
        avatar: options.sessionRobot.avatar,
        commonPrompt: options.sessionRobot.commonPrompt,
        systemPrompt: options.sessionRobot.systemPrompt,
        numericComputationEnabled: options.sessionRobot.numericComputationEnabled,
        numericComputationPrompt: options.sessionRobot.numericComputationPrompt,
        numericComputationItems: options.cloneNumericComputationItems(
          options.sessionRobot.numericComputationItems,
        ),
        structuredMemoryInterval: options.sessionRobot.structuredMemoryInterval,
        structuredMemoryHistoryLimit: options.sessionRobot.structuredMemoryHistoryLimit,
      },
      memory: options.currentSessionMemory,
      modelConfigId: options.activeModelConfig.value.id,
      modelLabel: options.currentModelLabel.value,
      memorySchema: options.currentMemorySchema,
    })

    options.storeActiveSessionId(response.session.id)
    options.sessionId.value = response.session.id
    options.applySessionMemory(response.session.memory)
    options.applyMemorySchema(response.session.memorySchema)
    options.applyStructuredMemory(response.session.structuredMemory)
    options.applySessionUsage(response.session.usage)
    await options.refreshSessionHistory()
  }

  async function hydrateSession(session: ChatSessionDetail) {
    options.sessionId.value = session.id
    options.sessionRobot.name = session.robot.name || '当前智能体'
    options.sessionRobot.avatar = session.robot.avatar || ''
    options.sessionRobot.commonPrompt = session.robot.commonPrompt || ''
    options.sessionRobot.systemPrompt = session.robot.systemPrompt || ''
    options.sessionRobot.numericComputationEnabled = Boolean(session.robot.numericComputationEnabled)
    options.sessionRobot.numericComputationPrompt = session.robot.numericComputationPrompt || ''
    options.sessionRobot.numericComputationItems = options.cloneNumericComputationItems(
      session.robot.numericComputationItems,
    )
    options.sessionRobot.structuredMemoryInterval =
      session.robot.structuredMemoryInterval || options.defaultStructuredMemoryInterval
    options.sessionRobot.structuredMemoryHistoryLimit =
      session.robot.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit

    options.applySessionMemory(session.memory)
    options.applyMemorySchema(session.memorySchema)
    options.applyStructuredMemory(session.structuredMemory)
    options.applySessionUsage(session.usage)
    options.storeActiveSessionId(session.id)

    if (
      session.modelConfigId &&
      session.modelConfigId !== options.activeModelConfigId.value &&
      options.modelConfigs.value.some((item) => item.id === session.modelConfigId)
    ) {
      options.activeModelConfigId.value = session.modelConfigId
      await options.loadCapabilities()
    }

    await nextTick()
    options.applyChatMessages(options.normalizeSessionMessages(session))
  }

  async function createNewChat(robot?: AIRobotCard | null) {
    if (robot) {
      options.sessionRobot.name = robot.name.trim() || '当前智能体'
      options.sessionRobot.avatar = robot.avatar || ''
      options.sessionRobot.commonPrompt = robot.commonPrompt
      options.sessionRobot.systemPrompt = robot.systemPrompt
      options.sessionRobot.numericComputationEnabled = Boolean(robot.numericComputationEnabled)
      options.sessionRobot.numericComputationPrompt = robot.numericComputationPrompt
      options.sessionRobot.numericComputationItems = options.cloneNumericComputationItems(
        robot.numericComputationItems,
      )
      options.sessionRobot.structuredMemoryInterval =
        robot.structuredMemoryInterval || options.defaultStructuredMemoryInterval
      options.sessionRobot.structuredMemoryHistoryLimit =
        robot.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit
      options.applyMemorySchema(robot.memorySchema)
    } else {
      options.sessionRobot.name = '当前智能体'
      options.sessionRobot.avatar = ''
      options.sessionRobot.commonPrompt = ''
      options.sessionRobot.systemPrompt = ''
      options.sessionRobot.numericComputationEnabled = false
      options.sessionRobot.numericComputationPrompt = ''
      options.sessionRobot.numericComputationItems = []
      options.sessionRobot.structuredMemoryInterval = options.defaultStructuredMemoryInterval
      options.sessionRobot.structuredMemoryHistoryLimit = options.defaultStructuredMemoryHistoryLimit
      options.applyMemorySchema(options.defaultMemorySchema)
    }

    options.applySessionMemory({
      ...options.defaultSessionMemory,
      structuredMemoryInterval:
        robot?.structuredMemoryInterval || options.defaultStructuredMemoryInterval,
      structuredMemoryHistoryLimit:
        robot?.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit,
    })
    options.applyStructuredMemory(options.defaultStructuredMemory)
    options.applySessionUsage(options.defaultSessionUsage)

    options.sessionId.value = options.createSessionId()
    options.storeActiveSessionId(options.sessionId.value)
    await nextTick()
    options.applyChatMessages([])
    await syncCurrentSessionMeta()
  }

  return {
    refreshCurrentSessionState,
    syncCurrentSessionMeta,
    hydrateSession,
    createNewChat,
  }
}
