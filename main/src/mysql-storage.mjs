import { Op } from 'sequelize'

import {
  areSessionsEquivalentForPersistence,
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_STRUCTURED_MEMORY,
  normalizeModelConfigsPayload,
  normalizeMemorySchema,
  normalizeRobots,
  normalizeSession,
  normalizeSessionMemory,
  normalizeSessionRobot,
  normalizeStoryOutline,
  normalizeStructuredMemory,
  normalizeSessionsPayload,
  safeJsonParse,
} from './storage-shared.mjs'
import { getModels, initializeDatabase } from './sequelize.mjs'
import {
  normalizeWorldGraphSnapshot,
} from './world-graph-service.mjs'

function resolveUserId(user) {
  const userId = String(user?.id || '').trim()
  if (!userId) {
    throw new Error('未授权访问')
  }
  return userId
}

function scopeId(user, id) {
  return `${resolveUserId(user)}:${String(id)}`
}

function unscopeId(user, id) {
  const prefix = `${resolveUserId(user)}:`
  return typeof id === 'string' && id.startsWith(prefix) ? id.slice(prefix.length) : String(id || '')
}

function serializeSuggestions(value) {
  return JSON.stringify(Array.isArray(value) ? value : [])
}

function serializeForm(value) {
  return value ? JSON.stringify(value) : null
}

function toDateOrNull(value) {
  if (!value) {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function mapSessionRow(user, row) {
  return normalizeSession({
    id: unscopeId(user, row.id),
    title: row.title,
    preview: row.preview,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    robot: {
      id: row.robotId,
      name: row.robotName,
      avatar: row.robotAvatar,
      commonPrompt: row.robotCommonPrompt,
      systemPrompt: row.robotSystemPrompt,
      memoryModelConfigId: row.robotMemoryModelConfigId,
      outlineModelConfigId: row.robotOutlineModelConfigId,
      knowledgeRetrievalModelConfigId: row.robotKnowledgeRetrievalModelConfigId,
      worldGraphModelConfigId: row.robotWorldGraphModelConfigId,
    },
    modelConfigId: row.modelConfigId,
    modelLabel: row.modelLabel,
    threadId: row.threadId,
    storyOutline: safeJsonParse(row.storyOutline || '', row.storyOutline || {}),
    memory: {
      summary: row.memorySummary,
      updatedAt: row.memoryUpdatedAt instanceof Date ? row.memoryUpdatedAt.toISOString() : row.memoryUpdatedAt || '',
      sourceMessageCount: row.memorySourceMessageCount,
      threshold: row.memoryThreshold,
      recentMessageLimit: row.memoryRecentMessageLimit,
      prompt: row.memoryPrompt,
    },
    memorySchema: normalizeMemorySchema(safeJsonParse(row.memorySchemaJson, null)),
    structuredMemory: normalizeStructuredMemory(safeJsonParse(row.structuredMemoryJson, DEFAULT_STRUCTURED_MEMORY)),
    worldGraph: row.sessionWorldGraphJson
      ? normalizeWorldGraphSnapshot(safeJsonParse(row.sessionWorldGraphJson, null), {
          robotId: row.robotId,
          robotName: row.robotName,
        })
      : null,
    usage: {
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
    },
    messages: (row.messages || []).map((message) => ({
      id: unscopeId(user, message.id),
      role: message.role,
      content: message.content,
      reasoning: message.reasoning,
      suggestions: safeJsonParse(message.suggestionsJson, []),
      form: safeJsonParse(message.formJson, null),
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
    })),
  })
}

function mapSessionRows(user, rows) {
  return normalizeSessionsPayload({
    sessions: rows.map((row) => mapSessionRow(user, row)),
  }).sessions
}

async function ensureDefaults(user) {
  const userId = resolveUserId(user)
  const { Robot } = getModels()

  if ((await Robot.count({ where: { userId } })) === 0) {
    for (const robot of normalizeRobots(DEFAULT_ROBOTS)) {
      await Robot.upsert({
        id: scopeId(user, robot.id),
        userId,
        name: robot.name,
        description: robot.description,
        avatar: robot.avatar,
        commonPrompt: robot.commonPrompt,
        systemPrompt: robot.systemPrompt,
        memoryModelConfigId: robot.memoryModelConfigId,
        outlineModelConfigId: robot.outlineModelConfigId,
        knowledgeRetrievalModelConfigId: robot.knowledgeRetrievalModelConfigId,
        worldGraphModelConfigId: robot.worldGraphModelConfigId,
        numericComputationEnabled: false,
        numericComputationPrompt: '',
        numericComputationSchema: '[]',
        numericComputationModelConfigId: '',
        memorySchemaJson: JSON.stringify(robot.memorySchema),
      })
    }
  }
}

export async function initializeStorage() {
  await initializeDatabase()
}

export async function ensureUserRecord(user) {
  const userId = resolveUserId(user)
  const { User } = getModels()
  await User.upsert({
    id: userId,
    email: user?.email || null,
    displayName: user?.displayName || null,
    avatarUrl: user?.avatarUrl || null,
  })
}

export async function listSessions(user) {
  await ensureDefaults(user)
  const userId = resolveUserId(user)
  const { Session } = getModels()
  const rows = await Session.findAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
  })

  return mapSessionRows(user, rows)
}

export async function listChatUsersForAdmin() {
  await initializeDatabase()
  const { Session, User } = getModels()
  const rows = await Session.findAll({
    include: [
      {
        model: User,
        as: 'user',
        required: false,
      },
    ],
    order: [['updatedAt', 'DESC']],
  })

  const grouped = new Map()
  for (const row of rows) {
    const userId = String(row.userId || '').trim()
    if (!userId) {
      continue
    }
    if (!grouped.has(userId)) {
      grouped.set(userId, {
        userId,
        userLabel: String(row.user?.displayName || row.user?.email || userId).trim() || userId,
        userEmail: String(row.user?.email || '').trim(),
        sessionCount: 0,
        lastActiveAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
      })
    }
    const current = grouped.get(userId)
    current.sessionCount += 1
    const currentMs = Date.parse(String(current.lastActiveAt || '')) || 0
    const nextMs = row.updatedAt instanceof Date ? row.updatedAt.getTime() : Date.parse(String(row.updatedAt || '')) || 0
    if (nextMs >= currentMs) {
      current.lastActiveAt = row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || '')
    }
  }

  return Array.from(grouped.values()).sort((left, right) =>
    (Date.parse(String(right.lastActiveAt || '')) || 0) - (Date.parse(String(left.lastActiveAt || '')) || 0),
  )
}

export async function listChatSessionsForAdmin(userId) {
  await initializeDatabase()
  const targetUserId = String(userId || '').trim()
  if (!targetUserId) {
    return []
  }
  const { Session } = getModels()
  const rows = await Session.findAll({
    where: { userId: targetUserId },
    order: [['updatedAt', 'DESC']],
  })

  return rows.map((row) => ({
    sessionId: unscopeId({ id: targetUserId }, row.id),
    sessionTitle: String(row.title || '').trim() || '未命名会话',
    threadId: String(row.threadId || '').trim(),
    preview: String(row.preview || '').trim(),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
  }))
}

export async function getSessionRecord(user, sessionId) {
  await ensureDefaults(user)
  const userId = resolveUserId(user)
  const { Session, SessionMessage } = getModels()
  const row = await Session.findOne({
    where: {
      id: scopeId(user, sessionId),
      userId,
    },
    include: [
      {
        model: SessionMessage,
        as: 'messages',
        required: false,
      },
    ],
    order: [[{ model: SessionMessage, as: 'messages' }, 'sequence', 'ASC']],
  })

  return row ? mapSessionRow(user, row) : null
}

export async function saveSessionRecord(user, session) {
  await ensureDefaults(user)
  const normalized = normalizeSession(session)
  const existing = await getSessionRecord(user, normalized.id)
  if (existing && areSessionsEquivalentForPersistence(existing, normalized)) {
    return existing
  }
  const userId = resolveUserId(user)
  const { sequelize, Session, SessionMessage } = getModels()
  const scopedSessionId = scopeId(user, normalized.id)

  await sequelize.transaction(async (transaction) => {
    await Session.upsert({
      id: scopedSessionId,
      userId,
      title: normalized.title,
      preview: normalized.preview,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      robotName: normalized.robot.name,
      robotAvatar: normalized.robot.avatar,
      robotId: normalized.robot.id,
      robotCommonPrompt: normalized.robot.commonPrompt,
      robotSystemPrompt: normalized.robot.systemPrompt,
      robotMemoryModelConfigId: normalized.robot.memoryModelConfigId,
      robotOutlineModelConfigId: normalized.robot.outlineModelConfigId,
      robotKnowledgeRetrievalModelConfigId: normalized.robot.knowledgeRetrievalModelConfigId,
      robotWorldGraphModelConfigId: normalized.robot.worldGraphModelConfigId,
      robotNumericComputationEnabled: false,
      robotNumericComputationPrompt: '',
      robotNumericComputationSchema: '[]',
      robotNumericComputationModelConfigId: '',
      robotImageFetchEnabled: false,
      robotImageFetchPrompt: '',
      modelConfigId: normalized.modelConfigId,
      modelLabel: normalized.modelLabel,
      threadId: normalized.threadId,
      storyOutline: JSON.stringify(normalized.storyOutline || normalizeStoryOutline({})),
      memorySummary: normalized.memory.summary,
      memoryUpdatedAt: toDateOrNull(normalized.memory.updatedAt),
      memorySourceMessageCount: normalized.memory.sourceMessageCount,
      memoryThreshold: normalized.memory.threshold,
      memoryRecentMessageLimit: normalized.memory.recentMessageLimit,
      memoryPrompt: normalized.memory.prompt,
      memorySchemaJson: JSON.stringify(normalized.memorySchema),
      structuredMemoryJson: JSON.stringify(normalized.structuredMemory || DEFAULT_STRUCTURED_MEMORY),
      sessionWorldGraphJson: normalized.worldGraph ? JSON.stringify(normalized.worldGraph) : null,
      numericStateJson: '{}',
      promptTokens: normalized.usage.promptTokens,
      completionTokens: normalized.usage.completionTokens,
    }, { transaction })

    await SessionMessage.destroy({
      where: { sessionId: scopedSessionId },
      transaction,
    })

    if (normalized.messages.length) {
      await SessionMessage.bulkCreate(
        normalized.messages.map((message, index) => ({
          id: scopeId(user, message.id),
          sessionId: scopedSessionId,
          sequence: index,
          role: message.role,
          content: message.content,
          reasoning: message.reasoning,
          suggestionsJson: serializeSuggestions(message.suggestions),
          formJson: serializeForm(message.form),
          imagesJson: '[]',
          createdAt: message.createdAt,
        })),
        { transaction },
      )
    }
  })

  return getSessionRecord(user, normalized.id)
}

export async function upsertSessionRecord(user, input) {
  const now = new Date().toISOString()
  const existing = input?.id ? await getSessionRecord(user, String(input.id)) : null
  let nextWorldGraph = input?.worldGraph || input?.world_graph || existing?.worldGraph || null
  if (nextWorldGraph) {
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
    storyOutline: normalizeStoryOutline(input?.storyOutline || input?.story_outline || existing?.storyOutline || {}),
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

  const userId = resolveUserId(user)
  const { Session } = getModels()
  await Session.destroy({
    where: {
      id: scopeId(user, sessionId),
      userId,
    },
  })

  return existing
}

export async function readModelConfigs(user) {
  await ensureDefaults(user)
  const userId = resolveUserId(user)
  const { ModelConfig } = getModels()
  const rows = await ModelConfig.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
  })

  if (!rows.length) {
    return normalizeModelConfigsPayload({ configs: [], activeModelConfigId: '' })
  }

  const configs = rows.map((row) => ({
    id: unscopeId(user, row.id),
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: row.model,
    description: row.description,
    tags: safeJsonParse(row.tagsJson, []),
    temperature: typeof row.temperature === 'number' ? row.temperature : null,
  }))
  const active = rows.find((row) => row.isActive) || rows[0]

  return normalizeModelConfigsPayload({
    configs,
    activeModelConfigId: unscopeId(user, active.id),
  })
}

export async function writeModelConfigs(user, payload) {
  await ensureDefaults(user)
  const normalized = normalizeModelConfigsPayload(payload)
  const { sequelize, ModelConfig } = getModels()
  const userId = resolveUserId(user)

  await sequelize.transaction(async (transaction) => {
    const ids = normalized.configs.map((item) => scopeId(user, item.id))
    await ModelConfig.destroy({
      where: ids.length
        ? {
            userId,
            id: { [Op.notIn]: ids },
          }
        : { userId },
      transaction,
    })

    for (const config of normalized.configs) {
      await ModelConfig.upsert({
        id: scopeId(user, config.id),
        userId,
        name: config.name,
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        description: config.description,
        tagsJson: JSON.stringify(config.tags || []),
        temperature: config.temperature,
        isActive: config.id === normalized.activeModelConfigId,
      }, { transaction })
    }

    await ModelConfig.update(
      { isActive: false },
      {
        where: {
          userId,
          id: { [Op.notIn]: [scopeId(user, normalized.activeModelConfigId)] },
        },
        transaction,
      },
    )
  })

  return normalized
}

export async function readRobots(user) {
  await ensureDefaults(user)
  const userId = resolveUserId(user)
  const { Robot } = getModels()
  const rows = await Robot.findAll({
    where: { userId },
    order: [['createdAt', 'ASC']],
  })

  if (!rows.length) {
    return normalizeRobots(DEFAULT_ROBOTS)
  }

  return normalizeRobots(rows.map((row) => ({
    id: unscopeId(user, row.id),
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    commonPrompt: row.commonPrompt,
    systemPrompt: row.systemPrompt,
    memoryModelConfigId: row.memoryModelConfigId,
    outlineModelConfigId: row.outlineModelConfigId,
    knowledgeRetrievalModelConfigId: row.knowledgeRetrievalModelConfigId,
    worldGraphModelConfigId: row.worldGraphModelConfigId,
    memorySchema: safeJsonParse(row.memorySchemaJson, null),
  })))
}

export async function writeRobots(user, robots) {
  await ensureDefaults(user)
  const normalized = normalizeRobots(robots)
  const userId = resolveUserId(user)
  const { sequelize, Robot } = getModels()

  await sequelize.transaction(async (transaction) => {
    const ids = normalized.map((item) => scopeId(user, item.id))
    await Robot.destroy({
      where: ids.length
        ? {
            userId,
            id: { [Op.notIn]: ids },
          }
        : { userId },
      transaction,
    })

    for (const robot of normalized) {
      await Robot.upsert({
        id: scopeId(user, robot.id),
        userId,
        name: robot.name,
        description: robot.description,
        avatar: robot.avatar,
        commonPrompt: robot.commonPrompt,
        systemPrompt: robot.systemPrompt,
        memoryModelConfigId: robot.memoryModelConfigId,
        outlineModelConfigId: robot.outlineModelConfigId,
        knowledgeRetrievalModelConfigId: robot.knowledgeRetrievalModelConfigId,
        worldGraphModelConfigId: robot.worldGraphModelConfigId,
        numericComputationEnabled: false,
        numericComputationPrompt: '',
        numericComputationSchema: '[]',
        numericComputationModelConfigId: '',
        memorySchemaJson: JSON.stringify(robot.memorySchema),
      }, { transaction })
    }
  })

  return normalized
}
