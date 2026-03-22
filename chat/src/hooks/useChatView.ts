import type { AIMessageContent, ChatServiceConfig, SSEChunkData } from '@tdesign-vue-next/chat'
import { MessagePlugin } from 'tdesign-vue-next'
import { useAuth } from '@clerk/vue'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useChatSession } from '@/hooks/useChatSession'
import { useTokenStatisticAnimation } from '@/hooks/useTokenStatisticAnimation'
import {
  getCapabilities,
  getModelConfigs,
  getRobots,
  getSession,
  saveRobots,
  saveModelConfigs,
  testModelConnection,
  upsertSession,
} from '@/lib/api'
import { UnauthorizedError, isSignedInNow, waitForAuthReady } from '@/lib/auth'
import type {
  AIFormField,
  AIFormSchema,
  AIModelConfigItem,
  AIRobotCard,
  ChatSessionDetail,
  MemorySchemaState,
  ModelCapabilities,
  ModelOption,
  ProviderType,
  SessionMemoryState,
  SessionUsageState,
  SessionRobotState,
  StructuredMemoryCategory,
  StructuredMemoryState,
  SuggestionOption,
} from '@/types/ai'

type ChatbotInstance = {
  registerMergeStrategy?: (
    type: string,
    handler: (chunk: unknown, existing?: unknown) => unknown,
  ) => void
  setMessages?: (messages: ChatRenderMessage[], mode?: 'replace' | 'prepend' | 'append') => void
  clearMessages?: () => void
  sendUserMessage?: (params: { prompt?: string }) => Promise<void>
}

type ChatRenderContent = {
  type?: string
  slotName?: string
  data?: unknown
  [key: string]: unknown
}

type ChatRenderMessage = {
  id?: string
  role?: string
  datetime?: string
  content?: ChatRenderContent[]
  [key: string]: unknown
}

type ChatMessageChangeEvent =
  | CustomEvent<ChatRenderMessage[]>
  | ChatRenderMessage[]
  | null
  | undefined
type FormDraftValue = string | number | boolean | (string | number | boolean)[]

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function formatMessageDatetime(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

function withMessageDatetimes(messages: ChatRenderMessage[], previousMessages: ChatRenderMessage[] = []) {
  const previousDatetimeById = new Map(
    previousMessages
      .filter((message) => message?.id && message?.datetime)
      .map((message) => [String(message.id), String(message.datetime)]),
  )

  return messages.map((message) => {
    const datetime =
      (typeof message.datetime === 'string' && message.datetime.trim()) ||
      (message.id ? previousDatetimeById.get(String(message.id)) : '') ||
      formatMessageDatetime()

    return {
      ...message,
      datetime,
    }
  })
}

function formatTimeSeparatorLabel(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const timeText = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isSameDay) {
    return timeText
  }

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) {
    return `昨天 ${timeText}`
  }

  const dateText = date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  })

  return `${dateText} ${timeText}`
}

function withTimeSeparators(messages: ChatRenderMessage[]) {
  const result: ChatRenderMessage[] = []
  let previousTimestamp = 0

  for (const message of messages) {
    if (message.role === 'system') {
      result.push(message)
      continue
    }

    const timestamp = message.datetime ? new Date(message.datetime).getTime() : Number.NaN
    const shouldInsertSeparator =
      Number.isFinite(timestamp) &&
      (result.length === 0 || !previousTimestamp || timestamp - previousTimestamp >= 5 * 60 * 1000)

    if (shouldInsertSeparator) {
      result.push({
        id: `time-${message.id || timestamp}`,
        role: 'system',
        content: formatTimeSeparatorLabel(message.datetime)
          ? [
              {
                type: 'text',
                data: formatTimeSeparatorLabel(message.datetime),
              },
            ]
          : [],
      })
    }

    result.push(message)

    if (Number.isFinite(timestamp)) {
      previousTimestamp = timestamp
    }
  }

  return result
}

function withSystemStatusMessages(
  messages: ChatRenderMessage[],
  statuses: Array<{ key: string; text: string }>,
) {
  const result = [...messages]
  statuses.forEach((status, index) => {
    const text = status.text.trim()
    if (!text) {
      return
    }
    result.push({
      id: `status-${status.key}-${index}`,
      role: 'system',
      content: [
        {
          type: 'markdown',
          data: `**${text}**`,
        },
      ],
    })
  })
  return result
}

function extractActivityFormSchema(content: ChatRenderContent): AIFormSchema | null {
  if (content?.type !== 'activity-form') {
    return null
  }

  const data = asRecord(content.data)
  const schema = data.content as AIFormSchema | undefined
  return schema?.fields?.length ? schema : null
}

type NormalizedStreamPayload = {
  type?:
    | 'text'
    | 'reasoning'
    | 'reasoning_done'
    | 'suggestion'
    | 'form'
    | 'memory_status'
    | 'usage'
    | 'agent_turn'
    | 'tool_status'
    | 'structured_memory'
    | 'ui_loading'
    | 'done'
    | 'error'
  text?: string
  message?: string
  items?: SuggestionOption[]
  form?: AIFormSchema | null
  status?: 'running' | 'success' | 'error'
  promptTokens?: number
  completionTokens?: number
  agent?: string
  tool?: string
  toolType?: 'tool_call' | 'tool_result'
  query?: string
  url?: string
  memory?: StructuredMemoryState
}

type ChatFormSlot = {
  slotName: string
  formId: string
  schema: AIFormSchema
}

type ChatLoadingSlot = {
  slotName: string
  text: string
}

type FormActivityContent = {
  type: 'activity-form'
  slotName: string
  data: {
    activityType: 'form'
    content: AIFormSchema
  }
}

type ModelDropdownItem = {
  content: string
  value: string
  divider?: boolean
}

type MemoryStatusState = {
  status: 'running' | 'success' | 'error'
  text: string
}

export function useChatView() {
const router = useRouter()
const route = useRoute()
const DEFAULT_STRUCTURED_MEMORY_INTERVAL = 3
const DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 12
const DEFAULT_SESSION_MEMORY: SessionMemoryState = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
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
const DEFAULT_SESSION_USAGE: SessionUsageState = {
  promptTokens: 0,
  completionTokens: 0,
}
const DEFAULT_STRUCTURED_MEMORY: StructuredMemoryState = {
  updatedAt: '',
  categories: [],
}
const DEFAULT_MEMORY_SCHEMA: MemorySchemaState = {
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
const MOBILE_BREAKPOINT = 768

const DEFAULT_MODEL_CONFIGS: Record<ProviderType, Omit<AIModelConfigItem, 'id' | 'name' | 'model'>> = {
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    description: '',
    tags: [],
    temperature: 0.7,
  },
}

function createModelConfig(provider: ProviderType = 'openai', index = 1): AIModelConfigItem {
  return {
    id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `模型配置 ${index}`,
    ...DEFAULT_MODEL_CONFIGS[provider],
    model: '',
  }
}

function normalizeModelTags(tags?: string[] | string | null) {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(/[,\n，]/) : []
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((item, index, source) => source.indexOf(item) === index)
}

function normalizeSessionMemory(memory?: Partial<SessionMemoryState> | null): SessionMemoryState {
  return {
    summary: typeof memory?.summary === 'string' ? memory.summary : '',
    updatedAt: typeof memory?.updatedAt === 'string' ? memory.updatedAt : '',
    sourceMessageCount:
      typeof memory?.sourceMessageCount === 'number' ? memory.sourceMessageCount : 0,
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

function normalizeStructuredMemory(memory?: Partial<StructuredMemoryState> | null): StructuredMemoryState {
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

function normalizeMemorySchemaField(field: any, fieldIndex = 0): any {
  return {
    id: String(field?.id || `field_${fieldIndex + 1}`).trim(),
    name: String(field?.name || `field_${fieldIndex + 1}`).trim(),
    label: String(field?.label || `字段 ${fieldIndex + 1}`).trim(),
    type: ['text', 'number', 'enum', 'boolean', 'object', 'array'].includes(String(field?.type)) ? field.type : 'text',
    required: Boolean(field?.required),
    options: Array.isArray(field?.options) ? field.options.map((option: any, optionIndex: number) => ({
      label: String(option?.label || `选项 ${optionIndex + 1}`),
      value: String(option?.value || `option_${optionIndex + 1}`),
    })) : [],
    fields: (Array.isArray(field?.fields) ? field.fields : []).map((child: any, childIndex: number) => normalizeMemorySchemaField(child, childIndex)),
    itemType: ['text', 'number', 'enum', 'boolean', 'object'].includes(String(field?.itemType)) ? field.itemType : 'text',
    itemOptions: Array.isArray(field?.itemOptions) ? field.itemOptions.map((option: any, optionIndex: number) => ({
      label: String(option?.label || `选项 ${optionIndex + 1}`),
      value: String(option?.value || `option_${optionIndex + 1}`),
    })) : [],
    itemFields: (Array.isArray(field?.itemFields) ? field.itemFields : []).map((child: any, childIndex: number) => normalizeMemorySchemaField(child, childIndex)),
  }
}

function normalizeMemorySchema(schema?: Partial<MemorySchemaState> | null): MemorySchemaState {
  const categories = (Array.isArray(schema?.categories) ? schema.categories : []).map((category, categoryIndex) => ({
    id: String(category?.id || `category_${categoryIndex + 1}`).trim(),
    label: String(category?.label || `分类 ${categoryIndex + 1}`).trim(),
    description: String(category?.description || '').trim(),
    extractionInstructions: String(category?.extractionInstructions || '').trim(),
    fields: (Array.isArray(category?.fields) ? category.fields : []).map((field, fieldIndex) => normalizeMemorySchemaField(field, fieldIndex)),
  })).filter((category) => category.id)

  return {
    categories: categories.length ? categories : DEFAULT_MEMORY_SCHEMA.categories.map((item) => JSON.parse(JSON.stringify(item))),
  }
}

function normalizeSessionMessages(session: ChatSessionDetail) {
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

function createFormActivityContent(
  schema: AIFormSchema,
  slotName = `activity-form-${Date.now()}-${Math.random().toString(16).slice(2)}`,
): FormActivityContent {
  return {
    type: 'activity-form',
    slotName,
    data: {
      activityType: 'form',
      content: schema,
    },
  }
}

function createLoadingActivityContent(
  text = '正在生成交互 UI',
  slotName = `activity-loading-${Date.now()}-${Math.random().toString(16).slice(2)}`,
) {
  return {
    type: 'activity-loading',
    slotName,
    data: {
      activityType: 'loading',
      text,
    },
  }
}

function createMemoryStatusContent(
  status: 'running' | 'success' | 'error',
  text: string,
): MemoryStatusState {
  return {
    status,
    text,
  }
}

function buildMemoryStatusMarkdown(status: 'running' | 'success' | 'error', text: string) {
  const statusLabel = status === 'running' ? '处理中' : status === 'success' ? '已完成' : '异常'
  return `<!--memory-status:${status}-->\n> **${statusLabel}**  \n> ${text}`
}

function createSuggestionContent(items: SuggestionOption[]) {
  return {
    type: 'suggestion',
    data: items.map((item) => ({
      title: item.title,
      prompt: item.prompt,
    })),
  }
}

function normalizeSessionUsage(usage?: Partial<SessionUsageState> | null): SessionUsageState {
  return {
    promptTokens: typeof usage?.promptTokens === 'number' ? usage.promptTokens : 0,
    completionTokens: typeof usage?.completionTokens === 'number' ? usage.completionTokens : 0,
  }
}

function createInitialFormValues(schema: AIFormSchema) {
  return schema.fields.reduce<Record<string, FormDraftValue>>((result, field) => {
    const expectsArray = field.type === 'checkbox' || (field.type === 'select' && field.multiple)
    if (expectsArray) {
      if (Array.isArray(field.defaultValue)) {
        result[field.name] = [...field.defaultValue]
      } else if (typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
        result[field.name] = [field.defaultValue]
      } else {
        result[field.name] = []
      }
    } else if (Array.isArray(field.defaultValue)) {
      result[field.name] = field.defaultValue[0] ?? ''
    } else if (typeof field.defaultValue === 'string') {
      result[field.name] = field.defaultValue
    } else if (field.type === 'checkbox' || (field.type === 'select' && field.multiple)) {
      result[field.name] = []
    } else {
      result[field.name] = ''
    }
    return result
  }, {})
}

function getFormDraft(formId: string, schema: AIFormSchema) {
  if (!formDrafts[formId]) {
    formDrafts[formId] = createInitialFormValues(schema)
  } else {
    const draft = formDrafts[formId]
    schema.fields.forEach((field) => {
      const expectsArray = field.type === 'checkbox' || (field.type === 'select' && field.multiple)
      const currentValue = draft?.[field.name]
      if (expectsArray) {
        if (Array.isArray(currentValue)) {
          return
        }
        draft[field.name] =
          typeof currentValue === 'string' && currentValue.trim() ? [currentValue] : []
        return
      }
      if (Array.isArray(currentValue)) {
        draft[field.name] = currentValue[0] ?? ''
      }
    })
  }
  return formDrafts[formId]
}

function getFormFieldLabel(field: AIFormField, value: FormDraftValue | undefined) {
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => field.options?.find((option) => option.value === item)?.label || String(item))
      .filter(Boolean)
    return labels.join('、')
  }

  if (typeof value === 'string' && field.options?.length) {
    return field.options.find((option) => option.value === value)?.label || value
  }

  return String(value ?? '')
}

function buildFormPrompt(schema: AIFormSchema, values: Record<string, FormDraftValue>) {
  const lines = [schema.title ? `已填写表单《${schema.title}》` : '已填写表单']
  schema.fields.forEach((field) => {
    const value = values[field.name]
    if (
      Array.isArray(value) ? value.length : value !== '' && value !== null && value !== undefined
    ) {
      lines.push(`${field.label}：${getFormFieldLabel(field, value)}`)
    }
  })
  return lines.join('\n')
}

const providerOptions = [{ label: 'OpenAI Compatible', value: 'openai' }]

const activePrimaryTab = computed<'agent' | 'discover' | 'mine'>({
  get: () => {
    if (route.name === 'agent' || route.name === 'mine') {
      return route.name
    }
    return 'discover'
  },
  set: (value) => {
    if (route.name === value) {
      return
    }
    void router.push({ name: value })
  },
})
const isMobile = ref(false)
const sidebarDrawerVisible = ref(false)
const newChatVisible = ref(false)
const configVisible = ref(false)
const agentManageVisible = ref(false)
const mobileAgentEditorVisible = ref(false)
const mobileModelEditorVisible = ref(false)
const desktopModelEditorVisible = ref(false)
const sessionRobotVisible = ref(false)
const memoryVisible = ref(false)
const savingConfig = ref(false)
const savingMobileAgent = ref(false)
const savingMobileModel = ref(false)
const savingDesktopModel = ref(false)
const loadingModels = ref(false)
const testingConnection = ref(false)
const chatbotRef = ref<ChatbotInstance | null>(null)
const chatInstanceKey = ref(0)
const robotTemplates = ref<AIRobotCard[]>([])
const selectedNewChatRobotId = ref('')
const editingAgentId = ref('')
const mobileAgentEditorMode = ref<'create' | 'edit'>('create')
const editingMobileAgentId = ref('')
const agentEditorStep = ref<1 | 2 | 3>(1)
const mobileModelEditorMode = ref<'create' | 'edit'>('create')
const editingMobileModelId = ref('')
const desktopModelEditorMode = ref<'create' | 'edit'>('create')
const editingDesktopModelId = ref('')
const pendingChatMessages = ref<ChatRenderMessage[] | null>(null)
const pendingAssistantSuggestions = ref<SuggestionOption[] | null>(null)
const pendingAssistantForm = ref<AIFormSchema | null>(null)
const chatMessages = ref<ChatRenderMessage[]>([])
const pendingAssistantMemoryStatus = ref<MemoryStatusState | null>(null)
const currentAssistantLoadingText = ref('')
const currentMemoryStatusText = ref('')
const streamEnabled = ref(true)
const thinkingEnabled = ref(false)
const isChatResponding = ref(false)
const editingConfigId = ref('')
const activeModelConfigId = ref('')
const capabilities = ref<ModelCapabilities>({
  supportsStreaming: true,
  supportsReasoning: false,
})
const modelConfigs = ref<AIModelConfigItem[]>([])
const modelOptionsMap = ref<Record<string, ModelOption[]>>({})
const formDrafts = reactive<Record<string, Record<string, FormDraftValue>>>({})
const submittedForms = reactive<Record<string, boolean>>({})
const rawChatMessages = ref<ChatRenderMessage[]>([])

const editingConfig = reactive<AIModelConfigItem>(createModelConfig())
const mobileModelDraft = reactive<AIModelConfigItem>(createModelConfig())
const desktopModelDraft = reactive<AIModelConfigItem>(createModelConfig())
const mobileModelTagsInput = ref('')
const desktopModelTagsInput = ref('')
const currentMemorySchema = reactive<MemorySchemaState>(normalizeMemorySchema(DEFAULT_MEMORY_SCHEMA))
const currentStructuredMemory = reactive<StructuredMemoryState>({ ...DEFAULT_STRUCTURED_MEMORY })
const currentUsage = reactive<SessionUsageState>({ ...DEFAULT_SESSION_USAGE })
const sessionRobot = reactive<SessionRobotState>({
  name: '当前智能体',
  avatar: '',
  systemPrompt: '',
  structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
})
const sessionRobotDraft = reactive<SessionRobotState>({
  name: '',
  avatar: '',
  systemPrompt: '',
  structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
})
const sessionMemoryDraft = reactive<SessionMemoryState>(normalizeSessionMemory(DEFAULT_SESSION_MEMORY))
const mobileAgentDraft = reactive<AIRobotCard>(createRobotTemplate())
const {
  sessionId,
  sessionHistory,
  deletingSessionId,
  createSessionId,
  getStoredActiveSessionId,
  storeActiveSessionId,
  refreshSessionHistory,
  openHistorySession: openHistorySessionRecord,
  handleDeleteSession: handleDeleteSessionRecord,
} = useChatSession({
  onHydrateSession: hydrateSession,
  onCreateNewChat: () => createNewChat(),
})
const hasInitializedAgent = ref(false)
const isInitializingAgent = ref(false)
const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()

function initDebug(message: string, extra?: Record<string, unknown>) {
  console.debug('[chat-init]', message, extra || {})
}

const activeModelConfig = computed(
  () =>
    modelConfigs.value.find((item) => item.id === activeModelConfigId.value) ??
    modelConfigs.value[0] ??
    createModelConfig(),
)
const currentRobotLabel = computed(() => sessionRobot.name.trim() || '当前智能体')
const currentModelLabel = computed(
  () => activeModelConfig.value.name || activeModelConfig.value.model || '选择模型',
)
const selectedNewChatRobot = computed(
  () => robotTemplates.value.find((item) => item.id === selectedNewChatRobotId.value) ?? null,
)
const isEditingAgentDraft = computed(() => mobileAgentEditorMode.value === 'edit')
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
const {
  promptTokenAnimation,
  completionTokenAnimation,
  promptTokenAnimationStart,
  completionTokenAnimationStart,
} = useTokenStatisticAnimation(sessionPromptTokens, sessionCompletionTokens)
const mobileOverlayProps = computed(() => ({
  placement: 'bottom' as const,
  size: '100%',
  footer: false,
}))

const suggestionActionHandlers = {
  suggestion: async ({ content }: { content?: SuggestionOption }) => {
    if (isChatResponding.value) {
      MessagePlugin.warning('请等待当前回复结束后再操作')
      return
    }
    const prompt = content?.prompt?.trim() || content?.title?.trim() || ''
    if (!prompt) {
      return
    }
    await chatbotRef.value?.sendUserMessage?.({ prompt })
  },
}

function chatMessageProps(message: { role?: string; avatar?: string; name?: string }) {
  if (message.role === 'system') {
    return {
      name: '',
      variant: 'text',
      handleActions: suggestionActionHandlers,
    }
  }

  if (message.role === 'assistant') {
    return {
      name: '',
      avatar: message.avatar || sessionRobot.avatar || undefined,
      variant: 'outline',
      handleActions: suggestionActionHandlers,
    }
  }

  if (message.role === 'user') {
    return {
      name: '',
      variant: 'outline',
      handleActions: suggestionActionHandlers,
    }
  }

  return {
    name: '',
    variant: 'outline',
    handleActions: suggestionActionHandlers,
  }
}
const showStreamToggle = computed(() => capabilities.value.supportsStreaming)
const showThinkingToggle = computed(() => capabilities.value.supportsReasoning)
const effectiveStream = computed(() => showStreamToggle.value && streamEnabled.value)
const effectiveThinking = computed(() => showThinkingToggle.value && thinkingEnabled.value)
const chatbotRuntimeKey = computed(() => `${chatInstanceKey.value}`)
const formActivitySlots = computed<ChatFormSlot[]>(() => {
  const slots: ChatFormSlot[] = []
  chatMessages.value.forEach((message) => {
    if (!Array.isArray(message?.content)) {
      return
    }
    message.content.forEach((content: ChatRenderContent, index: number) => {
      const schema = extractActivityFormSchema(content)
      if (!schema) {
        return
      }
      const activitySlotName = content.slotName || `activity-form-${index}`
      slots.push({
        slotName: `${message.id}-${activitySlotName}`,
        formId: `${message.id}-${activitySlotName}`,
        schema,
      })
    })
  })
  return slots
})
const loadingActivitySlots = computed<ChatLoadingSlot[]>(() => {
  const slots: ChatLoadingSlot[] = []
  chatMessages.value.forEach((message) => {
    if (!Array.isArray(message?.content)) {
      return
    }
    message.content.forEach((content: ChatRenderContent, index: number) => {
      if (content?.type !== 'activity-loading') {
        return
      }
      const activitySlotName = content.slotName || `activity-loading-${index}`
      slots.push({
        slotName: `${message.id}-${activitySlotName}`,
        text:
          typeof asRecord(content.data).text === 'string' && String(asRecord(content.data).text).trim()
            ? String(asRecord(content.data).text).trim()
            : '正在生成交互 UI',
      })
    })
  })
  return slots
})
const memoryStatusActivitySlots = computed(() => [])
const editingModelOptions = computed(() =>
  (modelOptionsMap.value[editingConfigId.value] || []).map((item) => ({
    label: item.label,
    value: item.id,
  })),
)
const temperatureValue = computed<number | undefined>({
  get: () => editingConfig.temperature ?? undefined,
  set: (value) => {
    editingConfig.temperature = typeof value === 'number' ? value : null
  },
})
const mobileModelTemperatureValue = computed<number | undefined>({
  get: () => mobileModelDraft.temperature ?? undefined,
  set: (value) => {
    mobileModelDraft.temperature = typeof value === 'number' ? value : null
  },
})
const desktopModelTemperatureValue = computed<number | undefined>({
  get: () => desktopModelDraft.temperature ?? undefined,
  set: (value) => {
    desktopModelDraft.temperature = typeof value === 'number' ? value : null
  },
})
const agentCardActionOptions = [
  { content: '修改', value: 'edit' },
  { content: '删除', value: 'delete', theme: 'error' as const },
]
const modelCardActionOptions = [
  { content: '修改', value: 'edit' },
  { content: '删除', value: 'delete', theme: 'error' as const },
]

function applySessionMemory(memory?: Partial<SessionMemoryState> | null) {
  const normalized = normalizeSessionMemory(memory)
  DEFAULT_SESSION_MEMORY.summary = normalized.summary
  DEFAULT_SESSION_MEMORY.updatedAt = normalized.updatedAt
  DEFAULT_SESSION_MEMORY.sourceMessageCount = normalized.sourceMessageCount
  DEFAULT_SESSION_MEMORY.threshold = normalized.threshold
  DEFAULT_SESSION_MEMORY.recentMessageLimit = normalized.recentMessageLimit
  DEFAULT_SESSION_MEMORY.structuredMemoryInterval = normalized.structuredMemoryInterval
  DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit = normalized.structuredMemoryHistoryLimit
  DEFAULT_SESSION_MEMORY.prompt = normalized.prompt
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

watch(
  capabilities,
  (value) => {
    if (!value.supportsStreaming) {
      streamEnabled.value = false
    }
    if (!value.supportsReasoning) {
      thinkingEnabled.value = false
    }
  },
  { deep: true, immediate: true },
)

watch(chatbotRef, (instance) => {
  if (!instance?.registerMergeStrategy) {
    return
  }

  instance.registerMergeStrategy('markdown', (chunk, existing) => {
    const chunkObj = asRecord(chunk)
    const existingObj = asRecord(existing)
    return {
      ...chunkObj,
      data: `${String(existingObj.data ?? '')}${String(chunkObj.data ?? '')}`,
    }
  })

  instance.registerMergeStrategy('thinking', (chunk, existing) => {
    const chunkObj = asRecord(chunk)
    const existingObj = asRecord(existing)
    const existingData = asRecord(existingObj.data)
    const chunkData = asRecord(chunkObj.data)
    return {
      ...chunkObj,
      data: {
        ...existingData,
        ...chunkData,
        text: `${String(existingData.text ?? '')}${String(chunkData.text ?? '')}`,
      },
    }
  })

  if (pendingChatMessages.value !== null) {
    applyChatMessages(pendingChatMessages.value)
  }
})

function applyChatMessages(messages: ChatRenderMessage[]) {
  const sourceMessages = messages.filter((message) => message?.role !== 'system')
  rawChatMessages.value = withMessageDatetimes(sourceMessages, rawChatMessages.value)
  const renderedMessages = withSystemStatusMessages(withTimeSeparators(rawChatMessages.value), [
    { key: 'ui-loading', text: currentAssistantLoadingText.value },
    { key: 'memory-status', text: currentMemoryStatusText.value },
  ])
  pendingChatMessages.value = renderedMessages
  chatMessages.value = renderedMessages
  initializeFormDrafts(renderedMessages)
  const instance = chatbotRef.value
  if (!instance) {
    return
  }
  if (!renderedMessages.length) {
    instance.clearMessages?.()
  } else {
    instance.setMessages?.(renderedMessages, 'replace')
  }
  pendingChatMessages.value = null
}

function injectAssistantMemoryStatus(
  messages: ChatRenderMessage[],
  status: 'running' | 'success' | 'error',
  text: string,
) {
  const nextMessages = messages.map((message) => ({
    ...message,
    content: Array.isArray(message?.content) ? [...message.content] : [],
  }))
  const targetMessage = [...nextMessages]
    .reverse()
    .find((message) => message?.role === 'assistant' && Array.isArray(message?.content))
  if (!targetMessage) {
    return null
  }

  const existingStatus = targetMessage.content.find((content: ChatRenderContent) => {
    if (
      content?.type !== 'markdown' ||
      typeof content?.data !== 'string' ||
      !content.data.includes('<!--memory-status:')
    ) {
      return false
    }
    return content.data.includes(`<!--memory-status:${status}-->`) && content.data.includes(text)
  })
  if (existingStatus) {
    return null
  }

  targetMessage.content = targetMessage.content.filter((content: ChatRenderContent) => {
    return !(
      content?.type === 'markdown' &&
      typeof content?.data === 'string' &&
      content.data.includes('<!--memory-status:')
    )
  })

  const insertionIndex = targetMessage.content.findIndex((content: ChatRenderContent) => {
    return content?.type === 'suggestion' || content?.type === 'activity-form'
  })
  const memoryStatusContent = {
    type: 'markdown',
    data: buildMemoryStatusMarkdown(status, text),
  }

  if (insertionIndex === -1) {
    targetMessage.content.push(memoryStatusContent)
  } else {
    targetMessage.content.splice(insertionIndex, 0, memoryStatusContent)
  }
  return nextMessages
}

function flushPendingAssistantMemoryStatus() {
  pendingAssistantMemoryStatus.value = null
}

function injectAssistantUiLoading(messages: ChatRenderMessage[], text: string) {
  const nextMessages = messages.map((message) => ({
    ...message,
    content: Array.isArray(message?.content) ? [...message.content] : [],
  }))
  const targetMessage = [...nextMessages]
    .reverse()
    .find((message) => message?.role === 'assistant' && Array.isArray(message?.content))
  if (!targetMessage) {
    return null
  }

  const existingLoading = targetMessage.content.find((content: ChatRenderContent) => content?.type === 'activity-loading')
  const existingText = typeof asRecord(existingLoading?.data).text === 'string' ? String(asRecord(existingLoading?.data).text) : ''
  if (existingText === (text || '正在生成交互 UI')) {
    return null
  }

  targetMessage.content = targetMessage.content.filter((content: ChatRenderContent) => {
    return content?.type !== 'activity-loading'
  })

  targetMessage.content.push(createLoadingActivityContent(text || '正在生成交互 UI'))

  return nextMessages
}

function clearAssistantUiLoading(messages: ChatRenderMessage[]) {
  const nextMessages = messages.map((message) => ({
    ...message,
    content: Array.isArray(message?.content) ? [...message.content] : [],
  }))
  let changed = false

  nextMessages.forEach((message) => {
    if (!Array.isArray(message?.content)) {
      return
    }
    const filtered = message.content.filter((content: ChatRenderContent) => {
      return content?.type !== 'activity-loading'
    })
    if (filtered.length !== message.content.length) {
      message.content = filtered
      changed = true
    }
  })

  return changed ? nextMessages : null
}

function flushPendingAssistantStructuredContent() {
  if (!pendingAssistantSuggestions.value?.length && !pendingAssistantForm.value?.fields?.length) {
    return
  }

  const nextMessages = chatMessages.value.map((message) => ({
    ...message,
    content: Array.isArray(message?.content) ? [...message.content] : [],
  }))
  const targetMessage = [...nextMessages]
    .reverse()
    .find((message) => message?.role === 'assistant' && Array.isArray(message?.content))
  if (!targetMessage) {
    return
  }

  targetMessage.content = targetMessage.content.filter(
    (content: ChatRenderContent) =>
      content?.type !== 'suggestion' && content?.type !== 'activity-form',
  )

  const memoryStatusIndex = targetMessage.content.findIndex((content: ChatRenderContent) => {
    return (
      content?.type === 'markdown' &&
      typeof content?.data === 'string' &&
      content.data.includes('<!--memory-status:')
    )
  })
  const insertionIndex = memoryStatusIndex === -1 ? targetMessage.content.length : memoryStatusIndex
  const structuredContent = pendingAssistantSuggestions.value?.length
    ? [createSuggestionContent(pendingAssistantSuggestions.value)]
    : pendingAssistantForm.value?.fields?.length
      ? [createFormActivityContent(pendingAssistantForm.value)]
      : []

  if (structuredContent.length) {
    targetMessage.content.splice(insertionIndex, 0, ...structuredContent)
  }

  pendingAssistantSuggestions.value = null
  pendingAssistantForm.value = null
  applyChatMessages(nextMessages)
}

function initializeFormDrafts(messages: ChatRenderMessage[]) {
  messages.forEach((message) => {
    if (!Array.isArray(message?.content)) {
      return
    }
    message.content.forEach((content: ChatRenderContent, index: number) => {
      const schema = extractActivityFormSchema(content)
      if (!schema) {
        return
      }
      const activitySlotName = content.slotName || `activity-form-${index}`
      const formId = `${message.id}-${activitySlotName}`
      if (!formDrafts[formId]) {
        formDrafts[formId] = createInitialFormValues(schema)
      }
      if (submittedForms[formId] === undefined) {
        submittedForms[formId] = false
      }
    })
  })
}

function handleChatMessageChange(event: ChatMessageChangeEvent) {
  const messages = Array.isArray(event)
    ? event
    : event && 'detail' in event && Array.isArray(event.detail)
      ? event.detail
      : []
  rawChatMessages.value = withMessageDatetimes(
    messages.filter((message) => message?.role !== 'system'),
    rawChatMessages.value,
  )
  const renderedMessages = withSystemStatusMessages(withTimeSeparators(rawChatMessages.value), [
    { key: 'ui-loading', text: currentAssistantLoadingText.value },
    { key: 'memory-status', text: currentMemoryStatusText.value },
  ])
  chatMessages.value = renderedMessages
  initializeFormDrafts(renderedMessages)
  if (pendingAssistantSuggestions.value?.length || pendingAssistantForm.value?.fields?.length) {
    nextTick(() => {
      flushPendingAssistantStructuredContent()
    })
  }
  if (pendingAssistantMemoryStatus.value) {
    nextTick(() => {
      flushPendingAssistantMemoryStatus()
    })
  }
}

async function submitChatForm(slot: ChatFormSlot) {
  if (isChatResponding.value) {
    MessagePlugin.warning('请等待当前回复结束后再提交表单')
    return
  }
  const values = formDrafts[slot.formId] || {}

  for (const field of slot.schema.fields) {
    if (!field.required) {
      continue
    }

    const value = values[field.name]
    const isEmpty = Array.isArray(value)
      ? value.length === 0
      : value === '' || value === null || value === undefined
    if (isEmpty) {
      MessagePlugin.warning(`请填写${field.label}`)
      return
    }
  }

  const prompt = buildFormPrompt(slot.schema, values)
  if (!prompt.trim()) {
    MessagePlugin.warning('表单内容不能为空')
    return
  }

  submittedForms[slot.formId] = true
  try {
    await chatbotRef.value?.sendUserMessage?.({ prompt })
  } catch (error) {
    submittedForms[slot.formId] = false
    MessagePlugin.error(error instanceof Error ? error.message : '表单提交失败')
  }
}

async function refreshCurrentSessionState() {
  if (!sessionId.value) {
    return
  }

  try {
    const response = await getSession(sessionId.value)
    applySessionMemory(response.session.memory)
    applyMemorySchema(response.session.memorySchema)
    applyStructuredMemory(response.session.structuredMemory)
    applySessionUsage(response.session.usage)
  } catch {
    // Ignore transient session refresh failures and keep the current values.
  }
}

async function loadRobotTemplates() {
  const response = await getRobots()
  robotTemplates.value = response.robots
  if (!robotTemplates.value.some((item) => item.id === selectedNewChatRobotId.value) && response.robots.length) {
    selectedNewChatRobotId.value = response.robots[0]!.id
  }
  if (!robotTemplates.value.some((item) => item.id === editingAgentId.value) && response.robots.length) {
    editingAgentId.value = response.robots[0]!.id
  }
}

function createRobotTemplate(): AIRobotCard {
  return {
    id: `robot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: '新智能体',
    description: '',
    avatar: '',
    systemPrompt: '',
    structuredMemoryInterval: DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    structuredMemoryHistoryLimit: DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
    memorySchema: normalizeMemorySchema(DEFAULT_MEMORY_SCHEMA),
  }
}

function syncMobileAgentDraft(source?: Partial<AIRobotCard> | null) {
  const fallback = createRobotTemplate()
  mobileAgentDraft.id = String(source?.id || fallback.id)
  mobileAgentDraft.name = String(source?.name || '')
  mobileAgentDraft.description = String(source?.description || '')
  mobileAgentDraft.avatar = String(source?.avatar || '')
  mobileAgentDraft.systemPrompt = String(source?.systemPrompt || '')
  mobileAgentDraft.structuredMemoryInterval =
    typeof source?.structuredMemoryInterval === 'number' && source.structuredMemoryInterval > 0
      ? Math.round(source.structuredMemoryInterval)
      : fallback.structuredMemoryInterval
  mobileAgentDraft.structuredMemoryHistoryLimit =
    typeof source?.structuredMemoryHistoryLimit === 'number' && source.structuredMemoryHistoryLimit > 0
      ? Math.round(source.structuredMemoryHistoryLimit)
      : fallback.structuredMemoryHistoryLimit
  mobileAgentDraft.memorySchema = normalizeMemorySchema(source?.memorySchema || fallback.memorySchema)
}

function syncMobileModelDraft(source?: Partial<AIModelConfigItem> | null) {
  const provider: ProviderType = 'openai'
  const fallback = createModelConfig(provider)
  mobileModelDraft.id = String(source?.id || fallback.id)
  mobileModelDraft.name = String(source?.name || '')
  mobileModelDraft.provider = provider
  mobileModelDraft.baseUrl = String(source?.baseUrl || fallback.baseUrl)
  mobileModelDraft.apiKey = String(source?.apiKey || '')
  mobileModelDraft.model = String(source?.model || '')
  mobileModelDraft.description = String(source?.description || '')
  mobileModelDraft.tags = normalizeModelTags(source?.tags || fallback.tags)
  mobileModelTagsInput.value = mobileModelDraft.tags.join(', ')
  mobileModelDraft.temperature =
    typeof source?.temperature === 'number' || source?.temperature === null
      ? source.temperature
      : fallback.temperature
}

function syncDesktopModelDraft(source?: Partial<AIModelConfigItem> | null) {
  const provider: ProviderType = 'openai'
  const fallback = createModelConfig(provider)
  desktopModelDraft.id = String(source?.id || fallback.id)
  desktopModelDraft.name = String(source?.name || '')
  desktopModelDraft.provider = provider
  desktopModelDraft.baseUrl = String(source?.baseUrl || fallback.baseUrl)
  desktopModelDraft.apiKey = String(source?.apiKey || '')
  desktopModelDraft.model = String(source?.model || '')
  desktopModelDraft.description = String(source?.description || '')
  desktopModelDraft.tags = normalizeModelTags(source?.tags || fallback.tags)
  desktopModelTagsInput.value = desktopModelDraft.tags.join(', ')
  desktopModelDraft.temperature =
    typeof source?.temperature === 'number' || source?.temperature === null
      ? source.temperature
      : fallback.temperature
}

async function persistRobotTemplates(nextTemplates: AIRobotCard[], successMessage: string) {
  const payload = nextTemplates.length
    ? nextTemplates.map((item, index) => ({
        ...item,
        name: item.name.trim() || `智能体 ${index + 1}`,
        description: item.description.trim(),
        avatar: item.avatar.trim(),
        structuredMemoryInterval: Math.max(1, Math.round(item.structuredMemoryInterval || DEFAULT_STRUCTURED_MEMORY_INTERVAL)),
        structuredMemoryHistoryLimit: Math.max(1, Math.round(item.structuredMemoryHistoryLimit || DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT)),
        memorySchema: normalizeMemorySchema(item.memorySchema),
      }))
    : [createRobotTemplate()]

  const response = await saveRobots(payload)
  robotTemplates.value = response.robots.length ? response.robots : [createRobotTemplate()]
  if (!robotTemplates.value.some((item) => item.id === selectedNewChatRobotId.value)) {
    selectedNewChatRobotId.value = robotTemplates.value[0]?.id || ''
  }
  if (!robotTemplates.value.some((item) => item.id === editingAgentId.value)) {
    editingAgentId.value = robotTemplates.value[0]?.id || ''
  }
  MessagePlugin.success(successMessage)
}

async function persistModelConfigs(
  nextConfigs: AIModelConfigItem[],
  nextActiveModelId: string,
  successMessage: string,
) {
  const payload = nextConfigs.length
    ? nextConfigs.map((item, index) => ({
        ...item,
        name: item.name.trim() || `模型配置 ${index + 1}`,
        baseUrl: item.baseUrl.trim(),
        apiKey: item.apiKey.trim(),
        description: item.description.trim(),
        tags: normalizeModelTags(item.tags),
      }))
    : [createModelConfig()]

  const activeId = payload.some((item) => item.id === nextActiveModelId)
    ? nextActiveModelId
    : payload[0]!.id

  const response = await saveModelConfigs(payload, activeId)
  const mergedConfigs = response.configs.map((item) => {
    const submitted = payload.find((candidate) => candidate.id === item.id)
    if (!submitted) {
      return item
    }
    return {
      ...item,
      description: submitted.description,
      tags: submitted.tags,
    }
  })
  applyModelConfigs(mergedConfigs, response.activeModelConfigId)
  await loadCapabilities()
  await syncCurrentSessionMeta()
  MessagePlugin.success(successMessage)
}

function openAgentManageDialog() {
  editingAgentId.value = editingAgentId.value || robotTemplates.value[0]?.id || ''
  agentManageVisible.value = true
}

function addAgentTemplate() {
  openMobileAgentCreateDialog()
}

function goToAgentEditorStep(step: 1 | 2 | 3) {
  agentEditorStep.value = step
}

function openMobileAgentCreateDialog() {
  mobileAgentEditorMode.value = 'create'
  editingMobileAgentId.value = ''
  editingAgentId.value = ''
  syncMobileAgentDraft(createRobotTemplate())
  goToAgentEditorStep(1)
  mobileAgentEditorVisible.value = true
}

function openMobileAgentEditDialog(agentId: string) {
  const target = robotTemplates.value.find((item) => item.id === agentId)
  if (!target) {
    return
  }
  mobileAgentEditorMode.value = 'edit'
  editingMobileAgentId.value = agentId
  editingAgentId.value = agentId
  syncMobileAgentDraft(target)
  goToAgentEditorStep(1)
  mobileAgentEditorVisible.value = true
}

function nextAgentEditorStep() {
  if (agentEditorStep.value < 3) {
    agentEditorStep.value = (agentEditorStep.value + 1) as 1 | 2 | 3
  }
}

function previousAgentEditorStep() {
  if (agentEditorStep.value > 1) {
    agentEditorStep.value = (agentEditorStep.value - 1) as 1 | 2 | 3
  }
}

function openMobileModelCreateDialog() {
  mobileModelEditorMode.value = 'create'
  editingMobileModelId.value = ''
  syncMobileModelDraft(createModelConfig('openai', modelConfigs.value.length + 1))
  mobileModelEditorVisible.value = true
}

function openMobileModelEditDialog(configId: string) {
  const target = modelConfigs.value.find((item) => item.id === configId)
  if (!target) {
    return
  }
  mobileModelEditorMode.value = 'edit'
  editingMobileModelId.value = configId
  syncMobileModelDraft(target)
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [target.id]: modelOptionsMap.value[target.id] || [],
  }
  mobileModelEditorVisible.value = true
}

function openDesktopModelCreateDialog() {
  desktopModelEditorMode.value = 'create'
  editingDesktopModelId.value = ''
  syncDesktopModelDraft(createModelConfig('openai', modelConfigs.value.length + 1))
  desktopModelEditorVisible.value = true
}

function openDesktopModelEditDialog(configId: string) {
  const target = modelConfigs.value.find((item) => item.id === configId)
  if (!target) {
    return
  }
  desktopModelEditorMode.value = 'edit'
  editingDesktopModelId.value = configId
  syncDesktopModelDraft(target)
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [target.id]: modelOptionsMap.value[target.id] || [],
  }
  desktopModelEditorVisible.value = true
}

async function removeMobileAgent(agentId: string) {
  savingMobileAgent.value = true
  try {
    const nextTemplates = robotTemplates.value.filter((item) => item.id !== agentId)
    await persistRobotTemplates(nextTemplates, '智能体已删除')
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return
    }
    MessagePlugin.error(error instanceof Error ? error.message : '删除智能体失败')
  } finally {
    savingMobileAgent.value = false
  }
}

function handleAgentCardAction(agentId: string, action?: string | number | Record<string, unknown>) {
  const nextAction = String(action || '')
  if (nextAction === 'edit') {
    openMobileAgentEditDialog(agentId)
    return
  }
  if (nextAction === 'delete') {
    void removeMobileAgent(agentId)
  }
}

async function saveMobileAgent() {
  savingMobileAgent.value = true
  try {
    const nextAgent: AIRobotCard = {
      ...mobileAgentDraft,
      name: mobileAgentDraft.name.trim(),
      description: mobileAgentDraft.description.trim(),
      avatar: mobileAgentDraft.avatar.trim(),
      systemPrompt: mobileAgentDraft.systemPrompt,
      structuredMemoryInterval: Math.max(1, Math.round(mobileAgentDraft.structuredMemoryInterval || DEFAULT_STRUCTURED_MEMORY_INTERVAL)),
      structuredMemoryHistoryLimit: Math.max(1, Math.round(mobileAgentDraft.structuredMemoryHistoryLimit || DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT)),
      memorySchema: normalizeMemorySchema(mobileAgentDraft.memorySchema),
    }
    const nextTemplates =
      mobileAgentEditorMode.value === 'edit'
        ? robotTemplates.value.map((item) => (item.id === editingMobileAgentId.value ? nextAgent : item))
        : [...robotTemplates.value, nextAgent]

    await persistRobotTemplates(
      nextTemplates,
      mobileAgentEditorMode.value === 'edit' ? '智能体已更新' : '智能体已新增',
    )

    if (mobileAgentEditorMode.value === 'create') {
      selectedNewChatRobotId.value = nextAgent.id
      editingAgentId.value = nextAgent.id
    } else {
      editingAgentId.value = nextAgent.id
    }

    mobileAgentEditorVisible.value = false
    agentManageVisible.value = false
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return
    }
    MessagePlugin.error(error instanceof Error ? error.message : '保存智能体失败')
  } finally {
    savingMobileAgent.value = false
  }
}

async function skipAgentStructureSetup() {
  await saveMobileAgent()
}

function handleMobileModelProviderChange(value: unknown) {
  const nextProvider: ProviderType = 'openai'
  const defaults = DEFAULT_MODEL_CONFIGS[nextProvider]
  mobileModelDraft.provider = nextProvider
  mobileModelDraft.baseUrl = defaults.baseUrl
  mobileModelDraft.apiKey = ''
  mobileModelDraft.model = ''
  mobileModelDraft.temperature = mobileModelDraft.temperature ?? defaults.temperature
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [mobileModelDraft.id]: [],
  }
}

function handleDesktopModelProviderChange(value: unknown) {
  const nextProvider: ProviderType = 'openai'
  const defaults = DEFAULT_MODEL_CONFIGS[nextProvider]
  desktopModelDraft.provider = nextProvider
  desktopModelDraft.baseUrl = defaults.baseUrl
  desktopModelDraft.apiKey = ''
  desktopModelDraft.model = ''
  desktopModelDraft.temperature = desktopModelDraft.temperature ?? defaults.temperature
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [desktopModelDraft.id]: [],
  }
}

async function refreshMobileModelOptions() {
  await refreshModelsForConfig(mobileModelDraft)
}

async function refreshDesktopModelOptions() {
  await refreshModelsForConfig(desktopModelDraft)
}

async function handleMobileModelTestConnection() {
  testingConnection.value = true
  try {
    await refreshModelsForConfig({
      ...mobileModelDraft,
      name: mobileModelDraft.name.trim() || '未命名配置',
      baseUrl: mobileModelDraft.baseUrl.trim(),
      apiKey: mobileModelDraft.apiKey.trim(),
    })
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '连接失败')
  } finally {
    testingConnection.value = false
  }
}

async function handleDesktopModelTestConnection() {
  testingConnection.value = true
  try {
    await refreshModelsForConfig({
      ...desktopModelDraft,
      name: desktopModelDraft.name.trim() || '未命名配置',
      baseUrl: desktopModelDraft.baseUrl.trim(),
      apiKey: desktopModelDraft.apiKey.trim(),
    })
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '连接失败')
  } finally {
    testingConnection.value = false
  }
}

async function saveMobileModel() {
  savingMobileModel.value = true
  try {
    const nextConfig: AIModelConfigItem = {
      ...mobileModelDraft,
      name: mobileModelDraft.name.trim(),
      baseUrl: mobileModelDraft.baseUrl.trim(),
      apiKey: mobileModelDraft.apiKey.trim(),
      description: mobileModelDraft.description.trim(),
      tags: normalizeModelTags(mobileModelTagsInput.value),
    }
    const nextConfigs =
      mobileModelEditorMode.value === 'edit'
        ? modelConfigs.value.map((item) => (item.id === editingMobileModelId.value ? nextConfig : item))
        : [...modelConfigs.value, nextConfig]

    await persistModelConfigs(
      nextConfigs,
      nextConfig.id,
      mobileModelEditorMode.value === 'edit' ? '模型配置已更新' : '模型配置已新增',
    )
    mobileModelEditorVisible.value = false
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    savingMobileModel.value = false
  }
}

async function removeMobileModel(configId: string) {
  savingMobileModel.value = true
  try {
    const nextConfigs = modelConfigs.value.filter((item) => item.id !== configId)
    const nextActiveModelId =
      activeModelConfigId.value === configId ? nextConfigs[0]?.id || createModelConfig().id : activeModelConfigId.value
    await persistModelConfigs(nextConfigs, nextActiveModelId, '模型配置已删除')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除模型配置失败')
  } finally {
    savingMobileModel.value = false
  }
}

function handleMobileModelCardAction(configId: string, action?: string | number | Record<string, unknown>) {
  const nextAction = String(action || '')
  if (nextAction === 'edit') {
    openMobileModelEditDialog(configId)
    return
  }
  if (nextAction === 'delete') {
    void removeMobileModel(configId)
  }
}

async function saveDesktopModel() {
  savingDesktopModel.value = true
  try {
    const nextConfig: AIModelConfigItem = {
      ...desktopModelDraft,
      name: desktopModelDraft.name.trim(),
      baseUrl: desktopModelDraft.baseUrl.trim(),
      apiKey: desktopModelDraft.apiKey.trim(),
      description: desktopModelDraft.description.trim(),
      tags: normalizeModelTags(desktopModelTagsInput.value),
    }
    const nextConfigs =
      desktopModelEditorMode.value === 'edit'
        ? modelConfigs.value.map((item) =>
            item.id === editingDesktopModelId.value ? nextConfig : item,
          )
        : [...modelConfigs.value, nextConfig]

    await persistModelConfigs(
      nextConfigs,
      nextConfig.id,
      desktopModelEditorMode.value === 'edit' ? '模型配置已更新' : '模型配置已新增',
    )
    desktopModelEditorVisible.value = false
    configVisible.value = false
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    savingDesktopModel.value = false
  }
}

async function removeDesktopModel(configId: string) {
  savingDesktopModel.value = true
  try {
    const nextConfigs = modelConfigs.value.filter((item) => item.id !== configId)
    const nextActiveModelId =
      activeModelConfigId.value === configId
        ? nextConfigs[0]?.id || createModelConfig().id
        : activeModelConfigId.value
    await persistModelConfigs(nextConfigs, nextActiveModelId, '模型配置已删除')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '删除模型配置失败')
  } finally {
    savingDesktopModel.value = false
  }
}

function handleDesktopModelCardAction(configId: string, action?: string | number | Record<string, unknown>) {
  const nextAction = String(action || '')
  if (nextAction === 'edit') {
    openDesktopModelEditDialog(configId)
    return
  }
  if (nextAction === 'delete') {
    void removeDesktopModel(configId)
  }
}

async function syncCurrentSessionMeta() {
  const response = await upsertSession({
    id: sessionId.value,
    robot: {
      name: sessionRobot.name,
      avatar: sessionRobot.avatar,
      systemPrompt: sessionRobot.systemPrompt,
      structuredMemoryInterval: sessionRobot.structuredMemoryInterval,
      structuredMemoryHistoryLimit: sessionRobot.structuredMemoryHistoryLimit,
    },
    memory: normalizeSessionMemory(DEFAULT_SESSION_MEMORY),
    modelConfigId: activeModelConfig.value.id,
    modelLabel: currentModelLabel.value,
    memorySchema: currentMemorySchema,
  })
  storeActiveSessionId(response.session.id)
  sessionId.value = response.session.id
  applySessionMemory(response.session.memory)
  applyMemorySchema(response.session.memorySchema)
  applyStructuredMemory(response.session.structuredMemory)
  applySessionUsage(response.session.usage)
  await refreshSessionHistory()
}

async function hydrateSession(session: ChatSessionDetail) {
  sessionId.value = session.id
  sessionRobot.name = session.robot.name || '当前智能体'
  sessionRobot.avatar = session.robot.avatar || ''
  sessionRobot.systemPrompt = session.robot.systemPrompt || ''
  sessionRobot.structuredMemoryInterval = session.robot.structuredMemoryInterval || DEFAULT_SESSION_MEMORY.structuredMemoryInterval
  sessionRobot.structuredMemoryHistoryLimit = session.robot.structuredMemoryHistoryLimit || DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit
  applySessionMemory(session.memory)
  applyMemorySchema(session.memorySchema)
  applyStructuredMemory(session.structuredMemory)
  applySessionUsage(session.usage)
  storeActiveSessionId(session.id)

  if (
    session.modelConfigId &&
    session.modelConfigId !== activeModelConfigId.value &&
    modelConfigs.value.some((item) => item.id === session.modelConfigId)
  ) {
    activeModelConfigId.value = session.modelConfigId
    await loadCapabilities()
  }

  await nextTick()
  applyChatMessages(normalizeSessionMessages(session))
}

async function createNewChat(robot?: AIRobotCard | null) {
  if (robot) {
    sessionRobot.name = robot.name.trim() || '当前智能体'
    sessionRobot.avatar = robot.avatar || ''
    sessionRobot.systemPrompt = robot.systemPrompt
    sessionRobot.structuredMemoryInterval = robot.structuredMemoryInterval || DEFAULT_SESSION_MEMORY.structuredMemoryInterval
    sessionRobot.structuredMemoryHistoryLimit = robot.structuredMemoryHistoryLimit || DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit
    applyMemorySchema(robot.memorySchema)
  } else {
    sessionRobot.name = '当前智能体'
    sessionRobot.avatar = ''
    sessionRobot.systemPrompt = ''
    sessionRobot.structuredMemoryInterval = DEFAULT_SESSION_MEMORY.structuredMemoryInterval
    sessionRobot.structuredMemoryHistoryLimit = DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit
    applyMemorySchema(DEFAULT_MEMORY_SCHEMA)
  }
  applySessionMemory({
    ...DEFAULT_SESSION_MEMORY,
    structuredMemoryInterval: robot?.structuredMemoryInterval || DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    structuredMemoryHistoryLimit: robot?.structuredMemoryHistoryLimit || DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  })
  applyStructuredMemory(DEFAULT_STRUCTURED_MEMORY)
  applySessionUsage(DEFAULT_SESSION_USAGE)
  sessionId.value = createSessionId()
  storeActiveSessionId(sessionId.value)
  await nextTick()
  applyChatMessages([])
  await syncCurrentSessionMeta()
}

function openMemoryDialog() {
  Object.assign(sessionMemoryDraft, normalizeSessionMemory(DEFAULT_SESSION_MEMORY))
  memoryVisible.value = true
}

function openNewChatDialog() {
  if (robotTemplates.value.length) {
    selectedNewChatRobotId.value = selectedNewChatRobotId.value || robotTemplates.value[0]!.id
    newChatVisible.value = true
    return
  }
  MessagePlugin.warning('暂无智能体卡片，请先去“设置智能体”中新增')
}

async function confirmStartNewChat() {
  if (!selectedNewChatRobot.value) {
    MessagePlugin.warning('请先选择一个智能体')
    return
  }
  await createNewChat(selectedNewChatRobot.value)
  newChatVisible.value = false
  sidebarDrawerVisible.value = false
}

function handleNewChatEntry() {
  sidebarDrawerVisible.value = false
  openNewChatDialog()
}

function handleGoToRobotPage() {
  sidebarDrawerVisible.value = false
  openAgentManageDialog()
}

function switchStream() {
  if (showStreamToggle.value) {
    streamEnabled.value = !streamEnabled.value
  }
}

function switchThinking() {
  if (showThinkingToggle.value) {
    thinkingEnabled.value = !thinkingEnabled.value
  }
}

function openSessionRobotDialog() {
  sessionRobotDraft.name = sessionRobot.name
  sessionRobotDraft.avatar = sessionRobot.avatar
  sessionRobotDraft.systemPrompt = sessionRobot.systemPrompt
  sessionRobotDraft.structuredMemoryInterval = sessionRobot.structuredMemoryInterval
  sessionRobotDraft.structuredMemoryHistoryLimit = sessionRobot.structuredMemoryHistoryLimit
  sessionRobotVisible.value = true
}

async function applySessionRobot() {
  sessionRobot.name = sessionRobotDraft.name.trim() || '当前智能体'
  sessionRobot.avatar = sessionRobotDraft.avatar.trim()
  sessionRobot.systemPrompt = sessionRobotDraft.systemPrompt
  sessionRobot.structuredMemoryInterval = sessionRobotDraft.structuredMemoryInterval
  sessionRobot.structuredMemoryHistoryLimit = sessionRobotDraft.structuredMemoryHistoryLimit
  sessionRobotVisible.value = false
  await syncCurrentSessionMeta()
}

async function applySessionMemorySettings() {
  applySessionMemory(sessionMemoryDraft)
  memoryVisible.value = false
  await syncCurrentSessionMeta()
}

async function openHistorySession(targetSessionId: string) {
  const opened = await openHistorySessionRecord(targetSessionId)
  if (opened) {
    sidebarDrawerVisible.value = false
  }
}

async function handleDeleteSession(targetSessionId: string) {
  await handleDeleteSessionRecord(targetSessionId)
}

function syncEditingConfig(config: AIModelConfigItem) {
  editingConfig.id = config.id
  editingConfig.name = config.name
  editingConfig.provider = config.provider
  editingConfig.baseUrl = config.baseUrl
  editingConfig.apiKey = config.apiKey
  editingConfig.model = config.model
  editingConfig.description = config.description
  editingConfig.tags = normalizeModelTags(config.tags)
  editingConfig.temperature = config.temperature
}

function commitEditingConfig() {
  modelConfigs.value = modelConfigs.value.map((item) =>
    item.id === editingConfig.id
      ? {
          ...editingConfig,
          name: editingConfig.name.trim() || item.name || '未命名配置',
          description: String(editingConfig.description || '').trim(),
          tags: normalizeModelTags(editingConfig.tags),
        }
      : item,
  )
}

function selectEditingConfig(configId: string) {
  commitEditingConfig()
  const target = modelConfigs.value.find((item) => item.id === configId)
  if (!target) {
    return
  }
  editingConfigId.value = target.id
  syncEditingConfig(target)
}

function addModelConfig() {
  commitEditingConfig()
  const next = createModelConfig('openai', modelConfigs.value.length + 1)
  modelConfigs.value = [...modelConfigs.value, next]
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [next.id]: [],
  }
  editingConfigId.value = next.id
  syncEditingConfig(next)
}

function removeModelConfig(configId: string) {
  const nextList = modelConfigs.value.filter((item) => item.id !== configId)
  if (!nextList.length) {
    const fallback = createModelConfig('openai', 1)
    modelConfigs.value = [fallback]
    activeModelConfigId.value = fallback.id
    editingConfigId.value = fallback.id
    modelOptionsMap.value = { [fallback.id]: [] }
    syncEditingConfig(fallback)
    syncCurrentSessionMeta()
    return
  }

  modelConfigs.value = nextList
  if (activeModelConfigId.value === configId) {
    activeModelConfigId.value = nextList[0]!.id
    loadCapabilities()
    syncCurrentSessionMeta()
  }
  if (editingConfigId.value === configId) {
    editingConfigId.value = nextList[0]!.id
    syncEditingConfig(nextList[0]!)
  }

  const nextMap = { ...modelOptionsMap.value }
  delete nextMap[configId]
  modelOptionsMap.value = nextMap
}

async function setActiveModel(configId: string) {
  if (activeModelConfigId.value === configId) {
    return
  }
  commitEditingConfig()
  activeModelConfigId.value = configId
  await loadCapabilities()
  await syncCurrentSessionMeta()
}

async function setActiveModelAndClose(configId: string) {
  if (activeModelConfigId.value !== configId) {
    await setActiveModel(configId)
  }
  configVisible.value = false
}

function openConfigDialog() {
  if (!modelConfigs.value.length) {
    addModelConfig()
  } else {
    selectEditingConfig(editingConfigId.value || modelConfigs.value[0]!.id)
  }
  configVisible.value = true
}

function applyModelConfigs(configs: AIModelConfigItem[], activeId: string) {
  const normalized = (configs.length ? configs : [createModelConfig()]).map((item, index) => ({
    ...item,
    name: String(item.name || `模型配置 ${index + 1}`),
    description: String(item.description || '').trim(),
    tags: normalizeModelTags(item.tags),
  }))
  modelConfigs.value = normalized
  activeModelConfigId.value = normalized.some((item) => item.id === activeId)
    ? activeId
    : normalized[0]!.id
  const editingTarget =
    normalized.find((item) => item.id === editingConfigId.value) ?? normalized[0]!
  editingConfigId.value = editingTarget.id
  syncEditingConfig(editingTarget)
}

async function loadCapabilities() {
  const current = activeModelConfig.value
  if (!current.model) {
    capabilities.value = { supportsStreaming: true, supportsReasoning: false }
    return
  }

  capabilities.value = await getCapabilities(current.provider, current.model)
}

async function refreshModelsForConfig(config: AIModelConfigItem) {
  loadingModels.value = true
  try {
    const models = await testModelConnection(config)
    modelOptionsMap.value = {
      ...modelOptionsMap.value,
      [config.id]: models.models,
    }
    if (!config.model || !models.models.some((item) => item.id === config.model)) {
      editingConfig.model = models.models[0]?.id ?? ''
    }
    MessagePlugin.success(models.message)
  } finally {
    loadingModels.value = false
  }
}

async function refreshEditingModels() {
  await refreshModelsForConfig(editingConfig)
}

async function initializePage() {
  if (isInitializingAgent.value) {
    initDebug('initializePage skipped: already running')
    return false
  }

  isInitializingAgent.value = true
  try {
    initDebug('initializePage start', {
      route: String(route.name || ''),
      authLoaded: Boolean(isAuthLoaded.value),
      signedIn: isSignedInNow(),
      hasInitialized: hasInitializedAgent.value,
    })
    await waitForAuthReady()
    if (!isSignedInNow()) {
      initDebug('initializePage stop: not signed in after auth ready', {
        authLoaded: Boolean(isAuthLoaded.value),
        signedIn: isSignedInNow(),
      })
      return false
    }
    initDebug('request getModelConfigs')
    const { configs, activeModelConfigId: activeId } = await getModelConfigs()
    initDebug('getModelConfigs success', {
      configCount: configs.length,
      activeId,
    })
    applyModelConfigs(configs, activeId)
    await loadCapabilities()
    initDebug('loadCapabilities success', {
      activeModel: activeModelConfig.value.model,
    })
    await loadRobotTemplates()
    initDebug('loadRobotTemplates success', {
      robotCount: robotTemplates.value.length,
    })
    await refreshSessionHistory()
    initDebug('refreshSessionHistory success', {
      sessionCount: sessionHistory.value.length,
    })

    const storedSessionId = getStoredActiveSessionId()
    const initialSessionId = storedSessionId || sessionHistory.value[0]?.id
    initDebug('resolve initial session', {
      storedSessionId,
      initialSessionId: initialSessionId || '',
    })
    if (initialSessionId) {
      try {
        initDebug('request getSession', { sessionId: initialSessionId })
        const response = await getSession(initialSessionId)
        await hydrateSession(response.session)
        initDebug('getSession success', { sessionId: initialSessionId })
      } catch {
        initDebug('getSession failed, fallback createNewChat', { sessionId: initialSessionId })
        await createNewChat()
      }
    } else {
      initDebug('no session found, createNewChat')
      await createNewChat()
    }
    initDebug('initializePage success')
    return true
  } catch (error) {
    initDebug('initializePage failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    MessagePlugin.error(error instanceof Error ? error.message : '初始化失败')
    return false
  } finally {
    isInitializingAgent.value = false
    initDebug('initializePage end', {
      hasInitialized: hasInitializedAgent.value,
      isInitializing: isInitializingAgent.value,
    })
  }
}

async function ensureAgentInitialized() {
  initDebug('ensureAgentInitialized check', {
    route: String(route.name || ''),
    hasInitialized: hasInitializedAgent.value,
    signedIn: Boolean(isSignedIn.value),
    authLoaded: Boolean(isAuthLoaded.value),
  })
  if (hasInitializedAgent.value || !isSignedIn.value) {
    initDebug('ensureAgentInitialized skipped', {
      hasInitialized: hasInitializedAgent.value,
      signedIn: Boolean(isSignedIn.value),
    })
    return
  }

  if (await initializePage()) {
    hasInitializedAgent.value = true
    initDebug('ensureAgentInitialized marked initialized')
    await nextTick()
  }
}

function syncViewportMode() {
  if (typeof window === 'undefined') {
    return
  }
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
}

function handleProviderChange(value: unknown) {
  const nextProvider: ProviderType = 'openai'
  const defaults = DEFAULT_MODEL_CONFIGS[nextProvider]
  editingConfig.provider = nextProvider
  editingConfig.baseUrl = defaults.baseUrl
  editingConfig.apiKey = ''
  editingConfig.model = ''
  editingConfig.temperature = editingConfig.temperature ?? defaults.temperature
  modelOptionsMap.value = {
    ...modelOptionsMap.value,
    [editingConfig.id]: [],
  }
}

async function handleTestConnection() {
  testingConnection.value = true
  try {
    await refreshModelsForConfig({
      ...editingConfig,
      name: editingConfig.name.trim() || '未命名配置',
      baseUrl: editingConfig.baseUrl.trim(),
      apiKey: editingConfig.apiKey.trim(),
    })
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '连接失败')
  } finally {
    testingConnection.value = false
  }
}

async function saveAllModelConfigs() {
  savingConfig.value = true
  try {
    commitEditingConfig()
    const payload = modelConfigs.value.map((item, index) => ({
      ...item,
      name: item.name.trim() || `模型配置 ${index + 1}`,
      baseUrl: item.baseUrl.trim(),
      apiKey: item.apiKey.trim(),
      description: item.description.trim(),
      tags: normalizeModelTags(item.tags),
    }))
    const activeId = payload.some((item) => item.id === activeModelConfigId.value)
      ? activeModelConfigId.value
      : payload[0]!.id
    const response = await saveModelConfigs(payload, activeId)
    applyModelConfigs(response.configs, response.activeModelConfigId)
    configVisible.value = false
    await loadCapabilities()
    await syncCurrentSessionMeta()
    MessagePlugin.success('模型配置已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    savingConfig.value = false
  }
}

async function switchModel(data: { value?: string | number | Record<string, unknown> }) {
  const selectedValue = typeof data.value === 'string' ? data.value : ''
  if (selectedValue === 'setting') {
    openConfigDialog()
    return
  }
  if (!selectedValue || selectedValue === activeModelConfigId.value) {
    return
  }

  try {
    commitEditingConfig()
    const response = await saveModelConfigs(modelConfigs.value, selectedValue)
    applyModelConfigs(response.configs, response.activeModelConfigId)
    await loadCapabilities()
    await syncCurrentSessionMeta()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '切换模型失败')
  }
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

const chatServiceConfig = computed<ChatServiceConfig>(() => ({
  endpoint: '/api/chat/stream',
  stream: true,
  onRequest: async (params) => {
    isChatResponding.value = true
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionId.value,
        provider: activeModelConfig.value.provider,
        baseUrl: activeModelConfig.value.baseUrl,
        apiKey: activeModelConfig.value.apiKey,
        model: activeModelConfig.value.model,
        modelConfigId: activeModelConfig.value.id,
        modelLabel: currentModelLabel.value,
        systemPrompt: sessionRobot.systemPrompt,
        robot: {
          name: sessionRobot.name,
          avatar: sessionRobot.avatar,
          systemPrompt: sessionRobot.systemPrompt,
          structuredMemoryInterval: sessionRobot.structuredMemoryInterval,
          structuredMemoryHistoryLimit: sessionRobot.structuredMemoryHistoryLimit,
        },
        stream: effectiveStream.value,
        thinking: effectiveThinking.value,
        temperature: activeModelConfig.value.temperature,
        prompt: params.prompt ?? '',
      }),
    }
  },
  onMessage: (chunk: SSEChunkData): AIMessageContent | null => {
    const payload = chunk.data as NormalizedStreamPayload
    if (payload.type === 'error') {
      isChatResponding.value = false
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
      currentAssistantLoadingText.value = payload.message || '正在生成交互 UI'
      applyChatMessages(chatMessages.value)
      return null
    }
    if (payload.type === 'suggestion' && payload.items?.length) {
      currentAssistantLoadingText.value = ''
      applyChatMessages(chatMessages.value)
      pendingAssistantSuggestions.value = payload.items
      pendingAssistantForm.value = null
      nextTick(() => {
        flushPendingAssistantStructuredContent()
      })
      return null
    }
    if (payload.type === 'form' && payload.form?.fields?.length) {
      currentAssistantLoadingText.value = ''
      applyChatMessages(chatMessages.value)
      if (!pendingAssistantSuggestions.value?.length) {
        pendingAssistantForm.value = payload.form
      }
      nextTick(() => {
        flushPendingAssistantStructuredContent()
      })
      return null
    }
    if (payload.type === 'memory_status' && payload.message) {
      const status = createMemoryStatusContent(payload.status || 'running', payload.message)
      pendingAssistantMemoryStatus.value = status
      currentMemoryStatusText.value = payload.message
      applyChatMessages(chatMessages.value)
      nextTick(() => {
        flushPendingAssistantMemoryStatus()
      })
      return null
    }
    if (payload.type === 'usage') {
      applySessionUsage({
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
      applyStructuredMemory(payload.memory)
      return null
    }
    if (payload.type === 'done') {
      isChatResponding.value = false
      flushPendingAssistantStructuredContent()
      currentAssistantLoadingText.value = ''
      currentMemoryStatusText.value = ''
      applyChatMessages(chatMessages.value)
      refreshCurrentSessionState().catch(() => {})
      refreshSessionHistory().catch(() => {})
    }
    return null
  },
  onError: (error) => {
    isChatResponding.value = false
    currentAssistantLoadingText.value = ''
    currentMemoryStatusText.value = ''
    MessagePlugin.error(error instanceof Error ? error.message : '聊天失败')
  },
}))

onMounted(async () => {
  syncViewportMode()
  window.addEventListener('resize', syncViewportMode)
  initDebug('onMounted')
  await ensureAgentInitialized()
})

watch(
  activePrimaryTab,
  async () => {
    initDebug('activePrimaryTab changed', {
      route: String(route.name || ''),
      tab: activePrimaryTab.value,
    })
    await ensureAgentInitialized()
  },
  { immediate: false },
)

watch(
  [isAuthLoaded, isSignedIn],
  async ([loaded, signedIn], previous) => {
    const [previousLoaded, previousSignedIn] = previous ?? []
    initDebug('auth watch fired', {
      loaded,
      signedIn,
      previousLoaded: previousLoaded ?? null,
      previousSignedIn: previousSignedIn ?? null,
      route: String(route.name || ''),
    })
    if (!loaded) {
      return
    }

    if (!signedIn) {
      hasInitializedAgent.value = false
      initDebug('auth watch reset initialized: signed out')
      return
    }

    if (!previousLoaded || !previousSignedIn) {
      initDebug('auth watch trigger ensureAgentInitialized')
      await ensureAgentInitialized()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (typeof window === 'undefined') {
    return
  }
  window.removeEventListener('resize', syncViewportMode)
})

  return {
    activePrimaryTab,
    sidebarDrawerVisible,
    newChatVisible,
    configVisible,
    agentManageVisible,
    mobileAgentEditorVisible,
    mobileModelEditorVisible,
    desktopModelEditorVisible,
    sessionRobotVisible,
    memoryVisible,
    savingConfig,
    savingMobileAgent,
    savingMobileModel,
    savingDesktopModel,
    loadingModels,
    testingConnection,
    chatbotRef,
    chatbotRuntimeKey,
    sessionId,
    sessionHistory,
    deletingSessionId,
    robotTemplates,
    selectedNewChatRobotId,
    editingAgentId,
    agentEditorStep,
    mobileAgentEditorMode,
    editingMobileAgentId,
    mobileModelEditorMode,
    editingMobileModelId,
    desktopModelEditorMode,
    editingDesktopModelId,
    isEditingAgentDraft,
    submittedForms,
    isChatResponding,
    modelConfigs,
    modelOptionsMap,
    editingConfigId,
    activeModelConfigId,
    editingConfig,
    sessionRobotDraft,
    sessionMemoryDraft,
    mobileAgentDraft,
    mobileModelDraft,
    desktopModelDraft,
    mobileModelTagsInput,
    desktopModelTagsInput,
    mobileOverlayProps,
    currentRobotLabel,
    currentModelLabel,
    sessionPromptTokens,
    sessionCompletionTokens,
    promptTokenAnimation,
    promptTokenAnimationStart,
    completionTokenAnimation,
    completionTokenAnimationStart,
    effectiveStream,
    effectiveThinking,
    showStreamToggle,
    showThinkingToggle,
    formActivitySlots,
    loadingActivitySlots,
    memoryStatusActivitySlots,
    editingModelOptions,
    temperatureValue,
    mobileModelTemperatureValue,
    desktopModelTemperatureValue,
    agentCardActionOptions,
    modelCardActionOptions,
    memoryUpdatedLabel,
    memoryDisplayCategories,
    structuredMemoryRecordCount,
    currentMemorySchema,
    currentStructuredMemory,
    providerOptions,
    chatMessageProps,
    chatServiceConfig,
    handleChatMessageChange,
    getFormDraft,
    submitChatForm,
    switchStream,
    switchThinking,
    switchModel,
    openConfigDialog,
    refreshEditingModels,
    handleTestConnection,
    handleProviderChange,
    saveAllModelConfigs,
    openMobileModelCreateDialog,
    openMobileModelEditDialog,
    openDesktopModelCreateDialog,
    openDesktopModelEditDialog,
    handleMobileModelProviderChange,
    handleDesktopModelProviderChange,
    refreshMobileModelOptions,
    refreshDesktopModelOptions,
    handleMobileModelTestConnection,
    handleDesktopModelTestConnection,
    handleAgentCardAction,
    handleMobileModelCardAction,
    handleDesktopModelCardAction,
    saveMobileModel,
    saveDesktopModel,
    removeMobileModel,
    removeDesktopModel,
    selectEditingConfig,
    setActiveModel,
    setActiveModelAndClose,
    removeModelConfig,
    addModelConfig,
    openAgentManageDialog,
    addAgentTemplate,
    openMobileAgentCreateDialog,
    openMobileAgentEditDialog,
    nextAgentEditorStep,
    previousAgentEditorStep,
    skipAgentStructureSetup,
    removeMobileAgent,
    saveMobileAgent,
    openSessionRobotDialog,
    applySessionRobot,
    openMemoryDialog,
    applySessionMemorySettings,
    confirmStartNewChat,
    handleNewChatEntry,
    handleGoToRobotPage,
    openHistorySession,
    handleDeleteSession,
    isMobile,
  }
}
