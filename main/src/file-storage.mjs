import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  areSessionsEquivalentForPersistence,
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSIONS_PAYLOAD,
  DEFAULT_STRUCTURED_MEMORY,
  normalizeModelConfigsPayload,
  normalizeMemorySchema,
  normalizeRobots,
  normalizeSession,
  normalizeSessionMemory,
  normalizeSessionRobot,
  normalizeStructuredMemory,
  normalizeSessionsPayload,
  safeJsonParse,
} from './storage-shared.mjs'
import {
  cloneWorldGraphSnapshot,
  createEmptyWorldGraphSnapshot,
  getWorldGraph,
  normalizeWorldGraphSnapshot,
} from './world-graph-service.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const LEGACY_MODEL_CONFIG_FILE = join(DATA_DIR, 'model-config.json')
const USERS_DIR = join(DATA_DIR, 'users')

const sessionStateCache = new Map()

function resolveUserId(user) {
  const userId = String(user?.id || '').trim()
  if (!userId) {
    throw new Error('未授权访问')
  }
  return userId.replace(/[<>:"/\\|?*]+/g, '_')
}

function getUserFiles(user) {
  const userId = resolveUserId(user)
  const userDataDir = join(USERS_DIR, userId)

  return {
    userId,
    userDataDir,
    modelConfigsFile: join(userDataDir, 'model-configs.json'),
    robotsFile: join(userDataDir, 'robots.json'),
    sessionsFile: join(userDataDir, 'sessions.json'),
  }
}

export async function initializeStorage() {
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(USERS_DIR, { recursive: true })
}

export async function ensureUserRecord() {
  return null
}

async function ensureUserStorage(user) {
  await initializeStorage()
  const files = getUserFiles(user)
  await mkdir(files.userDataDir, { recursive: true })

  try {
    await readFile(files.modelConfigsFile, 'utf8')
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
    await writeFile(files.modelConfigsFile, `${JSON.stringify(nextData, null, 2)}\n`, 'utf8')
  }

  try {
    await readFile(files.robotsFile, 'utf8')
  } catch {
    await writeFile(files.robotsFile, `${JSON.stringify(DEFAULT_ROBOTS, null, 2)}\n`, 'utf8')
  }

  try {
    const raw = await readFile(files.sessionsFile, 'utf8')
    sessionStateCache.set(files.userId, normalizeSessionsPayload(safeJsonParse(raw, DEFAULT_SESSIONS_PAYLOAD)))
  } catch {
    sessionStateCache.set(files.userId, DEFAULT_SESSIONS_PAYLOAD)
    await writeFile(files.sessionsFile, `${JSON.stringify(DEFAULT_SESSIONS_PAYLOAD, null, 2)}\n`, 'utf8')
  }

  return files
}

async function getSessionState(user) {
  const files = await ensureUserStorage(user)
  return {
    files,
    state: sessionStateCache.get(files.userId) || DEFAULT_SESSIONS_PAYLOAD,
  }
}

export async function listSessions(user) {
  const { state } = await getSessionState(user)
  return state.sessions
}

async function writeSessionsPayload(user, payload) {
  const { files } = await getSessionState(user)
  const nextState = normalizeSessionsPayload(payload)
  const currentState = sessionStateCache.get(files.userId) || DEFAULT_SESSIONS_PAYLOAD
  if (JSON.stringify(currentState) === JSON.stringify(nextState)) {
    sessionStateCache.set(files.userId, nextState)
    return
  }
  sessionStateCache.set(files.userId, nextState)
  await writeFile(files.sessionsFile, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8')
}

export async function getSessionRecord(user, sessionId) {
  const { state } = await getSessionState(user)
  return state.sessions.find((item) => item.id === sessionId) || null
}

export async function saveSessionRecord(user, session) {
  const normalized = normalizeSession(session)
  const existing = await getSessionRecord(user, normalized.id)
  if (existing && areSessionsEquivalentForPersistence(existing, normalized)) {
    return existing
  }
  const { state } = await getSessionState(user)
  const sessions = state.sessions.filter((item) => item.id !== normalized.id)
  await writeSessionsPayload(user, { sessions: [normalized, ...sessions] })
  return normalized
}

export async function upsertSessionRecord(user, input) {
  const now = new Date().toISOString()
  const existing = input?.id ? await getSessionRecord(user, String(input.id)) : null
  let nextWorldGraph = input?.worldGraph || input?.world_graph || existing?.worldGraph || null
  if (!nextWorldGraph) {
    const robotId = String(input?.robot?.id || existing?.robot?.id || '').trim()
    const robotName = String(input?.robot?.name || existing?.robot?.name || '').trim()
    if (robotId) {
      try {
        nextWorldGraph = cloneWorldGraphSnapshot(await getWorldGraph(user, robotId))
      } catch {
        nextWorldGraph = createEmptyWorldGraphSnapshot(robotId, robotName)
      }
    }
  } else {
    nextWorldGraph = normalizeWorldGraphSnapshot(nextWorldGraph, {
      robotId: input?.robot?.id || existing?.robot?.id || '',
      robotName: input?.robot?.name || existing?.robot?.name || '',
    })
  }
  const nextSession = normalizeSession({
    ...(existing || {}),
    ...input,
    robot: input?.robot ? normalizeSessionRobot(input.robot) : existing?.robot,
    memory: normalizeSessionMemory({ ...(existing?.memory || DEFAULT_SESSION_MEMORY), ...(input?.memory || {}) }),
    memorySchema: normalizeMemorySchema(input?.memorySchema || existing?.memorySchema),
    structuredMemory: normalizeStructuredMemory(input?.structuredMemory || existing?.structuredMemory || DEFAULT_STRUCTURED_MEMORY),
    messages: existing?.messages || input?.messages || [],
    worldGraph: nextWorldGraph,
    createdAt: existing?.createdAt || input?.createdAt || now,
    updatedAt: now,
  })

  if (existing && areSessionsEquivalentForPersistence(existing, nextSession)) {
    return existing
  }

  return saveSessionRecord(user, nextSession)
}

export async function updateSessionMemoryRecord(user, sessionId, patch) {
  const existing = await getSessionRecord(user, sessionId)
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

  return saveSessionRecord(user, {
    ...existing,
    memory: nextMemory,
    updatedAt: new Date().toISOString(),
  })
}

export async function clearSessionMemoryRecord(user, sessionId) {
  const existing = await getSessionRecord(user, sessionId)
  if (!existing) {
    return null
  }

  const currentMemory = normalizeSessionMemory(existing.memory)
  return saveSessionRecord(user, {
    ...existing,
    memory: {
      ...currentMemory,
      summary: '',
      updatedAt: '',
      sourceMessageCount: 0,
      prompt: currentMemory.prompt,
    },
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteSessionRecord(user, sessionId) {
  const existing = await getSessionRecord(user, sessionId)
  if (!existing) {
    return null
  }

  const { state } = await getSessionState(user)
  await writeSessionsPayload(user, {
    sessions: state.sessions.filter((item) => item.id !== sessionId),
  })

  return existing
}

export async function readModelConfigs(user) {
  const { modelConfigsFile } = await ensureUserStorage(user)
  const raw = await readFile(modelConfigsFile, 'utf8')
  return normalizeModelConfigsPayload(safeJsonParse(raw, { configs: [], activeModelConfigId: '' }))
}

export async function writeModelConfigs(user, payload) {
  const { modelConfigsFile } = await ensureUserStorage(user)
  const normalized = normalizeModelConfigsPayload(payload)
  await writeFile(modelConfigsFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

export async function readRobots(user) {
  const { robotsFile } = await ensureUserStorage(user)
  const raw = await readFile(robotsFile, 'utf8')
  return normalizeRobots(safeJsonParse(raw, []))
}

export async function writeRobots(user, robots) {
  const { robotsFile } = await ensureUserStorage(user)
  const normalized = normalizeRobots(robots)
  await writeFile(robotsFile, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

export async function listChatUsersForAdmin() {
  await initializeStorage()
  const userIds = await readdir(USERS_DIR).catch(() => [])
  const result = []

  for (const userId of userIds) {
    const sessionsFile = join(USERS_DIR, userId, 'sessions.json')
    const raw = await readFile(sessionsFile, 'utf8').catch(() => '')
    const payload = normalizeSessionsPayload(safeJsonParse(raw, DEFAULT_SESSIONS_PAYLOAD))
    result.push({
      userId,
      userLabel: userId,
      userEmail: '',
      sessionCount: Array.isArray(payload.sessions) ? payload.sessions.length : 0,
      lastActiveAt: (payload.sessions || [])
        .map((item) => String(item?.updatedAt || ''))
        .sort((left, right) => (Date.parse(right) || 0) - (Date.parse(left) || 0))[0] || '',
    })
  }

  return result.sort((left, right) => (Date.parse(right.lastActiveAt) || 0) - (Date.parse(left.lastActiveAt) || 0))
}

export async function listChatSessionsForAdmin(userId) {
  const sessionsFile = join(USERS_DIR, String(userId || '').trim(), 'sessions.json')
  const raw = await readFile(sessionsFile, 'utf8').catch(() => '')
  const payload = normalizeSessionsPayload(safeJsonParse(raw, DEFAULT_SESSIONS_PAYLOAD))
  return (payload.sessions || []).map((item) => ({
    sessionId: item.id,
    sessionTitle: item.title,
    threadId: item.threadId,
    preview: item.preview,
    updatedAt: item.updatedAt,
  }))
}
