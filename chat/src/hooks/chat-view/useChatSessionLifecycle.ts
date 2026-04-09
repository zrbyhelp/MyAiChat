import { nextTick, type Ref } from 'vue'

import { DEFAULT_REPLY_MODE } from '@/hooks/chat-view/replyMode'
import { getRobotWorldGraph, getSession, upsertSession } from '@/lib/api'
import type {
  AIModelConfigItem,
  AIRobotCard,
  ChatSessionDetail,
  MemorySchemaState,
  ReplyMode,
  SessionMemoryState,
  SessionRobotState,
  SessionUsageState,
  StoryOutlineState,
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
  currentStoryOutline: Ref<StoryOutlineState>
  currentReplyMode: Ref<ReplyMode>
  activeModelConfig: Ref<AIModelConfigItem>
  currentModelLabel: Ref<string>
  activeModelConfigId: Ref<string>
  modelConfigs: Ref<AIModelConfigItem[]>
  applySessionMemory: (memory?: Partial<SessionMemoryState> | null) => void
  applyMemorySchema: (schema?: Partial<MemorySchemaState> | null) => void
  applyStructuredMemory: (memory?: Partial<StructuredMemoryState> | null) => void
  applySessionUsage: (usage?: Partial<SessionUsageState> | null) => void
  applyStoryOutline: (value?: Partial<StoryOutlineState> | null) => void
  applySessionWorldGraph: (graph?: import('@/types/ai').RobotWorldGraph | null) => void
  applyReplyMode: (mode?: ReplyMode | null) => void
  applyChatMessages: (messages: ChatRenderMessage[]) => void
  loadCapabilities: () => Promise<void>
  normalizeSessionMessages: (session: ChatSessionDetail) => ChatRenderMessage[]
  defaultMemorySchema: MemorySchemaState
  defaultSessionMemory: SessionMemoryState
  defaultStructuredMemory: StructuredMemoryState
  defaultSessionUsage: SessionUsageState
}

export function useChatSessionLifecycle(options: UseChatSessionLifecycleOptions) {
  function cloneWorldGraph(graph?: import('@/types/ai').RobotWorldGraph | null) {
    return graph ? JSON.parse(JSON.stringify(graph)) as import('@/types/ai').RobotWorldGraph : null
  }

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
      options.applyStoryOutline(session.storyOutline || null)
      options.applySessionWorldGraph(session.worldGraph || null)
      options.applyReplyMode(session.replyMode)
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
        worldGraphModelConfigId: options.sessionRobot.worldGraphModelConfigId,
      },
      memory: options.currentSessionMemory,
      storyOutline: options.currentStoryOutline.value,
      modelConfigId: options.activeModelConfig.value.id,
      modelLabel: options.currentModelLabel.value,
      replyMode: options.currentReplyMode.value,
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
    options.applyStoryOutline(response.session.storyOutline || null)
    options.applySessionWorldGraph(response.session.worldGraph || null)
    options.applyReplyMode(response.session.replyMode)
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
    options.sessionRobot.worldGraphModelConfigId = session.robot.worldGraphModelConfigId || ''

    options.applySessionMemory(session.memory)
    options.applyMemorySchema(session.memorySchema)
    options.applyStructuredMemory(session.structuredMemory)
    options.applySessionUsage(session.usage)
    options.applyStoryOutline(session.storyOutline || null)
    options.applySessionWorldGraph(session.worldGraph || null)
    options.applyReplyMode(session.replyMode)
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
    let nextWorldGraph = cloneWorldGraph(robot?.worldGraph || null)

    if (robot) {
      options.sessionRobot.id = robot.id
      options.sessionRobot.name = robot.name.trim() || '当前智能体'
      options.sessionRobot.avatar = robot.avatar || ''
      options.sessionRobot.commonPrompt = robot.commonPrompt
      options.sessionRobot.systemPrompt = robot.systemPrompt
      options.sessionRobot.memoryModelConfigId = robot.memoryModelConfigId || ''
      options.sessionRobot.outlineModelConfigId = robot.outlineModelConfigId || ''
      options.sessionRobot.knowledgeRetrievalModelConfigId = robot.knowledgeRetrievalModelConfigId || ''
      options.sessionRobot.worldGraphModelConfigId = robot.worldGraphModelConfigId || ''
      options.applyMemorySchema(robot.memorySchema)
      if (robot.persistToServer && robot.id) {
        try {
          nextWorldGraph = cloneWorldGraph(await getRobotWorldGraph(robot.id))
        } catch {
          nextWorldGraph = cloneWorldGraph(robot.worldGraph || null)
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
      options.sessionRobot.worldGraphModelConfigId = ''
      options.applyMemorySchema(options.defaultMemorySchema)
    }

    options.applySessionMemory({
      ...options.defaultSessionMemory,
      persistToServer: true,
    })
    options.applyStructuredMemory(options.defaultStructuredMemory)
    options.applySessionUsage(options.defaultSessionUsage)
    options.applyStoryOutline(null)
    options.applySessionWorldGraph(cloneWorldGraph(nextWorldGraph))
    options.applyReplyMode(DEFAULT_REPLY_MODE)

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
