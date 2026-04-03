import { appendFile, mkdir, readFile, truncate, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const DATA_DIR = path.resolve(process.cwd(), 'main', 'data')
const EVENT_FILE = path.join(DATA_DIR, 'agent-monitor-events.jsonl')

function normalizeStoryDraftEntries(value) {
  return (Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)
}

function sanitizeStoryOutlineForMonitor(outline) {
  const source = outline && typeof outline === 'object' && !Array.isArray(outline) ? outline : {}
  const storyDraft = source.storyDraft && typeof source.storyDraft === 'object' && !Array.isArray(source.storyDraft)
    ? source.storyDraft
    : source.story_draft && typeof source.story_draft === 'object' && !Array.isArray(source.story_draft)
      ? source.story_draft
      : {}
  return {
    retrievalQuery: String(source.retrievalQuery || source.retrieval_query || '').trim(),
    storyDraft: {
      characters: normalizeStoryDraftEntries(storyDraft.characters),
      items: normalizeStoryDraftEntries(storyDraft.items),
      organizations: normalizeStoryDraftEntries(storyDraft.organizations),
      locations: normalizeStoryDraftEntries(storyDraft.locations),
      events: normalizeStoryDraftEntries(storyDraft.events),
    },
  }
}

function limitString(value, maxLength = 20000) {
  const text = typeof value === 'string' ? value : String(value ?? '')
  if (text.length <= maxLength) {
    return text
  }
  return `${text.slice(0, maxLength)}...[已截断 ${text.length - maxLength} 字符]`
}

function sanitizeSnapshot(value, depth = 0) {
  if (value === null || value === undefined) {
    return value
  }
  if (depth > 8) {
    return '[MaxDepth]'
  }
  if (Buffer.isBuffer(value)) {
    return { type: 'Buffer', length: value.length }
  }
  if (ArrayBuffer.isView(value)) {
    return {
      type: value.constructor?.name || 'TypedArray',
      length: value.byteLength ?? 0,
    }
  }
  if (value instanceof ArrayBuffer) {
    return { type: 'ArrayBuffer', length: value.byteLength }
  }
  if (typeof value === 'string') {
    return limitString(value)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSnapshot(item, depth + 1))
  }
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, sanitizeSnapshot(item, depth + 1)]),
    )
  }
  return String(value)
}

function cloneSnapshot(value) {
  return sanitizeSnapshot(value)
}

function sanitizeModelConfigForMonitor(config) {
  if (!config || typeof config !== 'object') {
    return null
  }
  return {
    model_config_id: String(config.model_config_id || config.modelConfigId || '').trim(),
    provider: String(config.provider || '').trim(),
    base_url: String(config.base_url || config.baseUrl || '').trim(),
    model: String(config.model || '').trim(),
    temperature: typeof config.temperature === 'number' ? config.temperature : null,
  }
}

function summarizeWorldGraphForMonitor(graph) {
  if (!graph || typeof graph !== 'object') {
    return null
  }
  return {
    meta: graph?.meta
      ? {
        robotId: String(graph.meta.robotId || '').trim(),
        title: String(graph.meta.title || '').trim(),
        summary: String(graph.meta.summary || '').trim(),
        graphVersion: Number(graph.meta.graphVersion || 0),
        calendar: graph.meta.calendar
          ? {
            calendarId: String(graph.meta.calendar.calendarId || '').trim(),
            calendarName: String(graph.meta.calendar.calendarName || '').trim(),
            formatTemplate: String(graph.meta.calendar.formatTemplate || '').trim(),
          }
          : null,
      }
      : null,
    relationTypeCount: Array.isArray(graph?.relationTypes) ? graph.relationTypes.length : 0,
    nodeCount: Array.isArray(graph?.nodes) ? graph.nodes.length : 0,
    edgeCount: Array.isArray(graph?.edges) ? graph.edges.length : 0,
  }
}

function sanitizeStructuredMemoryForMonitor(memory) {
  if (!memory || typeof memory !== 'object') {
    return null
  }
  return {
    updatedAt: String(memory.updatedAt || memory.updated_at || '').trim(),
    longTermMemory: String(memory.longTermMemory || memory.long_term_memory || '').trim(),
    shortTermMemory: String(memory.shortTermMemory || memory.short_term_memory || '').trim(),
  }
}

function sanitizeRobotForMonitor(robot) {
  if (!robot || typeof robot !== 'object') {
    return null
  }
  return {
    id: String(robot.id || '').trim(),
    name: String(robot.name || '').trim(),
    common_prompt: String(robot.common_prompt || robot.commonPrompt || '').trim(),
    system_prompt: String(robot.system_prompt || robot.systemPrompt || '').trim(),
  }
}

function sanitizePayloadForMonitor(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  return {
    sessionId: String(payload.sessionId || '').trim(),
    prompt: String(payload.prompt || '').trim(),
    provider: String(payload.provider || '').trim(),
    baseUrl: String(payload.baseUrl || '').trim(),
    model: String(payload.model || '').trim(),
    temperature: typeof payload.temperature === 'number' ? payload.temperature : null,
    systemPrompt: String(payload.systemPrompt || '').trim(),
    robotName: String(payload.robotName || '').trim(),
    sessionSnapshot: payload.sessionSnapshot
      ? {
        id: String(payload.sessionSnapshot.id || '').trim(),
        title: String(payload.sessionSnapshot.title || '').trim(),
      }
      : null,
  }
}

function sanitizeSessionForMonitor(session) {
  if (!session || typeof session !== 'object') {
    return null
  }
  return {
    id: String(session.id || '').trim(),
    threadId: String(session.threadId || '').trim(),
    title: String(session.title || '').trim(),
    robot: sanitizeRobotForMonitor(session.robot),
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    structuredMemory: sanitizeStructuredMemoryForMonitor(session.structuredMemory),
    storyOutline: sanitizeStoryOutlineForMonitor(session.storyOutline),
    worldGraph: summarizeWorldGraphForMonitor(session.worldGraph),
  }
}

function sanitizeAgentRequestForMonitor(agentRequest) {
  if (!agentRequest || typeof agentRequest !== 'object') {
    return null
  }
  return {
    thread_id: String(agentRequest.thread_id || agentRequest.threadId || '').trim(),
    session_id: String(agentRequest.session_id || agentRequest.sessionId || '').trim(),
    prompt: String(agentRequest.prompt || '').trim(),
    system_prompt: String(agentRequest.system_prompt || agentRequest.systemPrompt || '').trim(),
    robot: sanitizeRobotForMonitor(agentRequest.robot),
    history: (Array.isArray(agentRequest.history) ? agentRequest.history : []).slice(-2).map((item) => ({
      role: String(item?.role || '').trim(),
      content: String(item?.content || '').trim(),
    })),
    structured_memory: sanitizeStructuredMemoryForMonitor(agentRequest.structured_memory || agentRequest.structuredMemory),
    story_outline: sanitizeStoryOutlineForMonitor(agentRequest.story_outline || agentRequest.storyOutline || {}),
    story_outline_stage_completed: Boolean(agentRequest.story_outline_stage_completed || agentRequest.storyOutlineStageCompleted),
    vector_context_text: String(agentRequest.vector_context_text || agentRequest.vectorContextText || '').trim(),
    world_graph: summarizeWorldGraphForMonitor(agentRequest.world_graph || agentRequest.worldGraph),
    model_config: sanitizeModelConfigForMonitor(agentRequest.model_config || agentRequest.modelSettings),
    auxiliary_model_configs: {
      memory: sanitizeModelConfigForMonitor(agentRequest?.auxiliary_model_configs?.memory || agentRequest?.auxiliaryModelConfigs?.memory),
      outline: sanitizeModelConfigForMonitor(agentRequest?.auxiliary_model_configs?.outline || agentRequest?.auxiliaryModelConfigs?.outline),
      world_graph: sanitizeModelConfigForMonitor(agentRequest?.auxiliary_model_configs?.world_graph || agentRequest?.auxiliaryModelConfigs?.world_graph),
    },
  }
}

function buildUserLabel(user) {
  const candidates = [user?.displayName, user?.email, user?.username, user?.id]
  const resolved = candidates.find((item) => typeof item === 'string' && item.trim())
  return resolved ? String(resolved).trim() : '未知用户'
}

function buildSessionTitle(payload, session) {
  const candidates = [
    session?.title,
    payload?.sessionTitle,
    payload?.sessionSnapshot?.title,
    payload?.prompt,
  ]
  const resolved = candidates.find((item) => typeof item === 'string' && item.trim())
  return resolved ? limitString(String(resolved).trim(), 120) : '未命名会话'
}

function buildReplySummary(payload) {
  const prompt = String(payload?.prompt || '').trim()
  return prompt ? limitString(prompt, 160) : '新的回复'
}

function createEmptyStats() {
  return {
    userCount: 0,
    sessionCount: 0,
    replyCount: 0,
    stepCount: 0,
  }
}

const monitorState = {
  enabled: false,
  startedAt: '',
  stoppedAt: '',
  targetUserId: '',
  targetUserLabel: '',
  targetSessionId: '',
  targetSessionTitle: '',
}

async function ensureEventFile() {
  await mkdir(DATA_DIR, { recursive: true })
  try {
    await readFile(EVENT_FILE, 'utf8')
  } catch {
    await writeFile(EVENT_FILE, '', 'utf8')
  }
}

async function appendEvent(event) {
  await ensureEventFile()
  await appendFile(EVENT_FILE, `${JSON.stringify(cloneSnapshot(event))}\n`, 'utf8')
}

async function readEvents() {
  try {
    const content = await readFile(EVENT_FILE, 'utf8')
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line)
        } catch {
          return null
        }
      })
      .filter(Boolean)
  } catch {
    return []
  }
}

function isTargetMatch(user, payload, session) {
  if (!monitorState.enabled) {
    return false
  }
  const currentUserId = String(user?.id || '').trim()
  const currentSessionId = String(payload?.sessionId || session?.id || '').trim()
  if (monitorState.targetUserId && currentUserId !== monitorState.targetUserId) {
    return false
  }
  if (monitorState.targetSessionId && currentSessionId !== monitorState.targetSessionId) {
    return false
  }
  return true
}

function buildReplyContext({ user, payload, session, agentRequest }) {
  return {
    userId: String(user?.id || '').trim(),
    userLabel: monitorState.targetUserLabel || buildUserLabel(user),
    userEmail: String(user?.email || '').trim(),
    sessionId: String(payload?.sessionId || session?.id || '').trim(),
    sessionTitle: monitorState.targetSessionTitle || buildSessionTitle(payload, session),
    threadId: String(agentRequest?.thread_id || agentRequest?.threadId || session?.threadId || payload?.sessionId || '').trim(),
    summary: buildReplySummary(payload),
    promptPreview: limitString(String(payload?.prompt || '').trim(), 200),
  }
}

function hydrateReplyRecords(events) {
  const replyMap = new Map()

  for (const entry of events) {
    const replyId = String(entry?.replyId || '').trim()
    if (!replyId) {
      continue
    }

    if (!replyMap.has(replyId)) {
      replyMap.set(replyId, {
        replyId,
        userId: '',
        userLabel: '',
        userEmail: '',
        sessionId: '',
        sessionTitle: '',
        threadId: '',
        summary: '',
        promptPreview: '',
        assistantMessagePreview: '',
        status: 'running',
        createdAt: '',
        updatedAt: '',
        requestSnapshot: null,
        responseSnapshot: null,
        steps: [],
      })
    }

    const reply = replyMap.get(replyId)
    reply.updatedAt = String(entry.createdAt || entry.completedAt || entry.failedAt || reply.updatedAt || '')

    if (entry.entityType === 'reply' && entry.action === 'started') {
      reply.userId = String(entry.userId || '').trim()
      reply.userLabel = String(entry.userLabel || '').trim()
      reply.userEmail = String(entry.userEmail || '').trim()
      reply.sessionId = String(entry.sessionId || '').trim()
      reply.sessionTitle = String(entry.sessionTitle || '').trim()
      reply.threadId = String(entry.threadId || '').trim()
      reply.summary = String(entry.summary || '').trim()
      reply.promptPreview = String(entry.promptPreview || '').trim()
      reply.createdAt = String(entry.createdAt || '').trim()
      reply.requestSnapshot = entry.requestSnapshot ?? null
      continue
    }

    if (entry.entityType === 'reply' && entry.action === 'completed') {
      reply.status = String(entry.status || 'completed').trim() || 'completed'
      reply.threadId = String(entry.threadId || reply.threadId || '').trim()
      reply.sessionTitle = String(entry.sessionTitle || reply.sessionTitle || '').trim()
      reply.assistantMessagePreview = String(entry.assistantMessagePreview || '').trim()
      reply.responseSnapshot = entry.responseSnapshot ?? null
      continue
    }

    if (entry.entityType === 'reply' && entry.action === 'failed') {
      reply.status = 'failed'
      reply.summary = String(entry.summary || reply.summary || '').trim()
      reply.responseSnapshot = entry.responseSnapshot ?? null
      continue
    }

    if (entry.entityType === 'step') {
      reply.steps.push({
        stepId: String(entry.stepId || '').trim(),
        replyId,
        sequence: reply.steps.length + 1,
        mergeKey: String(entry.mergeKey || '').trim(),
        stage: String(entry.stage || entry.eventType || 'unknown').trim() || 'unknown',
        eventType: String(entry.eventType || entry.stage || 'unknown').trim() || 'unknown',
        status: String(entry.status || 'success').trim() || 'success',
        summary: String(entry.summary || '执行步骤').trim(),
        createdAt: String(entry.createdAt || '').trim(),
        requestSnapshot: entry.requestSnapshot ?? null,
        responseSnapshot: entry.responseSnapshot ?? null,
      })
    }
  }

  return Array.from(replyMap.values())
    .map((reply) => ({
      ...reply,
      stepCount: reply.steps.length,
      updatedAt: reply.updatedAt || reply.createdAt || '',
    }))
    .sort((a, b) => Date.parse(String(b.createdAt || '')) - Date.parse(String(a.createdAt || '')))
}

function buildStats(replyList) {
  const userIds = new Set()
  const sessionKeys = new Set()
  let stepCount = 0

  for (const reply of replyList) {
    if (reply.userId) {
      userIds.add(reply.userId)
    }
    if (reply.userId || reply.sessionId) {
      sessionKeys.add(`${reply.userId}::${reply.sessionId}`)
    }
    stepCount += reply.stepCount || 0
  }

  return {
    userCount: userIds.size,
    sessionCount: sessionKeys.size,
    replyCount: replyList.length,
    stepCount,
  }
}

export function getAgentMonitorStatus() {
  return {
    enabled: monitorState.enabled,
    startedAt: monitorState.startedAt,
    stoppedAt: monitorState.stoppedAt,
    targetUserId: monitorState.targetUserId,
    targetUserLabel: monitorState.targetUserLabel,
    targetSessionId: monitorState.targetSessionId,
    targetSessionTitle: monitorState.targetSessionTitle,
    stats: createEmptyStats(),
  }
}

export async function getAgentMonitorStatusWithStats() {
  const replies = hydrateReplyRecords(await readEvents())
  return {
    ...getAgentMonitorStatus(),
    stats: buildStats(replies),
  }
}

export async function startAgentMonitor(options = {}) {
  monitorState.enabled = true
  monitorState.startedAt = new Date().toISOString()
  monitorState.stoppedAt = ''
  monitorState.targetUserId = String(options.targetUserId || '').trim()
  monitorState.targetUserLabel = String(options.targetUserLabel || '').trim()
  monitorState.targetSessionId = String(options.targetSessionId || '').trim()
  monitorState.targetSessionTitle = String(options.targetSessionTitle || '').trim()
  return getAgentMonitorStatusWithStats()
}

export async function stopAgentMonitor() {
  monitorState.enabled = false
  monitorState.stoppedAt = new Date().toISOString()
  return getAgentMonitorStatusWithStats()
}

export async function clearAgentMonitorData() {
  await ensureEventFile()
  await truncate(EVENT_FILE, 0)
  return getAgentMonitorStatusWithStats()
}

export function beginAgentMonitorReply({ user, payload, session, agentRequest }) {
  if (!isTargetMatch(user, payload, session)) {
    return ''
  }

  const replyId = `agent-reply-${Date.now()}-${randomUUID()}`
  const createdAt = new Date().toISOString()
  const context = buildReplyContext({ user, payload, session, agentRequest })

  void appendEvent({
    entityType: 'reply',
    action: 'started',
    replyId,
    createdAt,
    status: 'running',
    ...context,
    requestSnapshot: {
      payload: sanitizePayloadForMonitor(payload),
      sessionSnapshot: sanitizeSessionForMonitor(session),
      agentRequest: sanitizeAgentRequestForMonitor(agentRequest),
    },
  }).catch((error) => {
    console.error('记录 Agent 监控回复失败', error)
  })

  return replyId
}

export function appendAgentMonitorStep(input = {}) {
  const replyId = String(input.replyId || '').trim()
  if (!replyId) {
    return null
  }

  const createdAt = new Date().toISOString()
  const step = {
    entityType: 'step',
    action: 'recorded',
    stepId: `agent-step-${Date.now()}-${randomUUID()}`,
    replyId,
    mergeKey: String(input.mergeKey || '').trim(),
    stage: String(input.stage || input.eventType || 'unknown').trim() || 'unknown',
    eventType: String(input.eventType || input.stage || 'unknown').trim() || 'unknown',
    status: String(input.status || 'success').trim() || 'success',
    summary: limitString(String(input.summary || '执行步骤').trim(), 240),
    createdAt,
    requestSnapshot: cloneSnapshot(input.requestSnapshot),
    responseSnapshot: cloneSnapshot(input.responseSnapshot),
  }

  void appendEvent(step).catch((error) => {
    console.error('记录 Agent 监控步骤失败', error)
  })

  return step
}

export function completeAgentMonitorReply(replyId, patch = {}) {
  const normalizedReplyId = String(replyId || '').trim()
  if (!normalizedReplyId) {
    return null
  }

  const event = {
    entityType: 'reply',
    action: 'completed',
    replyId: normalizedReplyId,
    status: String(patch.status || 'completed').trim() || 'completed',
    threadId: String(patch.threadId || '').trim(),
    assistantMessagePreview: limitString(String(patch.message || '').trim(), 220),
    sessionTitle: patch.sessionTitle ? limitString(String(patch.sessionTitle).trim(), 120) : '',
    completedAt: new Date().toISOString(),
    responseSnapshot: cloneSnapshot(patch.responseSnapshot),
  }

  void appendEvent(event).catch((error) => {
    console.error('记录 Agent 监控完成事件失败', error)
  })

  return event
}

export function failAgentMonitorReply(replyId, error, extra = {}) {
  const normalizedReplyId = String(replyId || '').trim()
  if (!normalizedReplyId) {
    return null
  }

  const failedMessage = error instanceof Error ? error.message : String(error || '执行失败')
  const event = {
    entityType: 'reply',
    action: 'failed',
    replyId: normalizedReplyId,
    status: 'failed',
    failedAt: new Date().toISOString(),
    summary: failedMessage,
    stage: String(extra.stage || 'error').trim() || 'error',
    eventType: String(extra.eventType || 'error').trim() || 'error',
    requestSnapshot: cloneSnapshot(extra.requestSnapshot),
    responseSnapshot: cloneSnapshot(extra.responseSnapshot ?? { error: failedMessage }),
  }

  void appendEvent(event).catch((appendError) => {
    console.error('记录 Agent 监控失败事件失败', appendError)
  })

  return event
}

export async function listAgentMonitorUsers() {
  const grouped = new Map()
  for (const reply of hydrateReplyRecords(await readEvents())) {
    if (!grouped.has(reply.userId)) {
      grouped.set(reply.userId, {
        userId: reply.userId,
        userLabel: reply.userLabel,
        userEmail: reply.userEmail,
        replyCount: 0,
        sessionKeys: new Set(),
        lastActiveAt: reply.createdAt,
      })
    }
    const current = grouped.get(reply.userId)
    current.replyCount += 1
    current.sessionKeys.add(reply.sessionId)
    if (Date.parse(String(reply.createdAt || '')) >= Date.parse(String(current.lastActiveAt || ''))) {
      current.lastActiveAt = reply.createdAt
    }
  }

  return Array.from(grouped.values())
    .map((item) => ({
      userId: item.userId,
      userLabel: item.userLabel,
      userEmail: item.userEmail,
      replyCount: item.replyCount,
      sessionCount: item.sessionKeys.size,
      lastActiveAt: item.lastActiveAt,
    }))
    .sort((a, b) => Date.parse(String(b.lastActiveAt || '')) - Date.parse(String(a.lastActiveAt || '')))
}

export async function listAgentMonitorSessions(userId) {
  const grouped = new Map()
  for (const reply of hydrateReplyRecords(await readEvents()).filter((item) => String(item.userId) === String(userId || '').trim())) {
    if (!grouped.has(reply.sessionId)) {
      grouped.set(reply.sessionId, {
        sessionId: reply.sessionId,
        sessionTitle: reply.sessionTitle,
        threadId: reply.threadId,
        replyCount: 0,
        lastActiveAt: reply.createdAt,
        latestPreview: reply.assistantMessagePreview || reply.promptPreview,
      })
    }
    const current = grouped.get(reply.sessionId)
    current.replyCount += 1
    if (Date.parse(String(reply.createdAt || '')) >= Date.parse(String(current.lastActiveAt || ''))) {
      current.lastActiveAt = reply.createdAt
      current.threadId = reply.threadId
      current.latestPreview = reply.assistantMessagePreview || reply.promptPreview
      current.sessionTitle = reply.sessionTitle
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => Date.parse(String(b.lastActiveAt || '')) - Date.parse(String(a.lastActiveAt || '')))
}

export async function listAgentMonitorReplies(userId, sessionId) {
  return hydrateReplyRecords(await readEvents())
    .filter((reply) => String(reply.userId) === String(userId || '').trim() && String(reply.sessionId) === String(sessionId || '').trim())
    .map((reply) => ({
      replyId: reply.replyId,
      userId: reply.userId,
      userLabel: reply.userLabel,
      sessionId: reply.sessionId,
      sessionTitle: reply.sessionTitle,
      threadId: reply.threadId,
      summary: reply.summary,
      promptPreview: reply.promptPreview,
      assistantMessagePreview: reply.assistantMessagePreview,
      status: reply.status,
      createdAt: reply.createdAt,
      updatedAt: reply.updatedAt,
      stepCount: reply.stepCount,
    }))
}

export async function getAgentMonitorReplyDetail(replyId) {
  return hydrateReplyRecords(await readEvents()).find((item) => item.replyId === String(replyId || '').trim()) || null
}

export async function getAgentMonitorStepDetail(stepId) {
  const normalizedStepId = String(stepId || '').trim()
  for (const reply of hydrateReplyRecords(await readEvents())) {
    const matched = (reply.steps || []).find((item) => item.stepId === normalizedStepId)
    if (matched) {
      return matched
    }
  }
  return null
}
