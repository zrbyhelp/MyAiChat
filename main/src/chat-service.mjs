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
import { normalizeFormSchema, normalizeSuggestionItems } from './structured.mjs'

const DEFAULT_AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000'

export function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function getAgentServiceUrl() {
  return sanitizeBaseUrl(DEFAULT_AGENT_SERVICE_URL)
}

function getOpenAIBaseUrl(baseUrl) {
  return sanitizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

function buildHeaders(config) {
  return {
    'Content-Type': 'application/json',
    Authorization: config.apiKey ? `Bearer ${config.apiKey}` : '',
  }
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

export function detectReasoningSupport(_provider, model) {
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

function buildAgentRequest(payload, user, session) {
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
      base_url: sanitizeBaseUrl(payload.baseUrl),
      api_key: String(payload.apiKey || ''),
      model: String(payload.model || ''),
      temperature: typeof payload.temperature === 'number' ? payload.temperature : 0.7,
    },
    robot: {
      name: robot?.name || payload.robotName || '当前智能体',
      avatar: robot?.avatar || '',
      common_prompt: String(robot?.commonPrompt || ''),
      system_prompt: robot?.systemPrompt || payload.systemPrompt || '',
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
    structured_memory_interval: structuredMemoryInterval,
    structured_memory_history_limit: structuredMemoryHistoryLimit,
  }
}

async function requestAgentRun(payload, user) {
  const session = await getSessionRecord(user, payload.sessionId)
  const endpoint = `${getAgentServiceUrl()}/runs/stream`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildAgentRequest(payload, user, session)),
    })

    if (!response.ok) {
      throw new Error((await response.text()) || 'Agent 请求失败')
    }

    return { response, session }
  } catch (error) {
    throw new Error(describeFetchError(error, endpoint, '智能体请求'))
  }
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
    messages: nextMessages,
    memory: existing?.memory,
    memorySchema: normalizeMemorySchema(existing?.memorySchema || payload.robot?.memorySchema),
    structuredMemory: normalizeStructuredMemory(result.memory || existing?.structuredMemory),
    numericState:
      typeof result.numericState === 'object' && result.numericState !== null
        ? result.numericState
        : existing?.numericState || {},
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
    throw new Error('Agent 流式请求失败')
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

  while (true) {
    const { value, done } = await reader.read()
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

      if (parsed.type === 'message_delta' && parsed.text) {
        finalMessage += String(parsed.text)
      }
      if (parsed.type === 'message_done' && parsed.text) {
        finalMessage = String(parsed.text)
      }
      if (parsed.type === 'memory_updated' && parsed.memory) {
        finalMemory = normalizeStructuredMemory(parsed.memory)
      }
      if (parsed.type === 'suggestion') {
        finalSuggestions = normalizeSuggestionItems(parsed.items)
        finalForm = null
      }
      if (parsed.type === 'form') {
        finalForm = normalizeFormSchema(parsed.form)
        finalSuggestions = []
      }
      if (parsed.type === 'usage') {
        finalUsage = normalizeUsage(parsed)
      }
      if (parsed.type === 'numeric_state_updated' && parsed.state) {
        finalNumericState = parsed.state
      }
      if (parsed.type === 'run_completed') {
        finalThreadId = String(parsed.threadId || finalThreadId)
        finalMessage = String(parsed.message || finalMessage)
        finalSuggestions = normalizeSuggestionItems(parsed.suggestions || finalSuggestions)
        finalForm = normalizeFormSchema(parsed.form || finalForm)
        finalMemory = normalizeStructuredMemory(parsed.memory || finalMemory)
        finalNumericState =
          typeof parsed.numeric_state === 'object' && parsed.numeric_state !== null
            ? parsed.numeric_state
            : typeof parsed.numericState === 'object' && parsed.numericState !== null
              ? parsed.numericState
              : finalNumericState
        finalUsage = normalizeUsage(parsed.usage || finalUsage)
      }

      await onEvent?.(parsed)
    }
  }

  const savedSession = await commitSession(payload, user, {
    threadId: finalThreadId,
    message: finalMessage,
    suggestions: finalSuggestions,
    form: finalForm,
    numericState: finalNumericState,
    memory: finalMemory,
    usage: finalUsage,
  }, session)

  return {
    message: finalMessage,
    suggestions: finalSuggestions,
    form: finalForm,
    numericState: finalNumericState,
    memory: finalMemory,
    usage: finalUsage,
    session: savedSession,
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
  if (payload.type === 'message_delta' && payload.text) {
    sendSSE(res, { type: 'text', text: payload.text })
    return
  }

  if (payload.type === 'message_done') {
    sendSSE(res, { type: 'ui_loading', message: '正在生成交互 UI' })
    return
  }

  if (payload.type === 'suggestion') {
    sendSSE(res, {
      type: 'suggestion',
      items: normalizeSuggestionItems(payload.items),
    })
    return
  }

  if (payload.type === 'form') {
    sendSSE(res, {
      type: 'form',
      form: normalizeFormSchema(payload.form),
    })
    return
  }

  if (payload.type === 'memory_started') {
    sendSSE(res, {
      type: 'memory_status',
      status: 'running',
      message: '正在整理结构化记忆',
    })
    return
  }

  if (payload.type === 'memory_updated' && payload.memory) {
    sendSSE(res, { type: 'structured_memory', memory: payload.memory })
    sendSSE(res, {
      type: 'memory_status',
      status: 'running',
      message: '正在保存会话到数据库',
    })
    return
  }

  if (payload.type === 'numeric_state_updated') {
    sendSSE(res, {
      type: 'numeric_state_updated',
      state: payload.state,
      summary: payload.summary || '',
    })
    return
  }

  if (payload.type === 'usage') {
    sendSSE(res, {
      type: 'usage',
      promptTokens: payload.prompt_tokens ?? payload.promptTokens ?? payload.input_tokens ?? 0,
      completionTokens: payload.completion_tokens ?? payload.completionTokens ?? payload.output_tokens ?? 0,
    })
    return
  }
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
  const baseUrl = getOpenAIBaseUrl(normalized.baseUrl)

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: buildHeaders(normalized),
    })
    if (!response.ok) {
      throw new Error((await response.text()) || 'OpenAI-compatible 模型列表获取失败')
    }

    const data = await response.json()
    return (data.data || [])
      .map((item) => ({
        id: item.id,
        label: item.id,
      }))
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
