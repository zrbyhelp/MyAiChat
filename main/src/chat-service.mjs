import {
  CHOICE_PROTOCOL_PROMPT,
  FORM_PROTOCOL_PROMPT,
  MAX_MESSAGE_HISTORY,
} from './constants.mjs'
import {
  createSessionTitle,
  getSessionRecord,
  normalizeModelConfig,
  normalizeSession,
  normalizeSessionMemory,
  normalizeSessionRobot,
  normalizeSessionUsage,
  readModelConfigs,
  saveSessionRecord,
} from './storage.mjs'
import {
  consumeStructuredStreamChunk,
  createStructuredStreamParser,
  extractStructuredPayloadsFromText,
  finalizeStructuredStream,
  normalizeFormSchema,
  normalizeSuggestionItems,
  safeJsonParse,
} from './structured.mjs'

export function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

export function getOpenAIBaseUrl(baseUrl) {
  return sanitizeBaseUrl(baseUrl).replace(/\/v1$/i, '')
}

export function buildHeaders(config) {
  const headers = {
    'Content-Type': 'application/json',
  }

  if (config.provider === 'openai' && config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`
  }

  return headers
}

function describeFetchError(error, config, actionLabel) {
  if (!(error instanceof Error)) {
    return `${actionLabel}失败`
  }

  const baseUrl = config?.provider === 'openai' ? getOpenAIBaseUrl(config?.baseUrl) : sanitizeBaseUrl(config?.baseUrl)
  if (error.message === 'fetch failed') {
    return `${actionLabel}失败，无法连接到 ${baseUrl || '上游服务'}`
  }

  if (/ECONNREFUSED|actively refused|积极拒绝|connect/i.test(error.message)) {
    return `${actionLabel}失败，目标服务拒绝连接：${baseUrl || '上游服务'}`
  }

  return `${actionLabel}失败：${error.message}`
}

export function detectReasoningSupport(provider, model) {
  if (!model) {
    return false
  }
  const reasoningPattern = /(deepseek-reasoner|deepseek-r1|qwq|qwen3|reasoner|thinking|r1)/i
  if (provider === 'openai') {
    return /^o\d/i.test(model) || /^gpt-5/i.test(model) || reasoningPattern.test(model)
  }
  return reasoningPattern.test(model)
}

export function extractText(value) {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (item?.type === 'text') {
          return item.text ?? ''
        }
        if (typeof item?.text === 'string') {
          return item.text
        }
        if (typeof item?.content === 'string') {
          return item.content
        }
        return ''
      })
      .join('')
  }
  if (typeof value.text === 'string') {
    return value.text
  }
  return ''
}

function normalizeUsage(input) {
  return normalizeSessionUsage({
    promptTokens: input?.promptTokens ?? input?.prompt_tokens ?? input?.prompt_eval_count,
    completionTokens: input?.completionTokens ?? input?.completion_tokens ?? input?.eval_count ?? input?.output_tokens,
  })
}

function extractReasoningFromOpenAIMessage(message) {
  return extractText(message?.reasoning || message?.reasoning_content || message?.reasoningContent)
}

function buildSystemPrompt(systemPrompt) {
  const basePrompt = String(systemPrompt || '').trim()
  const protocolPrompt = `${CHOICE_PROTOCOL_PROMPT}\n\n${FORM_PROTOCOL_PROMPT}`
  return basePrompt ? `${basePrompt}\n\n${protocolPrompt}` : protocolPrompt
}

function buildMemoryPrompt(summary) {
  const compact = String(summary || '').trim()
  if (!compact) {
    return ''
  }
  return [
    '以下是当前会话的长期记忆摘要，仅用于保持上下文连续性。若与用户最新表达冲突，以用户最新表达为准。',
    '',
    '<session_memory>',
    compact,
    '</session_memory>',
  ].join('\n')
}

export async function getSessionMessages(payload) {
  const session = await getSessionRecord(payload.sessionId)
  const memory = normalizeSessionMemory(session?.memory)
  const history = (session?.messages || []).slice(-memory.recentMessageLimit)
  const messages = []

  const systemPrompt = buildSystemPrompt(payload.systemPrompt)
  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    })
  }

  const memoryPrompt = buildMemoryPrompt(memory.summary)
  if (memoryPrompt) {
    messages.push({
      role: 'system',
      content: memoryPrompt,
    })
  }

  for (const item of history) {
    messages.push({
      role: item.role,
      content: item.content,
    })
  }

  messages.push({
    role: 'user',
    content: payload.prompt,
  })

  return messages
}

export async function commitSession(payload, assistantMessage, reasoning = '', suggestions = [], form = null, usage = null) {
  const now = new Date().toISOString()
  const existing = await getSessionRecord(payload.sessionId)
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
    content: String(assistantMessage || ''),
    reasoning: String(reasoning || ''),
    suggestions: normalizeSuggestionItems(suggestions),
    form: normalizeFormSchema(form),
    createdAt: now,
  })

  const normalizedSuggestions = normalizeSuggestionItems(suggestions)
  const normalizedForm = normalizeFormSchema(form)
  const previewText = String(assistantMessage || normalizedForm?.title || normalizedSuggestions[0]?.title || payload.prompt || '')
  const existingUsage = normalizeSessionUsage(existing?.usage)
  const nextUsage = normalizeUsage(usage)

  return saveSessionRecord(normalizeSession({
    ...(existing || {}),
    id: payload.sessionId,
    title: existing?.messages?.length ? existing.title : createSessionTitle(payload.prompt),
    preview: previewText,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    robot: normalizeSessionRobot(payload.robot || { name: payload.robotName, systemPrompt: payload.systemPrompt }),
    modelConfigId: payload.modelConfigId || existing?.modelConfigId || '',
    modelLabel: payload.modelLabel || existing?.modelLabel || payload.model || '',
    messages: nextMessages.slice(-MAX_MESSAGE_HISTORY),
    memory: normalizeSessionMemory(existing?.memory),
    usage: {
      promptTokens: existingUsage.promptTokens + nextUsage.promptTokens,
      completionTokens: existingUsage.completionTokens + nextUsage.completionTokens,
    },
  }))
}

export async function fetchModels(config) {
  const normalized = normalizeModelConfig(config, 0)
  const baseUrl = normalized.provider === 'openai' ? getOpenAIBaseUrl(normalized.baseUrl) : sanitizeBaseUrl(normalized.baseUrl)

  try {
    if (normalized.provider === 'openai') {
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: buildHeaders(normalized),
      })
      if (!response.ok) {
        throw new Error((await response.text()) || 'OpenAI 模型列表获取失败')
      }

      const data = await response.json()
      return (data.data || [])
        .map((item) => ({
          id: item.id,
          label: item.id,
        }))
        .sort((left, right) => left.label.localeCompare(right.label))
    }

    const response = await fetch(`${baseUrl}/api/tags`)
    if (!response.ok) {
      throw new Error((await response.text()) || 'Ollama 模型列表获取失败')
    }

    const data = await response.json()
    return (data.models || []).map((item) => ({
      id: item.model || item.name,
      label: item.name || item.model,
    }))
  } catch (error) {
    throw new Error(describeFetchError(error, normalized, '获取模型列表'))
  }
}

async function buildUpstreamBody(payload, stream = true) {
  const base = {
    model: payload.model,
    messages: payload.messages || await getSessionMessages(payload),
    stream,
  }

  if (typeof payload.temperature === 'number') {
    base.temperature = payload.temperature
  }

  if (payload.provider === 'ollama') {
    return {
      ...base,
      think: Boolean(payload.thinking),
      options: typeof payload.temperature === 'number' ? { temperature: payload.temperature } : undefined,
    }
  }

  return {
    ...base,
    reasoning: payload.thinking ? { effort: 'medium' } : undefined,
    stream_options: payload.provider === 'openai' && stream ? { include_usage: true } : undefined,
  }
}

async function requestUpstreamChat(payload, stream) {
  const endpoint =
    payload.provider === 'openai'
      ? `${getOpenAIBaseUrl(payload.baseUrl)}/v1/chat/completions`
      : `${sanitizeBaseUrl(payload.baseUrl)}/api/chat`

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(payload),
      body: JSON.stringify(await buildUpstreamBody(payload, stream)),
    })

    if (!response.ok) {
      throw new Error((await response.text()) || '聊天请求失败')
    }

    return response
  } catch (error) {
    throw new Error(describeFetchError(error, payload, '聊天请求'))
  }
}

export async function requestNonStreamChat(payload) {
  const response = await requestUpstreamChat(payload, false)
  const data = await response.json()

  if (payload.provider === 'openai') {
    const message = data.choices?.[0]?.message || {}
    const parsedMessage = extractStructuredPayloadsFromText(extractText(message.content))
    const reasoning = payload.thinking ? extractReasoningFromOpenAIMessage(message) : ''
    const session = await commitSession(payload, parsedMessage.text, reasoning, parsedMessage.suggestions, parsedMessage.form, normalizeUsage(data.usage))
    return { message: parsedMessage.text, reasoning, suggestions: parsedMessage.suggestions, form: parsedMessage.form, session }
  }

  const parsedMessage = extractStructuredPayloadsFromText(extractText(data.message?.content))
  const reasoning = payload.thinking ? extractText(data.message?.thinking || data.thinking) : ''
  const session = await commitSession(payload, parsedMessage.text, reasoning, parsedMessage.suggestions, parsedMessage.form, normalizeUsage(data))
  return { message: parsedMessage.text, reasoning, suggestions: parsedMessage.suggestions, form: parsedMessage.form, session }
}

function serializeMessagesForSummary(messages) {
  return messages
    .map((item) => `[${item.role === 'assistant' ? '助手' : '用户'}]\n${String(item.content || '').trim()}`)
    .join('\n\n')
}

async function requestSummary(payload, existingSummary, newMessages) {
  const messages = [
    {
      role: 'system',
      content: [
        '请根据旧摘要和新增对话，输出一份新的完整中文会话摘要。',
        '要求：',
        '1. 只输出摘要正文，不要加标题，不要输出 JSON。',
        '2. 保留重要上下文、用户偏好、约束、任务进展和仍未解决的问题。',
        '3. 内容尽量精炼，但不要遗漏后续对话需要继续依赖的信息。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '旧摘要：',
        existingSummary?.trim() || '（无）',
        '',
        '新增对话：',
        serializeMessagesForSummary(newMessages),
      ].join('\n'),
    },
  ]

  const response = await requestUpstreamChat({ ...payload, thinking: false, messages }, false)
  const data = await response.json()

  return payload.provider === 'openai'
    ? extractText(data.choices?.[0]?.message?.content).trim()
    : extractText(data.message?.content).trim()
}

function getMemoryRefreshState(session) {
  const memory = normalizeSessionMemory(session?.memory)
  const compressibleCount = Math.max((session?.messages?.length || 0) - memory.recentMessageLimit, 0)
  const uncoveredCount = Math.max(compressibleCount - memory.sourceMessageCount, 0)

  return {
    memory,
    compressibleCount,
    uncoveredCount,
    shouldRefresh: uncoveredCount >= memory.threshold,
  }
}

export async function refreshSessionMemoryIfNeeded(session, payload, notify) {
  const latestSession = (await getSessionRecord(session.id)) || session
  const { memory, compressibleCount, uncoveredCount, shouldRefresh } = getMemoryRefreshState(latestSession)
  if (!shouldRefresh) {
    return latestSession
  }

  const newMessages = latestSession.messages.slice(memory.sourceMessageCount, compressibleCount)
  if (!newMessages.length) {
    return latestSession
  }

  notify?.({ status: 'running', message: '正在整理长期记忆...' })

  try {
    const summary = await requestSummary(payload, memory.summary, newMessages)
    const nextSession = await saveSessionRecord({
      ...latestSession,
      memory: {
        ...memory,
        summary,
        updatedAt: new Date().toISOString(),
        sourceMessageCount: compressibleCount,
      },
      updatedAt: new Date().toISOString(),
    })
    notify?.({ status: 'success', message: `长期记忆已更新（整理 ${uncoveredCount} 条消息）` })
    return nextSession
  } catch (error) {
    notify?.({ status: 'error', message: `长期记忆整理失败：${error instanceof Error ? error.message : '未知错误'}` })
    return latestSession
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

async function finalizeAndRefreshMemory(payload, session, res) {
  await refreshSessionMemoryIfNeeded(session, payload, (status) => {
    sendSSE(res, { type: 'memory_status', ...status })
  })
}

export async function proxyOpenAIStream(payload, res) {
  const response = await requestUpstreamChat(payload, true)
  if (!response.body) {
    throw new Error('OpenAI 流式请求失败')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistantText = ''
  let reasoningText = ''
  let usage = normalizeUsage(null)
  const structuredParser = createStructuredStreamParser()

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''

    for (const part of parts) {
      const lines = part.split('\n').map((line) => line.trim()).filter(Boolean)

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue
        }

        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          continue
        }

        const parsed = safeJsonParse(data, null)
        const delta = parsed?.choices?.[0]?.delta || {}
        const text = extractText(delta.content)
        const reasoning = extractText(delta.reasoning || delta.reasoning_content || delta.reasoningContent)
        if (parsed?.usage) {
          usage = normalizeUsage(parsed.usage)
        }

        if (payload.thinking && reasoning) {
          reasoningText += reasoning
          sendSSE(res, { type: 'reasoning', text: reasoning })
        }
        if (text) {
          const visibleText = consumeStructuredStreamChunk(structuredParser, text)
          if (visibleText) {
            assistantText += visibleText
            sendSSE(res, { type: 'text', text: visibleText })
          }
        }
      }
    }
  }

  const finalized = finalizeStructuredStream(structuredParser)
  if (finalized.text) {
    assistantText += finalized.text
    sendSSE(res, { type: 'text', text: finalized.text })
  }

  const session = await commitSession(payload, assistantText, reasoningText, finalized.suggestions, finalized.form, usage)
  sendUsageSSE(res, session)
  if (finalized.suggestions.length) {
    sendSSE(res, { type: 'suggestion', items: finalized.suggestions })
  }
  if (finalized.form?.fields?.length) {
    sendSSE(res, { type: 'form', form: finalized.form })
  }
  if (payload.thinking && reasoningText) {
    sendSSE(res, { type: 'reasoning_done', text: reasoningText })
  }
  await finalizeAndRefreshMemory(payload, session, res)
  sendSSE(res, { type: 'done' })
}

export async function proxyOllamaStream(payload, res) {
  const response = await requestUpstreamChat(payload, true)
  if (!response.body) {
    throw new Error('Ollama 流式请求失败')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistantText = ''
  let reasoningText = ''
  let usage = normalizeUsage(null)
  const structuredParser = createStructuredStreamParser()

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }

      const parsed = safeJsonParse(line, null)
      if (!parsed) {
        continue
      }

      usage = normalizeUsage(parsed)

      const reasoning = extractText(parsed.message?.thinking || parsed.thinking)
      const text = extractText(parsed.message?.content)

      if (payload.thinking && reasoning) {
        reasoningText += reasoning
        sendSSE(res, { type: 'reasoning', text: reasoning })
      }
      if (text) {
        const visibleText = consumeStructuredStreamChunk(structuredParser, text)
        if (visibleText) {
          assistantText += visibleText
          sendSSE(res, { type: 'text', text: visibleText })
        }
      }
      if (parsed.done) {
        const finalized = finalizeStructuredStream(structuredParser)
        if (finalized.text) {
          assistantText += finalized.text
          sendSSE(res, { type: 'text', text: finalized.text })
        }
        const session = await commitSession(payload, assistantText, reasoningText, finalized.suggestions, finalized.form, usage)
        sendUsageSSE(res, session)
        if (finalized.suggestions.length) {
          sendSSE(res, { type: 'suggestion', items: finalized.suggestions })
        }
        if (finalized.form?.fields?.length) {
          sendSSE(res, { type: 'form', form: finalized.form })
        }
        if (payload.thinking && reasoningText) {
          sendSSE(res, { type: 'reasoning_done', text: reasoningText })
        }
        await finalizeAndRefreshMemory(payload, session, res)
        sendSSE(res, { type: 'done' })
        return
      }
    }
  }

  const finalized = finalizeStructuredStream(structuredParser)
  if (finalized.text) {
    assistantText += finalized.text
    sendSSE(res, { type: 'text', text: finalized.text })
  }

  const session = await commitSession(payload, assistantText, reasoningText, finalized.suggestions, finalized.form, usage)
  sendUsageSSE(res, session)
  if (finalized.suggestions.length) {
    sendSSE(res, { type: 'suggestion', items: finalized.suggestions })
  }
  if (finalized.form?.fields?.length) {
    sendSSE(res, { type: 'form', form: finalized.form })
  }
  if (payload.thinking && reasoningText) {
    sendSSE(res, { type: 'reasoning_done', text: reasoningText })
  }
  await finalizeAndRefreshMemory(payload, session, res)
  sendSSE(res, { type: 'done' })
}

export async function handleChatStream(payload, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  })

  try {
    if (!payload.prompt || !payload.model) {
      throw new Error('prompt 和 model 不能为空')
    }

    if (!payload.stream) {
      const result = await requestNonStreamChat(payload)
      sendUsageSSE(res, result.session)
      if (payload.thinking && result.reasoning) {
        sendSSE(res, { type: 'reasoning', text: result.reasoning })
        sendSSE(res, { type: 'reasoning_done', text: result.reasoning })
      }
      if (result.message) {
        sendSSE(res, { type: 'text', text: result.message })
      }
      if (result.suggestions?.length) {
        sendSSE(res, { type: 'suggestion', items: result.suggestions })
      }
      if (result.form?.fields?.length) {
        sendSSE(res, { type: 'form', form: result.form })
      }
      await finalizeAndRefreshMemory(payload, result.session, res)
      sendSSE(res, { type: 'done' })
    } else if (payload.provider === 'openai') {
      await proxyOpenAIStream(payload, res)
    } else {
      await proxyOllamaStream(payload, res)
    }
  } catch (error) {
    sendSSE(res, {
      type: 'error',
      message: error instanceof Error ? error.message : '流式请求失败',
    })
  } finally {
    res.end()
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

export async function getActiveLegacyConfig() {
  const legacy = await readModelConfigs()
  return { config: legacy.configs.find((item) => item.id === legacy.activeModelConfigId) ?? legacy.configs[0] }
}
