import {
  DEFAULT_MEMORY_PROMPT,
  DEFAULT_MEMORY_SCHEMA,
  DEFAULT_MEMORY_THRESHOLD,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_RECENT_MESSAGE_LIMIT,
  DEFAULT_ROBOTS,
  DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  DEFAULT_STRUCTURED_MEMORY_INTERVAL,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSION_ROBOT,
  DEFAULT_SESSIONS_PAYLOAD,
  DEFAULT_STRUCTURED_MEMORY,
  PROVIDER_DEFAULTS,
} from './constants.mjs'
import { normalizeFormSchema, normalizeSuggestionItems, safeJsonParse } from './structured.mjs'

export {
  DEFAULT_MEMORY_SCHEMA,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSION_ROBOT,
  DEFAULT_SESSIONS_PAYLOAD,
  DEFAULT_STRUCTURED_MEMORY,
  safeJsonParse,
}

export function createSessionTitle(text, fallback = '新对话') {
  const compact = String(text || '').replace(/\s+/g, ' ').trim()
  if (!compact) {
    return fallback
  }
  return compact.length > 24 ? `${compact.slice(0, 24)}...` : compact
}

export function normalizeModelConfig(input, index = 0) {
  const provider = 'openai'
  const defaults = PROVIDER_DEFAULTS[provider]
  const tags = Array.isArray(input?.tags)
    ? input.tags
    : typeof input?.tags === 'string'
      ? input.tags.split(/[,\n，]/)
      : []

  return {
    id: String(input?.id || `model-${index + 1}`),
    name: String(input?.name || `模型配置 ${index + 1}`),
    provider,
    baseUrl: String(input?.baseUrl || defaults.baseUrl).trim(),
    apiKey: String(input?.apiKey || '').trim(),
    model: String(input?.model || '').trim(),
    description: String(input?.description || '').trim(),
    tags: tags
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item, tagIndex, list) => list.indexOf(item) === tagIndex),
    temperature:
      typeof input?.temperature === 'number' && Number.isFinite(input.temperature) ? input.temperature : defaults.temperature,
  }
}

export function normalizeModelConfigsPayload(input) {
  const list = Array.isArray(input?.configs) ? input.configs : Array.isArray(input) ? input : []
  const configs = list.length ? list.map((item, index) => normalizeModelConfig(item, index)) : [normalizeModelConfig(DEFAULT_MODEL_CONFIG, 0)]
  const activeModelConfigId = configs.some((item) => item.id === input?.activeModelConfigId)
    ? input.activeModelConfigId
    : configs[0].id

  return {
    configs,
    activeModelConfigId,
  }
}

export function normalizeRobots(input) {
  const list = Array.isArray(input) ? input : []
  const robots = list.map((robot, index) => ({
    id: String(robot?.id || `robot-${index + 1}`),
    name: String(robot?.name || `智能体 ${index + 1}`),
    description: String(robot?.description || ''),
    avatar: String(robot?.avatar || '').trim(),
    systemPrompt: String(robot?.systemPrompt || ''),
    structuredMemoryInterval:
      typeof robot?.structuredMemoryInterval === 'number' && Number.isInteger(robot.structuredMemoryInterval) && robot.structuredMemoryInterval > 0
        ? robot.structuredMemoryInterval
        : DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    structuredMemoryHistoryLimit:
      typeof robot?.structuredMemoryHistoryLimit === 'number' && Number.isInteger(robot.structuredMemoryHistoryLimit) && robot.structuredMemoryHistoryLimit > 0
        ? robot.structuredMemoryHistoryLimit
        : DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
    memorySchema: normalizeMemorySchema(robot?.memorySchema || robot?.memory_schema || DEFAULT_MEMORY_SCHEMA),
  }))

  return robots.length ? robots : DEFAULT_ROBOTS
}

export function normalizeSessionRobot(input) {
  return {
    name: String(input?.name || DEFAULT_SESSION_ROBOT.name),
    avatar: String(input?.avatar || '').trim(),
    systemPrompt: String(input?.systemPrompt || ''),
    structuredMemoryInterval:
      typeof input?.structuredMemoryInterval === 'number' && Number.isInteger(input.structuredMemoryInterval) && input.structuredMemoryInterval > 0
        ? input.structuredMemoryInterval
        : DEFAULT_SESSION_ROBOT.structuredMemoryInterval,
    structuredMemoryHistoryLimit:
      typeof input?.structuredMemoryHistoryLimit === 'number' && Number.isInteger(input.structuredMemoryHistoryLimit) && input.structuredMemoryHistoryLimit > 0
        ? input.structuredMemoryHistoryLimit
        : DEFAULT_SESSION_ROBOT.structuredMemoryHistoryLimit,
  }
}

function normalizeMemorySchemaFieldOption(input, index = 0) {
  return {
    label: String(input?.label || `选项 ${index + 1}`).trim(),
    value: String(input?.value || `option_${index + 1}`).trim(),
  }
}

function normalizeMemorySchemaField(input, index = 0) {
  const type = ['text', 'number', 'enum', 'boolean', 'object', 'array'].includes(String(input?.type))
    ? String(input.type)
    : 'text'
  const field = {
    id: String(input?.id || `${String(input?.name || 'field').trim() || 'field'}-${index + 1}`),
    name: String(input?.name || `field_${index + 1}`).trim() || `field_${index + 1}`,
    label: String(input?.label || input?.name || `字段 ${index + 1}`).trim() || `字段 ${index + 1}`,
    type,
    required: Boolean(input?.required),
  }

  if (type === 'enum') {
    return {
      ...field,
      options: (Array.isArray(input?.options) ? input.options : []).map((item, optionIndex) => normalizeMemorySchemaFieldOption(item, optionIndex)),
    }
  }

  if (type === 'object') {
    return {
      ...field,
      fields: (Array.isArray(input?.fields) ? input.fields : []).map((item, fieldIndex) => normalizeMemorySchemaField(item, fieldIndex)),
    }
  }

  if (type === 'array') {
    const itemType = ['text', 'number', 'enum', 'boolean', 'object'].includes(String(input?.itemType))
      ? String(input.itemType)
      : 'text'
    return {
      ...field,
      itemType,
      itemOptions: itemType === 'enum'
        ? (Array.isArray(input?.itemOptions) ? input.itemOptions : []).map((item, optionIndex) => normalizeMemorySchemaFieldOption(item, optionIndex))
        : [],
      itemFields: itemType === 'object'
        ? (Array.isArray(input?.itemFields) ? input.itemFields : []).map((item, fieldIndex) => normalizeMemorySchemaField(item, fieldIndex))
        : [],
    }
  }

  return field
}

function normalizeMemorySchemaCategory(input, index = 0) {
  const id = String(input?.id || input?.name || `category_${index + 1}`).trim() || `category_${index + 1}`
  return {
    id,
    label: String(input?.label || id).trim() || id,
    description: String(input?.description || '').trim(),
    extractionInstructions: String(input?.extractionInstructions || input?.extraction_instructions || '').trim(),
    fields: (Array.isArray(input?.fields) ? input.fields : []).map((item, fieldIndex) => normalizeMemorySchemaField(item, fieldIndex)),
  }
}

export function normalizeMemorySchema(input) {
  const categories = (Array.isArray(input?.categories) ? input.categories : [])
    .map((item, index) => normalizeMemorySchemaCategory(item, index))
    .filter((item) => item.id && item.fields.length)

  return {
    categories: categories.length ? categories : DEFAULT_MEMORY_SCHEMA.categories.map((item, index) => normalizeMemorySchemaCategory(item, index)),
  }
}

export function normalizeSessionUsage(input) {
  return {
    promptTokens:
      typeof input?.promptTokens === 'number' && Number.isFinite(input.promptTokens) && input.promptTokens >= 0
        ? input.promptTokens
        : 0,
    completionTokens:
      typeof input?.completionTokens === 'number' && Number.isFinite(input.completionTokens) && input.completionTokens >= 0
        ? input.completionTokens
        : 0,
  }
}

export function normalizeSessionMemory(input) {
  const threshold =
    typeof input?.threshold === 'number' && Number.isInteger(input.threshold) && input.threshold > 0
      ? input.threshold
      : DEFAULT_MEMORY_THRESHOLD
  const recentMessageLimit =
    typeof input?.recentMessageLimit === 'number' && Number.isInteger(input.recentMessageLimit) && input.recentMessageLimit > 0
      ? input.recentMessageLimit
      : DEFAULT_RECENT_MESSAGE_LIMIT
  const structuredMemoryInterval =
    typeof input?.structuredMemoryInterval === 'number' && Number.isInteger(input.structuredMemoryInterval) && input.structuredMemoryInterval > 0
      ? input.structuredMemoryInterval
      : DEFAULT_STRUCTURED_MEMORY_INTERVAL
  const structuredMemoryHistoryLimit =
    typeof input?.structuredMemoryHistoryLimit === 'number' && Number.isInteger(input.structuredMemoryHistoryLimit) && input.structuredMemoryHistoryLimit > 0
      ? input.structuredMemoryHistoryLimit
      : DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT

  return {
    summary: String(input?.summary || ''),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
    sourceMessageCount:
      typeof input?.sourceMessageCount === 'number' && Number.isInteger(input.sourceMessageCount) && input.sourceMessageCount >= 0
        ? input.sourceMessageCount
        : 0,
    threshold,
    recentMessageLimit,
    prompt: typeof input?.prompt === 'string' && input.prompt.trim() ? input.prompt : DEFAULT_MEMORY_PROMPT,
    structuredMemoryInterval,
    structuredMemoryHistoryLimit,
  }
}

function normalizeStructuredPreference(input, index = 0) {
  const key = String(input?.key || input?.name || `preference_${index + 1}`).trim()
  const value = String(input?.value || '').trim()
  if (!key || !value) {
    return null
  }

  return {
    key,
    value,
    confidence:
      typeof input?.confidence === 'number' && Number.isFinite(input.confidence)
        ? Math.max(0, Math.min(1, input.confidence))
        : 0.5,
    sourceTurnId: String(input?.sourceTurnId || input?.source_turn_id || '').trim(),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
  }
}

function normalizeStructuredFact(input, index = 0) {
  const subject = String(input?.subject || '').trim()
  const predicate = String(input?.predicate || '').trim()
  const value = String(input?.value ?? input?.object ?? '').trim()
  if (!subject || !predicate || !value) {
    return null
  }

  return {
    subject,
    predicate,
    value,
    confidence:
      typeof input?.confidence === 'number' && Number.isFinite(input.confidence)
        ? Math.max(0, Math.min(1, input.confidence))
        : 0.5,
    sourceTurnId: String(input?.sourceTurnId || input?.source_turn_id || '').trim(),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
  }
}

function normalizeStructuredTask(input, index = 0) {
  const title = String(input?.title || `任务 ${index + 1}`).trim()
  const status = ['todo', 'in_progress', 'blocked', 'done'].includes(String(input?.status))
    ? String(input.status)
    : 'todo'

  return {
    title,
    status,
    details: String(input?.details || '').trim(),
    owner: String(input?.owner || '').trim(),
    nextStep: String(input?.nextStep || input?.next_step || '').trim(),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
  }
}

export function normalizeStructuredMemory(input) {
  return {
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
    categories: (Array.isArray(input?.categories) ? input.categories : []).map((category, categoryIndex) => ({
      categoryId: String(category?.categoryId || category?.category_id || `category_${categoryIndex + 1}`).trim(),
      label: String(category?.label || '').trim(),
      description: String(category?.description || '').trim(),
      updatedAt: typeof category?.updatedAt === 'string' ? category.updatedAt : '',
      items: (Array.isArray(category?.items) ? category.items : []).map((item, itemIndex) => ({
        id: String(item?.id || `item_${itemIndex + 1}`).trim(),
        summary: String(item?.summary || '').trim(),
        sourceTurnId: String(item?.sourceTurnId || item?.source_turn_id || '').trim(),
        updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : '',
        values: typeof item?.values === 'object' && item?.values !== null ? item.values : {},
      })),
    })).filter((category) => category.categoryId),
  }
}

export function normalizeSessionMessage(input, index = 0) {
  const role = input?.role === 'assistant' ? 'assistant' : 'user'
  const createdAt = typeof input?.createdAt === 'string' && input.createdAt ? input.createdAt : new Date().toISOString()
  const suggestions = role === 'assistant' ? normalizeSuggestionItems(input?.suggestions) : []
  const form = role === 'assistant' ? normalizeFormSchema(input?.form) : null

  return {
    id: String(input?.id || `message-${index + 1}`),
    role,
    content: String(input?.content || ''),
    reasoning: role === 'assistant' ? String(input?.reasoning || '') : '',
    suggestions,
    form,
    createdAt,
  }
}

export function normalizeSession(input, index = 0) {
  const messages = Array.isArray(input?.messages) ? input.messages.map((item, messageIndex) => normalizeSessionMessage(item, messageIndex)) : []
  const createdAt = typeof input?.createdAt === 'string' && input.createdAt ? input.createdAt : new Date().toISOString()
  const updatedAt = typeof input?.updatedAt === 'string' && input.updatedAt ? input.updatedAt : createdAt
  const firstUserMessage = messages.find((item) => item.role === 'user')?.content || ''
  const preview = String(input?.preview || messages[messages.length - 1]?.content || '').trim()

  return {
    id: String(input?.id || `session-${index + 1}`),
    title: createSessionTitle(input?.title || firstUserMessage),
    preview,
    createdAt,
    updatedAt,
    robot: normalizeSessionRobot(input?.robot),
    modelConfigId: String(input?.modelConfigId || ''),
    modelLabel: String(input?.modelLabel || ''),
    threadId: String(input?.threadId || input?.thread_id || input?.id || `thread-${index + 1}`),
    messages,
    memory: normalizeSessionMemory(input?.memory || DEFAULT_SESSION_MEMORY),
    memorySchema: normalizeMemorySchema(input?.memorySchema || input?.memory_schema || input?.robot?.memorySchema || DEFAULT_MEMORY_SCHEMA),
    structuredMemory: normalizeStructuredMemory(input?.structuredMemory || input?.structured_memory || DEFAULT_STRUCTURED_MEMORY),
    usage: normalizeSessionUsage(input?.usage),
  }
}

export function normalizeSessionsPayload(input) {
  const sessions = Array.isArray(input?.sessions) ? input.sessions.map((item, index) => normalizeSession(item, index)) : []

  return {
    sessions: sessions.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
  }
}

export function buildSessionSummary(session) {
  return {
    id: session.id,
    title: session.title,
    preview: session.preview,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    robotName: session.robot?.name || DEFAULT_SESSION_ROBOT.name,
    modelConfigId: session.modelConfigId || '',
    modelLabel: session.modelLabel || '',
    threadId: session.threadId || session.id,
    usage: normalizeSessionUsage(session.usage),
  }
}
