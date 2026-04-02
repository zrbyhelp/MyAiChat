import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getStorageDriver } from './database-config.mjs'
import { getModels } from './sequelize.mjs'
import { safeJsonParse } from './storage-shared.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '..', 'data')
const USERS_DIR = join(DATA_DIR, 'users')

function nowIso() {
  return new Date().toISOString()
}

function resolveUserId(user, sanitize = false) {
  const userId = String(user?.id || '').trim()
  if (!userId) {
    throw new Error('未授权访问')
  }
  return sanitize ? userId.replace(/[<>:"/\\|?*]+/g, '_') : userId
}

function scopeId(user, id) {
  return `${resolveUserId(user)}:${String(id || '').trim()}`
}

function unscopeId(user, id) {
  const prefix = `${resolveUserId(user)}:`
  return typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : String(id || '')
}

function normalizeProgress(value) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) {
    return 0
  }
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100))
}

function normalizeTaskStatus(value) {
  return ['pending', 'processing', 'canceling', 'completed', 'failed', 'canceled'].includes(String(value || ''))
    ? String(value)
    : 'pending'
}

function normalizeTaskRecord(input = {}) {
  const createdAt = typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso()
  return {
    id: String(input.id || '').trim(),
    status: normalizeTaskStatus(input.status),
    stage: String(input.stage || 'queued').trim() || 'queued',
    progress: normalizeProgress(input.progress),
    message: String(input.message || '').trim(),
    sourceName: String(input.sourceName || '').trim(),
    sourceType: String(input.sourceType || '').trim(),
    sourceSize: Math.max(0, Number(input.sourceSize || 0) || 0),
    guidance: String(input.guidance || ''),
    modelConfigId: String(input.modelConfigId || '').trim(),
    embeddingModelConfigId: String(input.embeddingModelConfigId || '').trim(),
    robotId: String(input.robotId || '').trim(),
    documentId: String(input.documentId || '').trim(),
    stats: input.stats && typeof input.stats === 'object' ? input.stats : {},
    result: input.result && typeof input.result === 'object' ? input.result : {},
    error: String(input.error || '').trim(),
    createdAt,
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : createdAt,
    startedAt: typeof input.startedAt === 'string' ? input.startedAt : '',
    completedAt: typeof input.completedAt === 'string' ? input.completedAt : '',
  }
}

function normalizeDocumentRecord(input = {}) {
  const createdAt = typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso()
  return {
    id: String(input.id || '').trim(),
    robotId: String(input.robotId || '').trim(),
    status: ['processing', 'ready', 'failed'].includes(String(input.status || ''))
      ? String(input.status)
      : 'processing',
    sourceName: String(input.sourceName || '').trim(),
    sourceType: String(input.sourceType || '').trim(),
    sourceSize: Math.max(0, Number(input.sourceSize || 0) || 0),
    guidance: String(input.guidance || ''),
    summary: String(input.summary || ''),
    retrievalSummary: String(input.retrievalSummary || ''),
    chunkCount: Math.max(0, Number(input.chunkCount || 0) || 0),
    characterCount: Math.max(0, Number(input.characterCount || 0) || 0),
    qdrantCollection: String(input.qdrantCollection || '').trim(),
    embeddingModelConfigId: String(input.embeddingModelConfigId || '').trim(),
    embeddingModel: String(input.embeddingModel || '').trim(),
    meta: input.meta && typeof input.meta === 'object' ? input.meta : {},
    createdAt,
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : createdAt,
  }
}

function normalizeGraphRagArtifactRecord(input = {}) {
  const createdAt = typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso()
  return {
    id: String(input.id || '').trim(),
    robotId: String(input.robotId || '').trim(),
    documentId: String(input.documentId || '').trim(),
    sessionId: String(input.sessionId || '').trim(),
    kind: ['extract', 'retrieve', 'writeback'].includes(String(input.kind || '')) ? String(input.kind) : 'extract',
    summary: String(input.summary || ''),
    payload: input.payload && typeof input.payload === 'object' ? input.payload : {},
    meta: input.meta && typeof input.meta === 'object' ? input.meta : {},
    createdAt,
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : createdAt,
  }
}

async function ensureFileStorage(user) {
  const userId = resolveUserId(user, true)
  const userDir = join(USERS_DIR, userId)
  await mkdir(userDir, { recursive: true })
  return {
    tasksFile: join(userDir, 'robot-generation-tasks.json'),
    documentsFile: join(userDir, 'robot-knowledge-documents.json'),
    graphragArtifactsFile: join(userDir, 'graphrag-artifacts.json'),
  }
}

async function readFileList(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8')
    return Array.isArray(safeJsonParse(raw, [])) ? safeJsonParse(raw, []) : []
  } catch {
    await writeFile(filePath, '[]\n', 'utf8')
    return []
  }
}

async function writeFileList(filePath, list) {
  await writeFile(filePath, `${JSON.stringify(Array.isArray(list) ? list : [], null, 2)}\n`, 'utf8')
}

export async function initializeRobotGenerationStore() {
  if (getStorageDriver() !== 'file') {
    return
  }
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(USERS_DIR, { recursive: true })
}

export async function createGraphRagArtifact(user, input) {
  const record = normalizeGraphRagArtifactRecord(input)
  if (!record.id) {
    throw new Error('GraphRAG artifact ID 不能为空')
  }

  if (getStorageDriver() === 'mysql') {
    const { GraphRagArtifact } = getModels()
    await GraphRagArtifact.create({
      id: scopeId(user, record.id),
      userId: resolveUserId(user),
      robotId: record.robotId ? scopeId(user, record.robotId) : '',
      documentId: record.documentId ? scopeId(user, record.documentId) : '',
      sessionId: record.sessionId,
      kind: record.kind,
      summary: record.summary,
      payloadJson: JSON.stringify(record.payload),
      metaJson: JSON.stringify(record.meta),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    return record
  }

  const { graphragArtifactsFile } = await ensureFileStorage(user)
  const artifacts = await readFileList(graphragArtifactsFile)
  artifacts.unshift(record)
  await writeFileList(graphragArtifactsFile, artifacts)
  return record
}

export async function listGraphRagArtifacts(user, filters = {}) {
  const robotId = String(filters.robotId || '').trim()
  const documentId = String(filters.documentId || '').trim()
  const sessionId = String(filters.sessionId || '').trim()
  const kind = String(filters.kind || '').trim()

  if (getStorageDriver() === 'mysql') {
    const { GraphRagArtifact } = getModels()
    const where = {
      userId: resolveUserId(user),
    }
    if (robotId) {
      where.robotId = scopeId(user, robotId)
    }
    if (documentId) {
      where.documentId = scopeId(user, documentId)
    }
    if (sessionId) {
      where.sessionId = sessionId
    }
    if (kind) {
      where.kind = kind
    }
    const rows = await GraphRagArtifact.findAll({
      where,
      order: [['createdAt', 'DESC']],
    })
    return rows.map((row) => normalizeGraphRagArtifactRecord({
      id: unscopeId(user, row.id),
      robotId: row.robotId ? unscopeId(user, row.robotId) : '',
      documentId: row.documentId ? unscopeId(user, row.documentId) : '',
      sessionId: row.sessionId,
      kind: row.kind,
      summary: row.summary,
      payload: safeJsonParse(row.payloadJson, {}),
      meta: safeJsonParse(row.metaJson, {}),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    }))
  }

  const { graphragArtifactsFile } = await ensureFileStorage(user)
  const artifacts = await readFileList(graphragArtifactsFile)
  return artifacts
    .map((item) => normalizeGraphRagArtifactRecord(item))
    .filter((item) => (!robotId || item.robotId === robotId))
    .filter((item) => (!documentId || item.documentId === documentId))
    .filter((item) => (!sessionId || item.sessionId === sessionId))
    .filter((item) => (!kind || item.kind === kind))
}

export async function createRobotGenerationTask(user, input) {
  const record = normalizeTaskRecord(input)
  if (!record.id) {
    throw new Error('任务 ID 不能为空')
  }

  if (getStorageDriver() === 'mysql') {
    const { RobotGenerationTask } = getModels()
    await RobotGenerationTask.create({
      id: scopeId(user, record.id),
      userId: resolveUserId(user),
      status: record.status,
      stage: record.stage,
      progress: record.progress,
      message: record.message,
      sourceName: record.sourceName,
      sourceType: record.sourceType,
      sourceSize: record.sourceSize,
      guidance: record.guidance,
      modelConfigId: record.modelConfigId,
      embeddingModelConfigId: record.embeddingModelConfigId,
      robotId: record.robotId,
      documentId: record.documentId,
      statsJson: JSON.stringify(record.stats),
      resultJson: JSON.stringify(record.result),
      error: record.error,
      startedAt: record.startedAt || null,
      completedAt: record.completedAt || null,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    return record
  }

  const { tasksFile } = await ensureFileStorage(user)
  const tasks = await readFileList(tasksFile)
  tasks.unshift(record)
  await writeFileList(tasksFile, tasks)
  return record
}

export async function getRobotGenerationTask(user, taskId) {
  if (getStorageDriver() === 'mysql') {
    const { RobotGenerationTask } = getModels()
    const row = await RobotGenerationTask.findOne({
      where: {
        id: scopeId(user, taskId),
        userId: resolveUserId(user),
      },
    })
    if (!row) {
      return null
    }
    return normalizeTaskRecord({
      id: unscopeId(user, row.id),
      status: row.status,
      stage: row.stage,
      progress: row.progress,
      message: row.message,
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      sourceSize: Number(row.sourceSize || 0),
      guidance: row.guidance,
      modelConfigId: row.modelConfigId,
      embeddingModelConfigId: row.embeddingModelConfigId,
      robotId: row.robotId,
      documentId: row.documentId,
      stats: safeJsonParse(row.statsJson, {}),
      result: safeJsonParse(row.resultJson, {}),
      error: row.error,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
      startedAt: row.startedAt instanceof Date ? row.startedAt.toISOString() : row.startedAt,
      completedAt: row.completedAt instanceof Date ? row.completedAt.toISOString() : row.completedAt,
    })
  }

  const { tasksFile } = await ensureFileStorage(user)
  const tasks = await readFileList(tasksFile)
  const found = tasks.find((item) => String(item?.id || '') === String(taskId || ''))
  return found ? normalizeTaskRecord(found) : null
}

export async function updateRobotGenerationTask(user, taskId, patch) {
  const existing = await getRobotGenerationTask(user, taskId)
  if (!existing) {
    return null
  }

  const next = normalizeTaskRecord({
    ...existing,
    ...patch,
    id: existing.id,
    stats: patch?.stats && typeof patch.stats === 'object' ? { ...existing.stats, ...patch.stats } : existing.stats,
    result:
      patch?.result && typeof patch.result === 'object'
        ? { ...existing.result, ...patch.result }
        : existing.result,
    updatedAt: nowIso(),
  })

  if (getStorageDriver() === 'mysql') {
    const { RobotGenerationTask } = getModels()
    await RobotGenerationTask.update({
      status: next.status,
      stage: next.stage,
      progress: next.progress,
      message: next.message,
      sourceName: next.sourceName,
      sourceType: next.sourceType,
      sourceSize: next.sourceSize,
      guidance: next.guidance,
      modelConfigId: next.modelConfigId,
      embeddingModelConfigId: next.embeddingModelConfigId,
      robotId: next.robotId,
      documentId: next.documentId,
      statsJson: JSON.stringify(next.stats),
      resultJson: JSON.stringify(next.result),
      error: next.error,
      startedAt: next.startedAt || null,
      completedAt: next.completedAt || null,
      updatedAt: next.updatedAt,
    }, {
      where: {
        id: scopeId(user, taskId),
        userId: resolveUserId(user),
      },
    })
    return next
  }

  const { tasksFile } = await ensureFileStorage(user)
  const tasks = await readFileList(tasksFile)
  const nextTasks = tasks.map((item) => (
    String(item?.id || '') === String(taskId || '')
      ? next
      : item
  ))
  await writeFileList(tasksFile, nextTasks)
  return next
}

export async function createRobotKnowledgeDocument(user, input) {
  const record = normalizeDocumentRecord(input)
  if (!record.id) {
    throw new Error('文档 ID 不能为空')
  }

  if (getStorageDriver() === 'mysql') {
    const { RobotKnowledgeDocument } = getModels()
    await RobotKnowledgeDocument.create({
      id: scopeId(user, record.id),
      userId: resolveUserId(user),
      robotId: scopeId(user, record.robotId),
      status: record.status,
      sourceName: record.sourceName,
      sourceType: record.sourceType,
      sourceSize: record.sourceSize,
      guidance: record.guidance,
      summary: record.summary,
      retrievalSummary: record.retrievalSummary,
      chunkCount: record.chunkCount,
      characterCount: record.characterCount,
      qdrantCollection: record.qdrantCollection,
      embeddingModelConfigId: record.embeddingModelConfigId,
      embeddingModel: record.embeddingModel,
      metaJson: JSON.stringify(record.meta),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })
    return record
  }

  const { documentsFile } = await ensureFileStorage(user)
  const documents = await readFileList(documentsFile)
  documents.unshift(record)
  await writeFileList(documentsFile, documents)
  return record
}

export async function updateRobotKnowledgeDocument(user, documentId, patch) {
  const existing = await getRobotKnowledgeDocument(user, documentId)
  if (!existing) {
    return null
  }

  const next = normalizeDocumentRecord({
    ...existing,
    ...patch,
    id: existing.id,
    robotId: patch?.robotId || existing.robotId,
    meta: patch?.meta && typeof patch.meta === 'object' ? { ...existing.meta, ...patch.meta } : existing.meta,
    updatedAt: nowIso(),
  })

  if (getStorageDriver() === 'mysql') {
    const { RobotKnowledgeDocument } = getModels()
    await RobotKnowledgeDocument.update({
      robotId: scopeId(user, next.robotId),
      status: next.status,
      sourceName: next.sourceName,
      sourceType: next.sourceType,
      sourceSize: next.sourceSize,
      guidance: next.guidance,
      summary: next.summary,
      retrievalSummary: next.retrievalSummary,
      chunkCount: next.chunkCount,
      characterCount: next.characterCount,
      qdrantCollection: next.qdrantCollection,
      embeddingModelConfigId: next.embeddingModelConfigId,
      embeddingModel: next.embeddingModel,
      metaJson: JSON.stringify(next.meta),
      updatedAt: next.updatedAt,
    }, {
      where: {
        id: scopeId(user, documentId),
        userId: resolveUserId(user),
      },
    })
    return next
  }

  const { documentsFile } = await ensureFileStorage(user)
  const documents = await readFileList(documentsFile)
  const nextDocuments = documents.map((item) => (
    String(item?.id || '') === String(documentId || '')
      ? next
      : item
  ))
  await writeFileList(documentsFile, nextDocuments)
  return next
}

export async function getRobotKnowledgeDocument(user, documentId) {
  if (getStorageDriver() === 'mysql') {
    const { RobotKnowledgeDocument } = getModels()
    const row = await RobotKnowledgeDocument.findOne({
      where: {
        id: scopeId(user, documentId),
        userId: resolveUserId(user),
      },
    })
    if (!row) {
      return null
    }
    return normalizeDocumentRecord({
      id: unscopeId(user, row.id),
      robotId: unscopeId(user, row.robotId),
      status: row.status,
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      sourceSize: Number(row.sourceSize || 0),
      guidance: row.guidance,
      summary: row.summary,
      retrievalSummary: row.retrievalSummary,
      chunkCount: row.chunkCount,
      characterCount: row.characterCount,
      qdrantCollection: row.qdrantCollection,
      embeddingModelConfigId: row.embeddingModelConfigId,
      embeddingModel: row.embeddingModel,
      meta: safeJsonParse(row.metaJson, {}),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    })
  }

  const { documentsFile } = await ensureFileStorage(user)
  const documents = await readFileList(documentsFile)
  const found = documents.find((item) => String(item?.id || '') === String(documentId || ''))
  return found ? normalizeDocumentRecord(found) : null
}

export async function listRobotKnowledgeDocuments(user, robotId) {
  if (getStorageDriver() === 'mysql') {
    const { RobotKnowledgeDocument } = getModels()
    const rows = await RobotKnowledgeDocument.findAll({
      where: {
        userId: resolveUserId(user),
        robotId: scopeId(user, robotId),
      },
      order: [['createdAt', 'DESC']],
    })

    return rows.map((row) => normalizeDocumentRecord({
      id: unscopeId(user, row.id),
      robotId: unscopeId(user, row.robotId),
      status: row.status,
      sourceName: row.sourceName,
      sourceType: row.sourceType,
      sourceSize: Number(row.sourceSize || 0),
      guidance: row.guidance,
      summary: row.summary,
      retrievalSummary: row.retrievalSummary,
      chunkCount: row.chunkCount,
      characterCount: row.characterCount,
      qdrantCollection: row.qdrantCollection,
      embeddingModelConfigId: row.embeddingModelConfigId,
      embeddingModel: row.embeddingModel,
      meta: safeJsonParse(row.metaJson, {}),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    }))
  }

  const { documentsFile } = await ensureFileStorage(user)
  const documents = await readFileList(documentsFile)
  return documents
    .filter((item) => String(item?.robotId || '') === String(robotId || ''))
    .map((item) => normalizeDocumentRecord(item))
}
