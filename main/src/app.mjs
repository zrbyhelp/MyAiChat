import express from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { extname } from 'node:path'

import { attachAdminBackoffice } from './admin-backoffice.mjs'
import { attachClerkAuth, requireApiAuth } from './auth.mjs'
import {
  detectReasoningSupport,
  fetchModels,
  getActiveLegacyConfig,
  getSessionBackgroundStatus,
  handleChatStream,
  requestNonStreamChat,
  testConnectionModels,
} from './chat-service.mjs'
import {
  buildSessionSummary,
  deleteSessionRecord,
  getSessionRecord,
  listSessions,
  normalizeModelConfig,
  normalizeModelConfigsPayload,
  normalizeRobots,
  readModelConfigs,
  readRobots,
  upsertSessionRecord,
  writeModelConfigs,
  writeRobots,
} from './storage.mjs'
import {
  cancelRobotGenerationImportTask,
  createRobotGenerationImportTask,
  getRobotImportTempDir,
  importRobotKnowledgeDocument,
  listRobotKnowledgeDocumentsForRobot,
  readRobotGenerationTask,
} from './robot-generation-service.mjs'
import {
  addTimelineEffect,
  createWorldRelationType,
  deleteTimelineEffect,
  deleteWorldEdge,
  deleteWorldNode,
  deleteWorldRelationType,
  getWorldGraph,
  listWorldRelationTypes,
  replaceWorldGraph,
  saveWorldEdge,
  saveWorldNode,
  updateTimelineEffect,
  updateTimelineOrder,
  updateWorldGraphLayout,
  updateWorldGraphMeta,
  updateWorldRelationType,
} from './world-graph-service.mjs'

function pickObjectKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return []
  }

  return Object.keys(value).slice(0, 30)
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: error.cause instanceof Error
        ? {
          name: error.cause.name,
          message: error.cause.message,
          stack: error.cause.stack,
        }
        : error.cause,
    }
  }

  return {
    message: typeof error === 'string' ? error : 'Non-error value thrown',
    detail: error,
  }
}

function logRequestError(error, req) {
  console.error('[api:error]', {
    timestamp: new Date().toISOString(),
    requestId: req.requestId || null,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userId: req.authUser?.id || null,
    userAgent: req.get('user-agent') || null,
    contentType: req.get('content-type') || null,
    params: req.params || {},
    queryKeys: pickObjectKeys(req.query),
    bodyKeys: pickObjectKeys(req.body),
    error: serializeError(error),
  })
}

function parseOptionalNumberField(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return undefined
  }
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

export function createApp() {
  const app = express()
  const supportedImportExtensions = new Set(['.txt', '.pdf', '.epub'])
  const supportedKnowledgeExtensions = new Set(['.txt', '.md'])
  const robotImportUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, getRobotImportTempDir())
      },
      filename: (_req, file, callback) => {
        const extension = extname(String(file?.originalname || '')).toLowerCase()
        callback(null, `${Date.now()}-${randomUUID()}${extension}`)
      },
    }),
    limits: {
      fileSize: Math.max(1, Number(process.env.ROBOT_IMPORT_MAX_FILE_SIZE_MB || 100)) * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
      const extension = extname(String(file?.originalname || '')).toLowerCase()
      if (!supportedImportExtensions.has(extension)) {
        callback(new Error('仅支持 txt、pdf、epub 文档导入'))
        return
      }
      callback(null, true)
    },
  })
  const robotKnowledgeUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, callback) => {
        callback(null, getRobotImportTempDir())
      },
      filename: (_req, file, callback) => {
        const extension = extname(String(file?.originalname || '')).toLowerCase()
        callback(null, `${Date.now()}-${randomUUID()}${extension}`)
      },
    }),
    limits: {
      fileSize: Math.max(1, Number(process.env.ROBOT_IMPORT_MAX_FILE_SIZE_MB || 100)) * 1024 * 1024,
    },
    fileFilter: (_req, file, callback) => {
      const extension = extname(String(file?.originalname || '')).toLowerCase()
      if (!supportedKnowledgeExtensions.has(extension)) {
        callback(new Error('仅支持 txt、md 文档导入'))
        return
      }
      callback(null, true)
    },
  })

  app.use(express.json({ limit: process.env.API_BODY_LIMIT || '20mb' }))
  app.use((req, res, next) => {
    req.requestId = randomUUID()
    res.setHeader('X-Request-Id', req.requestId)
    next()
  })
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })
  attachAdminBackoffice(app)
  app.use(attachClerkAuth)
  app.use('/api', requireApiAuth)

  app.get('/api/model-configs', async (req, res, next) => {
    try {
      res.json(await readModelConfigs(req.authUser))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/model-configs', async (req, res, next) => {
    try {
      const payload = normalizeModelConfigsPayload(req.body)
      await writeModelConfigs(req.authUser, payload)
      res.json(await readModelConfigs(req.authUser))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/model-configs/test', async (req, res, next) => {
    try {
      res.json(await testConnectionModels(req.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/model-config', async (req, res, next) => {
    try {
      res.json(await getActiveLegacyConfig(req.authUser))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/model-config', async (req, res, next) => {
    try {
      const config = normalizeModelConfig(req.body, 0)
      const payload = normalizeModelConfigsPayload({ configs: [config], activeModelConfigId: config.id })
      await writeModelConfigs(req.authUser, payload)
      res.json({ config })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/model-config/test', async (req, res, next) => {
    try {
      res.json(await testConnectionModels(req.body))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions', async (req, res, next) => {
    try {
      res.json({
        sessions: (await listSessions(req.authUser)).map((item) => buildSessionSummary(item)),
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/sessions', async (req, res, next) => {
    try {
      const session = await upsertSessionRecord(req.authUser, req.body)
      res.json({
        session: {
          ...buildSessionSummary(session),
          threadId: session.threadId,
          robot: session.robot,
          messages: session.messages,
          memory: session.memory,
          memorySchema: session.memorySchema,
          structuredMemory: session.structuredMemory,
          storyOutline: session.storyOutline || '',
          numericState: session.numericState,
          worldGraph: session.worldGraph,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:id', async (req, res, next) => {
    try {
      const session = await getSessionRecord(req.authUser, req.params.id)
      if (!session) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        session: {
          ...buildSessionSummary(session),
          threadId: session.threadId,
          robot: session.robot,
          messages: session.messages,
          memory: session.memory,
          memorySchema: session.memorySchema,
          structuredMemory: session.structuredMemory,
          storyOutline: session.storyOutline || '',
          numericState: session.numericState,
          worldGraph: session.worldGraph,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:id/background-status', async (req, res, next) => {
    try {
      const session = await getSessionRecord(req.authUser, req.params.id)
      if (!session) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        status: getSessionBackgroundStatus(req.params.id),
      })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/sessions/:id', async (req, res, next) => {
    try {
      const deleted = await deleteSessionRecord(req.authUser, req.params.id)
      if (!deleted) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        deletedSessionId: deleted.id,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/sessions/:id/delete', async (req, res, next) => {
    try {
      const deleted = await deleteSessionRecord(req.authUser, req.params.id)
      if (!deleted) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        deletedSessionId: deleted.id,
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/robots', async (req, res, next) => {
    try {
      res.json({ robots: await readRobots(req.authUser) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/robots', async (req, res, next) => {
    try {
      const robots = normalizeRobots(req.body?.robots)
      await writeRobots(req.authUser, robots)
      res.json({ robots })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/robots/:id/knowledge-documents', async (req, res, next) => {
    try {
      res.json({
        documents: await listRobotKnowledgeDocumentsForRobot(req.authUser, req.params.id),
      })
    } catch (error) {
      if (error instanceof Error && error.message === '智能体不存在') {
        res.status(404).json({ message: error.message })
        return
      }
      next(error)
    }
  })

  app.post('/api/robots/:id/knowledge-documents', robotKnowledgeUpload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: '请上传 txt 或 md 文档' })
        return
      }

      const embeddingModelConfigId = String(req.body?.embeddingModelConfigId || '').trim()
      if (!embeddingModelConfigId) {
        res.status(400).json({ message: '请选择向量 Embedding 模型' })
        return
      }

      const document = await importRobotKnowledgeDocument(req.authUser, {
        robotId: req.params.id,
        tempFilePath: req.file.path,
        sourceName: req.file.originalname,
        sourceSize: req.file.size,
        embeddingModelConfigId,
      })

      res.status(201).json({ document })
    } catch (error) {
      if (error instanceof Error && error.message === '智能体不存在') {
        res.status(404).json({ message: error.message })
        return
      }
      next(error)
    } finally {
      if (req.file?.path) {
        await unlink(req.file.path).catch(() => {})
      }
    }
  })

  app.post('/api/robots/generation-tasks', robotImportUpload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) {
        res.status(400).json({ message: '请上传 txt、pdf 或 epub 文档' })
        return
      }

      const modelConfigId = String(req.body?.modelConfigId || '').trim()
      if (!modelConfigId) {
        res.status(400).json({ message: '请选择文档生成模型' })
        return
      }

      const embeddingModelConfigId = String(req.body?.embeddingModelConfigId || '').trim()
      if (!embeddingModelConfigId) {
        res.status(400).json({ message: '请选择向量 Embedding 模型' })
        return
      }

      const extension = extname(String(req.file.originalname || '')).toLowerCase()
      const task = await createRobotGenerationImportTask(req.authUser, {
        tempFilePath: req.file.path,
        sourceName: req.file.originalname,
        sourceType: extension.replace(/^\./, ''),
        sourceSize: req.file.size,
        guidance: String(req.body?.guidance || ''),
        modelConfigId,
        embeddingModelConfigId,
        extractionDetail: {
          targetSegmentChars: parseOptionalNumberField(req.body?.targetSegmentChars),
          maxEntitiesPerSegment: parseOptionalNumberField(req.body?.maxEntitiesPerSegment),
          maxRelationsPerSegment: parseOptionalNumberField(req.body?.maxRelationsPerSegment),
          maxEventsPerSegment: parseOptionalNumberField(req.body?.maxEventsPerSegment),
          entityImportanceThreshold: parseOptionalNumberField(req.body?.entityImportanceThreshold),
          relationImportanceThreshold: parseOptionalNumberField(req.body?.relationImportanceThreshold),
          eventImportanceThreshold: parseOptionalNumberField(req.body?.eventImportanceThreshold),
        },
      })

      res.status(202).json({ task })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/robots/generation-tasks/:taskId', async (req, res, next) => {
    try {
      const task = await readRobotGenerationTask(req.authUser, req.params.taskId)
      if (!task) {
        res.status(404).json({ message: '任务不存在' })
        return
      }
      res.json({ task })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/robots/generation-tasks/:taskId', async (req, res, next) => {
    try {
      const task = await cancelRobotGenerationImportTask(req.authUser, req.params.taskId)
      if (!task) {
        res.status(404).json({ message: '任务不存在' })
        return
      }
      res.json({ task })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/robots/:id/world-graph', async (req, res, next) => {
    try {
      res.json(await getWorldGraph(req.authUser, req.params.id))
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph', async (req, res, next) => {
    try {
      res.json(await replaceWorldGraph(req.authUser, req.params.id, req.body))
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/meta', async (req, res, next) => {
    try {
      res.json({ meta: await updateWorldGraphMeta(req.authUser, req.params.id, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/layout', async (req, res, next) => {
    try {
      res.json({ meta: await updateWorldGraphLayout(req.authUser, req.params.id, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/robots/:id/world-graph/relation-types', async (req, res, next) => {
    try {
      res.json({ relationTypes: await listWorldRelationTypes(req.authUser, req.params.id) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/robots/:id/world-graph/relation-types', async (req, res, next) => {
    try {
      res.json({ relationType: await createWorldRelationType(req.authUser, req.params.id, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/relation-types/:typeId', async (req, res, next) => {
    try {
      res.json({ relationType: await updateWorldRelationType(req.authUser, req.params.id, req.params.typeId, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/robots/:id/world-graph/relation-types/:typeId', async (req, res, next) => {
    try {
      res.json(await deleteWorldRelationType(req.authUser, req.params.id, req.params.typeId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/robots/:id/world-graph/nodes', async (req, res, next) => {
    try {
      res.json({ node: await saveWorldNode(req.authUser, req.params.id, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/nodes/:nodeId', async (req, res, next) => {
    try {
      res.json({ node: await saveWorldNode(req.authUser, req.params.id, { ...req.body, id: req.params.nodeId }) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/robots/:id/world-graph/nodes/:nodeId', async (req, res, next) => {
    try {
      res.json(await deleteWorldNode(req.authUser, req.params.id, req.params.nodeId))
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/robots/:id/world-graph/edges', async (req, res, next) => {
    try {
      res.json({ edge: await saveWorldEdge(req.authUser, req.params.id, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/edges/:edgeId', async (req, res, next) => {
    try {
      res.json({ edge: await saveWorldEdge(req.authUser, req.params.id, { ...req.body, id: req.params.edgeId }) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/robots/:id/world-graph/edges/:edgeId', async (req, res, next) => {
    try {
      res.json(await deleteWorldEdge(req.authUser, req.params.id, req.params.edgeId))
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/timeline/order', async (req, res, next) => {
    try {
      res.json({ events: await updateTimelineOrder(req.authUser, req.params.id, req.body?.eventIds) })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/robots/:id/world-graph/timeline/events/:eventId/effects', async (req, res, next) => {
    try {
      res.json({ event: await addTimelineEffect(req.authUser, req.params.id, req.params.eventId, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.put('/api/robots/:id/world-graph/timeline/effects/:effectId', async (req, res, next) => {
    try {
      res.json({ event: await updateTimelineEffect(req.authUser, req.params.id, req.params.effectId, req.body) })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/robots/:id/world-graph/timeline/effects/:effectId', async (req, res, next) => {
    try {
      res.json(await deleteTimelineEffect(req.authUser, req.params.id, req.params.effectId))
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/models', async (req, res, next) => {
    try {
      const config = normalizeModelConfig({
        provider: req.query.provider,
        baseUrl: req.query.baseUrl,
        apiKey: req.query.apiKey,
      })
      res.json({ models: await fetchModels(config) })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/capabilities', (req, res) => {
    const provider = String(req.query.provider || 'openai')
    const model = String(req.query.model || '')
    res.json({
      capabilities: {
        supportsStreaming: true,
        supportsReasoning: detectReasoningSupport(provider, model),
      },
    })
  })

  app.post('/api/chat', async (req, res, next) => {
    try {
      const result = await requestNonStreamChat(req.body, req.authUser)
      res.json({
        message: result.message,
        reasoning: result.reasoning,
        suggestions: result.suggestions,
        form: result.form,
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/chat/stream', async (req, res) => {
    await handleChatStream(req.body, res, req.authUser)
  })

  app.use((error, req, res, _next) => {
    logRequestError(error, req)
    res.status(500).json({
      message: error instanceof Error ? error.message : '服务异常',
      requestId: req.requestId || null,
    })
  })

  return app
}
