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

export async function listSessions() {
  return getStorageImplementation().listSessions()
}

export async function getSessionRecord(sessionId) {
  return getStorageImplementation().getSessionRecord(sessionId)
}

export async function saveSessionRecord(session) {
  return getStorageImplementation().saveSessionRecord(session)
}

export async function upsertSessionRecord(input) {
  return getStorageImplementation().upsertSessionRecord(input)
}

export async function updateSessionMemoryRecord(sessionId, patch) {
  return getStorageImplementation().updateSessionMemoryRecord(sessionId, patch)
}

export async function clearSessionMemoryRecord(sessionId) {
  return getStorageImplementation().clearSessionMemoryRecord(sessionId)
}

export async function deleteSessionRecord(sessionId) {
  return getStorageImplementation().deleteSessionRecord(sessionId)
}

export async function readModelConfigs() {
  return getStorageImplementation().readModelConfigs()
}

export async function writeModelConfigs(payload) {
  return getStorageImplementation().writeModelConfigs(payload)
}

export async function readRobots() {
  return getStorageImplementation().readRobots()
}

export async function writeRobots(robots) {
  return getStorageImplementation().writeRobots(robots)
}
