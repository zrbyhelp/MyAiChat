import express from 'express'

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
  clearSessionMemoryRecord,
  deleteSessionRecord,
  ensureDataFiles,
  getSessionRecord,
  listSessions,
  normalizeModelConfig,
  normalizeModelConfigsPayload,
  normalizeRobots,
  readModelConfigs,
  readRobots,
  updateSessionMemoryRecord,
  upsertSessionRecord,
  writeModelConfigs,
  writeRobots,
} from './storage.mjs'

export function createApp() {
  const app = express()

  app.use(express.json({ limit: '2mb' }))
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') {
      res.status(204).end()
      return
    }
    next()
  })

  app.get('/api/model-configs', async (_req, res, next) => {
    try {
      res.json(await readModelConfigs())
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/model-configs', async (req, res, next) => {
    try {
      const payload = normalizeModelConfigsPayload(req.body)
      await writeModelConfigs(payload)
      res.json(payload)
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

  app.get('/api/model-config', async (_req, res, next) => {
    try {
      res.json(await getActiveLegacyConfig())
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/model-config', async (req, res, next) => {
    try {
      const config = normalizeModelConfig(req.body, 0)
      const payload = normalizeModelConfigsPayload({ configs: [config], activeModelConfigId: config.id })
      await writeModelConfigs(payload)
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

  app.get('/api/sessions', async (_req, res, next) => {
    try {
      await ensureDataFiles()
      res.json({
        sessions: listSessions().map((item) => buildSessionSummary(item)),
      })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/sessions', async (req, res, next) => {
    try {
      const session = await upsertSessionRecord(req.body)
      res.json({
        session: {
          ...buildSessionSummary(session),
          robot: session.robot,
          messages: session.messages,
          memory: session.memory,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/sessions/:id', async (req, res, next) => {
    try {
      const session = getSessionRecord(req.params.id)
      if (!session) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        session: {
          ...buildSessionSummary(session),
          robot: session.robot,
          messages: session.messages,
          memory: session.memory,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/sessions/:id', async (req, res, next) => {
    try {
      const deleted = await deleteSessionRecord(req.params.id)
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
      const deleted = await deleteSessionRecord(req.params.id)
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

  app.post('/api/sessions/:id/memory', async (req, res, next) => {
    try {
      const session = await updateSessionMemoryRecord(req.params.id, req.body || {})
      if (!session) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        session: {
          ...buildSessionSummary(session),
          robot: session.robot,
          messages: session.messages,
          memory: session.memory,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.delete('/api/sessions/:id/memory', async (req, res, next) => {
    try {
      const session = await clearSessionMemoryRecord(req.params.id)
      if (!session) {
        res.status(404).json({ message: '会话不存在' })
        return
      }
      res.json({
        session: {
          ...buildSessionSummary(session),
          robot: session.robot,
          messages: session.messages,
          memory: session.memory,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.get('/api/robots', async (_req, res, next) => {
    try {
      res.json({ robots: await readRobots() })
    } catch (error) {
      next(error)
    }
  })

  app.post('/api/robots', async (req, res, next) => {
    try {
      const robots = normalizeRobots(req.body?.robots)
      await writeRobots(robots)
      res.json({ robots })
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
    const provider = req.query.provider === 'openai' ? 'openai' : 'ollama'
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
      const result = await requestNonStreamChat(req.body)
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
    await handleChatStream(req.body, res)
  })

  app.use((error, _req, res, _next) => {
    res.status(500).json({ message: error instanceof Error ? error.message : '服务异常' })
  })

  return app
}
