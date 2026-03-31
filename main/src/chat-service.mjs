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
  getUnstreamedStructuredTextSuffix,
  normalizeFormSchema,
  normalizeSuggestionItems,
  reconcileAssistantStructuredOutput,
} from './structured.mjs'
import { enqueueBackgroundJob } from './background-job-queue.mjs'
import { retrieveRobotKnowledgeBySummary } from './robot-generation-service.mjs'
import {
  applyWorldGraphWritebackOps,
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

function addUsageTotals(left, right) {
  const normalizedLeft = normalizeSessionUsage(left)
  const normalizedRight = normalizeUsage(right)
  return {
    promptTokens: normalizedLeft.promptTokens + normalizedRight.promptTokens,
    completionTokens: normalizedLeft.completionTokens + normalizedRight.completionTokens,
  }
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

function countUserTurns(history) {
  return (Array.isArray(history) ? history : []).filter((item) => item?.role === 'user').length
}

function countStructuredMemoryItems(memory) {
  return (Array.isArray(memory?.categories) ? memory.categories : [])
    .reduce((count, category) => count + (Array.isArray(category?.items) ? category.items.length : 0), 0)
}

function summarizeWorldGraphWritebackOps(value) {
  const payload = value && typeof value === 'object' ? value : {}
  const count = (item) => (Array.isArray(item) ? item.length : 0)
  return {
    upsertNodeCount: count(payload.upsert_nodes || payload.upsertNodes),
    upsertEdgeCount: count(payload.upsert_edges || payload.upsertEdges),
    upsertEventCount: count(payload.upsert_events || payload.upsertEvents),
    appendNodeSnapshotCount: count(payload.append_node_snapshots || payload.appendNodeSnapshots),
    appendEdgeSnapshotCount: count(payload.append_edge_snapshots || payload.appendEdgeSnapshots),
    appendEventEffectCount: count(payload.append_event_effects || payload.appendEventEffects),
  }
}

function normalizeSequenceIndex(value, fallback = 0) {
  const candidate = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(candidate) ? Math.max(0, Math.round(candidate)) : fallback
}

function readEventSequenceIndex(event) {
  return normalizeSequenceIndex(
    event?.timeline?.sequenceIndex ?? event?.timeline?.sequence_index ?? event?.startSequenceIndex ?? event?.start_sequence_index,
    0,
  )
}

function summarizeWorldGraphEventTimeline(events) {
  return (Array.isArray(events) ? events : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id || '').trim(),
      name: String(item.name || '').trim(),
      sequenceIndex: readEventSequenceIndex(item),
    }))
    .sort((left, right) =>
      left.sequenceIndex - right.sequenceIndex
      || left.name.localeCompare(right.name, 'zh-CN')
      || left.id.localeCompare(right.id, 'zh-CN'),
    )
}

function summarizeGraphTimeline(graph) {
  return summarizeWorldGraphEventTimeline(
    (Array.isArray(graph?.nodes) ? graph.nodes : []).filter((item) => item?.objectType === 'event'),
  )
}

function backgroundLog(label, payload, level = 'info') {
  const logger = typeof console[level] === 'function' ? console[level] : console.info
  logger(label, payload)
}

function buildKnowledgeContextText(result) {
  const items = Array.isArray(result?.items) ? result.items : []
  if (!items.length) {
    return ''
  }

  return [
    '以下是从当前智能体知识库中按“对话摘要”检索得到的内部参考信息，仅在与当前问题相关时使用，不要机械照抄：',
    ...items.map((item, index) => [
      `知识片段 ${index + 1}（来源：${String(item.sourceName || '未命名文档').trim() || '未命名文档'}，相关度：${Number(item.score || 0).toFixed(3)}）`,
      `摘要：${String(item.summary || '').trim() || '无'}`,
      `摘录：${String(item.excerpt || '').trim() || '无'}`,
    ].join('\n')),
  ].join('\n\n')
}

async function maybeResolveKnowledgeContext(user, payload, session, robot) {
  const robotId = String(robot?.id || '').trim()
  if (!robotId) {
    return ''
  }

  try {
    const retrieval = await retrieveRobotKnowledgeBySummary(user, {
      robotId,
      modelConfigId: payload.modelConfigId,
      knowledgeRetrievalModelConfigId: robot?.knowledgeRetrievalModelConfigId || '',
      robotName: robot?.name,
      robotDescription: robot?.description || '',
      storyOutline: session?.storyOutline || payload.sessionSnapshot?.storyOutline || '',
      prompt: String(payload.prompt || ''),
      history: (session?.messages || []).map((item) => ({
        role: item.role,
        content: item.content,
      })),
    })
    return buildKnowledgeContextText(retrieval)
  } catch (error) {
    backgroundLog('[knowledge-retrieval:failed]', {
      sessionId: payload.sessionId,
      robotId,
      message: error instanceof Error ? error.message : '知识检索失败',
    }, 'error')
    return ''
  }
}

function buildStructuredMemoryTriggerMeta(agentRequest) {
  const history = Array.isArray(agentRequest?.history) ? agentRequest.history : []
  const existingUserTurnCount = countUserTurns(history)
  const interval = normalizePositiveInteger(
    agentRequest?.structured_memory_interval ?? agentRequest?.structuredMemoryInterval,
    3,
  )
  const nextUserTurnIndex = existingUserTurnCount + 1
  return {
    interval,
    existingUserTurnCount,
    nextUserTurnIndex,
    triggered: nextUserTurnIndex % interval === 0,
    historyLength: history.length,
    schemaCategoryCount: Array.isArray(agentRequest?.memory_schema?.categories)
      ? agentRequest.memory_schema.categories.length
      : 0,
    structuredMemoryItemCount: countStructuredMemoryItems(agentRequest?.structured_memory || agentRequest?.structuredMemory),
  }
}

function getBackgroundWorldGraphRobotId(agentRequest) {
  return String(agentRequest?.world_graph?.meta?.robotId || agentRequest?.worldGraph?.meta?.robotId || '').trim()
}

function buildWorldGraphTriggerMeta(agentRequest) {
  const graph = agentRequest?.world_graph || agentRequest?.worldGraph || {}
  return {
    robotId: getBackgroundWorldGraphRobotId(agentRequest),
    graphVersion: Number(graph?.meta?.graphVersion || 0),
    nodeCount: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph?.edges) ? graph.edges.length : 0,
    relationTypeCount: Array.isArray(graph?.relationTypes) ? graph.relationTypes.length : 0,
    eventTimeline: summarizeGraphTimeline(graph),
  }
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
  const knowledgeContextText = await maybeResolveKnowledgeContext(user, payload, session, {
    ...robot,
    description: payload?.robot?.description || payload?.sessionSnapshot?.robot?.description || '',
  })
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
    system_prompt: [payload.systemPrompt || robot?.systemPrompt || '', knowledgeContextText].filter(Boolean).join('\n\n'),
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
    await getSessionRecord(user, payload.sessionId)
    || normalizeSession(payload.sessionSnapshot || {
      id: payload.sessionId,
      persistToServer: true,
      messages: [],
      memory: {
        ...DEFAULT_SESSION_MEMORY,
        persistToServer: true,
      },
      structuredMemory: {},
    })
  const endpoint = `${getAgentServiceUrl()}/runs/stream`
  const agentRequest = await buildAgentRequest(payload, user, session)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentRequest),
    })

    if (!response.ok) {
      throw new Error((await response.text()) || 'Agent 请求失败')
    }

    return { response, session, agentRequest }
  } catch (error) {
    throw new Error(formatChatErrorMessage(payload, session, new Error(describeFetchError(error, endpoint, '请求失败'))))
  }
}

async function requestAgentJson(endpointPath, requestBody, payload, session, actionLabel) {
  const endpoint = `${getAgentServiceUrl()}${endpointPath}`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      throw new Error((await response.text()) || `${actionLabel}失败`)
    }

    return await response.json()
  } catch (error) {
    throw new Error(formatChatErrorMessage(payload, session, new Error(describeFetchError(error, endpoint, actionLabel))))
  }
}

function buildBackgroundAgentRequest(agentRequest, result) {
  return {
    ...agentRequest,
    thread_id: String(result.threadId || agentRequest.thread_id || agentRequest.threadId || ''),
    session_id: String(agentRequest.session_id || agentRequest.sessionId || ''),
    final_response: String(result.message || ''),
    numeric_state:
      typeof result.numericState === 'object' && result.numericState !== null
        ? result.numericState
        : agentRequest.numeric_state || agentRequest.numericState || {},
    story_outline: String(result.storyOutline || agentRequest.story_outline || agentRequest.storyOutline || ''),
  }
}

async function patchSessionStructuredMemory(user, sessionId, memory, usage) {
  const existingSession = await getSessionRecord(user, sessionId)
  if (!existingSession) {
    return null
  }

  return saveSessionRecord(user, normalizeSession({
    ...existingSession,
    structuredMemory: normalizeStructuredMemory(memory || existingSession.structuredMemory),
    usage: addUsageTotals(existingSession.usage, usage),
  }))
}

async function patchSessionWorldGraph(user, sessionId, graph, usage) {
  const existingSession = await getSessionRecord(user, sessionId)
  if (!existingSession) {
    return null
  }

  return saveSessionRecord(user, normalizeSession({
    ...existingSession,
    worldGraph: graph
      ? normalizeWorldGraphSnapshot(graph)
      : existingSession.worldGraph || null,
    usage: addUsageTotals(existingSession.usage, usage),
  }))
}

async function commitSession(payload, user, result, existingSession) {
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
  const { response, session, agentRequest } = await requestAgentRun(payload, user)
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
  const finalWorldGraph = await loadWorldGraphPayload(user, payload, session)
  const structuredStreamState = createStructuredStreamParser()
  let structuredStreamClosed = false
  let receivedResponseCompleted = false
  let receivedRunCompleted = false
  let streamedVisibleMessage = ''

  function finalizeStructuredAssistantOutput(rawMessage = '') {
    if (structuredStreamClosed) {
      return ''
    }

    const finalized = String(rawMessage || '').trim()
      ? extractStructuredPayloadsFromText(rawMessage)
      : finalizeStructuredStream(structuredStreamState)
    const reconciled = reconcileAssistantStructuredOutput(finalized.text, finalized.suggestions, finalized.form)
    const missingVisibleText = getUnstreamedStructuredTextSuffix(streamedVisibleMessage, reconciled.text)
    structuredStreamClosed = true
    finalMessage = reconciled.text
    finalSuggestions = normalizeSuggestionItems(reconciled.suggestions)
    finalForm = normalizeFormSchema(reconciled.form)
    return missingVisibleText
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
            streamedVisibleMessage += String(visibleText)
            finalMessage += String(visibleText)
            forwardedEvents.push({ type: 'message_delta', text: visibleText })
          }
        } else if (parsed.type === 'message_done') {
          const missingVisibleText = finalizeStructuredAssistantOutput(String(parsed.text || ''))
          if (missingVisibleText) {
            streamedVisibleMessage += missingVisibleText
            forwardedEvents.push({ type: 'message_delta', text: missingVisibleText })
          }
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
          const missingVisibleText = finalizeStructuredAssistantOutput(String(parsed.message || ''))
          if (missingVisibleText) {
            streamedVisibleMessage += missingVisibleText
            forwardedEvents.unshift({ type: 'message_delta', text: missingVisibleText })
          }
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
          const missingVisibleText = finalizeStructuredAssistantOutput(String(parsed.message || ''))
          if (missingVisibleText) {
            streamedVisibleMessage += missingVisibleText
            forwardedEvents.unshift({ type: 'message_delta', text: missingVisibleText })
          }
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
    agentRequest: buildBackgroundAgentRequest(agentRequest, {
      threadId: finalThreadId,
      message: finalMessage,
      numericState: finalNumericState,
      storyOutline: finalStoryOutline,
    }),
    session: savedSession || normalizeSession({
      ...(session || payload.sessionSnapshot || {}),
      id: payload.sessionId,
      persistToServer: true,
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

async function runStructuredMemoryBackgroundJob(agentRequest, payload, user) {
  const response = await requestAgentJson('/runs/memory', agentRequest, payload, null, '结构化记忆后台任务')
  const normalizedMemory = normalizeStructuredMemory(response?.memory)
  const updatedSession = await patchSessionStructuredMemory(user, payload.sessionId, normalizedMemory, response?.usage)

  return {
    memory: normalizedMemory,
    usage: normalizeUsage(response?.usage),
    session: updatedSession,
  }
}

async function runWorldGraphBackgroundJob(agentRequest, payload, user) {
  const response = await requestAgentJson(
    '/runs/world-graph-writeback',
    agentRequest,
    payload,
    null,
    '世界图谱后台任务',
  )
  const writebackOps = response?.world_graph_writeback_ops || response?.worldGraphWritebackOps || {}
  const writebackSummary = summarizeWorldGraphWritebackOps(writebackOps)
  const writebackEvents = summarizeWorldGraphEventTimeline(writebackOps.upsert_events || writebackOps.upsertEvents)
  const robotId = getBackgroundWorldGraphRobotId(agentRequest)
  let nextGraph = normalizeWorldGraphSnapshot(agentRequest.world_graph || agentRequest.worldGraph || null)
  let warnings = []
  let persistenceMode = 'session-snapshot'
  let applySummary = {
    appliedNodeCount: 0,
    appliedEdgeCount: 0,
    appliedEffectCount: 0,
    appliedSnapshotCount: 0,
  }

  if (hasWorldGraphWritebackOps(writebackOps)) {
    if (robotId) {
      try {
        const persistedResult = await applyWorldGraphWritebackOps(user, robotId, writebackOps)
        nextGraph = cloneWorldGraphSnapshot(await getWorldGraph(user, robotId))
        warnings = Array.isArray(persistedResult?.warnings) ? persistedResult.warnings : []
        applySummary = {
          appliedNodeCount: Number(persistedResult?.appliedNodeCount || 0),
          appliedEdgeCount: Number(persistedResult?.appliedEdgeCount || 0),
          appliedEffectCount: Number(persistedResult?.appliedEffectCount || 0),
          appliedSnapshotCount: Number(persistedResult?.appliedSnapshotCount || 0),
        }
        persistenceMode = 'robot-graph'
      } catch (error) {
        backgroundLog('[background-world-graph:persist-failed]', {
          sessionId: payload.sessionId,
          threadId: agentRequest.thread_id || agentRequest.threadId,
          robotId,
          writebackSummary,
          writebackEvents,
          message: error instanceof Error ? error.message : '世界图谱持久化失败',
        }, 'error')
        const persistedSession = await getSessionRecord(user, payload.sessionId)
        const latestGraph = persistedSession?.worldGraph || nextGraph
        const writebackResult = applyWorldGraphWritebackToSnapshot(latestGraph, writebackOps)
        nextGraph = writebackResult.graph
        warnings = [
          ...(Array.isArray(writebackResult.warnings) ? writebackResult.warnings : []),
          '真实世界图谱持久化失败，已回退为仅更新当前会话快照',
        ]
        applySummary = {
          appliedNodeCount: Number(writebackResult.appliedNodeCount || 0),
          appliedEdgeCount: Number(writebackResult.appliedEdgeCount || 0),
          appliedEffectCount: Number(writebackResult.appliedEffectCount || 0),
          appliedSnapshotCount: Number(writebackResult.appliedSnapshotCount || 0),
        }
        persistenceMode = 'session-snapshot-fallback'
      }
    } else {
      const persistedSession = await getSessionRecord(user, payload.sessionId)
      const latestGraph = persistedSession?.worldGraph || nextGraph
      const writebackResult = applyWorldGraphWritebackToSnapshot(latestGraph, writebackOps)
      nextGraph = writebackResult.graph
      warnings = Array.isArray(writebackResult.warnings) ? writebackResult.warnings : []
      applySummary = {
        appliedNodeCount: Number(writebackResult.appliedNodeCount || 0),
        appliedEdgeCount: Number(writebackResult.appliedEdgeCount || 0),
        appliedEffectCount: Number(writebackResult.appliedEffectCount || 0),
        appliedSnapshotCount: Number(writebackResult.appliedSnapshotCount || 0),
      }
    }
  }

  const updatedSession = await patchSessionWorldGraph(user, payload.sessionId, nextGraph, response?.usage)

  return {
    graph: nextGraph,
    usage: normalizeUsage(response?.usage),
    session: updatedSession,
    warnings,
    persistenceMode,
    writebackSummary,
    writebackEvents,
    resultTimeline: summarizeGraphTimeline(nextGraph),
    ...applySummary,
  }
}

function createBackgroundJobs(result, payload, user, onEvent) {
  const jobs = []
  const agentRequest = result.agentRequest
  const structuredMemoryTriggerMeta = buildStructuredMemoryTriggerMeta(agentRequest)

  if (structuredMemoryTriggerMeta.triggered) {
    jobs.push(
      enqueueBackgroundJob({
        sessionKey: payload.sessionId,
        run: async () => {
          try {
            backgroundLog('[background-memory:started]', {
              sessionId: payload.sessionId,
              threadId: agentRequest.thread_id || agentRequest.threadId,
              persistToServer: true,
              ...structuredMemoryTriggerMeta,
            })
            const memoryResult = await runStructuredMemoryBackgroundJob(agentRequest, payload, user)
            backgroundLog('[background-memory:succeeded]', {
              sessionId: payload.sessionId,
              threadId: agentRequest.thread_id || agentRequest.threadId,
              persistToServer: true,
              categoryCount: Array.isArray(memoryResult.memory?.categories) ? memoryResult.memory.categories.length : 0,
              recordCount: countStructuredMemoryItems(memoryResult.memory),
              usage: memoryResult.usage,
            })
            await onEvent?.({
              type: 'structured_memory',
              memory: memoryResult.memory,
            })
            if (memoryResult.session) {
              await onEvent?.({
                type: 'usage',
                promptTokens: memoryResult.session.usage?.promptTokens || 0,
                completionTokens: memoryResult.session.usage?.completionTokens || 0,
              })
            }
            return memoryResult
          } catch (error) {
            console.error('[background-memory:failed]', {
              sessionId: payload.sessionId,
              threadId: agentRequest.thread_id || agentRequest.threadId,
              message: error instanceof Error ? error.message : '结构化记忆后台任务失败',
            })
            return null
          }
        },
      }),
    )
  } else {
    backgroundLog('[background-memory:skipped]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      persistToServer: true,
      reason: 'interval_not_reached',
      ...structuredMemoryTriggerMeta,
    })
  }

  const worldGraphTriggerMeta = buildWorldGraphTriggerMeta(agentRequest)

  if (worldGraphTriggerMeta.robotId) {
    jobs.push(
      enqueueBackgroundJob({
        sessionKey: payload.sessionId,
        run: async () => {
          try {
            backgroundLog('[background-world-graph:started]', {
              sessionId: payload.sessionId,
              threadId: agentRequest.thread_id || agentRequest.threadId,
              persistToServer: true,
              ...worldGraphTriggerMeta,
            })
            const worldGraphResult = await runWorldGraphBackgroundJob(agentRequest, payload, user)
            backgroundLog('[background-world-graph:succeeded]', {
              sessionId: payload.sessionId,
              threadId: agentRequest.thread_id || agentRequest.threadId,
              persistToServer: true,
              robotId: worldGraphTriggerMeta.robotId,
              persistenceMode: worldGraphResult.persistenceMode,
              writebackSummary: worldGraphResult.writebackSummary,
              writebackEvents: worldGraphResult.writebackEvents,
              resultTimeline: worldGraphResult.resultTimeline,
              appliedNodeCount: worldGraphResult.appliedNodeCount,
              appliedEdgeCount: worldGraphResult.appliedEdgeCount,
              appliedEffectCount: worldGraphResult.appliedEffectCount,
              appliedSnapshotCount: worldGraphResult.appliedSnapshotCount,
              warningCount: Array.isArray(worldGraphResult.warnings) ? worldGraphResult.warnings.length : 0,
              usage: worldGraphResult.usage,
            })
            await onEvent?.({
              type: 'session_world_graph',
              graph: worldGraphResult.graph,
              warnings: worldGraphResult.warnings,
            })
            if (worldGraphResult.session) {
              await onEvent?.({
                type: 'usage',
                promptTokens: worldGraphResult.session.usage?.promptTokens || 0,
                completionTokens: worldGraphResult.session.usage?.completionTokens || 0,
              })
            }
            return worldGraphResult
          } catch (error) {
            console.error('[background-world-graph:failed]', {
              sessionId: payload.sessionId,
              threadId: agentRequest.thread_id || agentRequest.threadId,
              message: error instanceof Error ? error.message : '世界图谱后台任务失败',
            })
            return null
          }
        },
      }),
    )
  } else {
    backgroundLog('[background-world-graph:skipped]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      persistToServer: true,
      reason: 'missing_robot_id',
      ...worldGraphTriggerMeta,
    })
  }

  return jobs
}

export async function requestNonStreamChat(payload, user) {
  const result = await runAgentAndCollect(payload, user)
  void Promise.allSettled(createBackgroundJobs(result, payload, user))
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
    sendSSE(res, { type: 'done' })
    await Promise.allSettled(createBackgroundJobs(result, payload, user, async (event) => {
      sendSSE(res, event)
    }))
    sendSSE(res, { type: 'background_done' })
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
