import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const MODEL_CONFIGS_FILE = join(DATA_DIR, 'model-configs.json')
const LEGACY_MODEL_CONFIG_FILE = join(DATA_DIR, 'model-config.json')
const ROBOTS_FILE = join(DATA_DIR, 'robots.json')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')

let sessionState = DEFAULT_SESSIONS_PAYLOAD

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

export async function ensureDataFiles() {
  await mkdir(DATA_DIR, { recursive: true })

  try {
    await readFile(MODEL_CONFIGS_FILE, 'utf8')
  } catch {
    let nextData = DEFAULT_MODEL_CONFIGS
    try {
      const legacyRaw = await readFile(LEGACY_MODEL_CONFIG_FILE, 'utf8')
      nextData = normalizeModelConfigsPayload({
        configs: [safeJsonParse(legacyRaw, DEFAULT_MODEL_CONFIG)],
      })
    } catch {
      nextData = DEFAULT_MODEL_CONFIGS
    }
    await writeFile(MODEL_CONFIGS_FILE, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8')
  }

  try {
    await readFile(ROBOTS_FILE, 'utf8')
  } catch {
    await writeFile(ROBOTS_FILE, `${JSON.stringify(DEFAULT_ROBOTS, null, 2)}\n`, 'utf8')
  }

  try {
    const raw = await readFile(SESSIONS_FILE, 'utf8')
    sessionState = normalizeSessionsPayload(safeJsonParse(raw, DEFAULT_SESSIONS_PAYLOAD))
  } catch {
    sessionState = DEFAULT_SESSIONS_PAYLOAD
    await writeFile(SESSIONS_FILE, `${JSON.stringify(sessionState, null, 2)}\n`, 'utf8')
  }
}

export function listSessions() {
  return sessionState.sessions
}

export async function writeSessionsPayload(payload) {
  await ensureDataFiles()
  sessionState = normalizeSessionsPayload(payload)
  await writeFile(SESSIONS_FILE, `${JSON.stringify(sessionState, null, 2)}\n`, 'utf8')
}

export function getSessionRecord(sessionId) {
  return sessionState.sessions.find((item) => item.id === sessionId)
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

export async function saveSessionRecord(session) {
  const normalized = normalizeSession(session)
  const sessions = sessionState.sessions.filter((item) => item.id !== normalized.id)
  await writeSessionsPayload({ sessions: [normalized, ...sessions] })
  return normalized
}

export async function upsertSessionRecord(input) {
  const now = new Date().toISOString()
  const existing = input?.id ? getSessionRecord(String(input.id)) : null
  const nextSession = normalizeSession({
    ...(existing || {}),
    ...input,
    robot: input?.robot ? normalizeSessionRobot(input.robot) : existing?.robot,
    memory: normalizeSessionMemory({ ...(existing?.memory || DEFAULT_SESSION_MEMORY), ...(input?.memory || {}) }),
    messages: existing?.messages || input?.messages || [],
    createdAt: existing?.createdAt || input?.createdAt || now,
    updatedAt: now,
  })

  return saveSessionRecord(nextSession)
}

export async function updateSessionMemoryRecord(sessionId, patch) {
  const existing = getSessionRecord(sessionId)
  if (!existing) {
    return null
  }

  const currentMemory = normalizeSessionMemory(existing.memory)
  const nextMemory = normalizeSessionMemory({
    ...currentMemory,
    ...patch,
    updatedAt: Object.prototype.hasOwnProperty.call(patch || {}, 'summary') ? new Date().toISOString() : currentMemory.updatedAt,
    sourceMessageCount:
      typeof patch?.sourceMessageCount === 'number' ? patch.sourceMessageCount : currentMemory.sourceMessageCount,
  })

  return saveSessionRecord({
    ...existing,
    memory: nextMemory,
    updatedAt: new Date().toISOString(),
  })
}

export async function clearSessionMemoryRecord(sessionId) {
  const existing = getSessionRecord(sessionId)
  if (!existing) {
    return null
  }

  const currentMemory = normalizeSessionMemory(existing.memory)
  return saveSessionRecord({
    ...existing,
    memory: {
      ...currentMemory,
      summary: '',
      updatedAt: '',
      sourceMessageCount: 0,
    },
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteSessionRecord(sessionId) {
  const existing = getSessionRecord(sessionId)
  if (!existing) {
    return null
  }

  await writeSessionsPayload({
    sessions: sessionState.sessions.filter((item) => item.id !== sessionId),
  })

  return existing
}

export async function readModelConfigs() {
  await ensureDataFiles()
  const raw = await readFile(MODEL_CONFIGS_FILE, 'utf8')
  return normalizeModelConfigsPayload(safeJsonParse(raw, DEFAULT_MODEL_CONFIGS))
}

export async function writeModelConfigs(payload) {
  await ensureDataFiles()
  await writeFile(MODEL_CONFIGS_FILE, `${JSON.stringify(normalizeModelConfigsPayload(payload), null, 2)}\n`, 'utf8')
}

export async function readRobots() {
  await ensureDataFiles()
  const raw = await readFile(ROBOTS_FILE, 'utf8')
  return normalizeRobots(safeJsonParse(raw, []))
}

export async function writeRobots(robots) {
  await ensureDataFiles()
  await writeFile(ROBOTS_FILE, `${JSON.stringify(normalizeRobots(robots), null, 2)}\n`, 'utf8')
}
