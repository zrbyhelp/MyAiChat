import * as fileStorage from './file-storage.mjs'
import * as mysqlStorage from './mysql-storage.mjs'
import { getStorageDriver } from './database-config.mjs'

export {
  buildSessionSummary,
  createSessionTitle,
  normalizeModelConfig,
  normalizeModelConfigsPayload,
  normalizeRobots,
  normalizeSession,
  normalizeSessionMemory,
  normalizeSessionRobot,
  normalizeSessionUsage,
} from './storage-shared.mjs'

let activeStorage = null

function getStorageImplementation() {
  if (activeStorage) {
    return activeStorage
  }

  activeStorage = getStorageDriver() === 'mysql' ? mysqlStorage : fileStorage
  return activeStorage
}

export async function initializeStorage() {
  await getStorageImplementation().initializeStorage()
}

export async function ensureUserRecord(user) {
  return getStorageImplementation().ensureUserRecord(user)
}

export async function listSessions(user) {
  return getStorageImplementation().listSessions(user)
}

export async function getSessionRecord(user, sessionId) {
  return getStorageImplementation().getSessionRecord(user, sessionId)
}

export async function saveSessionRecord(user, session) {
  return getStorageImplementation().saveSessionRecord(user, session)
}

export async function upsertSessionRecord(user, input) {
  return getStorageImplementation().upsertSessionRecord(user, input)
}

export async function updateSessionMemoryRecord(user, sessionId, patch) {
  return getStorageImplementation().updateSessionMemoryRecord(user, sessionId, patch)
}

export async function clearSessionMemoryRecord(user, sessionId) {
  return getStorageImplementation().clearSessionMemoryRecord(user, sessionId)
}

export async function deleteSessionRecord(user, sessionId) {
  return getStorageImplementation().deleteSessionRecord(user, sessionId)
}

export async function readModelConfigs(user) {
  return getStorageImplementation().readModelConfigs(user)
}

export async function writeModelConfigs(user, payload) {
  return getStorageImplementation().writeModelConfigs(user, payload)
}

export async function readRobots(user) {
  return getStorageImplementation().readRobots(user)
}

export async function writeRobots(user, robots) {
  return getStorageImplementation().writeRobots(user, robots)
}
