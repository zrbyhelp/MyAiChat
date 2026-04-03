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
  appendAgentMonitorStep,
  beginAgentMonitorReply,
  completeAgentMonitorReply,
  failAgentMonitorReply,
} from './agent-monitor.mjs'
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
import {
  buildGraphRagArtifactId,
  mapGraphRagWritebackToWorldGraphUpdate,
  mergeGraphRagRelationTypesIntoWorldGraph,
  retrieveRobotKnowledgeByGraphRag,
  retrieveRobotKnowledgeBySummary,
} from './robot-generation-service.mjs'
import { createGraphRagArtifact } from './robot-generation-store.mjs'
import {
  applyWorldGraphWritebackToSnapshot,
  cloneWorldGraphSnapshot,
  createEmptyWorldGraphSnapshot,
  getWorldGraph,
  normalizeWorldGraphSnapshot,
} from './world-graph-service.mjs'
import { enqueueBackgroundJob } from './background-job-queue.mjs'

const DEFAULT_AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000'
const SESSION_BACKGROUND_STATUS_TTL_MS = 5000
const SESSION_BACKGROUND_TASK_KIND_MEMORY = 'memory'
const SESSION_BACKGROUND_TASK_KIND_WORLD_GRAPH = 'graph_writeback'
const sessionBackgroundStateMap = new Map()

function createSessionBackgroundState(sessionId = '') {
  return {
    sessionId: String(sessionId || '').trim(),
    status: 'idle',
    pendingTaskCount: 0,
    currentTask: '',
    lastError: '',
    updatedAt: new Date().toISOString(),
  }
}

function cloneSessionBackgroundState(state) {
  const source = state && typeof state === 'object' ? state : createSessionBackgroundState()
  return {
    sessionId: String(source.sessionId || '').trim(),
    status: ['queued', 'memory_processing', 'graph_writeback_processing', 'completed', 'failed', 'idle']
      .includes(String(source.status || ''))
      ? String(source.status)
      : 'idle',
    pendingTaskCount: Number.isFinite(Number(source.pendingTaskCount))
      ? Math.max(0, Math.round(Number(source.pendingTaskCount)))
      : 0,
    currentTask: [SESSION_BACKGROUND_TASK_KIND_MEMORY, SESSION_BACKGROUND_TASK_KIND_WORLD_GRAPH].includes(String(source.currentTask || ''))
      ? String(source.currentTask)
      : '',
    lastError: String(source.lastError || ''),
    updatedAt: String(source.updatedAt || new Date().toISOString()),
  }
}

function updateSessionBackgroundState(sessionId, updater) {
  const key = String(sessionId || '').trim()
  if (!key) {
    return createSessionBackgroundState()
  }

  const current = cloneSessionBackgroundState(sessionBackgroundStateMap.get(key) || createSessionBackgroundState(key))
  const nextValue = typeof updater === 'function' ? updater(current) : updater
  const next = cloneSessionBackgroundState({ ...current, ...(nextValue || {}), sessionId: key, updatedAt: new Date().toISOString() })
  sessionBackgroundStateMap.set(key, next)
  return next
}

function incrementSessionBackgroundPendingTasks(sessionId, count) {
  return updateSessionBackgroundState(sessionId, (current) => {
    const nextPendingTaskCount = current.pendingTaskCount + Math.max(0, Math.round(Number(count) || 0))
    if (!nextPendingTaskCount) {
      return current
    }
    return {
      pendingTaskCount: nextPendingTaskCount,
      status: current.currentTask ? current.status : 'queued',
      lastError: '',
    }
  })
}

function markSessionBackgroundTaskStarted(sessionId, taskKind) {
  const nextStatus = taskKind === SESSION_BACKGROUND_TASK_KIND_MEMORY
    ? 'memory_processing'
    : 'graph_writeback_processing'
  return updateSessionBackgroundState(sessionId, {
    status: nextStatus,
    currentTask: taskKind,
    lastError: '',
  })
}

function completeSessionBackgroundTask(sessionId) {
  return updateSessionBackgroundState(sessionId, (current) => {
    const nextPendingTaskCount = Math.max(0, current.pendingTaskCount - 1)
    return {
      pendingTaskCount: nextPendingTaskCount,
      currentTask: '',
      status: nextPendingTaskCount > 0 ? 'queued' : 'completed',
    }
  })
}

function failSessionBackgroundPipeline(sessionId, error, taskCountToDrop) {
  const normalizedTaskCount = Math.max(1, Math.round(Number(taskCountToDrop) || 1))
  return updateSessionBackgroundState(sessionId, (current) => ({
    pendingTaskCount: Math.max(0, current.pendingTaskCount - normalizedTaskCount),
    status: 'failed',
    currentTask: '',
    lastError: error instanceof Error ? error.message : String(error || '会话异步处理失败'),
  }))
}

function shouldExpireCompletedBackgroundStatus(state) {
  if (state.status !== 'completed' || state.pendingTaskCount > 0) {
    return false
  }

  const updatedAtMs = Date.parse(String(state.updatedAt || ''))
  if (!Number.isFinite(updatedAtMs)) {
    return true
  }

  return Date.now() - updatedAtMs >= SESSION_BACKGROUND_STATUS_TTL_MS
}

export function getSessionBackgroundStatus(sessionId) {
  const key = String(sessionId || '').trim()
  if (!key) {
    return createSessionBackgroundState()
  }

  const current = cloneSessionBackgroundState(sessionBackgroundStateMap.get(key) || createSessionBackgroundState(key))
  if (shouldExpireCompletedBackgroundStatus(current)) {
    const idleState = updateSessionBackgroundState(key, {
      status: 'idle',
      pendingTaskCount: 0,
      currentTask: '',
      lastError: '',
    })
    return cloneSessionBackgroundState(idleState)
  }

  return current
}

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

export function extractAgentServiceErrorMessage(rawText) {
  try {
    const parsed = JSON.parse(String(rawText || ''))
    const message = String(parsed?.detail || parsed?.message || '').trim()
    return message || ''
  } catch {
    return ''
  }
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

function hasSchemaCategories(schema) {
  return Array.isArray(schema?.categories) && schema.categories.length > 0
}

export function resolveEffectiveMemorySchema(existingSchema, requestedSchema) {
  const normalizedExisting = hasSchemaCategories(existingSchema) ? normalizeMemorySchema(existingSchema) : null
  const normalizedRequested = hasSchemaCategories(requestedSchema) ? normalizeMemorySchema(requestedSchema) : null

  if (!normalizedExisting) {
    return normalizedRequested || normalizeMemorySchema(existingSchema || requestedSchema)
  }
  if (!normalizedRequested) {
    return normalizedExisting
  }
  if (JSON.stringify(normalizedExisting) !== JSON.stringify(normalizedRequested)) {
    return normalizedRequested
  }
  return normalizedExisting
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
  if (level !== 'error') {
    return
  }
  const logger = typeof console[level] === 'function' ? console[level] : console.error
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

function buildGraphRagKnowledgeContextText(result) {
  const summary = String(result?.summary || '').trim()
  const communities = Array.isArray(result?.communities) ? result.communities : []
  const entities = Array.isArray(result?.entities) ? result.entities : []
  const events = Array.isArray(result?.events) ? result.events : []
  const chunks = Array.isArray(result?.chunks) ? result.chunks : []
  if (!summary && !communities.length && !entities.length && !events.length && !chunks.length) {
    return ''
  }

  return [
    '以下是基于 GraphRAG 从当前智能体知识图中召回的内部参考信息，仅在与当前问题相关时使用，不要机械照抄：',
    summary ? `知识焦点：${summary}` : '',
    communities.length
      ? [
        '相关社区：',
        ...communities.slice(0, 4).map((item, index) =>
          `${index + 1}. ${String(item?.name || item?.id || '未命名社区').trim()}（相关度：${Number(item?.score || 0).toFixed(3)}）\n${String(item?.summary || '').trim() || '无'}`),
      ].join('\n')
      : '',
    entities.length
      ? [
        '相关实体：',
        ...entities.slice(0, 8).map((item, index) =>
          `${index + 1}. ${String(item?.name || item?.id || '未命名实体').trim()} [${String(item?.type || '').trim() || 'unknown'}]${String(item?.summary || '').trim() ? `：${String(item.summary).trim()}` : ''}`),
      ].join('\n')
      : '',
    events.length
      ? [
        '相关事件：',
        ...events.slice(0, 6).map((item, index) => {
          const sequenceIndex = Number(item?.timeline?.sequenceIndex ?? item?.timeline?.sequence_index ?? 0) || 0
          return `${index + 1}. [${sequenceIndex}] ${String(item?.name || item?.id || '未命名事件').trim()}${String(item?.summary || '').trim() ? `：${String(item.summary).trim()}` : ''}`
        }),
      ].join('\n')
      : '',
    chunks.length
      ? chunks.slice(0, 6).map((item, index) => [
        `知识片段 ${index + 1}（来源：${String(item?.source_name || item?.sourceName || '未命名文档').trim() || '未命名文档'}#${Number(item?.segment_index ?? item?.segmentIndex ?? 0) || 0}，相关度：${Number(item?.score || 0).toFixed(3)}）`,
        `摘要：${String(item?.summary || '').trim() || '无'}`,
        `摘录：${String(item?.excerpt || '').trim() || '无'}`,
      ].join('\n')).join('\n\n')
      : '',
  ].filter(Boolean).join('\n\n')
}

async function persistGraphRagArtifact(user, input) {
  try {
    return await createGraphRagArtifact(user, input)
  } catch (error) {
    backgroundLog('[graphrag:artifact:failed]', {
      kind: input?.kind || '',
      robotId: input?.robotId || '',
      sessionId: input?.sessionId || '',
      message: error instanceof Error ? error.message : 'GraphRAG artifact 保存失败',
    }, 'warn')
    return null
  }
}

async function resolveGraphRagKnowledgeContext(user, payload, session, robot, monitorReplyId = '', retrievalBaseRequest = null) {
  const robotId = String(robot?.id || '').trim()
  if (!robotId) {
    return ''
  }
  if (!retrievalBaseRequest) {
    return ''
  }
  const retrievalQuery = String(retrievalBaseRequest.prompt || '').trim()
  const retrievalQuerySource = 'story_outline'

  try {
    const graphRagRetrieval = await retrieveRobotKnowledgeByGraphRag(user, {
      ...retrievalBaseRequest,
    })
    const graphRagContextText = buildGraphRagKnowledgeContextText(graphRagRetrieval)
    if (monitorReplyId) {
      appendAgentMonitorStep({
        replyId: monitorReplyId,
        stage: 'knowledge_graph_rag',
        eventType: 'knowledge_graph_rag',
        summary: graphRagContextText ? 'GraphRAG 检索命中' : 'GraphRAG 检索无结果',
        requestSnapshot: {
          mode: 'graphrag',
          retrievalQuerySource,
          retrievalQuery,
          originalPrompt: String(payload.prompt || ''),
          ...retrievalBaseRequest,
        },
        responseSnapshot: {
          mode: 'graphrag',
          retrieval: graphRagRetrieval,
          contextText: graphRagContextText,
        },
      })
    }
    if (graphRagContextText) {
      return graphRagContextText
    }
  } catch (error) {
    if (monitorReplyId) {
      appendAgentMonitorStep({
        replyId: monitorReplyId,
        stage: 'knowledge_graph_rag',
        eventType: 'knowledge_graph_rag',
        status: 'failed',
        summary: error instanceof Error ? error.message : 'GraphRAG 知识检索失败',
        requestSnapshot: {
          mode: 'graphrag',
          retrievalQuerySource,
          retrievalQuery,
          originalPrompt: String(payload.prompt || ''),
          ...retrievalBaseRequest,
        },
        responseSnapshot: {
          mode: 'graphrag',
          error: error instanceof Error ? error.message : 'GraphRAG 知识检索失败',
        },
      })
    }
    backgroundLog('[knowledge-retrieval:graphrag-failed]', {
      sessionId: payload.sessionId,
      robotId,
      message: error instanceof Error ? error.message : 'GraphRAG 知识检索失败',
    }, 'warn')
  }

  return ''
}

async function resolveVectorKnowledgeContext(user, payload, session, robot, monitorReplyId = '', retrievalBaseRequest = null) {
  const robotId = String(robot?.id || '').trim()
  if (!robotId) {
    return ''
  }
  if (!retrievalBaseRequest) {
    return ''
  }

  const retrievalQuery = String(retrievalBaseRequest.prompt || '').trim()
  const retrievalQuerySource = 'story_outline'

  try {
    const retrieval = await retrieveRobotKnowledgeBySummary(user, {
      ...retrievalBaseRequest,
    })
    const contextText = buildKnowledgeContextText(retrieval)
    if (monitorReplyId) {
      appendAgentMonitorStep({
        replyId: monitorReplyId,
        stage: 'knowledge_vector',
        eventType: 'knowledge_vector',
        summary: contextText ? '向量摘要检索命中' : '向量摘要检索无结果',
        requestSnapshot: {
          mode: 'summary',
          robotId,
          sessionId: payload.sessionId,
          retrievalQuerySource,
          retrievalQuery,
          originalPrompt: String(payload.prompt || ''),
          retrievalSummary: String(retrieval?.summary || ''),
          embeddingInput: String(retrieval?.summary || ''),
          prompt: retrievalQuery,
          history: retrievalBaseRequest.history,
          storyOutline: retrievalBaseRequest.storyOutline,
        },
        responseSnapshot: {
          mode: 'summary',
          retrieval,
          contextText,
        },
      })
    }
    return contextText
  } catch (error) {
    if (monitorReplyId) {
      appendAgentMonitorStep({
        replyId: monitorReplyId,
        stage: 'knowledge_vector',
        eventType: 'knowledge_vector',
        status: 'failed',
        summary: error instanceof Error ? error.message : '知识检索失败',
        requestSnapshot: {
          mode: 'summary',
          retrievalQuerySource,
          retrievalQuery,
          originalPrompt: String(payload.prompt || ''),
          ...retrievalBaseRequest,
        },
        responseSnapshot: {
          mode: 'summary',
          error: error instanceof Error ? error.message : '知识检索失败',
        },
      })
    }
    backgroundLog('[knowledge-retrieval:failed]', {
      sessionId: payload.sessionId,
      robotId,
      message: error instanceof Error ? error.message : '知识检索失败',
    }, 'error')
    return ''
  }
}

async function maybeResolveKnowledgeContext(user, payload, session, robot, monitorReplyId = '', storyOutlineInput = '') {
  const storyOutline = String(storyOutlineInput || '').trim()
  if (!storyOutline) {
    return ''
  }

  const resolvedHistory = (session?.messages || []).map((item) => ({
    role: item.role,
    content: item.content,
  }))

  const retrievalBaseRequest = {
    sessionId: payload.sessionId,
    robotId: String(robot?.id || '').trim(),
    robotName: robot?.name || '',
    robotDescription: robot?.description || '',
    modelConfigId: payload.modelConfigId,
    knowledgeRetrievalModelConfigId: robot?.knowledgeRetrievalModelConfigId || '',
    storyOutline,
    prompt: storyOutline,
    history: resolvedHistory,
  }

  const graphRagContextText = await resolveGraphRagKnowledgeContext(
    user,
    payload,
    session,
    robot,
    monitorReplyId,
    retrievalBaseRequest,
  )
  const vectorContextText = await resolveVectorKnowledgeContext(
    user,
    payload,
    session,
    robot,
    monitorReplyId,
    retrievalBaseRequest,
  )

  return [graphRagContextText, vectorContextText].filter(Boolean).join('\n\n')
}

async function prefetchNumericState(baseRequest, payload, session, monitorReplyId = '') {
  if (monitorReplyId) {
    appendAgentMonitorStep({
      replyId: monitorReplyId,
      mergeKey: 'numeric',
      stage: 'numeric',
      eventType: 'numeric',
      status: 'running',
      summary: '数值生成中',
      requestSnapshot: baseRequest,
    })
  }

  const numericResponse = await requestAgentJson(
    '/runs/numeric',
    baseRequest,
    payload,
    session,
    '数值生成',
  )
  const numericState =
    typeof (numericResponse?.numeric_state || numericResponse?.numericState) === 'object'
      && (numericResponse?.numeric_state || numericResponse?.numericState) !== null
      ? (numericResponse.numeric_state || numericResponse.numericState)
      : {}

  if (monitorReplyId) {
    appendAgentMonitorStep({
      replyId: monitorReplyId,
      mergeKey: 'numeric',
      stage: 'numeric',
      eventType: 'numeric',
      status: 'success',
      summary: '数值生成完成',
      requestSnapshot: baseRequest,
      responseSnapshot: {
        numeric_state: numericState,
        usage: numericResponse?.usage || null,
      },
    })
  }

  return {
    numericState,
    usage: normalizeUsage(numericResponse?.usage),
  }
}

async function prefetchStoryOutline(baseRequest, payload, session, monitorReplyId = '') {
  if (monitorReplyId) {
    appendAgentMonitorStep({
      replyId: monitorReplyId,
      mergeKey: 'story_outline',
      stage: 'story_outline',
      eventType: 'story_outline',
      status: 'running',
      summary: '故事梗概生成中',
      requestSnapshot: baseRequest,
    })
  }

  const outlineResponse = await requestAgentJson(
    '/runs/story-outline',
    baseRequest,
    payload,
    session,
    '故事梗概生成',
  )
  const storyOutline = String(outlineResponse?.story_outline || outlineResponse?.storyOutline || '').trim()
  if (!storyOutline) {
    throw new Error('故事梗概为空')
  }

  if (monitorReplyId) {
    appendAgentMonitorStep({
      replyId: monitorReplyId,
      mergeKey: 'story_outline',
      stage: 'story_outline',
      eventType: 'story_outline',
      status: 'success',
      summary: '故事梗概生成完成',
      requestSnapshot: baseRequest,
      responseSnapshot: {
        story_outline: storyOutline,
        usage: outlineResponse?.usage || null,
      },
    })
  }

  return {
    storyOutline,
    usage: normalizeUsage(outlineResponse?.usage),
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

export function shouldRunWorldGraphBackgroundJob(agentRequest) {
  const meta = buildWorldGraphTriggerMeta(agentRequest)
  return Boolean(
    meta.robotId
    || meta.nodeCount
    || meta.edgeCount
    || meta.relationTypeCount
    || meta.eventTimeline.length,
  )
}

export function applyWorldGraphWritebackToSessionGraph(sessionGraph, fallbackGraph, writebackOps) {
  const latestGraph = sessionGraph || fallbackGraph || null
  const writebackResult = applyWorldGraphWritebackToSnapshot(latestGraph, writebackOps)
  return {
    graph: writebackResult.graph,
    warnings: Array.isArray(writebackResult.warnings) ? writebackResult.warnings : [],
    persistenceMode: 'session-snapshot',
    appliedNodeCount: Number(writebackResult.appliedNodeCount || 0),
    appliedEdgeCount: Number(writebackResult.appliedEdgeCount || 0),
    appliedEffectCount: Number(writebackResult.appliedEffectCount || 0),
    appliedSnapshotCount: Number(writebackResult.appliedSnapshotCount || 0),
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

async function loadWorldGraphPayloadWithMonitor(user, payload, session, monitorReplyId = '') {
  const robotId = resolveSessionRobotId(payload, session)
  const robotName = resolveChatRobotName(payload, session)
  const requestSnapshot = {
    sessionId: payload?.sessionId || '',
    robotId,
    robotName,
    hasSessionGraph: Boolean(
      session?.worldGraph
      || payload?.sessionSnapshot?.worldGraph
      || payload?.sessionSnapshot?.world_graph,
    ),
    sessionWorldGraph: session?.worldGraph || null,
    sessionSnapshotWorldGraph:
      payload?.sessionSnapshot?.worldGraph
      || payload?.sessionSnapshot?.world_graph
      || null,
  }
  const graph = await loadWorldGraphPayload(user, payload, session)
  if (monitorReplyId) {
    appendAgentMonitorStep({
      replyId: monitorReplyId,
      stage: 'graph_context_recall',
      eventType: 'graph_context_recall',
      summary: '图谱上下文召回完成',
      requestSnapshot,
      responseSnapshot: {
        robotId,
        robotName,
        nodeCount: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
        edgeCount: Array.isArray(graph?.edges) ? graph.edges.length : 0,
        relationTypeCount: Array.isArray(graph?.relationTypes) ? graph.relationTypes.length : 0,
        graph,
      },
    })
  }
  return graph
}

function buildPrimaryAgentModelConfig(payload) {
  return {
    provider: String(payload.provider || 'openai'),
    base_url:
      String(payload.provider || 'openai') === 'ollama'
        ? getOllamaChatBaseUrl(payload.baseUrl)
        : sanitizeBaseUrl(payload.baseUrl),
    api_key: String(payload.apiKey || ''),
    model: String(payload.model || ''),
    temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
  }
}

function createAuxiliaryModelConfigResolver(payload) {
  return (modelConfigId) => {
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
}

function buildAgentAuxiliaryModelConfigs(payload, robot) {
  const resolveAuxiliaryModelConfig = createAuxiliaryModelConfigResolver(payload)
  return {
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
  }
}

function buildAgentRobotPayload(robot, payload) {
  return {
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
  }
}

async function buildAgentRequest(payload, user, session, monitorReplyId = '') {
  const memory = session?.memory || DEFAULT_SESSION_MEMORY
  const robot = session?.robot || payload.robot || DEFAULT_SESSION_ROBOT
  const memorySchema = resolveEffectiveMemorySchema(session?.memorySchema, payload?.robot?.memorySchema)
  const structuredMemory = normalizeStructuredMemory(session?.structuredMemory)
  const numericState =
    typeof session?.numericState === 'object' && session?.numericState !== null
      ? session.numericState
      : {}
  const structuredMemoryInterval = normalizePositiveInteger(
    memory?.structuredMemoryInterval,
    normalizePositiveInteger(robot?.structuredMemoryInterval, DEFAULT_SESSION_MEMORY.structuredMemoryInterval),
  )
  const structuredMemoryHistoryLimit = normalizePositiveInteger(
    memory?.structuredMemoryHistoryLimit,
    normalizePositiveInteger(robot?.structuredMemoryHistoryLimit, DEFAULT_SESSION_MEMORY.structuredMemoryHistoryLimit),
  )
  const worldGraph = await loadWorldGraphPayloadWithMonitor(user, payload, session, monitorReplyId)
  const auxiliaryModelConfigs = buildAgentAuxiliaryModelConfigs(payload, robot)
  const baseRequest = {
    thread_id: session?.threadId || payload.sessionId,
    session_id: payload.sessionId,
    prompt: String(payload.prompt || ''),
    user: {
      id: user.id,
      email: user.email || null,
      display_name: user.displayName || null,
    },
    model_config: buildPrimaryAgentModelConfig(payload),
    robot: buildAgentRobotPayload(robot, payload),
    system_prompt: payload.systemPrompt || robot?.systemPrompt || '',
    history: (session?.messages || []).map((item) => ({
      role: item.role,
      content: item.content,
    })),
    memory_schema: memorySchema,
    structured_memory: structuredMemory,
    numeric_state: numericState,
    numeric_stage_completed: false,
    story_outline: '',
    story_outline_stage_completed: false,
    auxiliary_model_configs: auxiliaryModelConfigs,
    world_graph: worldGraph,
    structured_memory_interval: structuredMemoryInterval,
    structured_memory_history_limit: structuredMemoryHistoryLimit,
  }
  const numericResult = await prefetchNumericState(baseRequest, payload, session, monitorReplyId)
  const outlineRequest = {
    ...baseRequest,
    numeric_state: numericResult.numericState,
    numeric_stage_completed: true,
  }
  const outlineResult = await prefetchStoryOutline(outlineRequest, payload, session, monitorReplyId)
  const knowledgeContextText = await maybeResolveKnowledgeContext(user, payload, session, {
    ...robot,
    description: payload?.robot?.description || payload?.sessionSnapshot?.robot?.description || '',
  }, monitorReplyId, outlineResult.storyOutline)

  return {
    ...outlineRequest,
    prefetch_usage: addUsageTotals(numericResult.usage, outlineResult.usage),
    system_prompt: [baseRequest.system_prompt, knowledgeContextText].filter(Boolean).join('\n\n'),
    story_outline: outlineResult.storyOutline,
    story_outline_stage_completed: true,
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
  const monitorReplyId = beginAgentMonitorReply({ user, payload, session })
  const agentRequest = await buildAgentRequest(payload, user, session, monitorReplyId)

  if (monitorReplyId) {
    appendAgentMonitorStep({
      replyId: monitorReplyId,
      stage: 'agent_request_ready',
      eventType: 'agent_request_ready',
      summary: 'Agent 主请求已构建',
      requestSnapshot: agentRequest,
    })
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(agentRequest),
    })

    if (!response.ok) {
      const rawText = await response.text()
      throw new Error(extractAgentServiceErrorMessage(rawText) || rawText || 'Agent 请求失败')
    }

    return { response, session, agentRequest, monitorReplyId }
  } catch (error) {
    if (monitorReplyId) {
      failAgentMonitorReply(monitorReplyId, error, {
        stage: 'agent_request_failed',
        eventType: 'agent_request_failed',
        requestSnapshot: agentRequest,
      })
    }
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
      const rawText = await response.text()
      throw new Error(extractAgentServiceErrorMessage(rawText) || rawText || `${actionLabel}失败`)
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

export function hydrateBackgroundAgentRequest(agentRequest, session) {
  const latestSession = session && typeof session === 'object' ? session : null
  return {
    ...agentRequest,
    memory_schema: resolveEffectiveMemorySchema(
      agentRequest?.memory_schema || agentRequest?.memorySchema,
      latestSession?.memorySchema,
    ),
    structured_memory: normalizeStructuredMemory(
      latestSession?.structuredMemory || agentRequest?.structured_memory || agentRequest?.structuredMemory,
    ),
    numeric_state: agentRequest?.numeric_state || agentRequest?.numericState || {},
    story_outline: String(agentRequest?.story_outline || agentRequest?.storyOutline || ''),
    world_graph:
      latestSession?.worldGraph
        ? normalizeWorldGraphSnapshot(latestSession.worldGraph)
        : agentRequest?.world_graph || agentRequest?.worldGraph || null,
  }
}

export function buildWorldGraphBackgroundAgentRequest(agentRequest, session) {
  const hydrated = hydrateBackgroundAgentRequest(agentRequest, session)
  const nextRequest = { ...hydrated }
  delete nextRequest.memory_schema
  delete nextRequest.memorySchema
  return nextRequest
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
  const memorySchema = resolveEffectiveMemorySchema(existing?.memorySchema, payload?.robot?.memorySchema)

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
    memorySchema,
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

function shouldRecordAgentMonitorEvent(payload) {
  const type = String(payload?.type || '').trim()
  if (!type) {
    return false
  }
  return !['message_delta', 'usage', 'run_started'].includes(type)
}

function summarizeAgentMonitorEvent(payload) {
  const type = String(payload?.type || '').trim()
  switch (type) {
    case 'numeric_state_updated':
      return '数值计算完成'
    case 'story_outline_started':
      return '故事梗概生成开始'
    case 'story_outline_completed':
      return '故事梗概生成完成'
    case 'message_done':
      return '主回复生成完成'
    case 'response_completed':
      return '回复结果已汇总'
    case 'memory_started':
      return '结构化记忆整理开始'
    case 'memory_updated':
      return '结构化记忆整理完成'
    case 'run_completed':
      return '主链路执行完成'
    case 'world_graph_writeback_started':
      return '世界图谱写回开始'
    case 'world_graph_updated':
      return '世界图谱写回完成'
    case 'error':
      return typeof payload?.message === 'string' && payload.message.trim() ? payload.message.trim() : '执行失败'
    default:
      return type || '执行步骤'
  }
}

function resolveAgentMonitorEventMergeMeta(payload) {
  const type = String(payload?.type || '').trim()
  switch (type) {
    case 'story_outline_started':
      return {
        mergeKey: 'story_outline',
        stage: 'story_outline',
        eventType: 'story_outline',
        status: 'running',
        summary: '故事梗概生成中',
      }
    case 'story_outline_completed':
      return {
        mergeKey: 'story_outline',
        stage: 'story_outline',
        eventType: 'story_outline',
        status: 'success',
        summary: '故事梗概生成完成',
      }
    case 'memory_started':
      return {
        mergeKey: 'memory_update',
        stage: 'memory_update',
        eventType: 'memory_update',
        status: 'running',
        summary: '结构化记忆整理中',
      }
    case 'memory_updated':
      return {
        mergeKey: 'memory_update',
        stage: 'memory_update',
        eventType: 'memory_update',
        status: 'success',
        summary: '结构化记忆整理完成',
      }
    case 'world_graph_writeback_started':
      return {
        mergeKey: 'world_graph_writeback',
        stage: 'world_graph_writeback',
        eventType: 'world_graph_writeback',
        status: 'running',
        summary: '世界图谱写回中',
      }
    case 'world_graph_updated':
      return {
        mergeKey: 'world_graph_writeback',
        stage: 'world_graph_writeback',
        eventType: 'world_graph_writeback',
        status: 'success',
        summary: '世界图谱写回完成',
      }
    default:
      return {
        mergeKey: '',
        stage: type,
        eventType: type,
        status: type === 'error' ? 'failed' : 'success',
        summary: summarizeAgentMonitorEvent(payload),
      }
  }
}

function getAgentMonitorStepRequestSnapshot(agentRequest, payload, session, parsedEvent) {
  const eventType = String(parsedEvent?.type || '').trim()
  const fullSnapshot = {
    eventType,
    payload: {
      ...payload,
      sessionSnapshot: payload?.sessionSnapshot || null,
    },
    session: session || null,
    agentRequest: agentRequest || null,
  }
  if (['message_done', 'response_completed', 'run_completed'].includes(eventType)) {
    return {
      ...fullSnapshot,
      prompt: payload?.prompt || '',
      sessionId: payload?.sessionId || '',
      threadId: agentRequest?.thread_id || agentRequest?.threadId || session?.threadId || '',
    }
  }
  if (['memory_started', 'memory_updated'].includes(eventType)) {
    return {
      ...fullSnapshot,
      threadId: agentRequest?.thread_id || agentRequest?.threadId || '',
      sessionId: payload?.sessionId || '',
    }
  }
  if (['story_outline_started', 'story_outline_completed'].includes(eventType)) {
    return {
      ...fullSnapshot,
      prompt: payload?.prompt || '',
      threadId: agentRequest?.thread_id || agentRequest?.threadId || '',
    }
  }
  if (eventType === 'numeric_state_updated') {
    return {
      ...fullSnapshot,
      prompt: payload?.prompt || '',
    }
  }
  return fullSnapshot
}

function recordAgentMonitorEvent(replyId, agentRequest, payload, session, parsedEvent) {
  if (!replyId || !shouldRecordAgentMonitorEvent(parsedEvent)) {
    return
  }
  const mergeMeta = resolveAgentMonitorEventMergeMeta(parsedEvent)
  appendAgentMonitorStep({
    replyId,
    mergeKey: mergeMeta.mergeKey,
    stage: mergeMeta.stage,
    eventType: mergeMeta.eventType,
    summary: mergeMeta.summary,
    requestSnapshot: getAgentMonitorStepRequestSnapshot(agentRequest, payload, session, parsedEvent),
    responseSnapshot: parsedEvent,
    status: mergeMeta.status,
  })
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
  const { response, session, agentRequest, monitorReplyId } = await requestAgentRun(payload, user)
  if (!response.body) {
    if (monitorReplyId) {
      failAgentMonitorReply(monitorReplyId, new Error('连接中断'), {
        stage: 'agent_stream_failed',
        eventType: 'agent_stream_failed',
        requestSnapshot: agentRequest,
      })
    }
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

        recordAgentMonitorEvent(monitorReplyId, agentRequest, payload, session, parsed)

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
    if (monitorReplyId) {
      failAgentMonitorReply(monitorReplyId, error, {
        stage: 'agent_stream_failed',
        eventType: 'agent_stream_failed',
        requestSnapshot: agentRequest,
      })
    }
    throw new Error(formatChatErrorMessage(payload, session, error))
  }

  if (!receivedRunCompleted) {
    if (monitorReplyId) {
      failAgentMonitorReply(monitorReplyId, new Error('连接中断'), {
        stage: 'agent_stream_incomplete',
        eventType: 'agent_stream_incomplete',
        requestSnapshot: agentRequest,
      })
    }
    throw new Error(formatChatErrorMessage(payload, session, new Error('连接中断')))
  }

  finalUsage = addUsageTotals(finalUsage, agentRequest?.prefetch_usage || agentRequest?.prefetchUsage)

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
    if (monitorReplyId) {
      failAgentMonitorReply(monitorReplyId, error, {
        stage: 'session_commit_failed',
        eventType: 'session_commit_failed',
      })
    }
    throw new Error(formatChatErrorMessage(payload, session, error))
  }

  if (monitorReplyId) {
    completeAgentMonitorReply(monitorReplyId, {
      threadId: finalThreadId,
      message: finalMessage,
      sessionTitle: savedSession?.title || session?.title || payload?.sessionSnapshot?.title || '',
      responseSnapshot: {
        message: finalMessage,
        suggestions: finalSuggestions,
        form: finalForm,
        memory: finalMemory,
        usage: finalUsage,
        numericState: finalNumericState,
        storyOutline: finalStoryOutline,
      },
    })
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
    monitorReplyId,
  }
}

async function runStructuredMemoryBackgroundJob(agentRequest, payload, user) {
  const latestSession = await getSessionRecord(user, payload.sessionId)
  const requestBody = hydrateBackgroundAgentRequest(agentRequest, latestSession)
  const response = await requestAgentJson('/runs/memory', requestBody, payload, null, '结构化记忆后台任务')
  const normalizedMemory = normalizeStructuredMemory(response?.memory)
  const updatedSession = await patchSessionStructuredMemory(user, payload.sessionId, normalizedMemory, response?.usage)

  return {
    requestBody,
    responseSnapshot: response,
    memory: normalizedMemory,
    usage: normalizeUsage(response?.usage),
    session: updatedSession,
  }
}

async function runWorldGraphBackgroundJob(agentRequest, payload, user) {
  const latestSession = await getSessionRecord(user, payload.sessionId)
  const requestBody = {
    ...buildWorldGraphBackgroundAgentRequest(agentRequest, latestSession),
    robot_name: String(agentRequest?.robot?.name || payload?.robot?.name || payload?.sessionSnapshot?.robot?.name || ''),
    robot_description: String(payload?.robot?.description || payload?.sessionSnapshot?.robot?.description || ''),
  }
  let nextGraph = normalizeWorldGraphSnapshot(requestBody.world_graph || requestBody.worldGraph || null)
  let warnings = []
  let persistenceMode = 'session-snapshot'
  let applySummary = {
    appliedRelationTypeCount: 0,
    appliedNodeCount: 0,
    appliedEdgeCount: 0,
    appliedEffectCount: 0,
    appliedSnapshotCount: 0,
  }
  let writebackSummary = summarizeWorldGraphWritebackOps({})
  let writebackEvents = []
  let responseUsage = null

  const applyWriteback = (writebackOps, relationTypes = []) => {
    const relationTypeResult = mergeGraphRagRelationTypesIntoWorldGraph(nextGraph, relationTypes)
    nextGraph = relationTypeResult.graph
    applySummary.appliedRelationTypeCount += Number(relationTypeResult.appliedRelationTypeCount || 0)
    if (hasWorldGraphWritebackOps(writebackOps)) {
      const writebackResult = applyWorldGraphWritebackToSessionGraph(
        nextGraph,
        nextGraph,
        writebackOps,
      )
      nextGraph = writebackResult.graph
      warnings = writebackResult.warnings
      applySummary.appliedNodeCount += writebackResult.appliedNodeCount
      applySummary.appliedEdgeCount += writebackResult.appliedEdgeCount
      applySummary.appliedEffectCount += writebackResult.appliedEffectCount
      applySummary.appliedSnapshotCount += writebackResult.appliedSnapshotCount
      persistenceMode = writebackResult.persistenceMode
    }
  }

  try {
    const response = await requestAgentJson(
      '/runs/graphrag-writeback',
      requestBody,
      payload,
      null,
      'GraphRAG 世界图谱后台任务',
    )
    const writebackPayload = response?.graphrag_writeback || response?.graphRagWriteback || {}
    const mapped = mapGraphRagWritebackToWorldGraphUpdate(writebackPayload, { currentGraph: nextGraph })
    writebackSummary = summarizeWorldGraphWritebackOps(mapped.writebackOps)
    writebackEvents = summarizeWorldGraphEventTimeline(mapped.writebackOps.upsert_events || mapped.writebackOps.upsertEvents)
    responseUsage = response?.usage || null

    await persistGraphRagArtifact(user, {
      id: buildGraphRagArtifactId('writeback'),
      robotId: String(agentRequest?.world_graph?.meta?.robotId || agentRequest?.worldGraph?.meta?.robotId || ''),
      sessionId: String(payload.sessionId || ''),
      kind: 'writeback',
      summary: mapped.summary,
      payload: {
        ...writebackPayload,
        mapped_writeback_ops: mapped.writebackOps,
      },
      meta: {
        threadId: agentRequest.thread_id || agentRequest.threadId || '',
        promptLength: String(payload?.prompt || '').trim().length,
        finalResponseLength: String(requestBody.final_response || '').trim().length,
      },
    })

    applyWriteback(mapped.writebackOps, mapped.relationTypes)
  } catch (error) {
    backgroundLog('[background-world-graph:graphrag-fallback]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      message: error instanceof Error ? error.message : 'GraphRAG 写回失败，回退到旧写回链路',
    }, 'warn')
    const response = await requestAgentJson(
      '/runs/world-graph-writeback',
      requestBody,
      payload,
      null,
      '世界图谱后台任务',
    )
    const writebackOps = response?.world_graph_writeback_ops || response?.worldGraphWritebackOps || {}
    writebackSummary = summarizeWorldGraphWritebackOps(writebackOps)
    writebackEvents = summarizeWorldGraphEventTimeline(writebackOps.upsert_events || writebackOps.upsertEvents)
    responseUsage = response?.usage || null
    applyWriteback(writebackOps, [])
  }

  const updatedSession = await patchSessionWorldGraph(user, payload.sessionId, nextGraph, responseUsage)

  return {
    requestBody,
    responseSnapshot: responseUsage,
    graph: nextGraph,
    usage: normalizeUsage(responseUsage),
    session: updatedSession,
    warnings,
    persistenceMode,
    writebackSummary,
    writebackEvents,
    resultTimeline: summarizeGraphTimeline(nextGraph),
    ...applySummary,
  }
}

function buildSessionBackgroundTaskPlan(agentRequest, payload) {
  const tasks = []
  const structuredMemoryTriggerMeta = buildStructuredMemoryTriggerMeta(agentRequest)
  if (!structuredMemoryTriggerMeta.triggered) {
    backgroundLog('[background-memory:skipped]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      persistToServer: true,
      reason: 'interval_not_reached',
      ...structuredMemoryTriggerMeta,
    })
  } else {
    tasks.push({
      kind: SESSION_BACKGROUND_TASK_KIND_MEMORY,
      meta: structuredMemoryTriggerMeta,
    })
  }

  const worldGraphTriggerMeta = buildWorldGraphTriggerMeta(agentRequest)
  if (!shouldRunWorldGraphBackgroundJob(agentRequest)) {
    backgroundLog('[background-world-graph:skipped]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      persistToServer: true,
      reason: 'missing_world_graph_context',
      ...worldGraphTriggerMeta,
    })
  } else {
    tasks.push({
      kind: SESSION_BACKGROUND_TASK_KIND_WORLD_GRAPH,
      meta: worldGraphTriggerMeta,
    })
  }

  return tasks
}

async function runSessionBackgroundTask(task, agentRequest, payload, user, replyId) {
  if (task.kind === SESSION_BACKGROUND_TASK_KIND_MEMORY) {
    const requestSnapshot = {
      taskMeta: task.meta,
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId || '',
      agentRequest,
    }
    backgroundLog('[background-memory:started]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      persistToServer: true,
      ...task.meta,
    })
    const memoryResult = await runStructuredMemoryBackgroundJob(agentRequest, payload, user)
    if (replyId) {
      appendAgentMonitorStep({
        replyId,
        stage: 'background_memory',
        eventType: 'background_memory',
        summary: '结构化记忆后台任务完成',
        requestSnapshot: {
          ...requestSnapshot,
          requestBody: memoryResult.requestBody,
        },
        responseSnapshot: {
          memory: memoryResult.memory,
          usage: memoryResult.usage,
        },
      })
    }
    backgroundLog('[background-memory:succeeded]', {
      sessionId: payload.sessionId,
      threadId: agentRequest.thread_id || agentRequest.threadId,
      persistToServer: true,
      categoryCount: Array.isArray(memoryResult.memory?.categories) ? memoryResult.memory.categories.length : 0,
      recordCount: countStructuredMemoryItems(memoryResult.memory),
      usage: memoryResult.usage,
    })
    return memoryResult
  }

  const requestSnapshot = {
    taskMeta: task.meta,
    sessionId: payload.sessionId,
    threadId: agentRequest.thread_id || agentRequest.threadId || '',
    agentRequest,
  }
  backgroundLog('[background-world-graph:started]', {
    sessionId: payload.sessionId,
    threadId: agentRequest.thread_id || agentRequest.threadId,
    persistToServer: true,
    ...task.meta,
  })
  const worldGraphResult = await runWorldGraphBackgroundJob(agentRequest, payload, user)
  if (replyId) {
    appendAgentMonitorStep({
      replyId,
      stage: 'background_world_graph',
      eventType: 'background_world_graph',
      summary: '世界图谱后台任务完成',
      requestSnapshot: {
        ...requestSnapshot,
        requestBody: worldGraphResult.requestBody,
      },
      responseSnapshot: {
        graph: worldGraphResult.graph,
        usage: worldGraphResult.usage,
        warnings: worldGraphResult.warnings,
        persistenceMode: worldGraphResult.persistenceMode,
        writebackSummary: worldGraphResult.writebackSummary,
        writebackEvents: worldGraphResult.writebackEvents,
        resultTimeline: worldGraphResult.resultTimeline,
      },
    })
  }
  backgroundLog('[background-world-graph:succeeded]', {
    sessionId: payload.sessionId,
    threadId: agentRequest.thread_id || agentRequest.threadId,
    persistToServer: true,
    robotId: task.meta.robotId || null,
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
  return worldGraphResult
}

function enqueueSessionBackgroundJobs(result, payload, user) {
  const sessionKey = String(payload.sessionId || '').trim()
  const agentRequest = result.agentRequest
  const replyId = result.monitorReplyId
  const tasks = buildSessionBackgroundTaskPlan(agentRequest, payload)

  if (!sessionKey || !tasks.length) {
    return getSessionBackgroundStatus(sessionKey)
  }

  incrementSessionBackgroundPendingTasks(sessionKey, tasks.length)
  backgroundLog('[background-session-queue:enqueued]', {
    sessionId: sessionKey,
    threadId: agentRequest.thread_id || agentRequest.threadId,
    taskKinds: tasks.map((task) => task.kind),
    pendingTaskCount: getSessionBackgroundStatus(sessionKey).pendingTaskCount,
  })

  void enqueueBackgroundJob({
    sessionKey,
    run: async () => {
      for (let index = 0; index < tasks.length; index += 1) {
        const task = tasks[index]
        markSessionBackgroundTaskStarted(sessionKey, task.kind)
        try {
          await runSessionBackgroundTask(task, agentRequest, payload, user, replyId)
          completeSessionBackgroundTask(sessionKey)
        } catch (error) {
          if (replyId) {
            appendAgentMonitorStep({
              replyId,
              stage: `background_${task.kind}_failed`,
              eventType: `background_${task.kind}_failed`,
              status: 'failed',
              summary: error instanceof Error ? error.message : '会话异步处理失败',
              requestSnapshot: {
                taskKind: task.kind,
                taskMeta: task.meta,
                sessionId: payload.sessionId,
                threadId: agentRequest.thread_id || agentRequest.threadId || '',
              },
            })
          }
          const remainingTaskCount = tasks.length - index
          failSessionBackgroundPipeline(sessionKey, error, remainingTaskCount)
          backgroundLog('[background-session-queue:failed]', {
            sessionId: sessionKey,
            threadId: agentRequest.thread_id || agentRequest.threadId,
            taskKind: task.kind,
            remainingTaskCount,
            message: error instanceof Error ? error.message : '会话异步处理失败',
          }, 'error')
          throw error
        }
      }
    },
  }).catch(() => {})

  return getSessionBackgroundStatus(sessionKey)
}

export async function requestNonStreamChat(payload, user) {
  const result = await runAgentAndCollect(payload, user)
  enqueueSessionBackgroundJobs(result, payload, user)
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
    enqueueSessionBackgroundJobs(result, payload, user)
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
