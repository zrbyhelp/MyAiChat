import { MessagePlugin } from 'tdesign-vue-next'
import { computed, reactive, ref } from 'vue'

import {
  createFormActivityContent,
  formatMessageDatetime,
} from '@/hooks/chat-view/useChatView.message-utils'
import type {
  ChatSessionDetail,
  MemorySchemaField,
  MemorySchemaState,
  NumericComputationItem,
  RobotWorldGraph,
  SessionMemoryState,
  SessionRobotState,
  SessionUsageState,
  StructuredMemoryCategory,
  StructuredMemoryState,
} from '@/types/ai'

export const DEFAULT_STRUCTURED_MEMORY_INTERVAL = 3
export const DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 12

export const DEFAULT_SESSION_MEMORY: SessionMemoryState = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  persistToServer: true,
  threshold: 20,
  recentMessageLimit: 10,
  structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  prompt: [
    '请根据旧摘要和新增对话，输出一份新的完整中文会话摘要。',
    '要求：',
    '1. 只输出摘要正文，不要加标题，不要输出 JSON。',
    '2. 保留重要上下文、用户偏好、约束、任务进展和仍未解决的问题。',
    '3. 内容尽量精炼，但不要遗漏后续对话需要继续依赖的信息。',
  ].join('\n'),
}

export const DEFAULT_SESSION_USAGE: SessionUsageState = {
  promptTokens: 0,
  completionTokens: 0,
}

export const DEFAULT_STRUCTURED_MEMORY: StructuredMemoryState = {
  updatedAt: '',
  categories: [],
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
    persistToServer: Boolean(memory?.persistToServer ?? true),
    threshold:
      typeof memory?.threshold === 'number' && memory.threshold > 0
        ? Math.round(memory.threshold)
        : DEFAULT_SESSION_MEMORY.threshold,
    recentMessageLimit:
      typeof memory?.recentMessageLimit === 'number' && memory.recentMessageLimit > 0
        ? Math.round(memory.recentMessageLimit)
        : DEFAULT_SESSION_MEMORY.recentMessageLimit,
    structuredMemoryInterval:
      typeof memory?.structuredMemoryInterval === 'number' && memory.structuredMemoryInterval > 0
        ? Math.round(memory.structuredMemoryInterval)
        : DEFAULT_SESSION_MEMORY.structuredMemoryInterval,
    structuredMemoryHistoryLimit:
      typeof memory?.structuredMemoryHistoryLimit === 'number' && memory.structuredMemoryHistoryLimit > 0
        ? Math.round(memory.structuredMemoryHistoryLimit)
        : DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit,
    prompt:
      typeof memory?.prompt === 'string' && memory.prompt.trim()
        ? memory.prompt
        : DEFAULT_SESSION_MEMORY.prompt,
  }
}

export function normalizeStructuredMemory(memory?: Partial<StructuredMemoryState> | null): StructuredMemoryState {
  return {
    updatedAt: typeof memory?.updatedAt === 'string' ? memory.updatedAt : '',
    categories: (Array.isArray(memory?.categories) ? memory.categories : []).map((category) => ({
      categoryId: String(category?.categoryId || '').trim(),
      label: String(category?.label || '').trim(),
      description: String(category?.description || '').trim(),
      updatedAt: typeof category?.updatedAt === 'string' ? category.updatedAt : '',
      items: (Array.isArray(category?.items) ? category.items : []).map((item, index) => ({
        id: String(item?.id || `item-${index + 1}`),
        summary: String(item?.summary || ''),
        sourceTurnId: String(item?.sourceTurnId || ''),
        updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : '',
        values: typeof item?.values === 'object' && item?.values !== null ? item.values : {},
      })),
    })),
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
  cloneNumericComputationItems: (items?: NumericComputationItem[] | null) => NumericComputationItem[]
  validateNumericComputationItems: (
    items: NumericComputationItem[],
  ) =>
    | { ok: true; normalized: NumericComputationItem[] }
    | { ok: false; message: string }
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
  const currentNumericState = ref<Record<string, unknown>>({})
  const currentStoryOutline = ref('')
  const currentSessionWorldGraph = ref<RobotWorldGraph | null>(null)

  const sessionRobot = reactive<SessionRobotState>({
    id: '',
    name: '当前智能体',
    avatar: '',
    commonPrompt: '',
    systemPrompt: '',
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    numericComputationModelConfigId: '',
    worldGraphModelConfigId: '',
    numericComputationEnabled: false,
    numericComputationPrompt: '',
    numericComputationItems: [],
    structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  })
  const sessionRobotDraft = reactive<SessionRobotState>({
    id: '',
    name: '',
    avatar: '',
    commonPrompt: '',
    systemPrompt: '',
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    numericComputationModelConfigId: '',
    worldGraphModelConfigId: '',
    numericComputationEnabled: false,
    numericComputationPrompt: '',
    numericComputationItems: [],
    structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  })
  const sessionMemoryDraft = reactive<SessionMemoryState>(
    normalizeSessionMemory(DEFAULT_SESSION_MEMORY),
  )

  const currentRobotLabel = computed(() => sessionRobot.name.trim() || '当前智能体')
  const memoryUpdatedLabel = computed(() =>
    currentStructuredMemory.updatedAt ? new Date(currentStructuredMemory.updatedAt).toLocaleString() : '未生成',
  )
  const memoryDisplayCategories = computed<StructuredMemoryCategory[]>(() => {
    const categoryMap = new Map(
      currentStructuredMemory.categories.map((category) => [category.categoryId, category] as const),
    )

    const merged = currentMemorySchema.categories.map((schemaCategory) => {
      const matched = categoryMap.get(schemaCategory.id)
      return {
        categoryId: schemaCategory.id,
        label: matched?.label || schemaCategory.label,
        description: matched?.description || schemaCategory.description || '',
        updatedAt: matched?.updatedAt || '',
        items: matched?.items || [],
      }
    })

    currentStructuredMemory.categories.forEach((category) => {
      if (!merged.some((item) => item.categoryId === category.categoryId)) {
        merged.push({
          categoryId: category.categoryId,
          label: category.label,
          description: category.description || '',
          updatedAt: category.updatedAt || '',
          items: category.items,
        })
      }
    })

    return merged
  })
  const structuredMemoryRecordCount = computed(() =>
    memoryDisplayCategories.value.reduce((count, category) => count + category.items.length, 0),
  )

  const sessionPromptTokens = computed(() => currentUsage.promptTokens)
  const sessionCompletionTokens = computed(() => currentUsage.completionTokens)

  function applySessionMemory(memory?: Partial<SessionMemoryState> | null) {
    const normalized = normalizeSessionMemory(memory)
    currentSessionMemory.summary = normalized.summary
    currentSessionMemory.updatedAt = normalized.updatedAt
    currentSessionMemory.sourceMessageCount = normalized.sourceMessageCount
    currentSessionMemory.persistToServer = normalized.persistToServer
    currentSessionMemory.threshold = normalized.threshold
    currentSessionMemory.recentMessageLimit = normalized.recentMessageLimit
    currentSessionMemory.structuredMemoryInterval = normalized.structuredMemoryInterval
    currentSessionMemory.structuredMemoryHistoryLimit = normalized.structuredMemoryHistoryLimit
    currentSessionMemory.prompt = normalized.prompt
  }

  function applyStructuredMemory(memory?: Partial<StructuredMemoryState> | null) {
    const normalized = normalizeStructuredMemory(memory)
    currentStructuredMemory.updatedAt = normalized.updatedAt
    currentStructuredMemory.categories = normalized.categories
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

  function applyNumericState(value?: Record<string, unknown> | null) {
    currentNumericState.value =
      typeof value === 'object' && value !== null ? { ...value } : {}
  }

  function applyStoryOutline(value?: string | null) {
    currentStoryOutline.value = typeof value === 'string' ? value : ''
  }

  function applySessionWorldGraph(graph?: RobotWorldGraph | null) {
    currentSessionWorldGraph.value = graph ? JSON.parse(JSON.stringify(graph)) as RobotWorldGraph : null
  }

  function openMemoryDialog() {
    Object.assign(sessionMemoryDraft, normalizeSessionMemory(currentSessionMemory))
    memoryVisible.value = true
  }

  function openSessionRobotDialog() {
    sessionRobotDraft.id = sessionRobot.id
    sessionRobotDraft.memoryModelConfigId = sessionRobot.memoryModelConfigId
    sessionRobotDraft.outlineModelConfigId = sessionRobot.outlineModelConfigId
    sessionRobotDraft.numericComputationModelConfigId = sessionRobot.numericComputationModelConfigId
    sessionRobotDraft.worldGraphModelConfigId = sessionRobot.worldGraphModelConfigId
    sessionRobotVisible.value = true
  }

  async function applySessionRobot() {
    sessionRobot.id = String(sessionRobotDraft.id || '').trim()
    sessionRobot.memoryModelConfigId = String(sessionRobotDraft.memoryModelConfigId || '').trim()
    sessionRobot.outlineModelConfigId = String(sessionRobotDraft.outlineModelConfigId || '').trim()
    sessionRobot.numericComputationModelConfigId = String(sessionRobotDraft.numericComputationModelConfigId || '').trim()
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
    memoryDisplayCategories,
    structuredMemoryRecordCount,
    sessionPromptTokens,
    sessionCompletionTokens,
    applySessionMemory,
    applyStructuredMemory,
    applyMemorySchema,
    applySessionUsage,
    applyNumericState,
    applyStoryOutline,
    applySessionWorldGraph,
    openMemoryDialog,
    openSessionRobotDialog,
    applySessionRobot,
    applySessionMemorySettings,
    currentNumericState,
    currentStoryOutline,
    currentSessionWorldGraph,
  }
}
