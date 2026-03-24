import type { AIModelConfigItem, ModelOption } from '@/types/ai'

export interface DirectChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface DirectChatResult {
  text: string
  reasoning: string
  usage: {
    promptTokens: number
    completionTokens: number
  }
}

function sanitizeBaseUrl(baseUrl: string) {
  return String(baseUrl || '').trim().replace(/\/+$/, '')
}

function buildHeaders(config: AIModelConfigItem) {
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  }
}

async function parseError(response: Response, fallback: string) {
  const raw = await response.text()
  if (!raw) {
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string }
      message?: string
    }
    return parsed.error?.message || parsed.message || raw
  } catch {
    return raw
  }
}

function normalizeUsage(input: unknown) {
  const usage = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  return {
    promptTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0,
    completionTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0,
  }
}

function extractMessageText(message: unknown) {
  if (typeof message === 'string') {
    return message
  }
  if (Array.isArray(message)) {
    return message
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }
        if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).text === 'string') {
          return String((item as Record<string, unknown>).text)
        }
        return ''
      })
      .join('')
  }
  if (typeof message === 'object' && message !== null) {
    const record = message as Record<string, unknown>
    if (typeof record.content === 'string') {
      return record.content
    }
    if (Array.isArray(record.content)) {
      return extractMessageText(record.content)
    }
    if (typeof record.text === 'string') {
      return record.text
    }
  }
  return ''
}

function extractReasoning(choice: Record<string, unknown>) {
  const message = typeof choice.message === 'object' && choice.message !== null
    ? (choice.message as Record<string, unknown>)
    : {}
  if (typeof message.reasoning_content === 'string') {
    return message.reasoning_content
  }
  if (typeof message.reasoning === 'string') {
    return message.reasoning
  }
  return ''
}

export async function fetchBrowserDirectModels(config: AIModelConfigItem): Promise<ModelOption[]> {
  const baseUrl = sanitizeBaseUrl(config.baseUrl)
  if (!baseUrl) {
    throw new Error('请先填写 Base URL')
  }
  const response = await fetch(`${baseUrl}/models`, {
    method: 'GET',
    headers: buildHeaders(config),
  })
  if (!response.ok) {
    throw new Error(await parseError(response, '获取模型列表失败'))
  }
  const payload = await response.json() as { data?: Array<{ id?: string }> }
  const models = Array.isArray(payload?.data) ? payload.data : []
  return models
    .map((item) => String(item?.id || '').trim())
    .filter(Boolean)
    .map((id) => ({ id, label: id }))
}

export async function requestBrowserDirectChat(
  config: AIModelConfigItem,
  messages: DirectChatMessage[],
  options?: {
    temperature?: number | null
    responseFormat?: { type: 'json_object' }
  },
): Promise<DirectChatResult> {
  const baseUrl = sanitizeBaseUrl(config.baseUrl)
  if (!baseUrl) {
    throw new Error('请先填写 Base URL')
  }
  if (!config.model.trim()) {
    throw new Error('请先选择模型')
  }

  const payload: Record<string, unknown> = {
    model: config.model.trim(),
    messages,
    stream: false,
  }
  if (typeof options?.temperature === 'number') {
    payload.temperature = options.temperature
  } else if (typeof config.temperature === 'number') {
    payload.temperature = config.temperature
  }
  if (options?.responseFormat) {
    payload.response_format = options.responseFormat
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(await parseError(response, '模型请求失败'))
  }

  const result = await response.json() as {
    choices?: Array<Record<string, unknown>>
    usage?: unknown
  }
  const choice = Array.isArray(result.choices) ? result.choices[0] || {} : {}
  const message = typeof choice.message === 'object' && choice.message !== null
    ? (choice.message as Record<string, unknown>)
    : {}

  return {
    text: extractMessageText(message.content ?? message),
    reasoning: extractReasoning(choice),
    usage: normalizeUsage(result.usage),
  }
}
