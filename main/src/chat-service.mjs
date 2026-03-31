import {
  createSessionTitle,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_SESSION_ROBOT,
  getSessionRecord,
  normalizeModelConfig,
  normalizeMemorySchema,
  normalizeSession,
  normalizeSessionRobot,
  normalizeSessionUsage,
  normalizeStructuredMemory,
  readModelConfigs,
  saveSessionRecord,
} from './storage.mjs'
import {
  createStructuredStreamParser,
  consumeStructuredStreamChunk,
  extractStructuredPayloadsFromText,
  finalizeStructuredStream,
  normalizeFormSchema,
  normalizeSuggestionItems,
} from './structured.mjs'
import {
  applyWorldGraphWritebackToSnapshot,
  cloneWorldGraphSnapshot,
  createEmptyWorldGraphSnapshot,
  getWorldGraph,
  normalizeWorldGraphSnapshot,
} from './world-graph-service.mjs'

const DEFAULT_AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000'

export function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function getOllamaChatBaseUrl(baseUrl) {
  const sanitized = sanitizeBaseUrl(baseUrl)
  return /\/v1$/i.test(sanitized) ? sanitized : `${sanitized}/v1`
}

function getOllamaApiBaseUrl(baseUrl) {
  return sanitizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

function getAgentServiceUrl() {
  return sanitizeBaseUrl(DEFAULT_AGENT_SERVICE_URL)
}

function getOpenAIBaseUrl(baseUrl) {
  return sanitizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

function buildHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
  }
  if (config.provider !== 'ollama' && config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }
  return headers
}

function resolveChatRobotName(payload, session) {
  const candidates = [
    session?.robot?.name,
    payload?.robot?.name,
    payload?.sessionSnapshot?.robot?.name,
    payload?.robotName,
  ]
  const resolved = candidates.find((item) => typeof item === 'string' && item.trim())
  return resolved ? String(resolved).trim() : '当前智能体'
}

function getChatErrorReason(error) {
  if (!(error instanceof Error)) {
    return '请求失败'
  }

  const message = String(error.message || '').trim()
  if (!message) {
    return '请求失败'
  }

  if (
    message === 'terminated' ||
    /terminated|abort|aborted|UND_ERR_SOCKET|other side closed|socket|stream ended unexpectedly/i.test(message)
  ) {
    return '连接中断'
  }

  if (message === 'fetch failed') {
    return '请求失败'
  }

  if (/ECONNREFUSED|actively refused|积极拒绝|connect/i.test(message)) {
    return '请求失败'
  }

  if (message.includes('聊天失败：')) {
    return message.replace(/^聊天失败：/, '').trim() || '请求失败'
  }

  if (/智能体「.+?」/.test(message)) {
    return message
  }

  return message
}

function formatChatErrorMessage(payload, session, error) {
  const robotName = resolveChatRobotName(payload, session)
  const reason = getChatErrorReason(error)
  const normalizedReason = reason.startsWith(`智能体「${robotName}」`) ? reason : `智能体「${robotName}」${reason}`
  return `聊天失败：${normalizedReason}`
}

function describeFetchError(error, endpoint, actionLabel) {
  if (!(error instanceof Error)) {
    return `${actionLabel}失败`
  }

  if (error.message === 'fetch failed') {
    return `${actionLabel}失败，无法连接到 ${endpoint || '上游服务'}`
  }

  if (/ECONNREFUSED|actively refused|积极拒绝|connect/i.test(error.message)) {
    return `${actionLabel}失败，目标服务拒绝连接：${endpoint || '上游服务'}`
  }

  return `${actionLabel}失败：${error.message}`
}

export function detectReasoningSupport(provider, model) {
  if (String(provider || 'openai') === 'ollama') {
    return false
  }
  if (!model) {
    return false
  }
  return /^o\d/i.test(model) || /^gpt-5/i.test(model)
}

function normalizeUsage(input) {
  return normalizeSessionUsage({
    promptTokens: input?.promptTokens ?? input?.prompt_tokens ?? input?.input_tokens,
    completionTokens: input?.completionTokens ?? input?.completion_tokens ?? input?.output_tokens,
  })
}

function normalizePositiveInteger(value, fallback) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function hasWorldGraphWritebackOps(value) {
  if (!value || typeof value !== 'object') {
    return false
  }
  return [
    value.upsert_nodes,
    value.upsertNodes,
    value.upsert_edges,
    value.upsertEdges,
    value.upsert_events,
    value.upsertEvents,
    value.append_node_snapshots,
    value.appendNodeSnapshots,
    value.append_edge_snapshots,
    value.appendEdgeSnapshots,
    value.append_event_effects,
    value.appendEventEffects,
  ].some((item) => Array.isArray(item) && item.length > 0)
}

function resolveSessionRobotId(payload, session) {
  const candidates = [
    session?.robot?.id,
    payload?.robot?.id,
    payload?.sessionSnapshot?.robot?.id,
  ]
  const resolved = candidates.find((item) => typeof item === 'string' && item.trim())
  return resolved ? String(resolved).trim() : ''
}

async function loadWorldGraphPayload(user, payload, session) {
  const robotId = resolveSessionRobotId(payload, session)
  const robotName = resolveChatRobotName(payload, session)
  const sessionGraph =
    session?.worldGraph ||
    payload?.sessionSnapshot?.worldGraph ||
    payload?.sessionSnapshot?.world_graph ||
    null

  if (sessionGraph) {
    return normalizeWorldGraphSnapshot(sessionGraph, { robotId, robotName })
  }

  if (!robotId) {
    return createEmptyWorldGraphSnapshot(robotId, robotName)
  }

  try {
    return cloneWorldGraphSnapshot(await getWorldGraph(user, robotId))
  } catch {
    return createEmptyWorldGraphSnapshot(robotId, robotName)
  }
}

async function buildAgentRequest(payload, user, session) {
  const memory = session?.memory || DEFAULT_SESSION_MEMORY
  const robot = session?.robot || payload.robot || DEFAULT_SESSION_ROBOT
  const structuredMemoryInterval = normalizePositiveInteger(
    memory?.structuredMemoryInterval,
    normalizePositiveInteger(robot?.structuredMemoryInterval, DEFAULT_SESSION_MEMORY.structuredMemoryInterval),
  )
  const structuredMemoryHistoryLimit = normalizePositiveInteger(
    memory?.structuredMemoryHistoryLimit,
    normalizePositiveInteger(robot?.structuredMemoryHistoryLimit, DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit),
  )

  function resolveAuxiliaryModelConfig(modelConfigId) {
    const targetId = String(modelConfigId || '').trim()
    const primaryConfig = normalizeModelConfig({
      provider: payload.provider,
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
      model: payload.model,
      temperature: payload.temperature,
    }, 0)

    if (!targetId) {
      return primaryConfig
    }

    const matched = Array.isArray(payload.modelConfigs)
      ? payload.modelConfigs.find((item) => String(item?.id || '') === targetId)
      : null

    return matched ? normalizeModelConfig(matched, 0) : primaryConfig
  }

  return {
    thread_id: session?.threadId || payload.sessionId,
    session_id: payload.sessionId,
    prompt: String(payload.prompt || ''),
    user: {
      id: user.id,
      email: user.email || null,
      display_name: user.displayName || null,
    },
    model_config: {
      provider: String(payload.provider || 'openai'),
      base_url:
        String(payload.provider || 'openai') === 'ollama'
          ? getOllamaChatBaseUrl(payload.baseUrl)
          : sanitizeBaseUrl(payload.baseUrl),
      api_key: String(payload.apiKey || ''),
      model: String(payload.model || ''),
      temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
    },
    robot: {
      id: String(robot?.id || ''),
      name: robot?.name || payload.robotName || '当前智能体',
      avatar: robot?.avatar || '',
      common_prompt: String(robot?.commonPrompt || ''),
      system_prompt: robot?.systemPrompt || payload.systemPrompt || '',
      memory_model_config_id: String(robot?.memoryModelConfigId || ''),
      outline_model_config_id: String(robot?.outlineModelConfigId || ''),
      numeric_computation_model_config_id: String(robot?.numericComputationModelConfigId || ''),
      world_graph_model_config_id: String(robot?.worldGraphModelConfigId || ''),
      numeric_computation_enabled: Boolean(robot?.numericComputationEnabled),
      numeric_computation_prompt: String(robot?.numericComputationPrompt || ''),
      numeric_computation_items: Array.isArray(robot?.numericComputationItems) ? robot.numericComputationItems : [],
      structured_memory_interval: normalizePositiveInteger(
        robot?.structuredMemoryInterval,
        DEFAULT_SESSION_ROBOT.structuredMemoryInterval,
      ),
      structured_memory_history_limit: normalizePositiveInteger(
        robot?.structuredMemoryHistoryLimit,
        DEFAULT_SESSION_ROBOT.structuredMemoryHistoryLimit,
      ),
    },
    system_prompt: payload.systemPrompt || '',
    history: (session?.messages || []).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    memory_schema: normalizeMemorySchema(session?.memorySchema || payload.robot?.memorySchema),
    structured_memory: normalizeStructuredMemory(session?.structuredMemory),
    numeric_state:
      typeof session?.numericState === 'object' && session?.numericState !== null
        ? session.numericState
        : {},
    story_outline: String(session?.storyOutline || payload.sessionSnapshot?.storyOutline || ''),
    auxiliary_model_configs: {
      memory: (() => {
        const config = resolveAuxiliaryModelConfig(robot?.memoryModelConfigId)
        return {
          model_config_id: String(robot?.memoryModelConfigId || ''),
          provider: config.provider,
          base_url:
            config.provider === 'ollama'
              ? getOllamaChatBaseUrl(config.baseUrl)
              : sanitizeBaseUrl(config.baseUrl),
          api_key: String(config.apiKey || ''),
          model: String(config.model || ''),
          temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
        }
      })(),
      outline: (() => {
        const config = resolveAuxiliaryModelConfig(robot?.outlineModelConfigId)
        return {
          model_config_id: String(robot?.outlineModelConfigId || ''),
          provider: config.provider,
          base_url:
            config.provider === 'ollama'
              ? getOllamaChatBaseUrl(config.baseUrl)
              : sanitizeBaseUrl(config.baseUrl),
          api_key: String(config.apiKey || ''),
          model: String(config.model || ''),
          temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
        }
      })(),
      numeric_computation: (() => {
        const config = resolveAuxiliaryModelConfig(robot?.numericComputationModelConfigId)
        return {
          model_config_id: String(robot?.numericComputationModelConfigId || ''),
          provider: config.provider,
          base_url:
            config.provider === 'ollama'
              ? getOllamaChatBaseUrl(config.baseUrl)
              : sanitizeBaseUrl(config.baseUrl),
          api_key: String(config.apiKey || ''),
          model: String(config.model || ''),
          temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
        }
      })(),
      world_graph: (() => {
        const config = resolveAuxiliaryModelConfig(robot?.worldGraphModelConfigId)
        return {
          model_config_id: String(robot?.worldGraphModelConfigId || ''),
          provider: config.provider,
          base_url:
            config.provider === 'ollama'
              ? getOllamaChatBaseUrl(config.baseUrl)
              : sanitizeBaseUrl(config.baseUrl),
          api_key: String(config.apiKey || ''),
          model: String(config.model || ''),
          temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
        }
      })(),
    },
    world_graph: await loadWorldGraphPayload(user, payload, session),
    structured_memory_interval: structuredMemoryInterval,
    structured_memory_history_limit: structuredMemoryHistoryLimit,
  }
}

async function requestAgentRun(payload, user) {
  const session =
    payload.persistToServer === false
      ? normalizeSession(payload.sessionSnapshot || {
          id: payload.sessionId,
          persistToServer: false,
          messages: [],
          memory: {
            ...DEFAULT_SESSION_MEMORY,
            persistToServer: false,
          },
          structuredMemory: {},
        })
      : await getSessionRecord(user, payload.sessionId)
  const endpoint = `${getAgentServiceUrl()}/runs/stream`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(await buildAgentRequest(payload, user, session)),
    })

    if (!response.ok) {
      throw new Error((await response.text()) || 'Agent 请求失败')
    }

    return { response, session }
  } catch (error) {
    throw new Error(formatChatErrorMessage(payload, session, new Error(describeFetchError(error, endpoint, '请求失败'))))
  }
}

async function commitSession(payload, user, result, existingSession) {
  if (payload.persistToServer === false) {
    return null
  }
  const now = new Date().toISOString()
  const existing = existingSession || await getSessionRecord(user, payload.sessionId)
  const nextMessages = [...(existing?.messages || [])]

  nextMessages.push({
    id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: 'user',
    content: String(payload.prompt || ''),
    reasoning: '',
    createdAt: now,
  })
  nextMessages.push({
      id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      role: 'assistant',
      content: String(result.message || ''),
      reasoning: '',
      suggestions: normalizeSuggestionItems(result.suggestions),
      form: normalizeFormSchema(result.form),
      createdAt: now,
    })

  const existingUsage = normalizeSessionUsage(existing?.usage)
  const nextUsage = normalizeUsage(result.usage)

  return saveSessionRecord(user, normalizeSession({
    ...(existing || {}),
    id: payload.sessionId,
    title: existing?.messages?.length ? existing.title : createSessionTitle(payload.prompt),
    preview: String(result.message || payload.prompt || ''),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    robot: normalizeSessionRobot(payload.robot || { name: payload.robotName, systemPrompt: payload.systemPrompt }),
    modelConfigId: payload.modelConfigId || existing?.modelConfigId || '',
    modelLabel: payload.modelLabel || existing?.modelLabel || payload.model || '',
    threadId: result.threadId || existing?.threadId || payload.sessionId,
    storyOutline: String(result.storyOutline || existing?.storyOutline || ''),
    messages: nextMessages,
    memory: existing?.memory,
    memorySchema: normalizeMemorySchema(existing?.memorySchema || payload.robot?.memorySchema),
    structuredMemory: normalizeStructuredMemory(result.memory || existing?.structuredMemory),
    numericState:
      typeof result.numericState === 'object' && result.numericState !== null
        ? result.numericState
        : existing?.numericState || {},
    worldGraph: result.worldGraph || existing?.worldGraph || payload.sessionSnapshot?.worldGraph || null,
    usage: {
      promptTokens: existingUsage.promptTokens + nextUsage.promptTokens,
      completionTokens: existingUsage.completionTokens + nextUsage.completionTokens,
    },
  }))
}

function parseSseParts(buffer) {
  const parts = buffer.split('\n\n')
  return {
    complete: parts.slice(0, -1),
    rest: parts[parts.length - 1] || '',
  }
}

function parseSseData(part) {
  const lines = part.split('\n').map((line) => line.trim()).filter(Boolean)
  const dataLine = lines.find((line) => line.startsWith('data:'))
  if (!dataLine) {
    return null
  }
  try {
    return JSON.parse(dataLine.slice(5).trim())
  } catch {
    return null
  }
}

export function sendSSE(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function sendUsageSSE(res, session) {
  const usage = normalizeSessionUsage(session?.usage)
  sendSSE(res, {
    type: 'usage',
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
  })
}

async function runAgentAndCollect(payload, user, onEvent) {
  const { response, session } = await requestAgentRun(payload, user)
  if (!response.body) {
    throw new Error(formatChatErrorMessage(payload, session, new Error('连接中断')))
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finalMessage = ''
  let finalMemory = normalizeStructuredMemory(session?.structuredMemory)
  let finalUsage = normalizeSessionUsage(null)
  let finalThreadId = session?.threadId || payload.sessionId
  let finalSuggestions = []
  let finalForm = null
  let finalNumericState = session?.numericState || {}
  let finalStoryOutline = String(session?.storyOutline || payload.sessionSnapshot?.storyOutline || '')
  let finalWorldGraph = await loadWorldGraphPayload(user, payload, session)
  let finalWorldGraphWritebackOps = null
  const structuredStreamState = createStructuredStreamParser()
  let structuredStreamClosed = false
  let receivedResponseCompleted = false
  let receivedRunCompleted = false

  function finalizeStructuredAssistantOutput(rawMessage = '') {
    if (structuredStreamClosed) {
      return
    }

    const finalized = String(rawMessage || '').trim()
      ? extractStructuredPayloadsFromText(rawMessage)
      : finalizeStructuredStream(structuredStreamState)
    structuredStreamClosed = true
    finalMessage = String(finalized.text || '').trim()
    finalSuggestions = normalizeSuggestionItems(finalized.suggestions)
    finalForm = normalizeFormSchema(finalized.form)
  }

  try {
    while (true) {
      let readResult
      try {
        readResult = await reader.read()
      } catch (error) {
        throw new Error(formatChatErrorMessage(payload, session, error))
      }

      const { value, done } = readResult
      if (done) {
        break
      }

      buffer += decoder.decode(value, { stream: true })
      const { complete, rest } = parseSseParts(buffer)
      buffer = rest

      for (const part of complete) {
        const parsed = parseSseData(part)
        if (!parsed) {
          continue
        }
        const forwardedEvents = []

        if (parsed.type === 'error') {
          throw new Error(typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message.trim() : '聊天失败')
        }

        if (parsed.type === 'message_delta' && parsed.text) {
          const visibleText = consumeStructuredStreamChunk(structuredStreamState, parsed.text)
          if (visibleText) {
            finalMessage += String(visibleText)
            forwardedEvents.push({ type: 'message_delta', text: visibleText })
          }
        } else if (parsed.type === 'message_done') {
          finalizeStructuredAssistantOutput(String(parsed.text || ''))
          forwardedEvents.push({ type: 'message_done', text: finalMessage })
          if (finalForm?.fields?.length) {
            forwardedEvents.push({ type: 'form', form: finalForm })
          } else if (finalSuggestions.length) {
            forwardedEvents.push({ type: 'suggestion', items: finalSuggestions })
          }
        } else {
          forwardedEvents.push(parsed)
        }

        if (parsed.type === 'memory_updated' && parsed.memory) {
          finalMemory = normalizeStructuredMemory(parsed.memory)
        }
        if (parsed.type === 'usage') {
          finalUsage = normalizeUsage(parsed)
        }
        if (parsed.type === 'numeric_state_updated' && parsed.state) {
          finalNumericState = parsed.state
        }
        if (parsed.type === 'story_outline_completed') {
          finalStoryOutline =
            typeof parsed.story_outline === 'string'
              ? parsed.story_outline
              : typeof parsed.storyOutline === 'string'
                ? parsed.storyOutline
                : finalStoryOutline
        }
        if (parsed.type === 'response_completed') {
          finalizeStructuredAssistantOutput(String(parsed.message || ''))
          receivedResponseCompleted = true
          finalThreadId = String(parsed.threadId || finalThreadId)
          finalNumericState =
            typeof parsed.numeric_state === 'object' && parsed.numeric_state !== null
              ? parsed.numeric_state
              : typeof parsed.numericState === 'object' && parsed.numericState !== null
                ? parsed.numericState
                : finalNumericState
        }
        if (parsed.type === 'run_completed') {
          finalizeStructuredAssistantOutput(String(parsed.message || ''))
          receivedRunCompleted = true
          finalThreadId = String(parsed.threadId || finalThreadId)
          finalMemory = normalizeStructuredMemory(parsed.memory || finalMemory)
          finalNumericState =
            typeof parsed.numeric_state === 'object' && parsed.numeric_state !== null
              ? parsed.numeric_state
              : typeof parsed.numericState === 'object' && parsed.numericState !== null
                ? parsed.numericState
                : finalNumericState
          finalUsage = normalizeUsage(parsed.usage || finalUsage)
          finalStoryOutline =
            typeof parsed.story_outline === 'string'
              ? parsed.story_outline
              : typeof parsed.storyOutline === 'string'
                ? parsed.storyOutline
                : finalStoryOutline
          finalWorldGraphWritebackOps =
            parsed.world_graph_writeback_ops && typeof parsed.world_graph_writeback_ops === 'object'
              ? parsed.world_graph_writeback_ops
              : parsed.worldGraphWritebackOps && typeof parsed.worldGraphWritebackOps === 'object'
                ? parsed.worldGraphWritebackOps
                : finalWorldGraphWritebackOps
        }

        for (const event of forwardedEvents) {
          await onEvent?.(event)
        }
      }
    }
  } catch (error) {
    throw new Error(formatChatErrorMessage(payload, session, error))
  }

  if (!receivedRunCompleted) {
    throw new Error(formatChatErrorMessage(payload, session, new Error('连接中断')))
  }

  if (hasWorldGraphWritebackOps(finalWorldGraphWritebackOps)) {
    try {
      await onEvent?.({ type: 'world_graph_started' })
      const writebackResult = applyWorldGraphWritebackToSnapshot(finalWorldGraph, finalWorldGraphWritebackOps)
      finalWorldGraph = writebackResult.graph
      await onEvent?.({
        type: 'world_graph_updated',
        ...writebackResult,
        graph: finalWorldGraph,
      })
    } catch (error) {
      console.error('[world-graph-writeback:apply-failed]', {
        sessionId: payload.sessionId,
        robotId: resolveSessionRobotId(payload, session),
        threadId: finalThreadId,
        message: error instanceof Error ? error.message : '世界图谱写回失败',
        ops: finalWorldGraphWritebackOps,
      })
      await onEvent?.({
        type: 'world_graph_update_failed',
        message: error instanceof Error ? error.message : '世界图谱写回失败',
      })
    }
  }

  let savedSession
  try {
    savedSession = await commitSession(payload, user, {
      threadId: finalThreadId,
      message: finalMessage,
      suggestions: finalSuggestions,
      form: finalForm,
      numericState: finalNumericState,
      storyOutline: finalStoryOutline,
      memory: finalMemory,
      usage: finalUsage,
      worldGraph: finalWorldGraph,
    }, session)
  } catch (error) {
    throw new Error(formatChatErrorMessage(payload, session, error))
  }

  return {
    message: finalMessage,
    suggestions: finalSuggestions,
    form: finalForm,
    numericState: finalNumericState,
    memory: finalMemory,
    storyOutline: finalStoryOutline,
    usage: finalUsage,
    responseCompleted: receivedResponseCompleted,
    session: savedSession || normalizeSession({
      ...(session || payload.sessionSnapshot || {}),
      id: payload.sessionId,
      persistToServer: false,
      preview: finalMessage,
      updatedAt: new Date().toISOString(),
      threadId: finalThreadId,
      storyOutline: finalStoryOutline,
      structuredMemory: finalMemory,
      numericState: finalNumericState,
      worldGraph: finalWorldGraph,
      usage: finalUsage,
    }),
  }
}

export async function requestNonStreamChat(payload, user) {
  const result = await runAgentAndCollect(payload, user)
  return {
    message: result.message,
    reasoning: '',
    suggestions: result.suggestions,
    form: result.form,
    session: result.session,
    memory: result.memory,
  }
}

function forwardAgentEvent(res, payload) {
  for (const event of mapAgentEventToChatEvents(payload)) {
    sendSSE(res, event)
  }
}

export function mapAgentEventToChatEvents(payload) {
  if (payload.type === 'error') {
    return [{
      type: 'error',
      message: typeof payload.message === 'string' && payload.message.trim() ? payload.message.trim() : '聊天失败',
    }]
  }

  if (payload.type === 'message_delta' && payload.text) {
    return [{ type: 'text', text: payload.text }]
  }

  if (payload.type === 'message_done') {
    return []
  }

  if (payload.type === 'response_completed') {
    return []
  }

  if (payload.type === 'story_outline_started') {
    return [{ type: 'ui_loading', message: '正在生成故事梗概' }]
  }

  if (payload.type === 'story_outline_completed') {
    return [{
      type: 'story_outline',
      storyOutline:
        typeof payload.story_outline === 'string'
          ? payload.story_outline
          : typeof payload.storyOutline === 'string'
            ? payload.storyOutline
            : '',
    }]
  }

  if (payload.type === 'suggestion') {
    return [{
      type: 'suggestion',
      items: normalizeSuggestionItems(payload.items),
    }]
  }

  if (payload.type === 'form') {
    return [{
      type: 'form',
      form: normalizeFormSchema(payload.form),
    }]
  }

  if (payload.type === 'memory_started') {
    return [{
      type: 'memory_status',
      status: 'running',
      message: '正在整理结构化记忆',
    }]
  }

  if (payload.type === 'memory_updated' && payload.memory) {
    return [
      { type: 'structured_memory', memory: payload.memory },
      {
        type: 'memory_status',
        status: 'running',
        message: '正在保存会话到数据库',
      },
    ]
  }

  if (payload.type === 'numeric_state_updated') {
    return [{
      type: 'numeric_state_updated',
      state: payload.state,
      summary: payload.summary || '',
    }]
  }

  if (payload.type === 'world_graph_writeback_started') {
    return [{ type: 'ui_loading', message: '正在写回世界图谱' }]
  }

  if (payload.type === 'world_graph_updated' && payload.graph) {
    return [{
      type: 'session_world_graph',
      graph: payload.graph,
      warnings: Array.isArray(payload.warnings) ? payload.warnings : [],
    }]
  }

  if (payload.type === 'usage') {
    return [{
      type: 'usage',
      promptTokens: payload.prompt_tokens ?? payload.promptTokens ?? payload.input_tokens ?? 0,
      completionTokens: payload.completion_tokens ?? payload.completionTokens ?? payload.output_tokens ?? 0,
    }]
  }

  return []
}

export async function handleChatStream(payload, res, user) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  try {
    if (!payload.prompt || !payload.model) {
      throw new Error('prompt 和 model 不能为空')
    }

    const result = await runAgentAndCollect(payload, user, async (event) => {
      forwardAgentEvent(res, event)
    })

    sendUsageSSE(res, result.session)
    sendSSE(res, {
      type: 'structured_memory',
      memory: result.memory,
    })
    sendSSE(res, {
      type: 'numeric_state_updated',
      state: result.numericState,
    })
    sendSSE(res, {
      type: 'session_world_graph',
      graph: result.session.worldGraph || null,
    })
    sendSSE(res, { type: 'background_done' })
    sendSSE(res, { type: 'done' })
  } catch (error) {
    sendSSE(res, {
      type: 'error',
      message: error instanceof Error ? error.message : '流式请求失败',
    })
  } finally {
    res.end()
  }
}

export async function fetchModels(config) {
  const normalized = normalizeModelConfig(config, 0)
  const isOllama = normalized.provider === 'ollama'
  const baseUrl = isOllama ? getOllamaApiBaseUrl(normalized.baseUrl) : getOpenAIBaseUrl(normalized.baseUrl)

  try {
    const response = await fetch(isOllama ? `${baseUrl}/api/tags` : `${baseUrl}/v1/models`, {
      headers: buildHeaders(normalized),
    })
    if (!response.ok) {
      throw new Error((await response.text()) || `${isOllama ? 'Ollama' : 'OpenAI-compatible'} 模型列表获取失败`)
    }

    const data = await response.json()
    const modelItems = isOllama ? (data.models || []) : (data.data || [])
    return modelItems
      .map((item) => {
        const id = String(item?.name || item?.model || item?.id || '').trim()
        return {
          id,
          label: id,
        }
      })
      .filter((item) => item.id)
      .sort((left, right) => left.label.localeCompare(right.label))
  } catch (error) {
    throw new Error(describeFetchError(error, baseUrl, '获取模型列表'))
  }
}

export async function testConnectionModels(body) {
  const config = normalizeModelConfig(body, 0)
  const models = await fetchModels(config)
  return {
    success: true,
    models,
    message: `连接成功，获取到 ${models.length} 个模型`,
  }
}

export async function getActiveLegacyConfig(user) {
  const legacy = await readModelConfigs(user)
  return { config: legacy.configs.find((item) => item.id === legacy.activeModelConfigId) ?? legacy.configs[0] }
}
