import { computed, reactive, ref } from 'vue'

import {
  createFormActivityContent,
  formatMessageDatetime,
} from '@/hooks/chat-view/useChatView.message-utils'
import { DEFAULT_REPLY_MODE, normalizeReplyMode } from '@/hooks/chat-view/replyMode'
import type {
  ChatSessionDetail,
  MemorySchemaField,
  MemorySchemaState,
  ReplyMode,
  RobotWorldGraph,
  SessionMemoryState,
  SessionRobotState,
  SessionUsageState,
  StoryOutlineState,
  StructuredMemoryState,
} from '@/types/ai'

export const DEFAULT_SESSION_MEMORY: SessionMemoryState = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  persistToServer: true,
  threshold: 20,
  recentMessageLimit: 10,
  prompt: [
    '请根据长期记忆、短期记忆、本轮输入和本轮回复更新记忆。',
    '要求：',
    '1. 长期记忆保留稳定有效的设定、关系、偏好、约束和长期目标。',
    '2. 短期记忆保留当前阶段状态、近期推进、待办事项和未解决问题。',
    '3. 两部分都要尽量完整，不要遗漏后续仍会依赖的信息。',
  ].join('\n'),
}

export const DEFAULT_SESSION_USAGE: SessionUsageState = {
  promptTokens: 0,
  completionTokens: 0,
}

export const DEFAULT_STRUCTURED_MEMORY: StructuredMemoryState = {
  updatedAt: '',
  longTermMemory: '',
  shortTermMemory: '',
}

export const DEFAULT_STORY_OUTLINE: StoryOutlineState = {
  storyDraft: {
    characters: [],
    items: [],
    organizations: [],
    locations: [],
    events: [],
  },
  retrievalQuery: '',
}

export function normalizeStoryOutline(storyOutline?: Partial<StoryOutlineState> | null): StoryOutlineState {
  const storyDraft = (storyOutline?.storyDraft || {}) as Partial<StoryOutlineState['storyDraft']>
  const toList = (value?: string[] | null) => (Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [])
  return {
    storyDraft: {
      characters: toList(storyDraft.characters),
      items: toList(storyDraft.items),
      organizations: toList(storyDraft.organizations),
      locations: toList(storyDraft.locations),
      events: toList(storyDraft.events),
    },
    retrievalQuery: typeof storyOutline?.retrievalQuery === 'string' ? storyOutline.retrievalQuery : '',
  }
}

export const DEFAULT_MEMORY_SCHEMA: MemorySchemaState = {
  categories: [
    {
      id: 'preferences',
      label: '用户偏好',
      description: '记录长期偏好和约束',
      extractionInstructions: '提取长期有效的偏好、风格和约束。',
      fields: [
        { id: 'preference', name: 'preference', label: '偏好项', type: 'text', required: true },
        { id: 'value', name: 'value', label: '偏好值', type: 'text', required: true },
      ],
    },
    {
      id: 'facts',
      label: '已知事实',
      description: '记录稳定背景信息和事实',
      extractionInstructions: '提取后续还会用到的稳定事实。',
      fields: [
        { id: 'subject', name: 'subject', label: '主体', type: 'text', required: true },
        { id: 'predicate', name: 'predicate', label: '关系', type: 'text', required: true },
        { id: 'value', name: 'value', label: '值', type: 'text', required: true },
      ],
    },
    {
      id: 'tasks',
      label: '任务进展',
      description: '记录目标、状态和下一步',
      extractionInstructions: '提取任务及其当前状态、阻塞和下一步。',
      fields: [
        { id: 'title', name: 'title', label: '任务标题', type: 'text', required: true },
        {
          id: 'status',
          name: 'status',
          label: '状态',
          type: 'enum',
          required: true,
          options: [
            { label: '待办', value: 'todo' },
            { label: '进行中', value: 'in_progress' },
            { label: '阻塞', value: 'blocked' },
            { label: '完成', value: 'done' },
          ],
        },
      ],
    },
    {
      id: 'long_term_memory',
      label: '长期记忆',
      description: '记录对后续长期有价值的稳定背景、经历和约定',
      extractionInstructions: '提取后续多轮对话仍值得保留的长期信息，避免一次性细节。',
      fields: [
        { id: 'topic', name: 'topic', label: '记忆主题', type: 'text', required: true },
        { id: 'content', name: 'content', label: '记忆内容', type: 'text', required: true },
      ],
    },
  ],
}

function cloneMemorySchema(schema: MemorySchemaState): MemorySchemaState {
  return {
    categories: schema.categories.map((category) => ({
      ...category,
      fields: category.fields.map((field) => cloneMemorySchemaField(field)),
    })),
  }
}

function cloneMemorySchemaField(field: MemorySchemaField): MemorySchemaField {
  return {
    ...field,
    options: field.options?.map((item) => ({ ...item })),
  }
}

export function normalizeSessionMemory(memory?: Partial<SessionMemoryState> | null): SessionMemoryState {
  return {
    summary: typeof memory?.summary === 'string' ? memory.summary : '',
    updatedAt: typeof memory?.updatedAt === 'string' ? memory.updatedAt : '',
    sourceMessageCount:
      typeof memory?.sourceMessageCount === 'number' ? memory.sourceMessageCount : 0,
    persistToServer: true,
    threshold:
      typeof memory?.threshold === 'number' && memory.threshold > 0
        ? Math.round(memory.threshold)
        : DEFAULT_SESSION_MEMORY.threshold,
    recentMessageLimit:
      typeof memory?.recentMessageLimit === 'number' && memory.recentMessageLimit > 0
        ? Math.round(memory.recentMessageLimit)
        : DEFAULT_SESSION_MEMORY.recentMessageLimit,
    prompt:
      typeof memory?.prompt === 'string' && memory.prompt.trim()
        ? memory.prompt
        : DEFAULT_SESSION_MEMORY.prompt,
  }
}

export function normalizeStructuredMemory(memory?: Partial<StructuredMemoryState> | null): StructuredMemoryState {
  return {
    updatedAt: typeof memory?.updatedAt === 'string' ? memory.updatedAt : '',
    longTermMemory: typeof memory?.longTermMemory === 'string' ? memory.longTermMemory : '',
    shortTermMemory: typeof memory?.shortTermMemory === 'string' ? memory.shortTermMemory : '',
  }
}

function normalizeMemorySchemaField(field: Partial<MemorySchemaField>, fieldIndex = 0): MemorySchemaField {
  const type = ['text', 'number', 'enum', 'boolean'].includes(String(field?.type))
    ? (field.type as MemorySchemaField['type'])
    : 'text'
  return {
    id: String(field?.id || `field_${fieldIndex + 1}`).trim(),
    name: String(field?.name || `field_${fieldIndex + 1}`).trim(),
    label: String(field?.label || `字段 ${fieldIndex + 1}`).trim(),
    type,
    required: Boolean(field?.required),
    options: type === 'enum' && Array.isArray(field?.options)
      ? field.options.map((option, optionIndex) => ({
          label: String(option?.label || `选项 ${optionIndex + 1}`),
          value: String(option?.value || `option_${optionIndex + 1}`),
        }))
      : [],
  }
}

export function normalizeMemorySchema(schema?: Partial<MemorySchemaState> | null): MemorySchemaState {
  const categories = (Array.isArray(schema?.categories) ? schema.categories : [])
    .map((category, categoryIndex) => ({
      id: String(category?.id || `category_${categoryIndex + 1}`).trim(),
      label: String(category?.label || `分类 ${categoryIndex + 1}`).trim(),
      description: String(category?.description || '').trim(),
      extractionInstructions: String(category?.extractionInstructions || '').trim(),
      fields: (Array.isArray(category?.fields) ? category.fields : []).map((field, fieldIndex) =>
        normalizeMemorySchemaField(field, fieldIndex),
      ),
    }))
    .filter((category) => category.id)

  return {
    categories: categories.length ? categories : cloneMemorySchema(DEFAULT_MEMORY_SCHEMA).categories,
  }
}

export function normalizeSessionUsage(usage?: Partial<SessionUsageState> | null): SessionUsageState {
  return {
    promptTokens: typeof usage?.promptTokens === 'number' ? usage.promptTokens : 0,
    completionTokens: typeof usage?.completionTokens === 'number' ? usage.completionTokens : 0,
  }
}

export function normalizeSessionMessages(session: ChatSessionDetail) {
  return session.messages.map((item, index) => {
    if (item.role === 'user') {
    return {
      id: `${session.id}-user-${index}`,
        role: 'user',
        name: '',
        datetime: formatMessageDatetime(item.createdAt),
        content: [
          {
            type: 'text',
            data: item.content,
          },
        ],
      }
    }

    const content = []
    if (item.reasoning) {
      content.push({
        type: 'thinking',
        status: 'complete',
        data: {
          title: '深度思考已完成',
          text: item.reasoning,
        },
      })
    }
    if (item.content) {
      content.push({
        type: 'markdown',
        data: item.content,
      })
    }
    if (item.suggestions?.length) {
      content.push({
        type: 'suggestion',
        data: item.suggestions.map((suggestion) => ({
          title: suggestion.title,
          prompt: suggestion.prompt,
        })),
      })
    }
    if (item.form?.fields?.length) {
      content.push(createFormActivityContent(item.form, `activity-form-${session.id}-${index}`))
    }
    return {
      id: `${session.id}-assistant-${index}`,
      role: 'assistant',
      name: '',
      avatar: session.robot.avatar || '',
      datetime: formatMessageDatetime(item.createdAt),
      content,
    }
  })
}

interface UseChatSessionStateManagerOptions {
  onSyncCurrentSessionMeta: () => Promise<void>
}

export function useChatSessionStateManager(options: UseChatSessionStateManagerOptions) {
  const sessionRobotVisible = ref(false)
  const memoryVisible = ref(false)

  const currentSessionMemory = reactive<SessionMemoryState>(
    normalizeSessionMemory(DEFAULT_SESSION_MEMORY),
  )
  const currentMemorySchema = reactive<MemorySchemaState>(normalizeMemorySchema(DEFAULT_MEMORY_SCHEMA))
  const currentStructuredMemory = reactive<StructuredMemoryState>({
    ...DEFAULT_STRUCTURED_MEMORY,
  })
  const currentUsage = reactive<SessionUsageState>({ ...DEFAULT_SESSION_USAGE })
  const currentStoryOutline = ref<StoryOutlineState>({ ...DEFAULT_STORY_OUTLINE })
  const currentSessionWorldGraph = ref<RobotWorldGraph | null>(null)
  const currentReplyMode = ref<ReplyMode>(DEFAULT_REPLY_MODE)

  const sessionRobot = reactive<SessionRobotState>({
    id: '',
    name: '当前智能体',
    avatar: '',
    commonPrompt: '',
    systemPrompt: '',
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    knowledgeRetrievalModelConfigId: '',
    worldGraphModelConfigId: '',
  })
  const sessionRobotDraft = reactive<SessionRobotState>({
    id: '',
    name: '',
    avatar: '',
    commonPrompt: '',
    systemPrompt: '',
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    knowledgeRetrievalModelConfigId: '',
    worldGraphModelConfigId: '',
  })
  const sessionMemoryDraft = reactive<SessionMemoryState>(
    normalizeSessionMemory(DEFAULT_SESSION_MEMORY),
  )

  const currentRobotLabel = computed(() => sessionRobot.name.trim() || '当前智能体')
  const memoryUpdatedLabel = computed(() =>
    currentStructuredMemory.updatedAt ? new Date(currentStructuredMemory.updatedAt).toLocaleString() : '未生成',
  )
  const structuredMemoryRecordCount = computed(() =>
    [currentStructuredMemory.longTermMemory, currentStructuredMemory.shortTermMemory].filter((item) => String(item || '').trim()).length,
  )

  const sessionPromptTokens = computed(() => currentUsage.promptTokens)
  const sessionCompletionTokens = computed(() => currentUsage.completionTokens)

  function applySessionMemory(memory?: Partial<SessionMemoryState> | null) {
    const normalized = normalizeSessionMemory(memory)
    currentSessionMemory.summary = normalized.summary
    currentSessionMemory.updatedAt = normalized.updatedAt
    currentSessionMemory.sourceMessageCount = normalized.sourceMessageCount
    currentSessionMemory.persistToServer = true
    currentSessionMemory.threshold = normalized.threshold
    currentSessionMemory.recentMessageLimit = normalized.recentMessageLimit
    currentSessionMemory.prompt = normalized.prompt
  }

  function applyStructuredMemory(memory?: Partial<StructuredMemoryState> | null) {
    const normalized = normalizeStructuredMemory(memory)
    currentStructuredMemory.updatedAt = normalized.updatedAt
    currentStructuredMemory.longTermMemory = normalized.longTermMemory
    currentStructuredMemory.shortTermMemory = normalized.shortTermMemory
  }

  function applyMemorySchema(schema?: Partial<MemorySchemaState> | null) {
    const normalized = normalizeMemorySchema(schema)
    currentMemorySchema.categories = normalized.categories
  }

  function applySessionUsage(usage?: Partial<SessionUsageState> | null) {
    const normalized = normalizeSessionUsage(usage)
    currentUsage.promptTokens = normalized.promptTokens
    currentUsage.completionTokens = normalized.completionTokens
  }

  function applyStoryOutline(value?: Partial<StoryOutlineState> | null) {
    currentStoryOutline.value = normalizeStoryOutline(value)
  }

  function applySessionWorldGraph(graph?: RobotWorldGraph | null) {
    currentSessionWorldGraph.value = graph ? JSON.parse(JSON.stringify(graph)) as RobotWorldGraph : null
  }

  function applyReplyMode(mode?: ReplyMode | null) {
    currentReplyMode.value = normalizeReplyMode(mode)
  }

  function openMemoryDialog() {
    Object.assign(sessionMemoryDraft, normalizeSessionMemory(currentSessionMemory))
    memoryVisible.value = true
  }

  function openSessionRobotDialog() {
    sessionRobotDraft.id = sessionRobot.id
    sessionRobotDraft.memoryModelConfigId = sessionRobot.memoryModelConfigId
    sessionRobotDraft.outlineModelConfigId = sessionRobot.outlineModelConfigId
    sessionRobotDraft.knowledgeRetrievalModelConfigId = sessionRobot.knowledgeRetrievalModelConfigId
    sessionRobotDraft.worldGraphModelConfigId = sessionRobot.worldGraphModelConfigId
    sessionRobotVisible.value = true
  }

  async function applySessionRobot() {
    sessionRobot.id = String(sessionRobotDraft.id || '').trim()
    sessionRobot.memoryModelConfigId = String(sessionRobotDraft.memoryModelConfigId || '').trim()
    sessionRobot.outlineModelConfigId = String(sessionRobotDraft.outlineModelConfigId || '').trim()
    sessionRobot.knowledgeRetrievalModelConfigId = String(sessionRobotDraft.knowledgeRetrievalModelConfigId || '').trim()
    sessionRobot.worldGraphModelConfigId = String(sessionRobotDraft.worldGraphModelConfigId || '').trim()
    sessionRobotVisible.value = false
    await options.onSyncCurrentSessionMeta()
  }

  async function applySessionMemorySettings() {
    applySessionMemory(sessionMemoryDraft)
    memoryVisible.value = false
    await options.onSyncCurrentSessionMeta()
  }

  return {
    sessionRobotVisible,
    memoryVisible,
    currentSessionMemory,
    currentMemorySchema,
    currentStructuredMemory,
    currentUsage,
    sessionRobot,
    sessionRobotDraft,
    sessionMemoryDraft,
    currentRobotLabel,
    memoryUpdatedLabel,
    structuredMemoryRecordCount,
    sessionPromptTokens,
    sessionCompletionTokens,
    currentReplyMode,
    applySessionMemory,
    applyStructuredMemory,
    applyMemorySchema,
    applySessionUsage,
    applyStoryOutline,
    applySessionWorldGraph,
    applyReplyMode,
    openMemoryDialog,
    openSessionRobotDialog,
    applySessionRobot,
    applySessionMemorySettings,
    currentStoryOutline,
    currentSessionWorldGraph,
  }
}
