import { Op } from 'sequelize'

import {
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
  normalizeStructuredMemory,
  normalizeSessionsPayload,
  safeJsonParse,
} from './storage-shared.mjs'
import { getModels, initializeDatabase } from './sequelize.mjs'

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
      name: row.robotName,
      avatar: row.robotAvatar,
      commonPrompt: row.robotCommonPrompt,
      systemPrompt: row.robotSystemPrompt,
      numericComputationEnabled: row.robotNumericComputationEnabled ?? row.robotImageFetchEnabled,
      numericComputationPrompt: row.robotNumericComputationPrompt ?? row.robotImageFetchPrompt,
      numericComputationItems: safeJsonParse(row.robotNumericComputationSchema, []),
      structuredMemoryInterval: row.robotStructuredMemoryInterval,
      structuredMemoryHistoryLimit: row.robotStructuredMemoryHistoryLimit,
    },
    modelConfigId: row.modelConfigId,
    modelLabel: row.modelLabel,
    threadId: row.threadId,
    memory: {
      summary: row.memorySummary,
      updatedAt: row.memoryUpdatedAt instanceof Date ? row.memoryUpdatedAt.toISOString() : row.memoryUpdatedAt || '',
      sourceMessageCount: row.memorySourceMessageCount,
      threshold: row.memoryThreshold,
      recentMessageLimit: row.memoryRecentMessageLimit,
      prompt: row.memoryPrompt,
      structuredMemoryInterval: row.structuredMemoryInterval,
      structuredMemoryHistoryLimit: row.structuredMemoryHistoryLimit,
    },
    memorySchema: normalizeMemorySchema(safeJsonParse(row.memorySchemaJson, null)),
    structuredMemory: normalizeStructuredMemory(safeJsonParse(row.structuredMemoryJson, DEFAULT_STRUCTURED_MEMORY)),
    numericState: safeJsonParse(row.numericStateJson, {}),
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
    await Robot.bulkCreate(normalizeRobots(DEFAULT_ROBOTS).map((robot) => ({
      id: scopeId(user, robot.id),
      userId,
      name: robot.name,
      description: robot.description,
      avatar: robot.avatar,
      commonPrompt: robot.commonPrompt,
      systemPrompt: robot.systemPrompt,
      numericComputationEnabled: robot.numericComputationEnabled,
      numericComputationPrompt: robot.numericComputationPrompt,
      numericComputationSchema: JSON.stringify(robot.numericComputationItems || []),
      structuredMemoryInterval: robot.structuredMemoryInterval,
      structuredMemoryHistoryLimit: robot.structuredMemoryHistoryLimit,
      memorySchemaJson: JSON.stringify(robot.memorySchema),
    })))
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
      robotCommonPrompt: normalized.robot.commonPrompt,
      robotSystemPrompt: normalized.robot.systemPrompt,
      robotImageFetchEnabled: false,
      robotImageFetchPrompt: '',
      robotNumericComputationEnabled: normalized.robot.numericComputationEnabled,
      robotNumericComputationPrompt: normalized.robot.numericComputationPrompt,
      robotNumericComputationSchema: JSON.stringify(normalized.robot.numericComputationItems || []),
      robotStructuredMemoryInterval: normalized.robot.structuredMemoryInterval,
      robotStructuredMemoryHistoryLimit: normalized.robot.structuredMemoryHistoryLimit,
      modelConfigId: normalized.modelConfigId,
      modelLabel: normalized.modelLabel,
      threadId: normalized.threadId,
      memorySummary: normalized.memory.summary,
      memoryUpdatedAt: toDateOrNull(normalized.memory.updatedAt),
      memorySourceMessageCount: normalized.memory.sourceMessageCount,
      memoryThreshold: normalized.memory.threshold,
      memoryRecentMessageLimit: normalized.memory.recentMessageLimit,
      memoryPrompt: normalized.memory.prompt,
      structuredMemoryInterval: normalized.memory.structuredMemoryInterval,
      structuredMemoryHistoryLimit: normalized.memory.structuredMemoryHistoryLimit,
      memorySchemaJson: JSON.stringify(normalized.memorySchema),
      structuredMemoryJson: JSON.stringify(normalized.structuredMemory || DEFAULT_STRUCTURED_MEMORY),
      numericStateJson: JSON.stringify(normalized.numericState || {}),
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
  const nextSession = normalizeSession({
    ...(existing || {}),
    ...input,
    robot: input?.robot ? normalizeSessionRobot(input.robot) : existing?.robot,
    memory: normalizeSessionMemory({ ...(existing?.memory || DEFAULT_SESSION_MEMORY), ...(input?.memory || {}) }),
    memorySchema: normalizeMemorySchema(input?.memorySchema || existing?.memorySchema),
    structuredMemory: normalizeStructuredMemory(input?.structuredMemory || existing?.structuredMemory || DEFAULT_STRUCTURED_MEMORY),
    messages: existing?.messages || input?.messages || [],
    createdAt: existing?.createdAt || input?.createdAt || now,
    updatedAt: now,
  })

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
    accessMode: row.accessMode === 'browser-direct' ? 'browser-direct' : 'server',
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
        accessMode: config.accessMode === 'browser-direct' ? 'browser-direct' : 'server',
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
    numericComputationEnabled: row.numericComputationEnabled ?? row.imageFetchEnabled,
    numericComputationPrompt: row.numericComputationPrompt ?? row.imageFetchPrompt,
    numericComputationItems: safeJsonParse(row.numericComputationSchema, []),
    structuredMemoryInterval: row.structuredMemoryInterval,
    structuredMemoryHistoryLimit: row.structuredMemoryHistoryLimit,
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
        numericComputationEnabled: robot.numericComputationEnabled,
        numericComputationPrompt: robot.numericComputationPrompt,
        numericComputationSchema: JSON.stringify(robot.numericComputationItems || []),
        structuredMemoryInterval: robot.structuredMemoryInterval,
        structuredMemoryHistoryLimit: robot.structuredMemoryHistoryLimit,
        memorySchemaJson: JSON.stringify(robot.memorySchema),
      }, { transaction })
    }
  })

  return normalized
}
