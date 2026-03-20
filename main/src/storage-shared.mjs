import {
  DEFAULT_MEMORY_THRESHOLD,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_RECENT_MESSAGE_LIMIT,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSION_ROBOT,
  DEFAULT_SESSIONS_PAYLOAD,
  PROVIDER_DEFAULTS,
} from './constants.mjs'
import { normalizeFormSchema, normalizeSuggestionItems, safeJsonParse } from './structured.mjs'

export {
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSION_ROBOT,
  DEFAULT_SESSIONS_PAYLOAD,
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
  const provider = input?.provider === 'openai' ? 'openai' : 'ollama'
  const defaults = PROVIDER_DEFAULTS[provider]

  return {
    id: String(input?.id || `model-${index + 1}`),
    name: String(input?.name || `模型配置 ${index + 1}`),
    provider,
    baseUrl: String(input?.baseUrl || defaults.baseUrl).trim(),
    apiKey: provider === 'openai' ? String(input?.apiKey || '').trim() : '',
    model: String(input?.model || '').trim(),
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
    name: String(robot?.name || `机器人 ${index + 1}`),
    description: String(robot?.description || ''),
    avatar: String(robot?.avatar || '').trim(),
    systemPrompt: String(robot?.systemPrompt || ''),
  }))

  return robots.length ? robots : DEFAULT_ROBOTS
}

export function normalizeSessionRobot(input) {
  return {
    name: String(input?.name || DEFAULT_SESSION_ROBOT.name),
    avatar: String(input?.avatar || '').trim(),
    systemPrompt: String(input?.systemPrompt || ''),
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

  return {
    summary: String(input?.summary || ''),
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt : '',
    sourceMessageCount:
      typeof input?.sourceMessageCount === 'number' && Number.isInteger(input.sourceMessageCount) && input.sourceMessageCount >= 0
        ? input.sourceMessageCount
        : 0,
    threshold,
    recentMessageLimit,
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
    messages,
    memory: normalizeSessionMemory(input?.memory || DEFAULT_SESSION_MEMORY),
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
    usage: normalizeSessionUsage(session.usage),
  }
}
