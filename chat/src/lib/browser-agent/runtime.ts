import { normalizeMemorySchema } from '@/hooks/chat-view/useChatSessionStateManager'
import { requestBrowserDirectChat } from '@/lib/browser-agent/openai-compatible'
import type {
  AIFormField,
  AIFormSchema,
  AIModelConfigItem,
  ChatSessionMessage,
  MemorySchemaField,
  MemorySchemaState,
  NumericComputationItem,
  SessionRobotState,
  StructuredMemoryCategory,
  StructuredMemoryItem,
  StructuredMemoryState,
  StructuredMemoryValue,
  SuggestionOption,
} from '@/types/ai'

type UsageState = {
  promptTokens: number
  completionTokens: number
}

type RuntimeEvent =
  | { type: 'reasoning'; text: string }
  | { type: 'text'; text: string }
  | { type: 'ui_loading'; text: string }
  | { type: 'suggestion'; items: SuggestionOption[] }
  | { type: 'form'; form: AIFormSchema | null }
  | { type: 'memory_status'; status: 'running' | 'success' | 'error'; text: string }
  | { type: 'usage'; usage: UsageState }
  | { type: 'numeric_state_updated'; state: Record<string, unknown> }
  | { type: 'structured_memory'; memory: StructuredMemoryState }

export interface BrowserDirectAgentRequest {
  prompt: string
  modelConfig: AIModelConfigItem
  sessionRobot: SessionRobotState
  history: ChatSessionMessage[]
  memorySchema: MemorySchemaState
  structuredMemory: StructuredMemoryState
  numericState: Record<string, unknown>
  structuredMemoryHistoryLimit: number
}

export interface BrowserDirectAgentResult {
  text: string
  reasoning: string
  suggestions: SuggestionOption[]
  form: AIFormSchema | null
  numericState: Record<string, unknown>
  structuredMemory: StructuredMemoryState
  usage: UsageState
}

function utcNow() {
  return new Date().toISOString()
}

function addUsage(left: UsageState, right?: Partial<UsageState> | null) {
  return {
    promptTokens: left.promptTokens + Number(right?.promptTokens || 0),
    completionTokens: left.completionTokens + Number(right?.completionTokens || 0),
  }
}

function composeSystemPrompt(...sections: string[]) {
  return sections
    .map((section) => String(section || '').trim())
    .filter(Boolean)
    .join('\n\n')
}

function parseJsonObject(raw: string, fallback: Record<string, unknown>) {
  let text = String(raw || '').trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/```$/, '').trim()
  }
  try {
    const parsed = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : fallback
  } catch {
    return fallback
  }
}

function normalizeUiSuggestions(input: unknown): SuggestionOption[] {
  const items = Array.isArray(input) ? input : []
  return items
    .map((item) => {
      const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
      const title = String(record.title ?? record.t ?? '').trim()
      const prompt = String(record.prompt ?? record.p ?? title).trim()
      return title ? { title, prompt: prompt || title } : null
    })
    .filter((item): item is SuggestionOption => Boolean(item))
}

function normalizeUiOptions(input: unknown) {
  const items = Array.isArray(input) ? input : []
  return items
    .map((item) => {
      const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
      const label = String(record.label ?? record.l ?? record.value ?? record.v ?? '').trim()
      const value = String(record.value ?? record.v ?? record.label ?? record.l ?? '').trim()
      return label && value ? { label, value } : null
    })
    .filter((item): item is { label: string; value: string } => Boolean(item))
}

function normalizeUiForm(input: unknown): AIFormSchema | null {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : null
  if (!record) {
    return null
  }
  const rawFields = Array.isArray(record.fields) ? record.fields : Array.isArray(record.fs) ? record.fs : []
  const fields = rawFields.reduce<AIFormField[]>((acc, field, index) => {
      const fieldRecord = typeof field === 'object' && field !== null ? (field as Record<string, unknown>) : {}
      const type = String(fieldRecord.type ?? fieldRecord.t ?? 'input').trim()
      const normalizedType = ['input', 'radio', 'checkbox', 'select'].includes(type) ? type : 'input'
      const name = String(fieldRecord.name ?? fieldRecord.n ?? `field_${index + 1}`).trim()
      const label = String((fieldRecord.label ?? fieldRecord.l ?? name) || `字段 ${index + 1}`).trim()
      if (!name || !label) {
        return acc
      }
      acc.push({
        name,
        label,
        type: normalizedType as 'input' | 'radio' | 'checkbox' | 'select',
        placeholder: String(fieldRecord.placeholder ?? fieldRecord.p ?? '').trim(),
        required: Boolean(fieldRecord.required ?? fieldRecord.r),
        inputType: String(fieldRecord.inputType ?? fieldRecord.it ?? '').trim() === 'number' ? 'number' : 'text',
        multiple: Boolean(fieldRecord.multiple ?? fieldRecord.m),
        options: normalizeUiOptions(fieldRecord.options ?? fieldRecord.o),
        defaultValue: (fieldRecord.defaultValue ?? fieldRecord.d ?? '') as string | string[],
      })
      return acc
    }, [])
  if (!fields.length) {
    return null
  }
  return {
    title: String(record.title ?? record.ti ?? '请补充信息').trim(),
    description: String(record.description ?? record.de ?? '').trim(),
    submitText: String(record.submitText ?? record.st ?? '提交').trim(),
    fields,
  }
}

function normalizeUiPayload(input: unknown) {
  const record = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
  const form = normalizeUiForm(record.form ?? record.f)
  const suggestions = form ? [] : normalizeUiSuggestions(record.suggestions ?? record.s)
  return {
    suggestions: suggestions.length ? suggestions : form ? [] : [{ title: '继续', prompt: '继续' }],
    form,
  }
}

function normalizeNumericItems(items: NumericComputationItem[] | undefined) {
  const seen = new Set<string>()
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      name: String(item?.name || '').trim(),
      currentValue: Number(item?.currentValue),
      description: String(item?.description || '').trim(),
    }))
    .filter((item) => item.name && Number.isFinite(item.currentValue) && !seen.has(item.name) && seen.add(item.name))
}

function numericItemsDescriptionText(items: NumericComputationItem[]) {
  if (!items.length) {
    return '暂无字段说明。'
  }
  return items
    .map((item) => `- ${item.name}：默认值 ${item.currentValue}；说明：${item.description || '无'}`)
    .join('\n')
}

function numericItemsToSchema(items: NumericComputationItem[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.name] = Number(item.currentValue)
    return acc
  }, {})
}

function normalizeNumericState(schema: Record<string, number>, current: Record<string, unknown>, next: Record<string, unknown>) {
  return Object.keys(schema).reduce<Record<string, number>>((acc, key) => {
    const candidate = next[key]
    const fallback = current[key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      acc[key] = candidate
      return acc
    }
    if (typeof fallback === 'number' && Number.isFinite(fallback)) {
      acc[key] = fallback
      return acc
    }
    acc[key] = schema[key]!
    return acc
  }, {})
}

function numericPayloadForAnswerer(items: NumericComputationItem[], state: Record<string, unknown>) {
  return items.map((item) => ({
    name: item.name,
    currentValue:
      typeof state[item.name] === 'number' && Number.isFinite(state[item.name]) ? Number(state[item.name]) : item.currentValue,
    description: item.description,
  }))
}

function historyText(history: ChatSessionMessage[], limit: number) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 12
  const list = history.slice(-normalizedLimit)
  if (!list.length) {
    return '暂无历史消息。'
  }
  return list.map((item) => `${item.role}: ${item.content}`).join('\n')
}

function fieldTypeText(field: MemorySchemaField) {
  if (field.type === 'enum') {
    return `enum(${(field.options || []).map((item) => item.value).join(', ') || '无'})`
  }
  if (field.type === 'object') {
    return `object(${(field.fields || []).map((item) => item.name).join(', ') || '无子字段'})`
  }
  if (field.type === 'array') {
    if (field.itemType === 'enum') {
      return `array(enum:${(field.itemOptions || []).map((item) => item.value).join(', ') || '无'})`
    }
    if (field.itemType === 'object') {
      return `array(object:${(field.itemFields || []).map((item) => item.name).join(', ') || '无子字段'})`
    }
    return `array(${field.itemType || 'text'})`
  }
  return field.type
}

function schemaText(schema: MemorySchemaState) {
  if (!schema.categories.length) {
    return '暂无记忆 schema。'
  }
  return schema.categories
    .flatMap((category) => {
      const lines = [`- ${category.id} | ${category.label}`]
      if (category.description) {
        lines.push(`  描述：${category.description}`)
      }
      if (category.extractionInstructions) {
        lines.push(`  抽取说明：${category.extractionInstructions}`)
      }
      category.fields.forEach((field) => {
        lines.push(`  字段：${field.name} (${field.label}) / ${fieldTypeText(field)} / ${field.required ? '必填' : '可选'}`)
      })
      return lines
    })
    .join('\n')
}

function memoryText(memory: StructuredMemoryState) {
  if (!memory.categories.length) {
    return '暂无结构化记忆。'
  }
  const parts = memory.categories.flatMap((category) => {
    const lines = [`${category.label || category.categoryId}：`]
    category.items.slice(0, 8).forEach((item) => {
      const valueText = Object.entries(item.values || {})
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(', ')
      const summary = String(item.summary || '').trim()
      lines.push(`- ${summary || valueText || item.id}`)
      if (valueText && summary !== valueText) {
        lines.push(`  ${valueText}`)
      }
    })
    return lines
  })
  return parts.join('\n')
}

function normalizeScalar(value: unknown, fieldType: string, enumOptions?: Set<string>) {
  if (fieldType === 'number') {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : null
  }
  if (fieldType === 'boolean') {
    if (typeof value === 'boolean') {
      return value
    }
    const text = String(value || '').trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(text)) {
      return true
    }
    if (['false', '0', 'no', 'n'].includes(text)) {
      return false
    }
    return null
  }
  if (fieldType === 'enum') {
    const text = String(value || '').trim()
    return text && (!enumOptions || enumOptions.has(text)) ? text : null
  }
  const text = String(value || '').trim()
  return text || null
}

function normalizeFieldValue(field: MemorySchemaField, value: unknown): unknown {
  if (field.type === 'object') {
    const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
    const result = (field.fields || []).reduce<Record<string, unknown>>((acc, child) => {
      const childValue = normalizeFieldValue(child, source[child.name])
      if (childValue !== null && childValue !== undefined) {
        acc[child.name] = childValue
      }
      return acc
    }, {})
    return Object.keys(result).length ? result : null
  }
  if (field.type === 'array') {
    const items = Array.isArray(value) ? value : []
    const normalizedItems = items
      .slice(0, 20)
      .map((item) => {
        if (field.itemType === 'object') {
          const source = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
          const childResult = (field.itemFields || []).reduce<Record<string, unknown>>((acc, child) => {
            const childValue = normalizeFieldValue(child, source[child.name])
            if (childValue !== null && childValue !== undefined) {
              acc[child.name] = childValue
            }
            return acc
          }, {})
          return Object.keys(childResult).length ? childResult : null
        }
        return normalizeScalar(
          item,
          field.itemType || 'text',
          field.itemType === 'enum' ? new Set((field.itemOptions || []).map((option) => option.value)) : undefined,
        )
      })
      .filter((item) => item !== null && item !== undefined)
    return normalizedItems.length ? normalizedItems : null
  }
  return normalizeScalar(
    value,
    field.type,
    field.type === 'enum' ? new Set((field.options || []).map((option) => option.value)) : undefined,
  )
}

function defaultStructuredMemory(schema: MemorySchemaState): StructuredMemoryState {
  return {
    updatedAt: '',
    categories: schema.categories.map((category) => ({
      categoryId: category.id,
      label: category.label,
      description: category.description,
      updatedAt: '',
      items: [],
    })),
  }
}

function normalizeStructuredMemoryPatch(schema: MemorySchemaState, payload: Record<string, unknown>) {
  const categoryMap = new Map(
    (Array.isArray(payload.categories) ? payload.categories : [])
      .filter((item) => typeof item === 'object' && item !== null)
      .map((item) => {
        const record = item as Record<string, unknown>
        return [String(record.category_id ?? record.categoryId ?? ''), record] as const
      }),
  )
  return {
    updatedAt: String(payload.updated_at ?? payload.updatedAt ?? utcNow()),
    categories: schema.categories.map((category) => {
      const rawCategory = categoryMap.get(category.id) || {}
      const rawItems = Array.isArray(rawCategory.items) ? rawCategory.items : []
      return {
        categoryId: category.id,
        updatedAt: String(rawCategory.updated_at ?? rawCategory.updatedAt ?? (rawItems.length ? utcNow() : '')),
        items: rawItems
          .map((item, index) => {
            const record = typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
            const op = ['add', 'update', 'delete'].includes(String(record.op || '').toLowerCase())
              ? String(record.op).toLowerCase()
              : 'add'
            const id = String(record.id || '').trim() || `${category.id}_${index + 1}_${Date.now()}`
            if ((op === 'update' || op === 'delete') && !String(record.id || '').trim()) {
              return null
            }
            const valuesSource = typeof record.values === 'object' && record.values !== null ? (record.values as Record<string, unknown>) : {}
            const values = op === 'delete'
              ? {}
              : category.fields.reduce<Record<string, unknown>>((acc, field) => {
                  const normalized = normalizeFieldValue(field, valuesSource[field.name])
                  if (normalized !== null && normalized !== undefined) {
                    acc[field.name] = normalized
                  }
                  return acc
                }, {})
            if (op === 'add' && !Object.keys(values).length) {
              return null
            }
            if (op === 'update' && !Object.keys(values).length && !String(record.summary || '').trim()) {
              return null
            }
            return {
              op,
              id,
              summary: String(record.summary || '').trim(),
              sourceTurnId: String(record.source_turn_id ?? record.sourceTurnId ?? '').trim(),
              updatedAt: String(record.updated_at ?? record.updatedAt ?? utcNow()),
              values: values as Record<string, StructuredMemoryValue>,
            }
          })
          .filter((item): item is {
            op: string
            id: string
            summary: string
            sourceTurnId: string
            updatedAt: string
            values: Record<string, StructuredMemoryValue>
          } => Boolean(item)),
      }
    }),
  }
}

function mergeStructuredMemory(
  schema: MemorySchemaState,
  currentMemory: StructuredMemoryState,
  patchMemory: ReturnType<typeof normalizeStructuredMemoryPatch>,
): StructuredMemoryState {
  const currentMap = new Map(currentMemory.categories.map((category) => [category.categoryId, category]))
  const mergedCategories: StructuredMemoryCategory[] = schema.categories.map((category) => {
    const currentCategory = currentMap.get(category.id)
    const patchCategory = patchMemory.categories.find((item) => item.categoryId === category.id)
    const mergedItems: StructuredMemoryItem[] = [...(currentCategory?.items || []).map((item) => ({ ...item, values: { ...item.values } }))]
    for (const patchItem of patchCategory?.items || []) {
      const matchIndex = mergedItems.findIndex((item) => item.id === patchItem.id)
      if (patchItem.op === 'delete') {
        if (matchIndex >= 0) {
          mergedItems.splice(matchIndex, 1)
        }
        continue
      }
      if (patchItem.op === 'update') {
        if (matchIndex < 0) {
          continue
        }
        mergedItems[matchIndex] = {
          ...mergedItems[matchIndex]!,
          summary: patchItem.summary || mergedItems[matchIndex]!.summary,
          sourceTurnId: patchItem.sourceTurnId || mergedItems[matchIndex]!.sourceTurnId,
          updatedAt: patchItem.updatedAt || mergedItems[matchIndex]!.updatedAt,
          values: {
            ...mergedItems[matchIndex]!.values,
            ...patchItem.values,
          } as Record<string, StructuredMemoryValue>,
        }
        continue
      }
      mergedItems.push({
        id: patchItem.id,
        summary: patchItem.summary,
        sourceTurnId: patchItem.sourceTurnId,
        updatedAt: patchItem.updatedAt,
        values: { ...patchItem.values } as Record<string, StructuredMemoryValue>,
      })
    }
    return {
      categoryId: category.id,
      label: category.label,
      description: category.description,
      updatedAt:
        patchCategory?.items?.length
          ? utcNow()
          : currentCategory?.updatedAt || '',
      items: mergedItems,
    }
  })
  return {
    updatedAt: mergedCategories.some((category) => category.items.length) ? utcNow() : currentMemory.updatedAt,
    categories: mergedCategories,
  }
}

async function callJsonNode(
  config: AIModelConfigItem,
  messages: Array<{ role: 'system' | 'user'; content: string }>,
) {
  const response = await requestBrowserDirectChat(config, messages, {
    temperature: config.temperature,
    responseFormat: { type: 'json_object' },
  })
  return {
    raw: response.text,
    usage: response.usage,
    parsed: parseJsonObject(response.text, {}),
  }
}

export async function runBrowserDirectAgent(
  request: BrowserDirectAgentRequest,
  emit: (event: RuntimeEvent) => void,
): Promise<BrowserDirectAgentResult> {
  const schema = normalizeMemorySchema(request.memorySchema)
  const normalizedMemory = request.structuredMemory.categories.length
    ? request.structuredMemory
    : defaultStructuredMemory(schema)
  const numericItems = normalizeNumericItems(request.sessionRobot.numericComputationItems)
  let usage: UsageState = { promptTokens: 0, completionTokens: 0 }
  let numericState = normalizeNumericState(
    numericItemsToSchema(numericItems),
    {},
    request.numericState || {},
  )

  if (request.sessionRobot.numericComputationEnabled && numericItems.length) {
    const numericResponse = await callJsonNode(request.modelConfig, [
      {
        role: 'system',
        content: composeSystemPrompt(
          request.sessionRobot.commonPrompt,
          [
            '你是多智能体系统中的数值计算节点，用来在正文回复前根据上下文生成数值 JSON。',
            '你只能输出 JSON，不要输出解释。',
            '输出格式必须是一个 JSON 对象，字段必须严格遵循给定数值结构体。',
            '你必须根据用户传入的数值计算提示词修改当前 JSON 数据并输出。',
            '所有叶子字段都必须是 number，不能输出字符串、布尔值、null。',
            '不要输出 summary、explanation 或任何额外字段。',
            '',
            '用户配置的数值计算提示词：',
            request.sessionRobot.numericComputationPrompt || '未配置',
          ].join('\n'),
        ),
      },
      {
        role: 'user',
        content: [
          `主要故事设定：\n${request.sessionRobot.systemPrompt}`,
          `结构化记忆：\n${memoryText(normalizedMemory)}`,
          `数值字段定义：\n${numericItemsDescriptionText(numericItems)}`,
          `数值结构体：\n${JSON.stringify(numericItemsToSchema(numericItems))}`,
          `当前数值状态：\n${JSON.stringify(numericState) || '暂无数值状态。'}`,
          `历史消息：\n${historyText(request.history, request.structuredMemoryHistoryLimit)}`,
          `用户最新输入：${request.prompt}`,
        ].join('\n\n'),
      },
    ])
    usage = addUsage(usage, numericResponse.usage)
    numericState = normalizeNumericState(numericItemsToSchema(numericItems), numericState, numericResponse.parsed)
    emit({ type: 'numeric_state_updated', state: numericState })
  }

  const answerResponse = await requestBrowserDirectChat(request.modelConfig, [
    {
      role: 'system',
      content: composeSystemPrompt(
        request.sessionRobot.commonPrompt,
        '请综合结构化记忆、历史消息，直接给出中文内容。',
        request.sessionRobot.systemPrompt,
      ),
    },
    {
      role: 'user',
      content: [
        `结构化记忆：\n${memoryText(normalizedMemory)}`,
        '数值信息说明：每个数值项中的 description 字段表示这个值的名字或含义。你只能读取、引用这里提供的 currentValue，不能以任何形式自行计算、修改、推断、纠正、补全或重写这些数值；如果正文需要提到数值，必须严格以这里给出的 currentValue 为准。',
        `数值信息：\n${JSON.stringify(numericPayloadForAnswerer(numericItems, numericState))}`,
        `历史消息：\n${historyText(request.history, request.structuredMemoryHistoryLimit)}`,
        `用户最新输入：${request.prompt}`,
      ].join('\n\n'),
    },
  ], {
    temperature: request.modelConfig.temperature,
  })
  usage = addUsage(usage, answerResponse.usage)
  if (answerResponse.reasoning.trim()) {
    emit({ type: 'reasoning', text: answerResponse.reasoning })
  }
  emit({ type: 'text', text: answerResponse.text })

  emit({ type: 'ui_loading', text: '正在生成交互 UI' })
  const uiResponse = await callJsonNode(request.modelConfig, [
    {
      role: 'system',
      content: composeSystemPrompt(
        request.sessionRobot.commonPrompt,
        [
          '你负责为当前 assistant 回复生成聊天气泡里的交互 UI。',
          '只输出 JSON，顶层结构固定为 {"suggestions":[{"title":"按钮文字","prompt":"点击后发送文本"}],"form":null} 或 {"suggestions":[],"form":{"title":"标题","description":"说明","submitText":"提交","fields":[{"name":"字段名","label":"字段标签","type":"input|radio|checkbox|select","placeholder":"占位","required":true,"inputType":"text|number","multiple":false,"options":[{"label":"选项","value":"值"}],"defaultValue":"默认值"}]}}。',
          '只要当前回复要求用户输入，补充、填写任何输入内容，必须优先生成 form，不要生成 suggestions。',
          '只有在不需要用户输入、只是给出后续动作或方向选择时，才生成 suggestions。',
          '当回复存在明确下一步选择时，生成 suggestions。',
          'form 和 suggestions 不能同时出现。',
          '如果没有明显交互需求，也必须返回一个 suggestions，内容只能有一个继续。',
        ].join('\n'),
      ),
    },
    {
      role: 'user',
      content: [
        `主要故事设定：\n${request.sessionRobot.systemPrompt}`,
        `结构化记忆：\n${memoryText(normalizedMemory)}`,
        `历史消息：\n${historyText(request.history, request.structuredMemoryHistoryLimit)}`,
        `用户最新输入：${request.prompt}`,
        `assistant 最终回复：\n${answerResponse.text}`,
      ].join('\n\n'),
    },
  ])
  usage = addUsage(usage, uiResponse.usage)
  const uiPayload = normalizeUiPayload(uiResponse.parsed)
  if (uiPayload.suggestions.length) {
    emit({ type: 'suggestion', items: uiPayload.suggestions })
  }
  if (uiPayload.form?.fields?.length) {
    emit({ type: 'form', form: uiPayload.form })
  }

  emit({ type: 'memory_status', status: 'running', text: '正在更新结构化记忆' })
  const memoryResponse = await callJsonNode(request.modelConfig, [
    {
      role: 'system',
      content: composeSystemPrompt(
        request.sessionRobot.commonPrompt,
        [
          '你负责把当前对话整理成结构化长期记忆。',
          '你必须严格遵循给定 schema，只输出 JSON。',
          '你输出的是增量 patch，不是完整重写后的全部记忆。',
          '顶层结构固定为：{"updated_at":"ISO时间","categories":[{"category_id":"分类ID","updated_at":"ISO时间","items":[{"op":"add|update|delete","id":"记录ID","summary":"一句话总结","source_turn_id":"来源轮次ID","updated_at":"ISO时间","values":{"字段名":"字段值"}}]}]}。',
          'categories 里只能使用 schema 中声明的 category_id。',
          'values 里只能写该分类 schema 声明过的字段。',
          '每个 item 必须显式声明 op，只允许 add、update、delete。',
          '只输出本轮新增或发生变化的记忆项；未变化的旧记忆不要重复输出。',
          '如果某个分类本轮没有新增或变化，items 输出空数组即可。',
          '如果要修改已有记忆，必须使用 op=update，并提供现有记录的 id。',
          '如果要删除已有记忆，必须使用 op=delete，并提供现有记录的 id。',
          'delete 时不要输出 values。',
          'add 时必须提供有效 values；update 时只需要输出要修改的字段。',
          '除非本轮明确要求删除或纠正错误记忆，否则不要输出 delete。',
          '不要输出没有任何字段值的 add item，不要输出缺少 id 的 update/delete item。',
        ].join('\n'),
      ),
    },
    {
      role: 'user',
      content: [
        `主要故事设定：\n${request.sessionRobot.systemPrompt}`,
        `当前记忆 schema：\n${schemaText(schema)}`,
        `现有结构化记忆：\n${JSON.stringify(normalizedMemory)}`,
        '你需要根据现有记忆的 id 决定执行 add、update 还是 delete。',
        `历史消息：\n${historyText(request.history, request.structuredMemoryHistoryLimit)}`,
        `用户最新输入：${request.prompt}`,
        `助手最终回复：${answerResponse.text}`,
      ].join('\n\n'),
    },
  ])
  usage = addUsage(usage, memoryResponse.usage)
  const nextStructuredMemory = mergeStructuredMemory(
    schema,
    normalizedMemory,
    normalizeStructuredMemoryPatch(schema, memoryResponse.parsed),
  )
  emit({ type: 'structured_memory', memory: nextStructuredMemory })
  emit({ type: 'memory_status', status: 'success', text: '结构化记忆已更新' })
  emit({ type: 'usage', usage })

  return {
    text: answerResponse.text,
    reasoning: answerResponse.reasoning,
    suggestions: uiPayload.suggestions,
    form: uiPayload.form,
    numericState,
    structuredMemory: nextStructuredMemory,
    usage,
  }
}
