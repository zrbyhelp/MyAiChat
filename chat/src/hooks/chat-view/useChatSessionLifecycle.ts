import { nextTick, type Ref } from 'vue'

import { getRobotWorldGraph, getSession, upsertSession } from '@/lib/api'
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
  loadSessionRecord: (sessionId: string) => Promise<ChatSessionDetail | null>
  buildCurrentSessionDetail: () => ChatSessionDetail
  sessionRobot: SessionRobotState
  currentSessionMemory: SessionMemoryState
  currentMemorySchema: MemorySchemaState
  currentStoryOutline: Ref<string>
  activeModelConfig: Ref<AIModelConfigItem>
  currentModelLabel: Ref<string>
  activeModelConfigId: Ref<string>
  modelConfigs: Ref<AIModelConfigItem[]>
  cloneNumericComputationItems: (items?: NumericComputationItem[] | null) => NumericComputationItem[]
  applySessionMemory: (memory?: Partial<SessionMemoryState> | null) => void
  applyMemorySchema: (schema?: Partial<MemorySchemaState> | null) => void
  applyStructuredMemory: (memory?: Partial<StructuredMemoryState> | null) => void
  applySessionUsage: (usage?: Partial<SessionUsageState> | null) => void
  applyNumericState: (value?: Record<string, unknown> | null) => void
  applyStoryOutline: (value?: string | null) => void
  applySessionWorldGraph: (graph?: import('@/types/ai').RobotWorldGraph | null) => void
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
      const session = (await getSession(options.sessionId.value)).session
      if (!session) {
        return
      }
      options.applySessionMemory(session.memory)
      options.applyMemorySchema(session.memorySchema)
      options.applyStructuredMemory(session.structuredMemory)
      options.applySessionUsage(session.usage)
      options.applyStoryOutline(session.storyOutline || '')
      options.applySessionWorldGraph(session.worldGraph || null)
    } catch {
      // 忽略短暂刷新失败，保留当前状态。
    }
  }

  async function syncCurrentSessionMeta() {
    const response = await upsertSession({
      id: options.sessionId.value,
      robot: {
        id: options.sessionRobot.id,
        name: options.sessionRobot.name,
        avatar: options.sessionRobot.avatar,
        commonPrompt: options.sessionRobot.commonPrompt,
        systemPrompt: options.sessionRobot.systemPrompt,
        memoryModelConfigId: options.sessionRobot.memoryModelConfigId,
        outlineModelConfigId: options.sessionRobot.outlineModelConfigId,
        knowledgeRetrievalModelConfigId: options.sessionRobot.knowledgeRetrievalModelConfigId,
        numericComputationModelConfigId: options.sessionRobot.numericComputationModelConfigId,
        worldGraphModelConfigId: options.sessionRobot.worldGraphModelConfigId,
        numericComputationEnabled: options.sessionRobot.numericComputationEnabled,
        numericComputationPrompt: options.sessionRobot.numericComputationPrompt,
        numericComputationItems: options.cloneNumericComputationItems(
          options.sessionRobot.numericComputationItems,
        ),
        structuredMemoryInterval: options.sessionRobot.structuredMemoryInterval,
        structuredMemoryHistoryLimit: options.sessionRobot.structuredMemoryHistoryLimit,
      },
      memory: options.currentSessionMemory,
      storyOutline: options.currentStoryOutline.value,
      modelConfigId: options.activeModelConfig.value.id,
      modelLabel: options.currentModelLabel.value,
      memorySchema: options.currentMemorySchema,
      worldGraph: options.buildCurrentSessionDetail().worldGraph || null,
      persistToServer: true,
    })

    options.storeActiveSessionId(response.session.id)
    options.sessionId.value = response.session.id
    options.applySessionMemory(response.session.memory)
    options.applyMemorySchema(response.session.memorySchema)
    options.applyStructuredMemory(response.session.structuredMemory)
    options.applySessionUsage(response.session.usage)
    options.applyStoryOutline(response.session.storyOutline || '')
    options.applySessionWorldGraph(response.session.worldGraph || null)
    await options.refreshSessionHistory()
  }

  async function hydrateSession(session: ChatSessionDetail) {
    options.sessionId.value = session.id
    options.sessionRobot.id = session.robot.id || ''
    options.sessionRobot.name = session.robot.name || '当前智能体'
    options.sessionRobot.avatar = session.robot.avatar || ''
    options.sessionRobot.commonPrompt = session.robot.commonPrompt || ''
    options.sessionRobot.systemPrompt = session.robot.systemPrompt || ''
    options.sessionRobot.memoryModelConfigId = session.robot.memoryModelConfigId || ''
    options.sessionRobot.outlineModelConfigId = session.robot.outlineModelConfigId || ''
    options.sessionRobot.knowledgeRetrievalModelConfigId = session.robot.knowledgeRetrievalModelConfigId || ''
    options.sessionRobot.numericComputationModelConfigId = session.robot.numericComputationModelConfigId || ''
    options.sessionRobot.worldGraphModelConfigId = session.robot.worldGraphModelConfigId || ''
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
    options.applyNumericState(session.numericState)
    options.applyStoryOutline(session.storyOutline || '')
    options.applySessionWorldGraph(session.worldGraph || null)
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
    let nextWorldGraph = robot?.worldGraph || null

    if (robot) {
      options.sessionRobot.id = robot.id
      options.sessionRobot.name = robot.name.trim() || '当前智能体'
      options.sessionRobot.avatar = robot.avatar || ''
      options.sessionRobot.commonPrompt = robot.commonPrompt
      options.sessionRobot.systemPrompt = robot.systemPrompt
      options.sessionRobot.memoryModelConfigId = robot.memoryModelConfigId || ''
      options.sessionRobot.outlineModelConfigId = robot.outlineModelConfigId || ''
      options.sessionRobot.knowledgeRetrievalModelConfigId = robot.knowledgeRetrievalModelConfigId || ''
      options.sessionRobot.numericComputationModelConfigId = robot.numericComputationModelConfigId || ''
      options.sessionRobot.worldGraphModelConfigId = robot.worldGraphModelConfigId || ''
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
      if (robot.persistToServer && robot.id) {
        try {
          nextWorldGraph = await getRobotWorldGraph(robot.id)
        } catch {
          nextWorldGraph = robot.worldGraph || null
        }
      }
    } else {
      options.sessionRobot.id = ''
      options.sessionRobot.name = '当前智能体'
      options.sessionRobot.avatar = ''
      options.sessionRobot.commonPrompt = ''
      options.sessionRobot.systemPrompt = ''
      options.sessionRobot.memoryModelConfigId = ''
      options.sessionRobot.outlineModelConfigId = ''
      options.sessionRobot.knowledgeRetrievalModelConfigId = ''
      options.sessionRobot.numericComputationModelConfigId = ''
      options.sessionRobot.worldGraphModelConfigId = ''
      options.sessionRobot.numericComputationEnabled = false
      options.sessionRobot.numericComputationPrompt = ''
      options.sessionRobot.numericComputationItems = []
      options.sessionRobot.structuredMemoryInterval = options.defaultStructuredMemoryInterval
      options.sessionRobot.structuredMemoryHistoryLimit = options.defaultStructuredMemoryHistoryLimit
      options.applyMemorySchema(options.defaultMemorySchema)
    }

    options.applySessionMemory({
      ...options.defaultSessionMemory,
      persistToServer: true,
      structuredMemoryInterval:
        robot?.structuredMemoryInterval || options.defaultStructuredMemoryInterval,
      structuredMemoryHistoryLimit:
        robot?.structuredMemoryHistoryLimit || options.defaultStructuredMemoryHistoryLimit,
    })
    options.applyStructuredMemory(options.defaultStructuredMemory)
    options.applySessionUsage(options.defaultSessionUsage)
    options.applyNumericState({})
    options.applyStoryOutline('')
    options.applySessionWorldGraph(nextWorldGraph)

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
