import type { AIFormField, AIFormSchema, ChatSessionMessage, SuggestionOption } from '@/types/ai'

import type {
  ChatRenderContent,
  ChatRenderMessage,
  FormActivityContent,
  FormDraftValue,
  MemoryStatusState,
} from './useChatView.types'

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function formatMessageDatetime(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toISOString()
}

export function withMessageDatetimes(messages: ChatRenderMessage[], previousMessages: ChatRenderMessage[] = []) {
  const previousDatetimeById = new Map(
    previousMessages
      .filter((message) => message?.id && message?.datetime)
      .map((message) => [String(message.id), String(message.datetime)]),
  )

  return messages.map((message) => {
    const datetime =
      (typeof message.datetime === 'string' && message.datetime.trim()) ||
      (message.id ? previousDatetimeById.get(String(message.id)) : '') ||
      formatMessageDatetime()

    return {
      ...message,
      datetime,
    }
  })
}

function formatTimeSeparatorLabel(value?: string) {
  const date = value ? new Date(value) : new Date()
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  const timeText = date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const isSameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isSameDay) {
    return timeText
  }

  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()

  if (isYesterday) {
    return `昨天 ${timeText}`
  }

  const dateText = date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  })

  return `${dateText} ${timeText}`
}

export function withTimeSeparators(messages: ChatRenderMessage[]) {
  const result: ChatRenderMessage[] = []
  let previousTimestamp = 0

  for (const message of messages) {
    if (message.role === 'system') {
      result.push(message)
      continue
    }

    const timestamp = message.datetime ? new Date(message.datetime).getTime() : Number.NaN
    const shouldInsertSeparator =
      Number.isFinite(timestamp) &&
      (result.length === 0 || !previousTimestamp || timestamp - previousTimestamp >= 5 * 60 * 1000)

    if (shouldInsertSeparator) {
      result.push({
        id: `time-${message.id || timestamp}`,
        role: 'system',
        content: formatTimeSeparatorLabel(message.datetime)
          ? [
              {
                type: 'text',
                data: formatTimeSeparatorLabel(message.datetime),
              },
            ]
          : [],
      })
    }

    result.push(message)

    if (Number.isFinite(timestamp)) {
      previousTimestamp = timestamp
    }
  }

  return result
}

export function withSystemStatusMessages(
  messages: ChatRenderMessage[],
  statuses: Array<{ key: string; text: string }>,
) {
  const result = [...messages]
  statuses.forEach((status, index) => {
    const text = status.text.trim()
    if (!text) {
      return
    }
    result.push({
      id: `status-${status.key}-${index}`,
      role: 'system',
      content: [
        {
          type: 'markdown',
          data: `**${text}**`,
        },
      ],
    })
  })
  return result
}

export function extractActivityFormSchema(content: ChatRenderContent): AIFormSchema | null {
  if (content?.type !== 'activity-form') {
    return null
  }

  const data = asRecord(content.data)
  const schema = data.content as AIFormSchema | undefined
  return schema?.fields?.length ? schema : null
}

export function createFormActivityContent(
  schema: AIFormSchema,
  slotName = `activity-form-${Date.now()}-${Math.random().toString(16).slice(2)}`,
): FormActivityContent {
  return {
    type: 'activity-form',
    slotName,
    data: {
      activityType: 'form',
      content: schema,
    },
  }
}

export function createLoadingActivityContent(
  text = '正在生成交互 UI',
  slotName = `activity-loading-${Date.now()}-${Math.random().toString(16).slice(2)}`,
) {
  return {
    type: 'activity-loading',
    slotName,
    data: {
      activityType: 'loading',
      text,
    },
  }
}

export function createMemoryStatusContent(
  status: 'running' | 'success' | 'error',
  text: string,
): MemoryStatusState {
  return {
    status,
    text,
  }
}

export function buildMemoryStatusMarkdown(status: 'running' | 'success' | 'error', text: string) {
  const statusLabel = status === 'running' ? '处理中' : status === 'success' ? '已完成' : '异常'
  return `<!--memory-status:${status}-->\n> **${statusLabel}**  \n> ${text}`
}

export function createSuggestionContent(items: SuggestionOption[]) {
  return {
    type: 'suggestion',
    data: items.map((item) => ({
      title: item.title,
      prompt: item.prompt,
    })),
  }
}

export function createInitialFormValues(schema: AIFormSchema) {
  return schema.fields.reduce<Record<string, FormDraftValue>>((result, field) => {
    const expectsArray = field.type === 'checkbox' || (field.type === 'select' && field.multiple)
    if (expectsArray) {
      if (Array.isArray(field.defaultValue)) {
        result[field.name] = [...field.defaultValue]
      } else if (typeof field.defaultValue === 'string' && field.defaultValue.trim()) {
        result[field.name] = [field.defaultValue]
      } else {
        result[field.name] = []
      }
    } else if (Array.isArray(field.defaultValue)) {
      result[field.name] = field.defaultValue[0] ?? ''
    } else if (typeof field.defaultValue === 'string') {
      result[field.name] = field.defaultValue
    } else if (field.type === 'checkbox' || (field.type === 'select' && field.multiple)) {
      result[field.name] = []
    } else {
      result[field.name] = ''
    }
    return result
  }, {})
}

export function getFormFieldLabel(field: AIFormField, value: FormDraftValue | undefined) {
  if (Array.isArray(value)) {
    const labels = value
      .map((item) => field.options?.find((option) => option.value === item)?.label || String(item))
      .filter(Boolean)
    return labels.join('、')
  }

  if (typeof value === 'string' && field.options?.length) {
    return field.options.find((option) => option.value === value)?.label || value
  }

  return String(value ?? '')
}

export function buildFormPrompt(schema: AIFormSchema, values: Record<string, FormDraftValue>) {
  const lines = [schema.title ? `已填写表单《${schema.title}》` : '已填写表单']
  schema.fields.forEach((field) => {
    const value = values[field.name]
    if (
      Array.isArray(value) ? value.length : value !== '' && value !== null && value !== undefined
    ) {
      lines.push(`${field.label}：${getFormFieldLabel(field, value)}`)
    }
  })
  return lines.join('\n')
}

export function serializeChatMessages(messages: ChatRenderMessage[]): ChatSessionMessage[] {
  return messages
    .filter((message) => message?.role === 'user' || message?.role === 'assistant')
    .map((message, index) => {
      const content = Array.isArray(message.content) ? message.content : []
      const markdownParts = content
        .filter((item) => item?.type === 'markdown' && typeof item?.data === 'string')
        .map((item) => String(item.data))
      const textParts = content
        .filter((item) => item?.type === 'text' && typeof item?.data === 'string')
        .map((item) => String(item.data))
      const thinkingParts = content
        .filter((item) => item?.type === 'thinking')
        .map((item) => {
          const data = asRecord(item.data)
          return typeof data.text === 'string' ? data.text : ''
        })
        .filter(Boolean)
      const suggestionContent = content.find((item) => item?.type === 'suggestion')
      const formContent = content.find((item) => item?.type === 'activity-form')
      const formSchema = formContent ? extractActivityFormSchema(formContent) : null
      const suggestionItems = Array.isArray(suggestionContent?.data)
        ? suggestionContent.data
            .map((item) => asRecord(item))
            .filter((item) => typeof item.title === 'string' && typeof item.prompt === 'string')
            .map((item) => ({
              title: String(item.title),
              prompt: String(item.prompt),
            }))
        : []

      return {
        id: String(message.id || `message-${index + 1}`),
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content:
          message.role === 'assistant'
            ? markdownParts.join('')
            : [...textParts, ...markdownParts].join(''),
        reasoning: message.role === 'assistant' ? thinkingParts.join('') : '',
        suggestions: message.role === 'assistant' ? suggestionItems : [],
        form: message.role === 'assistant' ? formSchema : null,
        createdAt: typeof message.datetime === 'string' && message.datetime ? message.datetime : formatMessageDatetime(),
      }
    })
}
