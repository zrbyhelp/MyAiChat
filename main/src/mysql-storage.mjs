import { Op } from 'sequelize'

import {
  DEFAULT_MODEL_CONFIGS,
  DEFAULT_ROBOTS,
  DEFAULT_SESSION_MEMORY,
  normalizeModelConfigsPayload,
  normalizeRobots,
  normalizeSession,
  normalizeSessionMemory,
  normalizeSessionRobot,
  normalizeSessionsPayload,
  safeJsonParse,
} from './storage-shared.mjs'
import { getModels, initializeDatabase } from './sequelize.mjs'

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

function mapSessionRow(row) {
  return normalizeSession({
    id: row.id,
    title: row.title,
    preview: row.preview,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    robot: {
      name: row.robotName,
      avatar: row.robotAvatar,
      systemPrompt: row.robotSystemPrompt,
    },
    modelConfigId: row.modelConfigId,
    modelLabel: row.modelLabel,
    memory: {
      summary: row.memorySummary,
      updatedAt: row.memoryUpdatedAt instanceof Date ? row.memoryUpdatedAt.toISOString() : row.memoryUpdatedAt || '',
      sourceMessageCount: row.memorySourceMessageCount,
      threshold: row.memoryThreshold,
      recentMessageLimit: row.memoryRecentMessageLimit,
    },
    usage: {
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
    },
    messages: (row.messages || []).map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      reasoning: message.reasoning,
      suggestions: safeJsonParse(message.suggestionsJson, []),
      form: safeJsonParse(message.formJson, null),
      createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
    })),
  })
}

function mapSessionRows(rows) {
  return normalizeSessionsPayload({
    sessions: rows.map(mapSessionRow),
  }).sessions
}

async function ensureDefaults() {
  const { ModelConfig, Robot } = getModels()

  if ((await ModelConfig.count()) === 0) {
    const defaults = normalizeModelConfigsPayload(DEFAULT_MODEL_CONFIGS)
    await ModelConfig.bulkCreate(
      defaults.configs.map((config) => ({
        ...config,
        isActive: config.id === defaults.activeModelConfigId,
      })),
    )
  }

  if ((await Robot.count()) === 0) {
    await Robot.bulkCreate(normalizeRobots(DEFAULT_ROBOTS))
  }
}

export async function initializeStorage() {
  await initializeDatabase()
  await ensureDefaults()
}

export async function listSessions() {
  const { Session } = getModels()
  const rows = await Session.findAll({
    order: [['updatedAt', 'DESC']],
  })

  return mapSessionRows(rows)
}

export async function getSessionRecord(sessionId) {
  const { Session, SessionMessage } = getModels()
  const row = await Session.findByPk(sessionId, {
    include: [
      {
        model: SessionMessage,
        as: 'messages',
        required: false,
      },
    ],
    order: [[{ model: SessionMessage, as: 'messages' }, 'sequence', 'ASC']],
  })

  return row ? mapSessionRow(row) : null
}

export async function saveSessionRecord(session) {
  const normalized = normalizeSession(session)
  const { sequelize, Session, SessionMessage } = getModels()

  await sequelize.transaction(async (transaction) => {
    await Session.upsert({
      id: normalized.id,
      title: normalized.title,
      preview: normalized.preview,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      robotName: normalized.robot.name,
      robotAvatar: normalized.robot.avatar,
      robotSystemPrompt: normalized.robot.systemPrompt,
      modelConfigId: normalized.modelConfigId,
      modelLabel: normalized.modelLabel,
      memorySummary: normalized.memory.summary,
      memoryUpdatedAt: toDateOrNull(normalized.memory.updatedAt),
      memorySourceMessageCount: normalized.memory.sourceMessageCount,
      memoryThreshold: normalized.memory.threshold,
      memoryRecentMessageLimit: normalized.memory.recentMessageLimit,
      promptTokens: normalized.usage.promptTokens,
      completionTokens: normalized.usage.completionTokens,
    }, { transaction })

    await SessionMessage.destroy({
      where: { sessionId: normalized.id },
      transaction,
    })

    if (normalized.messages.length) {
      await SessionMessage.bulkCreate(
        normalized.messages.map((message, index) => ({
          id: message.id,
          sessionId: normalized.id,
          sequence: index,
          role: message.role,
          content: message.content,
          reasoning: message.reasoning,
          suggestionsJson: serializeSuggestions(message.suggestions),
          formJson: serializeForm(message.form),
          createdAt: message.createdAt,
        })),
        { transaction },
      )
    }
  })

  return getSessionRecord(normalized.id)
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

  const { Session } = getModels()
  await Session.destroy({
    where: { id: sessionId },
  })

  return existing
}

export async function readModelConfigs() {
  const { ModelConfig } = getModels()
  const rows = await ModelConfig.findAll({
    order: [['createdAt', 'ASC']],
  })

  if (!rows.length) {
    return normalizeModelConfigsPayload(DEFAULT_MODEL_CONFIGS)
  }

  const configs = rows.map((row) => ({
    id: row.id,
    name: row.name,
    provider: row.provider,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey,
    model: row.model,
    temperature: typeof row.temperature === 'number' ? row.temperature : null,
  }))
  const active = rows.find((row) => row.isActive) || rows[0]

  return normalizeModelConfigsPayload({
    configs,
    activeModelConfigId: active.id,
  })
}

export async function writeModelConfigs(payload) {
  const normalized = normalizeModelConfigsPayload(payload)
  const { sequelize, ModelConfig } = getModels()

  await sequelize.transaction(async (transaction) => {
    const ids = normalized.configs.map((item) => item.id)
    await ModelConfig.destroy({
      where: ids.length ? { id: { [Op.notIn]: ids } } : {},
      transaction,
    })

    for (const config of normalized.configs) {
      await ModelConfig.upsert({
        ...config,
        isActive: config.id === normalized.activeModelConfigId,
      }, { transaction })
    }

    await ModelConfig.update(
      { isActive: false },
      {
        where: { id: { [Op.notIn]: [normalized.activeModelConfigId] } },
        transaction,
      },
    )
  })

  return normalized
}

export async function readRobots() {
  const { Robot } = getModels()
  const rows = await Robot.findAll({
    order: [['createdAt', 'ASC']],
  })

  if (!rows.length) {
    return normalizeRobots(DEFAULT_ROBOTS)
  }

  return normalizeRobots(rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    avatar: row.avatar,
    systemPrompt: row.systemPrompt,
  })))
}

export async function writeRobots(robots) {
  const normalized = normalizeRobots(robots)
  const { sequelize, Robot } = getModels()

  await sequelize.transaction(async (transaction) => {
    const ids = normalized.map((item) => item.id)
    await Robot.destroy({
      where: ids.length ? { id: { [Op.notIn]: ids } } : {},
      transaction,
    })

    for (const robot of normalized) {
      await Robot.upsert(robot, { transaction })
    }
  })

  return normalized
}
