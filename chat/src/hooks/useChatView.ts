import type { AIMessageContent, ChatServiceConfig, SSEChunkData } from '@tdesign-vue-next/chat'
import { MessagePlugin } from 'tdesign-vue-next'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useChatSession } from '@/hooks/useChatSession'
import { useTokenStatisticAnimation } from '@/hooks/useTokenStatisticAnimation'
import {
  clearSessionMemory,
  getCapabilities,
  getModelConfigs,
  getRobots,
  getSession,
  saveModelConfigs,
  testModelConnection,
  updateSessionMemory,
  upsertSession,
} from '@/lib/api'
import type {
  AIFormField,
  AIFormSchema,
  AIModelConfigItem,
  AIRobotCard,
  ChatSessionDetail,
  ModelCapabilities,
  ModelOption,
  ProviderType,
  SessionMemoryState,
  SessionUsageState,
  SessionRobotState,
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
    | 'done'
    | 'error'
  text?: string
  message?: string
  items?: SuggestionOption[]
  form?: AIFormSchema | null
  status?: 'running' | 'success' | 'error'
  promptTokens?: number
  completionTokens?: number
}

type ChatFormSlot = {
  slotName: string
  formId: string
  schema: AIFormSchema
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
const DEFAULT_SESSION_MEMORY: SessionMemoryState = {
  summary: '',
  updatedAt: '',
  sourceMessageCount: 0,
  threshold: 20,
  recentMessageLimit: 10,
}
const DEFAULT_SESSION_USAGE: SessionUsageState = {
  promptTokens: 0,
  completionTokens: 0,
}
const MOBILE_BREAKPOINT = 768

const DEFAULT_MODEL_CONFIGS: Record<
  ProviderType,
  Omit<AIModelConfigItem, 'id' | 'name' | 'model'>
> = {
  ollama: {
    provider: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    apiKey: '',
    temperature: 0.7,
  },
  openai: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    temperature: 0.7,
  },
}

function createModelConfig(provider: ProviderType = 'ollama', index = 1): AIModelConfigItem {
  return {
    id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `模型配置 ${index}`,
    ...DEFAULT_MODEL_CONFIGS[provider],
    model: '',
  }
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
  }
}

function normalizeSessionMessages(session: ChatSessionDetail) {
  return session.messages.map((item, index) => {
    if (item.role === 'user') {
      return {
        id: `${session.id}-user-${index}`,
        role: 'user',
        name: '',
        datetime: item.createdAt,
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
      datetime: item.createdAt,
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
  const statusLabel = status === 'running' ? '整理中' : status === 'success' ? '已更新' : '失败'
  return `<!--memory-status:${status}-->\n> **长期记忆 ${statusLabel}**  \n> ${text}`
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
    if (Array.isArray(field.defaultValue)) {
      result[field.name] = [...field.defaultValue]
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

const providerOptions = [
  { label: 'Ollama', value: 'ollama' },
  { label: 'OpenAI', value: 'openai' },
]

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
const sessionRobotVisible = ref(false)
const memoryVisible = ref(false)
const savingConfig = ref(false)
const loadingModels = ref(false)
const testingConnection = ref(false)
const savingMemory = ref(false)
const clearingMemory = ref(false)
const chatbotRef = ref<ChatbotInstance | null>(null)
const chatInstanceKey = ref(0)
const robotTemplates = ref<AIRobotCard[]>([])
const selectedNewChatRobotId = ref('')
const pendingChatMessages = ref<ChatRenderMessage[] | null>(null)
const pendingAssistantSuggestions = ref<SuggestionOption[] | null>(null)
const pendingAssistantForm = ref<AIFormSchema | null>(null)
const chatMessages = ref<ChatRenderMessage[]>([])
const pendingAssistantMemoryStatus = ref<MemoryStatusState | null>(null)
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

const editingConfig = reactive<AIModelConfigItem>(createModelConfig())
const currentMemory = reactive<SessionMemoryState>({ ...DEFAULT_SESSION_MEMORY })
const currentUsage = reactive<SessionUsageState>({ ...DEFAULT_SESSION_USAGE })
const memoryDraft = reactive<SessionMemoryState>({ ...DEFAULT_SESSION_MEMORY })
const sessionRobot = reactive<SessionRobotState>({
  name: '当前机器人',
  avatar: '',
  systemPrompt: '',
})
const sessionRobotDraft = reactive<SessionRobotState>({
  name: '',
  avatar: '',
  systemPrompt: '',
})
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

const activeModelConfig = computed(
  () =>
    modelConfigs.value.find((item) => item.id === activeModelConfigId.value) ??
    modelConfigs.value[0] ??
    createModelConfig(),
)
const currentRobotLabel = computed(() => sessionRobot.name.trim() || '当前机器人')
const currentModelLabel = computed(
  () => activeModelConfig.value.name || activeModelConfig.value.model || '选择模型',
)
const selectedNewChatRobot = computed(
  () => robotTemplates.value.find((item) => item.id === selectedNewChatRobotId.value) ?? null,
)
const memoryUpdatedLabel = computed(() =>
  currentMemory.updatedAt ? new Date(currentMemory.updatedAt).toLocaleString() : '未生成',
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
const modelDropdownOptions = computed<ModelDropdownItem[]>(() => [
  ...modelConfigs.value.map((item, index) => ({
    content: item.name || item.model || '未命名配置',
    value: item.id,
    divider: index === modelConfigs.value.length - 1,
  })),
  { content: '配置', value: 'setting' },
])
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

function applySessionMemory(memory?: Partial<SessionMemoryState> | null) {
  const normalized = normalizeSessionMemory(memory)
  currentMemory.summary = normalized.summary
  currentMemory.updatedAt = normalized.updatedAt
  currentMemory.sourceMessageCount = normalized.sourceMessageCount
  currentMemory.threshold = normalized.threshold
  currentMemory.recentMessageLimit = normalized.recentMessageLimit
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
  pendingChatMessages.value = messages
  chatMessages.value = messages
  initializeFormDrafts(messages)
  const instance = chatbotRef.value
  if (!instance) {
    return
  }
  if (!messages.length) {
    instance.clearMessages?.()
  } else {
    instance.setMessages?.(messages, 'replace')
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

  const withoutMemoryStatus = targetMessage.content.filter((content: ChatRenderContent) => {
    return !(
      content?.type === 'markdown' &&
      typeof content?.data === 'string' &&
      content.data.includes('<!--memory-status:')
    )
  })
  const insertionIndex = withoutMemoryStatus.findIndex((content: ChatRenderContent) => {
    return content?.type === 'suggestion' || content?.type === 'activity-form'
  })
  const memoryStatusContent = {
    type: 'markdown',
    data: buildMemoryStatusMarkdown(status, text),
  }

  if (insertionIndex === -1) {
    withoutMemoryStatus.push(memoryStatusContent)
  } else {
    withoutMemoryStatus.splice(insertionIndex, 0, memoryStatusContent)
  }

  targetMessage.content = withoutMemoryStatus
  return nextMessages
}

function flushPendingAssistantMemoryStatus() {
  const pendingStatus = pendingAssistantMemoryStatus.value
  if (!pendingStatus) {
    return
  }

  const nextMessages = injectAssistantMemoryStatus(
    chatMessages.value,
    pendingStatus.status,
    pendingStatus.text,
  )
  if (!nextMessages) {
    return
  }

  pendingAssistantMemoryStatus.value = null
  applyChatMessages(nextMessages)
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
  chatMessages.value = messages
  initializeFormDrafts(messages)
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

function syncMemoryDraftFromCurrentMemory() {
  memoryDraft.summary = currentMemory.summary
  memoryDraft.updatedAt = currentMemory.updatedAt
  memoryDraft.sourceMessageCount = currentMemory.sourceMessageCount
  memoryDraft.threshold = currentMemory.threshold
  memoryDraft.recentMessageLimit = currentMemory.recentMessageLimit
}

async function refreshCurrentSessionState() {
  if (!sessionId.value) {
    return
  }

  try {
    const response = await getSession(sessionId.value)
    applySessionMemory(response.session.memory)
    applySessionUsage(response.session.usage)
    if (memoryVisible.value) {
      syncMemoryDraftFromCurrentMemory()
    }
  } catch {
    // Ignore transient session refresh failures and keep the current values.
  }
}

async function loadRobotTemplates() {
  const response = await getRobots()
  robotTemplates.value = response.robots
  if (!selectedNewChatRobotId.value && response.robots.length) {
    selectedNewChatRobotId.value = response.robots[0]!.id
  }
}

async function syncCurrentSessionMeta() {
  const response = await upsertSession({
    id: sessionId.value,
    robot: {
      name: sessionRobot.name,
      avatar: sessionRobot.avatar,
      systemPrompt: sessionRobot.systemPrompt,
    },
    modelConfigId: activeModelConfig.value.id,
    modelLabel: currentModelLabel.value,
    memory: {
      threshold: currentMemory.threshold,
      recentMessageLimit: currentMemory.recentMessageLimit,
    },
  })
  storeActiveSessionId(response.session.id)
  sessionId.value = response.session.id
  applySessionMemory(response.session.memory)
  applySessionUsage(response.session.usage)
  await refreshSessionHistory()
}

async function hydrateSession(session: ChatSessionDetail) {
  sessionId.value = session.id
  sessionRobot.name = session.robot.name || '当前机器人'
  sessionRobot.avatar = session.robot.avatar || ''
  sessionRobot.systemPrompt = session.robot.systemPrompt || ''
  applySessionMemory(session.memory)
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
    sessionRobot.name = robot.name.trim() || '当前机器人'
    sessionRobot.avatar = robot.avatar || ''
    sessionRobot.systemPrompt = robot.systemPrompt
  }
  applySessionMemory(DEFAULT_SESSION_MEMORY)
  applySessionUsage(DEFAULT_SESSION_USAGE)
  sessionId.value = createSessionId()
  storeActiveSessionId(sessionId.value)
  await nextTick()
  applyChatMessages([])
  await syncCurrentSessionMeta()
}

function openMemoryDialog() {
  syncMemoryDraftFromCurrentMemory()
  memoryVisible.value = true
}

function openNewChatDialog() {
  if (robotTemplates.value.length) {
    selectedNewChatRobotId.value = selectedNewChatRobotId.value || robotTemplates.value[0]!.id
    newChatVisible.value = true
    return
  }
  MessagePlugin.warning('暂无机器人卡片，请先去“设置机器人”中新增')
}

async function confirmStartNewChat() {
  if (!selectedNewChatRobot.value) {
    MessagePlugin.warning('请先选择一个机器人')
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
  goToRobotPage()
}

function goToRobotPage() {
  router.push({ name: 'robots' })
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
  sessionRobotVisible.value = true
}

async function applySessionRobot() {
  sessionRobot.name = sessionRobotDraft.name.trim() || '当前机器人'
  sessionRobot.avatar = sessionRobotDraft.avatar.trim()
  sessionRobot.systemPrompt = sessionRobotDraft.systemPrompt
  sessionRobotVisible.value = false
  await syncCurrentSessionMeta()
}

async function saveSessionMemoryConfig() {
  savingMemory.value = true
  try {
    const response = await updateSessionMemory(sessionId.value, {
      summary: memoryDraft.summary,
      threshold: Math.max(1, Math.round(memoryDraft.threshold || DEFAULT_SESSION_MEMORY.threshold)),
      recentMessageLimit: Math.max(
        1,
        Math.round(memoryDraft.recentMessageLimit || DEFAULT_SESSION_MEMORY.recentMessageLimit),
      ),
    })
    applySessionMemory(response.session.memory)
    memoryVisible.value = false
    MessagePlugin.success('会话记忆已保存')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '保存会话记忆失败')
  } finally {
    savingMemory.value = false
  }
}

async function clearCurrentSessionMemory() {
  clearingMemory.value = true
  try {
    const response = await clearSessionMemory(sessionId.value)
    applySessionMemory(response.session.memory)
    memoryDraft.summary = response.session.memory.summary
    memoryDraft.updatedAt = response.session.memory.updatedAt
    memoryDraft.sourceMessageCount = response.session.memory.sourceMessageCount
    memoryDraft.threshold = response.session.memory.threshold
    memoryDraft.recentMessageLimit = response.session.memory.recentMessageLimit
    MessagePlugin.success('会话记忆已清空')
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '清空会话记忆失败')
  } finally {
    clearingMemory.value = false
  }
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
  editingConfig.temperature = config.temperature
}

function commitEditingConfig() {
  modelConfigs.value = modelConfigs.value.map((item) =>
    item.id === editingConfig.id
      ? {
          ...editingConfig,
          name: editingConfig.name.trim() || item.name || '未命名配置',
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
  const next = createModelConfig('ollama', modelConfigs.value.length + 1)
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
    const fallback = createModelConfig('ollama', 1)
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

function openConfigDialog() {
  if (!modelConfigs.value.length) {
    addModelConfig()
  } else {
    selectEditingConfig(editingConfigId.value || modelConfigs.value[0]!.id)
  }
  configVisible.value = true
}

function applyModelConfigs(configs: AIModelConfigItem[], activeId: string) {
  const normalized = configs.length ? configs : [createModelConfig()]
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
  try {
    const { configs, activeModelConfigId: activeId } = await getModelConfigs()
    applyModelConfigs(configs, activeId)
    await loadCapabilities()
    await loadRobotTemplates()
    await refreshSessionHistory()

    const storedSessionId = getStoredActiveSessionId()
    const initialSessionId = storedSessionId || sessionHistory.value[0]?.id
    if (initialSessionId) {
      try {
        const response = await getSession(initialSessionId)
        await hydrateSession(response.session)
      } catch {
        await createNewChat()
      }
    } else {
      await createNewChat()
    }
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '初始化失败')
  }
}

function syncViewportMode() {
  if (typeof window === 'undefined') {
    return
  }
  isMobile.value = window.innerWidth <= MOBILE_BREAKPOINT
}

function handleProviderChange(value: unknown) {
  const nextProvider: ProviderType = value === 'openai' ? 'openai' : 'ollama'
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
    if (payload.type === 'suggestion' && payload.items?.length) {
      pendingAssistantSuggestions.value = payload.items
      pendingAssistantForm.value = null
      return null
    }
    if (payload.type === 'form' && payload.form?.fields?.length) {
      if (!pendingAssistantSuggestions.value?.length) {
        pendingAssistantForm.value = payload.form
      }
      return null
    }
    if (payload.type === 'memory_status' && payload.message) {
      const status = createMemoryStatusContent(payload.status || 'running', payload.message)
      pendingAssistantMemoryStatus.value = status
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
    if (payload.type === 'done') {
      isChatResponding.value = false
      flushPendingAssistantStructuredContent()
      refreshCurrentSessionState().catch(() => {})
      refreshSessionHistory().catch(() => {})
    }
    return null
  },
  onError: (error) => {
    isChatResponding.value = false
    MessagePlugin.error(error instanceof Error ? error.message : '聊天失败')
  },
}))

onMounted(async () => {
  syncViewportMode()
  window.addEventListener('resize', syncViewportMode)
  if (activePrimaryTab.value === 'agent' && !hasInitializedAgent.value) {
    hasInitializedAgent.value = true
    await initializePage()
    await nextTick()
  }
})

watch(
  activePrimaryTab,
  async (tab) => {
    if (tab !== 'agent' || hasInitializedAgent.value) {
      return
    }
    hasInitializedAgent.value = true
    await initializePage()
    await nextTick()
  },
  { immediate: false },
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
    sessionRobotVisible,
    memoryVisible,
    savingConfig,
    loadingModels,
    testingConnection,
    savingMemory,
    clearingMemory,
    chatbotRef,
    chatbotRuntimeKey,
    sessionId,
    sessionHistory,
    deletingSessionId,
    robotTemplates,
    selectedNewChatRobotId,
    submittedForms,
    isChatResponding,
    modelConfigs,
    editingConfigId,
    activeModelConfigId,
    editingConfig,
    sessionRobotDraft,
    memoryDraft,
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
    modelDropdownOptions,
    editingModelOptions,
    temperatureValue,
    memoryUpdatedLabel,
    currentMemory,
    providerOptions,
    chatMessageProps,
    chatServiceConfig,
    handleChatMessageChange,
    getFormDraft,
    submitChatForm,
    switchStream,
    switchThinking,
    switchModel,
    refreshEditingModels,
    handleTestConnection,
    handleProviderChange,
    saveAllModelConfigs,
    selectEditingConfig,
    setActiveModel,
    removeModelConfig,
    addModelConfig,
    openSessionRobotDialog,
    applySessionRobot,
    openMemoryDialog,
    saveSessionMemoryConfig,
    clearCurrentSessionMemory,
    confirmStartNewChat,
    handleNewChatEntry,
    handleGoToRobotPage,
    openHistorySession,
    handleDeleteSession,
    isMobile,
  }
}
