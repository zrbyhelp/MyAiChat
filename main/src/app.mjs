import express from 'express'

import { attachAdminBackoffice } from './admin-backoffice.mjs'
import { attachClerkAuth, requireApiAuth } from './auth.mjs'
import {
  detectReasoningSupport,
  fetchModels,
  getActiveLegacyConfig,
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
  addTimelineEffect,
  createWorldRelationType,
  deleteTimelineEffect,
  deleteWorldEdge,
  deleteWorldNode,
  deleteWorldRelationType,
  getWorldGraph,
  listWorldRelationTypes,
  saveWorldEdge,
  saveWorldNode,
  updateTimelineEffect,
  updateTimelineOrder,
  updateWorldGraphLayout,
  updateWorldGraphMeta,
  updateWorldRelationType,
} from './world-graph-service.mjs'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: process.env.API_BODY_LIMIT || '20mb' }))
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
          numericState: session.numericState,
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
          numericState: session.numericState,
        },
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

  app.get('/api/robots/:id/world-graph', async (req, res, next) => {
    try {
      res.json(await getWorldGraph(req.authUser, req.params.id))
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

  app.use((error, _req, res, _next) => {
    res.status(500).json({ message: error instanceof Error ? error.message : '服务异常' })
  })

  return app
}
