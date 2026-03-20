import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_MODEL_CONFIG,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSIONS_PAYLOAD,
  normalizeModelConfigsPayload,
  normalizeRobots,
  normalizeSession,
  normalizeSessionMemory,
  normalizeSessionRobot,
  normalizeSessionsPayload,
  safeJsonParse,
} from './storage-shared.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const MODEL_CONFIGS_FILE = join(DATA_DIR, 'model-configs.json')
const LEGACY_MODEL_CONFIG_FILE = join(DATA_DIR, 'model-config.json')
const ROBOTS_FILE = join(DATA_DIR, 'robots.json')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')

let sessionState = DEFAULT_SESSIONS_PAYLOAD

export async function initializeStorage() {
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

export async function listSessions() {
  return sessionState.sessions
}

async function writeSessionsPayload(payload) {
  await initializeStorage()
  sessionState = normalizeSessionsPayload(payload)
  await writeFile(SESSIONS_FILE, `${JSON.stringify(sessionState, null, 2)}\n`, 'utf8')
}

export async function getSessionRecord(sessionId) {
  return sessionState.sessions.find((item) => item.id === sessionId) || null
}

export async function saveSessionRecord(session) {
  const normalized = normalizeSession(session)
  const sessions = sessionState.sessions.filter((item) => item.id !== normalized.id)
  await writeSessionsPayload({ sessions: [normalized, ...sessions] })
  return normalized
}

export async function upsertSessionRecord(input) {
  const now = new Date().toISOString()
  const existing = input?.id ? await getSessionRecord(String(input.id)) : null
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
  const existing = await getSessionRecord(sessionId)
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
  const existing = await getSessionRecord(sessionId)
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
  const existing = await getSessionRecord(sessionId)
  if (!existing) {
    return null
  }

  await writeSessionsPayload({
    sessions: sessionState.sessions.filter((item) => item.id !== sessionId),
  })

  return existing
}

export async function readModelConfigs() {
  await initializeStorage()
  const raw = await readFile(MODEL_CONFIGS_FILE, 'utf8')
  return normalizeModelConfigsPayload(safeJsonParse(raw, DEFAULT_MODEL_CONFIGS))
}

export async function writeModelConfigs(payload) {
  await initializeStorage()
  const normalized = normalizeModelConfigsPayload(payload)
  await writeFile(MODEL_CONFIGS_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}

export async function readRobots() {
  await initializeStorage()
  const raw = await readFile(ROBOTS_FILE, 'utf8')
  return normalizeRobots(safeJsonParse(raw, []))
}

export async function writeRobots(robots) {
  await initializeStorage()
  const normalized = normalizeRobots(robots)
  await writeFile(ROBOTS_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return normalized
}
