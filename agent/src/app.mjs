import express from 'express'
import { ZodError } from 'zod'

import { createModelClient } from './model-client.mjs'
import { getPromptConfig } from './prompt-config.mjs'
import {
  buildRequestState,
  emptyUsage,
  formatStageError,
  hasSchemaCategories,
  historyText,
  normalizeStructuredMemory,
  saveMemoryToThread,
  shouldUseRequestSchema,
  worldGraphWritebackNode,
  memoryNode,
  buildInitialState,
} from './runtime.mjs'
import {
  parseDocumentSummaryRequest,
  parseRetrievalSummaryRequest,
  parseRobotGenerationRequest,
  parseRobotWorldGraphEvolutionRequest,
  parseRunRequest,
} from './schemas.mjs'
import { ThreadStore } from './thread-store.mjs'
import {
  createRobotGenerationWorkflow,
  createStreamWorkflow,
  runWorldGraphEvolution,
} from './workflows.mjs'

function sse(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next)
    } catch (error) {
      next(error)
    }
  }
}

function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

export async function createApp(options = {}) {
  const promptConfig = options.promptConfig || getPromptConfig()
  const modelClient = options.modelClient || createModelClient(options.modelClientOptions)
  const store = options.store || new ThreadStore(options.storeOptions)
  const streamWorkflow = options.streamWorkflow || createStreamWorkflow({ modelClient })
  const robotGenerationWorkflow = options.robotGenerationWorkflow || createRobotGenerationWorkflow({ modelClient })

  await store.ensureReady()

  const app = express()
  app.use(express.json({ limit: '20mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/runs/document-summary', asyncRoute(async (req, res) => {
    const request = parseDocumentSummaryRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }

    let prompt = ''
    let systemInstruction = ''
    if (request.mode === 'segment') {
      if (!String(request.text || '').trim()) {
        throw createHttpError(400, 'text 不能为空')
      }
      systemInstruction = promptConfig.templates.document_summary.segment_system_instruction
      prompt = [
        `文档名称：${request.source_name || '未命名文档'}`,
        `用户引导语：${request.guidance || '无'}`,
        `当前片段：${request.index + 1}/${Math.max(request.total, 1)}`,
        '片段内容：',
        request.text.trim(),
      ].join('\n\n')
    } else {
      const summaries = request.summaries.map((item) => String(item || '').trim()).filter(Boolean)
      if (!summaries.length) {
        throw createHttpError(400, 'summaries 不能为空')
      }
      systemInstruction = promptConfig.templates.document_summary.aggregate_system_instruction
      prompt = [
        `文档名称：${request.source_name || '未命名文档'}`,
        `用户引导语：${request.guidance || '无'}`,
        `聚合轮次：${Math.max(request.round, 1)}`,
        '待压缩摘要：',
        summaries.map((item) => `- ${item}`).join('\n\n'),
      ].join('\n\n')
    }

    const result = await modelClient.invokeText(
      request.model_settings,
      systemInstruction,
      prompt,
    )

    res.json({
      summary: result.text,
      usage: result.usage,
    })
  }))

  app.post('/runs/robot-generation', asyncRoute(async (req, res) => {
    const request = parseRobotGenerationRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }
    if (!String(request.document_summary || '').trim() && !request.segment_summaries.some((item) => String(item || '').trim())) {
      throw createHttpError(400, 'document_summary 不能为空')
    }

    try {
      const result = await robotGenerationWorkflow.invoke({
        context: {
          request,
          model_settings: request.model_settings,
        },
      })
      res.json({
        ...result.context.generated_robot_payload,
        usage: result.context.usage,
      })
    } catch (error) {
      throw createHttpError(502, error instanceof Error ? error.message : '智能体生成失败')
    }
  }))

  app.post('/runs/robot-world-graph-evolution', asyncRoute(async (req, res) => {
    const request = parseRobotWorldGraphEvolutionRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }
    if (!String(request.segment_summary || '').trim()) {
      throw createHttpError(400, 'segment_summary 不能为空')
    }

    try {
      const result = await runWorldGraphEvolution({
        modelClient,
        modelSettings: request.model_settings,
        request,
      })
      res.json(result)
    } catch (error) {
      throw createHttpError(502, error instanceof Error ? error.message : '世界图谱演化 patch生成失败')
    }
  }))

  app.post('/runs/retrieval-summary', asyncRoute(async (req, res) => {
    const request = parseRetrievalSummaryRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }
    if (!String(request.prompt || '').trim() && !request.history.some((item) => String(item.content || '').trim())) {
      throw createHttpError(400, 'prompt 不能为空')
    }

    const prompt = [
      `机器人名称：${request.robot_name || '当前智能体'}`,
      `机器人简介：${request.robot_description || '无'}`,
      `故事梗概：${request.story_outline || '无'}`,
      '最近对话：',
      historyText(request.history, 8),
      '用户当前输入：',
      String(request.prompt || '').trim() || '无',
    ].join('\n\n')

    const result = await modelClient.invokeText(
      request.model_settings,
      promptConfig.templates.retrieval_summary.system_instruction,
      prompt,
    )
    res.json({
      summary: result.text,
      usage: result.usage,
    })
  }))

  app.post('/runs/stream', asyncRoute(async (req, res) => {
    const request = parseRunRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }
    if (!String(request.prompt || '').trim()) {
      throw createHttpError(400, 'prompt 不能为空')
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    })

    const sendEvent = async (payload) => {
      if (!res.writableEnded) {
        res.write(sse(payload))
      }
    }

    try {
      const thread = await store.load(request.thread_id)
      const history = thread ? thread.messages : request.history
      const useRequestSchema = shouldUseRequestSchema(thread, request)
      const memorySchema = useRequestSchema
        ? request.memory_schema
        : (thread && hasSchemaCategories(thread.memory_schema) ? thread.memory_schema : request.memory_schema)
      const rawStructuredMemory = thread && !useRequestSchema ? thread.structured_memory : request.structured_memory
      const structuredMemory = normalizeStructuredMemory(memorySchema, rawStructuredMemory)
      if (thread) {
        request.numeric_state = thread.numeric_state
        request.story_outline = thread.story_outline || request.story_outline
      }

      const state = buildInitialState(request, history, memorySchema, structuredMemory)
      state.request = request
      state.event_sink = sendEvent

      await sendEvent({ type: 'run_started', threadId: request.thread_id })
      const result = await streamWorkflow.invoke({ context: state })
      const nextState = result.context

      const nextMessages = [
        ...history,
        { role: 'user', content: request.prompt },
        { role: 'assistant', content: nextState.final_response || '' },
      ]

      await store.save({
        thread_id: request.thread_id,
        messages: nextMessages,
        memory_schema: memorySchema,
        structured_memory: nextState.structured_memory,
        numeric_state: nextState.numeric_state || {},
        story_outline: nextState.story_outline || '',
      })

      await sendEvent({ type: 'usage', ...(nextState.usage || emptyUsage()) })
      await sendEvent({
        type: 'run_completed',
        threadId: request.thread_id,
        message: nextState.final_response || '',
        memory: nextState.structured_memory,
        numeric_state: nextState.numeric_state || {},
        story_outline: nextState.story_outline || '',
        usage: nextState.usage || emptyUsage(),
      })
    } catch (error) {
      await sendEvent({
        type: 'error',
        message: String(error instanceof Error ? error.message : formatStageError(request, '执行阶段', error)).trim(),
      })
    } finally {
      res.end()
    }
  }))

  app.post('/runs/memory', asyncRoute(async (req, res) => {
    const request = parseRunRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }
    if (!String(request.prompt || '').trim()) {
      throw createHttpError(400, 'prompt 不能为空')
    }

    const { state } = buildRequestState(request)
    const payload = await memoryNode(state, modelClient)
    if (!payload.structured_memory) {
      throw createHttpError(500, '结构化记忆结果无效')
    }
    await saveMemoryToThread(store, request, payload.structured_memory, state)
    res.json({
      threadId: request.thread_id,
      memory: payload.structured_memory,
      usage: payload.usage || emptyUsage(),
    })
  }))

  app.post('/runs/world-graph-writeback', asyncRoute(async (req, res) => {
    const request = parseRunRequest(req.body)
    if (!request.model_settings.model) {
      throw createHttpError(400, 'model 不能为空')
    }
    if (!String(request.prompt || '').trim()) {
      throw createHttpError(400, 'prompt 不能为空')
    }

    const { state } = buildRequestState(request)
    const payload = await worldGraphWritebackNode(state, modelClient)
    res.json({
      threadId: request.thread_id,
      world_graph_writeback_ops: payload.world_graph_writeback_ops || {},
      usage: payload.usage || emptyUsage(),
    })
  }))

  app.use((error, _req, res, _next) => {
    if (res.headersSent) {
      return
    }

    if (error instanceof ZodError) {
      res.status(400).json({
        detail: error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; '),
      })
      return
    }

    const status = Number(error?.status || 500) || 500
    res.status(status).json({
      detail: error instanceof Error ? error.message : '请求失败',
    })
  })

  return app
}
