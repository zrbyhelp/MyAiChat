import { getPromptConfig } from './prompt-config.mjs'

export const DEFAULT_STRUCTURED_MEMORY_INTERVAL = 3
export const DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 12
const MAX_MEMORY_SUMMARY_LENGTH = 280

function debugLogsEnabled() {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env.AGENT_DEBUG_LOGS || '').trim().toLowerCase())
}

export function emptyUsage() {
  return { prompt_tokens: 0, completion_tokens: 0 }
}

export function addUsage(left, right) {
  return {
    prompt_tokens: Number(left?.prompt_tokens || 0) + Number(right?.prompt_tokens || 0),
    completion_tokens: Number(left?.completion_tokens || 0) + Number(right?.completion_tokens || 0),
  }
}

export function utcNow() {
  return new Date().toISOString()
}

export function debugLog(label, payload) {
  if (!debugLogsEnabled()) {
    return
  }
  console.log(label, JSON.stringify(payload))
}

export function normalizePositiveInt(value, fallback) {
  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized <= 0) {
    return fallback
  }
  return normalized
}

function truncateText(value, limit) {
  const text = String(value || '').trim()
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`
}

export function parseJsonObject(raw, fallback = {}) {
  let text = String(raw || '').trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[a-zA-Z]*\s*/, '').replace(/```$/, '').trim()
  }

  const candidates = [text]
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) {
    const snippet = text.slice(start, end + 1).trim()
    if (snippet && snippet !== text) {
      candidates.push(snippet)
    }
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // ignore parse failures
    }
  }

  return fallback
}

export function historyPayload(history) {
  return (Array.isArray(history) ? history : []).map((item) => ({
    role: String(item?.role || 'user'),
    content: String(item?.content || ''),
  }))
}

export function composeSystemPrompt(...sections) {
  return sections
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim())
    .join('\n\n')
}

export function normalizeNumericItems(input) {
  const results = []
  const seen = new Set()
  for (const item of Array.isArray(input) ? input : []) {
    const name = String(item?.name || '').trim()
    if (!name || seen.has(name)) {
      continue
    }
    const currentValue = Number(item?.current_value ?? item?.currentValue)
    if (!Number.isFinite(currentValue)) {
      continue
    }
    seen.add(name)
    results.push({
      name,
      current_value: currentValue,
      description: String(item?.description || '').trim(),
    })
  }
  return results
}

export function numericItemsToSchema(items) {
  return Object.fromEntries(
    normalizeNumericItems(items).map((item) => [item.name, Number(item.current_value)]),
  )
}

function numericItemsDescriptionText(items) {
  if (!items.length) {
    return '暂无字段说明。'
  }
  return items.map((item) => `- ${item.name}：默认值 ${Number(item.current_value)}；说明：${item.description || '无'}`).join('\n')
}

export function numericPayloadForAnswerer(items, numericState) {
  const state = numericState && typeof numericState === 'object' ? numericState : {}
  return normalizeNumericItems(items).map((item) => ({
    name: item.name,
    currentValue: Number.isFinite(Number(state[item.name])) ? Number(state[item.name]) : Number(item.current_value),
    description: item.description,
  }))
}

export function normalizeNumericStateValue(schemaValue, currentValue, nextValue) {
  if (schemaValue && typeof schemaValue === 'object' && !Array.isArray(schemaValue)) {
    const current = currentValue && typeof currentValue === 'object' ? currentValue : {}
    const next = nextValue && typeof nextValue === 'object' ? nextValue : {}
    return Object.fromEntries(
      Object.entries(schemaValue)
        .map(([key, childSchema]) => [key, normalizeNumericStateValue(childSchema, current[key], next[key])])
        .filter(([, value]) => value != null),
    )
  }

  if (Number.isFinite(Number(nextValue))) {
    return Number(nextValue)
  }
  if (Number.isFinite(Number(currentValue))) {
    return Number(currentValue)
  }
  return Number(schemaValue)
}

function numericStateText(input) {
  return JSON.stringify(input && typeof input === 'object' ? input : {}, null, 0) || '{}'
}

function fieldTypeText(field) {
  if (field.type === 'enum') {
    return `enum(${(Array.isArray(field.options) ? field.options : []).map((item) => item.value).join(', ') || '无'})`
  }
  return field.type
}

function schemaText(schema) {
  const categories = Array.isArray(schema?.categories) ? schema.categories : []
  if (!categories.length) {
    return '暂无记忆 schema。'
  }
  return categories.map((category) => [
    `- ${category.id} | ${category.label}`,
    category.description ? `  描述：${category.description}` : '',
    category.extraction_instructions ? `  抽取说明：${category.extraction_instructions}` : '',
    ...(Array.isArray(category.fields) ? category.fields : []).map((field) =>
      `  字段：${field.name} (${field.label}) / ${fieldTypeText(field)} / ${field.required ? '必填' : '可选'}`),
  ].filter(Boolean).join('\n')).join('\n')
}

function normalizeScalar(value, fieldType, enumOptions = null) {
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
    if (!text) {
      return null
    }
    return enumOptions && !enumOptions.has(text) ? null : text
  }
  const text = String(value || '').trim()
  return text || null
}

function normalizeFieldValue(field, value) {
  return normalizeScalar(
    value,
    field.type,
    field.type === 'enum' ? new Set((Array.isArray(field.options) ? field.options : []).map((item) => item.value)) : null,
  )
}

function normalizeMemoryItem(category, rawItem, itemIndex) {
  const values = rawItem?.values && typeof rawItem.values === 'object' && !Array.isArray(rawItem.values) ? rawItem.values : {}
  const normalizedValues = {}
  for (const field of Array.isArray(category.fields) ? category.fields : []) {
    const normalized = normalizeFieldValue(field, values[field.name])
    if (normalized != null) {
      normalizedValues[field.name] = normalized
    }
  }
  if (!Object.keys(normalizedValues).length) {
    return null
  }
  return {
    id: String(rawItem?.id || `${category.id}_${itemIndex + 1}`),
    summary: truncateText(rawItem?.summary || '', MAX_MEMORY_SUMMARY_LENGTH),
    source_turn_id: String(rawItem?.source_turn_id || rawItem?.sourceTurnId || ''),
    updated_at: String(rawItem?.updated_at || rawItem?.updatedAt || utcNow()),
    values: normalizedValues,
  }
}

function normalizeStructuredMemoryCategory(schemaCategory, rawCategory) {
  const items = []
  for (const [index, rawItem] of (Array.isArray(rawCategory?.items) ? rawCategory.items : []).entries()) {
    const normalized = normalizeMemoryItem(schemaCategory, rawItem || {}, index)
    if (normalized) {
      items.push(normalized)
    }
  }
  return {
    category_id: schemaCategory.id,
    label: schemaCategory.label,
    description: schemaCategory.description,
    updated_at: items.length ? String(rawCategory?.updated_at || rawCategory?.updatedAt || utcNow()) : '',
    items,
  }
}

export function normalizeStructuredMemory(schema, payload) {
  const categoryMap = new Map(
    (Array.isArray(payload?.categories) ? payload.categories : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => [String(item.category_id || item.categoryId || ''), item]),
  )
  return {
    updated_at: String(payload?.updated_at || payload?.updatedAt || utcNow()),
    categories: (Array.isArray(schema?.categories) ? schema.categories : []).map((category) =>
      normalizeStructuredMemoryCategory(category, categoryMap.get(category.id) || {})),
  }
}

function compactCategoryMemoryPayload(categoryMemory) {
  return {
    category_id: String(categoryMemory?.category_id || categoryMemory?.categoryId || ''),
    label: String(categoryMemory?.label || ''),
    description: String(categoryMemory?.description || ''),
    updated_at: String(categoryMemory?.updated_at || categoryMemory?.updatedAt || ''),
    items: (Array.isArray(categoryMemory?.items) ? categoryMemory.items : []).map((item) => ({
      id: String(item?.id || ''),
      summary: String(item?.summary || ''),
      source_turn_id: String(item?.source_turn_id || item?.sourceTurnId || ''),
      updated_at: String(item?.updated_at || item?.updatedAt || ''),
      values: item?.values && typeof item.values === 'object' && !Array.isArray(item.values) ? item.values : {},
    })),
  }
}

function compactMemoryPayload(memory) {
  return {
    updated_at: String(memory?.updated_at || ''),
    categories: (Array.isArray(memory?.categories) ? memory.categories : []).map(compactCategoryMemoryPayload),
  }
}

export function memoryText(memory) {
  const categories = Array.isArray(memory?.categories) ? memory.categories : []
  if (!categories.length) {
    return '暂无结构化记忆。'
  }
  const parts = []
  for (const category of categories) {
    parts.push(`${category.label || category.category_id}：`)
    for (const item of Array.isArray(category.items) ? category.items : []) {
      const valueText = Object.entries(item.values || {}).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ')
      const summary = String(item.summary || '').trim()
      parts.push(`- ${summary || valueText || item.id}`)
      if (valueText && summary !== valueText) {
        parts.push(`  ${valueText}`)
      }
    }
  }
  return parts.join('\n') || '暂无结构化记忆。'
}

export function buildMemoryContext(memory) {
  return {
    structured_memory_text: memoryText(memory),
    structured_memory_payload_json: JSON.stringify(compactMemoryPayload(memory)),
  }
}

export function refreshStateMemoryContext(state, memory) {
  const context = buildMemoryContext(memory)
  state.structured_memory = memory
  state.structured_memory_text = context.structured_memory_text
  state.structured_memory_payload_json = context.structured_memory_payload_json
}

export function historyText(history, limit = DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT) {
  const normalizedHistory = Array.isArray(history) ? history : []
  if (!normalizedHistory.length) {
    return '暂无历史消息。'
  }
  return normalizedHistory
    .slice(-normalizePositiveInt(limit, DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT))
    .map((item) => `${item.role}: ${String(item.content || '').trim()}`)
    .filter((item) => item !== 'user: ' && item !== 'assistant: ' && item !== 'system: ')
    .join('\n')
    || '暂无历史消息。'
}

export function normalizeWorldGraphWritebackOps(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const readList = (snakeKey, camelKey) => {
    const raw = Array.isArray(value[snakeKey]) ? value[snakeKey] : value[camelKey]
    return Array.isArray(raw) ? raw.filter((item) => item && typeof item === 'object') : []
  }
  return {
    upsert_nodes: readList('upsert_nodes', 'upsertNodes'),
    upsert_edges: readList('upsert_edges', 'upsertEdges'),
    upsert_events: readList('upsert_events', 'upsertEvents'),
    append_node_snapshots: readList('append_node_snapshots', 'appendNodeSnapshots'),
    append_edge_snapshots: readList('append_edge_snapshots', 'appendEdgeSnapshots'),
    append_event_effects: readList('append_event_effects', 'appendEventEffects'),
  }
}

function resolveCommonPrompt(state) {
  return String(state.common_prompt || getPromptConfig()?.defaults?.common_prompt || '').trim()
}

function resolveSystemPrompt(state) {
  return String(state.system_prompt || getPromptConfig()?.defaults?.system_prompt || '').trim()
}

function resolveNumericComputationPrompt(state) {
  return String(state.numeric_computation_prompt || getPromptConfig()?.defaults?.numeric_computation_prompt || '').trim()
}

function resolveStoryOutline(state) {
  return String(state.story_outline || '').trim()
}

function resolveNodeModelConfig(state, kind) {
  const config = state.auxiliary_model_configs?.[kind]
  return config?.model ? config : state.model_config
}

export function buildInitialState(request, history, memorySchema, structuredMemory) {
  const promptConfig = getPromptConfig()
  const numericComputationItems = normalizeNumericItems(request.robot?.numeric_computation_items || [])
  const normalizedHistory = historyPayload(history)
  const structuredMemoryHistoryLimit = normalizePositiveInt(
    request.structured_memory_history_limit ?? request.robot?.structured_memory_history_limit,
    DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT,
  )
  const memoryContext = buildMemoryContext(structuredMemory)

  return {
    thread_id: request.thread_id,
    prompt: request.prompt,
    common_prompt: request.robot?.common_prompt || promptConfig?.defaults?.common_prompt || '',
    system_prompt: request.system_prompt || request.robot?.system_prompt || promptConfig?.defaults?.system_prompt || '',
    history: normalizedHistory,
    history_text: historyText(normalizedHistory, structuredMemoryHistoryLimit),
    memory_schema: memorySchema,
    structured_memory: structuredMemory,
    structured_memory_text: memoryContext.structured_memory_text,
    structured_memory_payload_json: memoryContext.structured_memory_payload_json,
    structured_memory_interval: normalizePositiveInt(
      request.structured_memory_interval ?? request.robot?.structured_memory_interval,
      DEFAULT_STRUCTURED_MEMORY_INTERVAL,
    ),
    structured_memory_history_limit: structuredMemoryHistoryLimit,
    model_config: request.model_settings,
    auxiliary_model_configs: request.auxiliary_model_configs || {},
    numeric_computation_enabled: Boolean(request.robot?.numeric_computation_enabled),
    numeric_computation_prompt: request.robot?.numeric_computation_prompt || promptConfig?.defaults?.numeric_computation_prompt || '',
    numeric_computation_items: numericComputationItems,
    numeric_state: request.numeric_state && typeof request.numeric_state === 'object' ? request.numeric_state : {},
    story_outline: String(request.story_outline || ''),
    world_graph_payload: request.world_graph && typeof request.world_graph === 'object' ? request.world_graph : {},
    world_graph_writeback_ops: normalizeWorldGraphWritebackOps({}),
    final_response: String(request.final_response || ''),
    usage: emptyUsage(),
  }
}

export function buildAnswererMessages(state) {
  const promptConfig = getPromptConfig()
  const numericItems = Array.isArray(state.numeric_computation_items) ? state.numeric_computation_items : []
  return [
    {
      role: 'system',
      content: composeSystemPrompt(
        resolveCommonPrompt(state),
        promptConfig.templates.answerer.base_instruction,
        promptConfig.templates.answerer.structured_output_instruction,
        resolveSystemPrompt(state),
      ),
    },
    {
      role: 'user',
      content: [
        '内部故事梗概：',
        resolveStoryOutline(state) || '暂无故事梗概。',
        '',
        '结构化记忆：',
        state.structured_memory_text,
        '',
        '完整世界图谱 JSON：',
        JSON.stringify(state.world_graph_payload || {}, null, 0),
        '',
        promptConfig.templates.answerer.numeric_guardrail,
        '',
        '数值信息：',
        JSON.stringify(numericPayloadForAnswerer(numericItems, state.numeric_state)),
        '',
        '历史消息：',
        state.history_text,
        '',
        `用户最新输入：${state.prompt}`,
      ].join('\n'),
    },
  ]
}

export async function numericAgentNode(state, modelClient) {
  const promptConfig = getPromptConfig()
  const numericItems = Array.isArray(state.numeric_computation_items) ? state.numeric_computation_items : []
  const numericSchema = numericItemsToSchema(numericItems)
  const currentNumericState = normalizeNumericStateValue(numericSchema, {}, state.numeric_state || {})

  if (!state.numeric_computation_enabled || !Object.keys(numericSchema).length) {
    return {
      numeric_state: currentNumericState,
      usage: emptyUsage(),
    }
  }

  const response = await modelClient.invokeText(
    resolveNodeModelConfig(state, 'numeric_computation'),
    composeSystemPrompt(
      resolveCommonPrompt(state),
      promptConfig.templates.numeric_agent.system_instruction,
      `${promptConfig.templates.numeric_agent.user_prompt_label}\n${resolveNumericComputationPrompt(state) || '未配置'}`,
    ),
    [
      '主要故事设定：',
      resolveSystemPrompt(state),
      '',
      '结构化记忆：',
      state.structured_memory_text,
      '',
      '数值字段定义：',
      numericItemsDescriptionText(numericItems),
      '',
      '数值结构体：',
      JSON.stringify(numericSchema),
      '',
      '当前数值状态：',
      numericStateText(currentNumericState),
      '',
      '历史消息：',
      state.history_text,
      '',
      `用户最新输入：${state.prompt}`,
    ].join('\n'),
  )

  const parsed = parseJsonObject(response.text, numericSchema)
  const numericResult = normalizeNumericStateValue(numericSchema, currentNumericState, parsed)
  debugLog('[numeric-agent]', {
    prompt: state.prompt,
    raw_output: response.text,
    parsed_output: parsed,
    numeric_result: numericResult,
  })
  return {
    numeric_state: numericResult,
    usage: response.usage,
  }
}

export async function storyOutlineNode(state, modelClient) {
  const promptConfig = getPromptConfig()
  const response = await modelClient.invokeText(
    resolveNodeModelConfig(state, 'outline'),
    composeSystemPrompt(
      resolveCommonPrompt(state),
      `主要故事设定：\n${resolveSystemPrompt(state)}`,
      promptConfig.templates.story_outline.system_instruction,
    ),
    [
      '结构化记忆：',
      state.structured_memory_text,
      '',
      '完整世界图谱 JSON：',
      JSON.stringify(state.world_graph_payload || {}),
      '',
      '数值信息：',
      JSON.stringify(numericPayloadForAnswerer(state.numeric_computation_items || [], state.numeric_state)),
      '',
      '历史消息：',
      state.history_text,
      '',
      `用户最新输入：${state.prompt}`,
    ].join('\n'),
  )
  return {
    story_outline: response.text.trim(),
    usage: response.usage,
  }
}

function normalizeCategoryMemoryPatch(category, payload) {
  const rawUpserts = Array.isArray(payload?.upserts) ? payload.upserts : []
  const upserts = []
  for (const [index, item] of rawUpserts.entries()) {
    const normalized = normalizeMemoryItem(category, item || {}, index)
    if (normalized) {
      upserts.push(normalized)
    }
  }
  const deletes = [...new Set((Array.isArray(payload?.deletes) ? payload.deletes : []).map((item) => String(item || '').trim()).filter(Boolean))]
  return {
    category_id: category.id,
    updated_at: String(payload?.updated_at || payload?.updatedAt || utcNow()),
    upserts,
    deletes,
  }
}

function normalizeMemoryPatch(schema, payload) {
  const categoryMap = new Map(
    (Array.isArray(payload?.categories) ? payload.categories : [])
      .filter((item) => item && typeof item === 'object')
      .map((item) => [String(item.category_id || item.categoryId || ''), item]),
  )
  return {
    updated_at: String(payload?.updated_at || payload?.updatedAt || utcNow()),
    categories: (Array.isArray(schema?.categories) ? schema.categories : []).map((category) =>
      normalizeCategoryMemoryPatch(category, categoryMap.get(category.id) || {})),
  }
}

function mergeCategoryMemoryPatch(category, currentCategoryMemory, patch) {
  const currentItems = Array.isArray(currentCategoryMemory?.items) ? currentCategoryMemory.items : []
  const deleteIds = new Set(Array.isArray(patch?.deletes) ? patch.deletes : [])
  const upserts = Array.isArray(patch?.upserts) ? patch.upserts : []
  const upsertMap = new Map(upserts.map((item) => [String(item.id || ''), item]))
  const mergedItems = []
  const seen = new Set()

  for (const [index, item] of currentItems.entries()) {
    const itemId = String(item?.id || '').trim()
    if (!itemId || deleteIds.has(itemId)) {
      continue
    }
    if (upsertMap.has(itemId)) {
      mergedItems.push(upsertMap.get(itemId))
      seen.add(itemId)
      continue
    }
    const normalized = normalizeMemoryItem(category, item || {}, index)
    if (normalized) {
      mergedItems.push(normalized)
      seen.add(itemId)
    }
  }

  for (const item of upserts) {
    const itemId = String(item?.id || '').trim()
    if (!itemId || seen.has(itemId) || deleteIds.has(itemId)) {
      continue
    }
    mergedItems.push(item)
    seen.add(itemId)
  }

  return {
    category_id: category.id,
    label: category.label,
    description: category.description,
    updated_at: mergedItems.length ? String(patch?.updated_at || patch?.updatedAt || currentCategoryMemory?.updated_at || currentCategoryMemory?.updatedAt || utcNow()) : '',
    items: mergedItems,
  }
}

function mergeMemoryPatch(schema, currentMemory, patch) {
  const memoryMap = new Map((Array.isArray(currentMemory?.categories) ? currentMemory.categories : []).map((item) => [item.category_id, item]))
  const patchMap = new Map((Array.isArray(patch?.categories) ? patch.categories : []).map((item) => [item.category_id, item]))
  return normalizeStructuredMemory(schema, {
    updated_at: String(patch?.updated_at || patch?.updatedAt || utcNow()),
    categories: (Array.isArray(schema?.categories) ? schema.categories : []).map((category) =>
      mergeCategoryMemoryPatch(
        category,
        memoryMap.get(category.id) || {
          category_id: category.id,
          label: category.label,
          description: category.description,
          updated_at: '',
          items: [],
        },
        patchMap.get(category.id) || {},
      )),
  })
}

async function updateMemoryPatch(state, modelClient) {
  const promptConfig = getPromptConfig()
  const response = await modelClient.invokeText(
    resolveNodeModelConfig(state, 'memory'),
    composeSystemPrompt(
      resolveCommonPrompt(state),
      promptConfig.templates.memory_patch.system_instruction,
    ),
    [
      `当前记忆 schema：\n${schemaText(state.memory_schema)}`,
      `当前已有记忆：\n${state.structured_memory_payload_json}`,
      `历史消息：\n${state.history_text}`,
      `用户最新输入：${state.prompt}`,
      `助手最终回复：${state.final_response || ''}`,
      `内部故事梗概：\n${resolveStoryOutline(state) || '暂无故事梗概。'}`,
    ].join('\n\n'),
  )
  const patch = normalizeMemoryPatch(state.memory_schema, parseJsonObject(response.text, {
    updated_at: utcNow(),
    categories: [],
  }))
  debugLog('[memory-patch]', {
    thread_id: state.thread_id,
    raw_output: response.text,
    patch_category_count: patch.categories.length,
  })
  return { patch, usage: response.usage }
}

export async function memoryNode(state, modelClient) {
  const { patch, usage } = await updateMemoryPatch(state, modelClient)
  const memory = mergeMemoryPatch(state.memory_schema, state.structured_memory, patch)
  return {
    structured_memory: memory,
    usage,
  }
}

export async function worldGraphWritebackNode(state, modelClient) {
  const promptConfig = getPromptConfig()
  const worldGraphPayload = state.world_graph_payload && typeof state.world_graph_payload === 'object'
    ? state.world_graph_payload
    : {}
  if (!String(worldGraphPayload?.meta?.robotId || '').trim()) {
    return {
      world_graph_writeback_ops: normalizeWorldGraphWritebackOps({}),
      usage: emptyUsage(),
    }
  }

  const response = await modelClient.invokeText(
    resolveNodeModelConfig(state, 'world_graph'),
    composeSystemPrompt(
      resolveCommonPrompt(state),
      `主要故事设定：\n${resolveSystemPrompt(state)}`,
      promptConfig.templates.world_graph_writeback.system_instruction,
    ),
    [
      `结构化记忆：\n${state.structured_memory_text}`,
      `数值信息：\n${JSON.stringify(numericPayloadForAnswerer(state.numeric_computation_items || [], state.numeric_state))}`,
      `历史消息：\n${state.history_text}`,
      `用户最新输入：${state.prompt}`,
      `最终正文：\n${state.final_response || ''}`,
      `内部故事梗概：\n${resolveStoryOutline(state) || '暂无故事梗概。'}`,
      `当前最大 sequenceIndex：${getWorldGraphMaxSequenceIndex(worldGraphPayload)}`,
      `当前事件时间线摘要：\n${summarizeWorldGraphTimelineText(worldGraphPayload)}`,
      `完整世界图谱 JSON：\n${JSON.stringify(worldGraphPayload)}`,
    ].join('\n\n'),
  )
  return {
    world_graph_writeback_ops: normalizeWorldGraphWritebackOps(parseJsonObject(response.text, {})),
    usage: response.usage,
  }
}

export async function answerNode(state, modelClient, onChunk) {
  const response = await modelClient.streamText(
    state.model_config,
    buildAnswererMessages(state),
    onChunk,
  )
  return {
    final_response: response.text.trimEnd(),
    usage: response.usage,
  }
}

export function buildRobotGenerationContext(request) {
  return [
    `文档名称：${request.source_name || '未命名文档'}`,
    `用户引导语：${request.guidance || '无'}`,
    '文档整体摘要：',
    String(request.document_summary || '').trim() || '无',
    '分段摘要：',
    (Array.isArray(request.segment_summaries) ? request.segment_summaries : []).filter((item) => String(item || '').trim()).map((item) => `- ${String(item).trim()}`).join('\n') || '无',
  ].join('\n\n')
}

export function buildMemorySchemaPrompt(request, core) {
  return [
    buildRobotGenerationContext(request),
    '已确定的智能体核心定位：',
    `名称：${core.name}`,
    `简介：${core.description}`,
    `系统提示词摘要：${String(core.system_prompt || '').trim() || '无'}`,
  ].join('\n\n')
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

function listTimelineEvents(graph) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : [])
    .filter((item) => item && item.objectType === 'event')
    .sort((left, right) =>
      readEventSequenceIndex(left) - readEventSequenceIndex(right)
      || String(left?.name || '').localeCompare(String(right?.name || ''), 'zh-CN')
      || String(left?.id || '').localeCompare(String(right?.id || ''), 'zh-CN'))
}

function summarizeEventEffects(event, limit = 2) {
  const summaries = (Array.isArray(event?.effects) ? event.effects : [])
    .map((item) => String(item?.summary || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(0, limit))
  return summaries.length ? `；影响：${summaries.join('；')}` : ''
}

function summarizeWorldGraphTimelineText(graph, limit = 8) {
  const events = listTimelineEvents(graph)
  if (!events.length) {
    return '无'
  }
  return events
    .slice(0, Math.max(1, limit))
    .map((event) => {
      const sequenceIndex = readEventSequenceIndex(event)
      const name = String(event?.name || '').trim() || String(event?.id || '').trim() || '未命名事件'
      const summary = String(event?.summary || '').trim()
      return `- [${sequenceIndex}] ${name}${summary ? `：${summary}` : ''}${summarizeEventEffects(event)}`
    })
    .join('\n')
}

function getWorldGraphMaxSequenceIndex(graph) {
  return listTimelineEvents(graph).reduce((max, event) => Math.max(max, readEventSequenceIndex(event)), 0)
}

export function buildWorldGraphEvolutionPrompt(request) {
  return [
    `文档名称：${request.source_name || '未命名文档'}`,
    `用户引导语：${request.guidance || '无'}`,
    '已确定的智能体核心定位：',
    `名称：${request.core?.name || '未命名智能体'}`,
    `简介：${request.core?.description || '无'}`,
    `当前切片：${Number(request.segment_index || 0) + 1}/${Math.max(Number(request.segment_total || 1), 1)}`,
    '当前切片摘要：',
    String(request.segment_summary || '').trim() || '无',
    `当前最大 sequenceIndex：${getWorldGraphMaxSequenceIndex(request.current_world_graph || {})}`,
    '当前事件时间线摘要：',
    summarizeWorldGraphTimelineText(request.current_world_graph || {}),
    '当前全量世界图谱 JSON：',
    JSON.stringify(request.current_world_graph || {}, null, 2),
  ].join('\n\n')
}

export function buildGraphRagExtractPrompt(request) {
  const extractionDetail = request.extraction_detail || {}
  const segmentSummary = String(request.segment_summary || '').trim()
  const fallbackSegmentSummary = Array.isArray(request.segment_summaries)
    ? request.segment_summaries.map((item) => String(item || '').trim()).filter(Boolean).join('\n\n')
    : ''
  return [
    `文档名称：${request.source_name || '未命名文档'}`,
    `用户引导语：${request.guidance || '无'}`,
    '智能体核心定位：',
    `名称：${request.core?.name || '未命名智能体'}`,
    `简介：${request.core?.description || '无'}`,
    '文档整体摘要：',
    String(request.document_summary || '').trim() || '无',
    `当前分片：${Number(request.segment_index || 0) + 1}/${Math.max(Number(request.segment_total || 1), 1)}`,
    '当前分片摘要：',
    segmentSummary || fallbackSegmentSummary || '无',
    '本次抽取细度控制：',
    `- 实体上限：${Math.max(1, Number(extractionDetail.max_entities_per_segment || extractionDetail.maxEntitiesPerSegment || 12) || 12)}`,
    `- 关系上限：${Math.max(1, Number(extractionDetail.max_relations_per_segment || extractionDetail.maxRelationsPerSegment || 16) || 16)}`,
    `- 事件上限：${Math.max(1, Number(extractionDetail.max_events_per_segment || extractionDetail.maxEventsPerSegment || 8) || 8)}`,
    `- 实体重要性阈值：${Number(extractionDetail.entity_importance_threshold || extractionDetail.entityImportanceThreshold || 0.35)}`,
    `- 关系重要性阈值：${Number(extractionDetail.relation_importance_threshold || extractionDetail.relationImportanceThreshold || 0.35)}`,
    `- 事件重要性阈值：${Number(extractionDetail.event_importance_threshold || extractionDetail.eventImportanceThreshold || 0.4)}`,
    `当前最大 sequenceIndex：${getWorldGraphMaxSequenceIndex(request.current_world_graph || {})}`,
    '当前事件时间线摘要：',
    summarizeWorldGraphTimelineText(request.current_world_graph || {}),
    '当前全量世界图谱 JSON：',
    JSON.stringify(request.current_world_graph || {}, null, 2),
    '任务要求：',
    '请只针对当前分片抽取适合长期保留的实体、关系、关键事件、社区主题和片段锚点，并与当前全量世界图谱保持时间与事实一致。',
  ].join('\n\n')
}

export function buildGraphRagRetrievePrompt(request) {
  return [
    `机器人名称：${request.robot_name || '当前智能体'}`,
    `机器人简介：${request.robot_description || '无'}`,
    `故事梗概：${request.story_outline || '无'}`,
    '最近对话：',
    historyText(request.history, 8),
    '用户当前输入：',
    String(request.prompt || '').trim() || '无',
    '可用 GraphRAG 文档：',
    JSON.stringify(request.graphrag_documents || [], null, 2),
  ].join('\n\n')
}

export function buildGraphRagWritebackPrompt(request) {
  return [
    `机器人名称：${request.robot_name || '当前智能体'}`,
    `机器人简介：${request.robot_description || '无'}`,
    `故事梗概：${request.story_outline || '无'}`,
    '历史消息：',
    historyText(request.history, 10),
    `用户最新输入：${String(request.prompt || '').trim() || '无'}`,
    '最终正文：',
    String(request.final_response || '').trim() || '无',
    `当前最大 sequenceIndex：${getWorldGraphMaxSequenceIndex(request.current_world_graph || {})}`,
    '当前事件时间线摘要：',
    summarizeWorldGraphTimelineText(request.current_world_graph || {}),
    '当前全量世界图谱 JSON：',
    JSON.stringify(request.current_world_graph || {}, null, 2),
  ].join('\n\n')
}

export function ensureGeneratedRobotPayload(payload) {
  const missing = []
  if (!String(payload?.name || '').trim()) {
    missing.push('name')
  }
  if (!String(payload?.description || '').trim()) {
    missing.push('description')
  }
  if (!String(payload?.system_prompt || '').trim()) {
    missing.push('systemPrompt')
  }
  if ((Array.isArray(payload?.memory_schema?.categories) ? payload.memory_schema.categories.length : 0) < 2) {
    missing.push('memorySchema.categories(>=2)')
  }
  if (!String(payload?.document_summary || '').trim()) {
    missing.push('documentSummary')
  }
  if (!String(payload?.retrieval_summary || '').trim()) {
    missing.push('retrievalSummary')
  }
  if (missing.length) {
    throw new Error(`生成的智能体配置不完整：缺少 ${missing.join(', ')}`)
  }
}

export function hasSchemaCategories(schema) {
  return Array.isArray(schema?.categories) && schema.categories.length > 0
}

export function shouldUseRequestSchema(thread, request) {
  if (!hasSchemaCategories(request.memory_schema)) {
    return false
  }
  if (!thread || !hasSchemaCategories(thread.memory_schema)) {
    return true
  }
  return JSON.stringify(thread.memory_schema) !== JSON.stringify(request.memory_schema)
}

export function resolveRobotName(request) {
  const name = String(request?.robot?.name || '').trim()
  return name || '当前智能体'
}

export function formatStageError(request, stageLabel, error) {
  const robotName = resolveRobotName(request)
  const rawMessage = String(error instanceof Error ? error.message : error || '').trim()
  return `聊天失败：智能体「${robotName}」${stageLabel}失败${rawMessage ? `：${rawMessage}` : ''}`
}

export function buildRequestState(request) {
  const memorySchema = request.memory_schema
  const structuredMemory = normalizeStructuredMemory(memorySchema, request.structured_memory)
  const state = buildInitialState(request, request.history, memorySchema, structuredMemory)
  return { state, structuredMemory }
}

export async function saveMemoryToThread(store, request, memory, state) {
  const currentThread = await store.load(request.thread_id)
  if (currentThread) {
    await store.save({
      thread_id: request.thread_id,
      messages: currentThread.messages,
      memory_schema: state.memory_schema || request.memory_schema || currentThread.memory_schema,
      structured_memory: memory,
      numeric_state: currentThread.numeric_state,
      story_outline: currentThread.story_outline,
    })
    return
  }

  await store.save({
    thread_id: request.thread_id,
    messages: [
      ...request.history,
      { role: 'user', content: request.prompt },
      { role: 'assistant', content: request.final_response || '' },
    ],
    memory_schema: request.memory_schema,
    structured_memory: memory,
    numeric_state: state.numeric_state || {},
    story_outline: state.story_outline || '',
  })
}
