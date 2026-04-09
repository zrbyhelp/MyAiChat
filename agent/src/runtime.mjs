import { inspect } from 'node:util'

import { getPromptConfig } from './prompt-config.mjs'

export const DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT = 2
export const STORY_OUTLINE_HISTORY_LIMIT = 10
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
  void label
  void payload
  void debugLogsEnabled
}

function formatConsolePayload(payload) {
  if (typeof payload === 'string') {
    return payload
  }
  return inspect(payload, {
    depth: null,
    maxArrayLength: null,
    maxStringLength: null,
    compact: false,
    breakLength: 120,
  })
}

export function graphWritebackLog(label, payload) {
  if (payload === undefined) {
    console.log(label)
    return
  }
  console.log(label, formatConsolePayload(payload))
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

export function normalizeNumericItems() {
  return []
}

export function numericItemsToSchema() {
  return {}
}

export function numericPayloadForAnswerer() {
  return []
}

export function normalizeNumericStateValue(_schemaValue, _currentValue, _nextValue) {
  return null
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

export function normalizeStructuredMemory(schemaOrPayload, payloadMaybe) {
  const payload = payloadMaybe === undefined ? schemaOrPayload : payloadMaybe
  return {
    updated_at: String(payload?.updated_at || payload?.updatedAt || ''),
    long_term_memory: String(payload?.long_term_memory || payload?.longTermMemory || '').trim(),
    short_term_memory: String(payload?.short_term_memory || payload?.shortTermMemory || '').trim(),
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
    long_term_memory: String(memory?.long_term_memory || memory?.longTermMemory || ''),
    short_term_memory: String(memory?.short_term_memory || memory?.shortTermMemory || ''),
  }
}

export function memoryText(memory) {
  const longTermMemory = String(memory?.long_term_memory || memory?.longTermMemory || '').trim()
  const shortTermMemory = String(memory?.short_term_memory || memory?.shortTermMemory || '').trim()
  if (!longTermMemory && !shortTermMemory) {
    return '暂无结构化记忆。'
  }
  return [
    '长期记忆：',
    longTermMemory || '暂无',
    '',
    '短期记忆：',
    shortTermMemory || '暂无',
  ].join('\n')
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

function normalizeWritebackChangeContent(value) {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value
  }
  return String(value ?? '')
}

const WRITEBACK_OBJECT_TYPE_TO_SHORT = Object.freeze({
  character: 'c',
  organization: 'o',
  location: 'l',
  item: 'i',
})

const WRITEBACK_OBJECT_TYPE_FROM_SHORT = Object.freeze(
  Object.fromEntries(Object.entries(WRITEBACK_OBJECT_TYPE_TO_SHORT).map(([key, value]) => [value, key])),
)

const WRITEBACK_NODE_FIELD_TO_SHORT = Object.freeze({
  name: 'n',
  summary: 's',
  status: 'st',
  knownFacts: 'kf',
  preferencesAndConstraints: 'pc',
  taskProgress: 'tp',
  longTermMemory: 'lm',
  tag: 'tg',
})

const WRITEBACK_NODE_FIELD_FROM_SHORT = Object.freeze(
  Object.fromEntries(Object.entries(WRITEBACK_NODE_FIELD_TO_SHORT).map(([key, value]) => [value, key])),
)

const WRITEBACK_RELATION_FIELD_TO_SHORT = Object.freeze({
  summary: 's',
  status: 'st',
  intensity: 'in',
  label: 'lb',
})

const WRITEBACK_RELATION_FIELD_FROM_SHORT = Object.freeze(
  Object.fromEntries(Object.entries(WRITEBACK_RELATION_FIELD_TO_SHORT).map(([key, value]) => [value, key])),
)

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key)
}

function readOwnValue(source, ...keys) {
  for (const key of keys) {
    if (hasOwn(source, key)) {
      return source[key]
    }
  }
  return undefined
}

function expandWritebackTypeAlias(value) {
  const type = String(value || '').trim()
  if (!type) {
    return ''
  }
  if (type.startsWith('relation.')) {
    return type
  }
  const relationMatch = /^r\.([a-z]+)$/i.exec(type)
  if (relationMatch) {
    const relationField = WRITEBACK_RELATION_FIELD_FROM_SHORT[relationMatch[1]]
    return relationField ? `relation.${relationField}` : type
  }

  const parts = type.split('.').map((item) => item.trim()).filter(Boolean)
  if (parts.length < 2) {
    return type
  }
  const objectType = WRITEBACK_OBJECT_TYPE_FROM_SHORT[parts[0]]
  if (!objectType) {
    return type
  }
  if (parts[1] === 'a' && parts.length >= 3) {
    return `${objectType}.attribute.${parts.slice(2).join('.')}`
  }
  const fieldName = WRITEBACK_NODE_FIELD_FROM_SHORT[parts[1]]
  return fieldName && parts.length === 2 ? `${objectType}.${fieldName}` : type
}

function compactWritebackTypeAlias(value) {
  const type = String(value || '').trim()
  if (!type) {
    return ''
  }
  const relationMatch = /^relation\.([a-zA-Z]+)$/.exec(type)
  if (relationMatch) {
    const shortField = WRITEBACK_RELATION_FIELD_TO_SHORT[relationMatch[1]]
    return shortField ? `r.${shortField}` : type
  }

  const parts = type.split('.').map((item) => item.trim()).filter(Boolean)
  if (parts.length < 2) {
    return type
  }
  const shortObjectType = WRITEBACK_OBJECT_TYPE_TO_SHORT[parts[0]]
  if (!shortObjectType) {
    return type
  }
  if (parts[1] === 'attribute' && parts.length >= 3) {
    return `${shortObjectType}.a.${parts.slice(2).join('.')}`
  }
  const shortField = WRITEBACK_NODE_FIELD_TO_SHORT[parts[1]]
  return shortField && parts.length === 2 ? `${shortObjectType}.${shortField}` : type
}

function normalizeWorldGraphWritebackChange(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    id: String(readOwnValue(source, 'id', 'i') || '').trim(),
    type: expandWritebackTypeAlias(readOwnValue(source, 'type', 't')),
    content: normalizeWritebackChangeContent(readOwnValue(source, 'content', 'v')),
  }
}

function normalizeWorldGraphWritebackEvent(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const rawChanges = Array.isArray(readOwnValue(source, 'changes', 'c')) ? readOwnValue(source, 'changes', 'c') : []
  return {
    id: String(readOwnValue(source, 'id', 'i') || '').trim(),
    mode: String(readOwnValue(source, 'mode', 'm') || '').trim().toLowerCase() === 'continue' ? 'continue' : 'new',
    name: String(readOwnValue(source, 'name', 'n') || '').trim(),
    summary: String(readOwnValue(source, 'summary', 's') || '').trim(),
    changes: rawChanges.map(normalizeWorldGraphWritebackChange),
  }
}

export function normalizeWorldGraphWritebackOps(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const readList = (...keys) => {
    const matchedKey = keys.find((key) => Array.isArray(value[key]))
    const raw = matchedKey ? value[matchedKey] : undefined
    return Array.isArray(raw) ? raw.filter((item) => item && typeof item === 'object') : []
  }
  return {
    events: readList('events', 'e').map(normalizeWorldGraphWritebackEvent),
    upsert_nodes: readList('upsert_nodes', 'upsertNodes', 'un'),
    upsert_edges: readList('upsert_edges', 'upsertEdges', 'ue'),
    upsert_events: readList('upsert_events', 'upsertEvents', 'uv'),
    append_node_snapshots: readList('append_node_snapshots', 'appendNodeSnapshots', 'ans'),
    append_edge_snapshots: readList('append_edge_snapshots', 'appendEdgeSnapshots', 'aes'),
    append_event_effects: readList('append_event_effects', 'appendEventEffects', 'aef'),
  }
}

function canonicalNodeId(item) {
  return String(item?.id || item?.nodeId || item?.node_id || '').trim()
}

function canonicalEdgeId(item) {
  return String(item?.id || item?.edgeId || item?.edge_id || '').trim()
}

function canonicalEffectTargetNodeId(item) {
  return String(item?.targetNodeId || item?.target_node_id || '').trim()
}

function normalizeObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {}
}

function removeExactDuplicateStatusAttribute(source) {
  if (
    source?.attributes
    && typeof source.attributes === 'object'
    && !Array.isArray(source.attributes)
    && String(source.status || '').trim()
    && String(source.attributes.currentStatus || '').trim()
    && String(source.attributes.currentStatus).trim() === String(source.status).trim()
  ) {
    const nextAttributes = { ...source.attributes }
    delete nextAttributes.currentStatus
    source.attributes = nextAttributes
    if (!Object.keys(nextAttributes).length) {
      delete source.attributes
    }
  }
  return source
}

function removeExactDuplicateTextFields(source) {
  const summary = String(source.summary || '').trim()
  const knownFacts = String(source.knownFacts || source.known_facts || '').trim()
  const longTermMemory = String(source.longTermMemory || source.long_term_memory || '').trim()
  const status = String(source.status || '').trim()

  if (knownFacts && (knownFacts === summary || knownFacts === status)) {
    source.knownFacts = ''
    delete source.known_facts
  }
  if (longTermMemory && (longTermMemory === summary || longTermMemory === status || longTermMemory === knownFacts)) {
    source.longTermMemory = ''
    delete source.long_term_memory
  }
  return source
}

function dedupeNodeLikeItem(item, { isEvent = false } = {}) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? { ...item } : {}
  source.objectType = String(source.objectType || source.object_type || (isEvent ? 'event' : '')).trim() || undefined
  return removeExactDuplicateTextFields(removeExactDuplicateStatusAttribute(source))
}

function dedupeNodeSnapshotItem(item) {
  return removeExactDuplicateStatusAttribute(normalizeObjectRecord(item))
}

function dedupeEventEffectItem(item) {
  const source = normalizeObjectRecord(item)
  if (
    source.nodeAttributeChanges
    && typeof source.nodeAttributeChanges === 'object'
    && !Array.isArray(source.nodeAttributeChanges)
    && source.summary
    && source.nodeAttributeChanges.currentStatus
    && String(source.nodeAttributeChanges.currentStatus).trim() === String(source.summary).trim()
  ) {
    const nextChanges = { ...source.nodeAttributeChanges }
    delete nextChanges.currentStatus
    source.nodeAttributeChanges = nextChanges
    if (!Object.keys(nextChanges).length) {
      delete source.nodeAttributeChanges
    }
  }
  return source
}

function summarizeWritebackOps(ops) {
  const normalized = normalizeWorldGraphWritebackOps(ops)
  return {
    eventCount: normalized.events.length,
    eventChangeCount: normalized.events
      .reduce((count, item) => count + (Array.isArray(item?.changes) ? item.changes.length : 0), 0),
    upsertNodeCount: normalized.upsert_nodes.length,
    upsertEdgeCount: normalized.upsert_edges.length,
    upsertEventCount: normalized.upsert_events.length,
    appendNodeSnapshotCount: normalized.append_node_snapshots.length,
    appendEdgeSnapshotCount: normalized.append_edge_snapshots.length,
    appendEventEffectCount: normalized.append_event_effects.length,
  }
}

function compactWorldGraphWritebackOps(input) {
  const normalized = normalizeWorldGraphWritebackOps(input)
  const compacted = {}

  const compactEvents = normalized.events
    .map((event) => ({
      i: String(event?.id || '').trim(),
      ...(String(event?.mode || '').trim() === 'continue' ? { m: 'continue' } : {}),
      n: String(event?.name || '').trim(),
      ...(String(event?.summary || '').trim() ? { s: String(event.summary).trim() } : {}),
      c: (Array.isArray(event?.changes) ? event.changes : [])
        .map((change) => ({
          i: String(change?.id || '').trim(),
          t: compactWritebackTypeAlias(change?.type),
          v: normalizeWritebackChangeContent(change?.content),
        }))
        .filter((change) => change.i && change.t),
    }))
    .filter((event) => event.i && event.n)

  if (compactEvents.length) {
    compacted.e = compactEvents
  }
  if (normalized.upsert_nodes.length) {
    compacted.un = normalized.upsert_nodes.map((item) => normalizeObjectRecord(item))
  }
  if (normalized.upsert_edges.length) {
    compacted.ue = normalized.upsert_edges.map((item) => normalizeObjectRecord(item))
  }
  if (normalized.upsert_events.length) {
    compacted.uv = normalized.upsert_events.map((item) => normalizeObjectRecord(item))
  }
  if (normalized.append_node_snapshots.length) {
    compacted.ans = normalized.append_node_snapshots.map((item) => normalizeObjectRecord(item))
  }
  if (normalized.append_edge_snapshots.length) {
    compacted.aes = normalized.append_edge_snapshots.map((item) => normalizeObjectRecord(item))
  }
  if (normalized.append_event_effects.length) {
    compacted.aef = normalized.append_event_effects.map((item) => normalizeObjectRecord(item))
  }
  return compacted
}

function resolveCommonPrompt(state) {
  return String(state.common_prompt || getPromptConfig()?.defaults?.common_prompt || '').trim()
}

function resolveSystemPrompt(state) {
  return String(state.system_prompt || getPromptConfig()?.defaults?.system_prompt || '').trim()
}

function resolveNumericComputationPrompt(state) {
  void state
  return ''
}

function normalizeStoryDraftEntries(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

export function normalizeStoryOutlinePayload(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const storyDraft = source.story_draft && typeof source.story_draft === 'object' && !Array.isArray(source.story_draft)
    ? source.story_draft
    : source.storyDraft && typeof source.storyDraft === 'object' && !Array.isArray(source.storyDraft)
      ? source.storyDraft
      : {}
  return {
    story_draft: {
      characters: normalizeStoryDraftEntries(storyDraft.characters),
      items: normalizeStoryDraftEntries(storyDraft.items),
      organizations: normalizeStoryDraftEntries(storyDraft.organizations),
      locations: normalizeStoryDraftEntries(storyDraft.locations),
      events: normalizeStoryDraftEntries(storyDraft.events),
    },
    retrieval_query: String(source.retrieval_query || source.retrievalQuery || '').trim(),
  }
}

function resolveStoryOutline(state) {
  return normalizeStoryOutlinePayload(state.story_outline)
}

function hasStoryOutline(outline) {
  const normalized = normalizeStoryOutlinePayload(outline)
  return Boolean(
    normalized.retrieval_query
    || normalized.story_draft.characters.length
    || normalized.story_draft.items.length
    || normalized.story_draft.organizations.length
    || normalized.story_draft.locations.length
    || normalized.story_draft.events.length
  )
}

function formatStoryDraftForPrompt(outline) {
  const normalized = normalizeStoryOutlinePayload(outline)
  const sections = [
    ['人物草稿', normalized.story_draft.characters],
    ['物品草稿', normalized.story_draft.items],
    ['组织草稿', normalized.story_draft.organizations],
    ['地点草稿', normalized.story_draft.locations],
    ['事件草稿', normalized.story_draft.events],
  ]
  const content = sections
    .filter(([, items]) => items.length)
    .map(([label, items]) => `${label}：\n${items.map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n')
  return content || '暂无故事草稿。'
}

function resolveNodeModelConfig(state, kind) {
  const config = state.auxiliary_model_configs?.[kind]
  return config?.model ? config : state.model_config
}

export function buildInitialState(request, history, memorySchema, structuredMemory) {
  const promptConfig = getPromptConfig()
  const normalizedHistory = historyPayload(history)
  const memoryContext = buildMemoryContext(structuredMemory)

  return {
    thread_id: request.thread_id,
    prompt: request.prompt,
    common_prompt: request.robot?.common_prompt || promptConfig?.defaults?.common_prompt || '',
    system_prompt: request.system_prompt || request.robot?.system_prompt || promptConfig?.defaults?.system_prompt || '',
    history: normalizedHistory,
    history_text: historyText(normalizedHistory, DEFAULT_STRUCTURED_MEMORY_HISTORY_LIMIT),
    story_outline_history_text: historyText(normalizedHistory, STORY_OUTLINE_HISTORY_LIMIT),
    memory_schema: memorySchema,
    structured_memory: structuredMemory,
    structured_memory_text: memoryContext.structured_memory_text,
    structured_memory_payload_json: memoryContext.structured_memory_payload_json,
    model_config: request.model_settings,
    auxiliary_model_configs: request.auxiliary_model_configs || {},
    story_outline_stage_completed: Boolean(request.story_outline_stage_completed),
    story_outline: normalizeStoryOutlinePayload(request.story_outline),
    world_graph_payload: request.world_graph && typeof request.world_graph === 'object' ? request.world_graph : {},
    vector_context_text: String(request.vector_context_text || request.vectorContextText || '').trim(),
    world_graph_update_ops: normalizeWorldGraphWritebackOps({}),
    final_response: String(request.final_response || ''),
    usage: emptyUsage(),
  }
}

export function buildAnswererMessages(state) {
  const promptConfig = getPromptConfig()
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
        '故事设定：',
        resolveSystemPrompt(state) || '无',
        '',
        '内部故事草稿：',
        formatStoryDraftForPrompt(state.story_outline),
        '',
        '长期记忆：',
        String(state.structured_memory?.long_term_memory || '').trim() || '暂无长期记忆。',
        '',
        '短期记忆：',
        String(state.structured_memory?.short_term_memory || '').trim() || '暂无短期记忆。',
        '',
        '向量检索结果：',
        state.vector_context_text || '无',
        '',
        '最近一轮历史消息：',
        state.history_text,
        '',
        `用户最新输入：${state.prompt}`,
      ].join('\n'),
    },
  ]
}

export async function storyOutlineNode(state, modelClient) {
  if (state.story_outline_stage_completed && hasStoryOutline(state.story_outline)) {
    return {
      story_outline: resolveStoryOutline(state),
      usage: emptyUsage(),
    }
  }
  const promptConfig = getPromptConfig()
  const response = await modelClient.invokeText(
    resolveNodeModelConfig(state, 'outline'),
    composeSystemPrompt(
      resolveCommonPrompt(state),
      `主要故事设定：\n${resolveSystemPrompt(state)}`,
      promptConfig.templates.story_outline.system_instruction,
    ),
    [
      '故事设定：',
      resolveSystemPrompt(state),
      '',
      '结构化记忆：',
      state.structured_memory_text,
      '',
      '历史消息：',
      state.story_outline_history_text || state.history_text,
      '',
      `用户最新输入：${state.prompt}`,
    ].join('\n'),
  )
  const payload = normalizeStoryOutlinePayload(parseJsonObject(response.text, {
    story_draft: {
      characters: [],
      items: [],
      organizations: [],
      locations: [],
      events: [],
    },
    retrieval_query: '',
  }))
  return {
    story_outline: payload,
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
  void schema
  return normalizeStructuredMemory(payload)
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
  void schema
  void currentMemory
  return normalizeStructuredMemory({
    updated_at: String(patch?.updated_at || patch?.updatedAt || utcNow()),
    long_term_memory: String(patch?.long_term_memory || patch?.longTermMemory || ''),
    short_term_memory: String(patch?.short_term_memory || patch?.shortTermMemory || ''),
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
      `故事设定：\n${resolveSystemPrompt(state) || '无'}`,
      `当前长期记忆：\n${String(state.structured_memory?.long_term_memory || '').trim() || '无'}`,
      `当前短期记忆：\n${String(state.structured_memory?.short_term_memory || '').trim() || '无'}`,
      `用户最新输入：${state.prompt}`,
      `助手最终回复：${state.final_response || ''}`,
    ].join('\n\n'),
  )
  const patch = normalizeStructuredMemory(parseJsonObject(response.text, {
    updated_at: utcNow(),
    long_term_memory: '',
    short_term_memory: '',
  }))
  return { patch, usage: response.usage }
}

export async function memoryNode(state, modelClient) {
  const { patch, usage } = await updateMemoryPatch(state, modelClient)
  const memory = normalizeStructuredMemory({
    updated_at: patch.updated_at || utcNow(),
    long_term_memory: patch.long_term_memory,
    short_term_memory: patch.short_term_memory,
  })
  return {
    structured_memory: memory,
    usage,
  }
}

export async function worldGraphUpdateNode(state, modelClient) {
  const promptConfig = getPromptConfig()
  const worldGraphPayload = state.world_graph_payload && typeof state.world_graph_payload === 'object'
    ? state.world_graph_payload
    : {}
  if (!String(worldGraphPayload?.meta?.robotId || '').trim()) {
    return {
      world_graph_update_ops: compactWorldGraphWritebackOps({}),
      usage: emptyUsage(),
    }
  }

  const userContent = [
    `故事设定：\n${resolveSystemPrompt(state) || '无'}`,
    `长期记忆：\n${String(state.structured_memory?.long_term_memory || '').trim() || '无'}`,
    `短期记忆：\n${String(state.structured_memory?.short_term_memory || '').trim() || '无'}`,
    `内部故事草稿：\n${formatStoryDraftForPrompt(state.story_outline)}`,
    `用户最新输入：${state.prompt}`,
    `最终正文：\n${state.final_response || ''}`,
    `当前最大 sequenceIndex：${getWorldGraphMaxSequenceIndex(worldGraphPayload)}`,
    '当前事件时间线摘要：',
    summarizeWorldGraphTimelineText(worldGraphPayload),
    '可续写事件候选：',
    '只有当本轮仍在推进同一目标、同一流程阶段或同一冲突处理链，且参与锚点/地点锚点基本一致时，才允许使用 `m:"continue"`；只要出现新目标、新冲突、明显阶段切换或从一个流程跳到另一个流程，就必须新建事件。',
    summarizeContinuableEvents(worldGraphPayload),
    `完整世界图谱 JSON：\n${JSON.stringify(worldGraphPayload)}`,
  ].join('\n\n')
  const startedAt = Date.now()
  graphWritebackLog('[agent:world-graph-update:start]', {
    threadId: String(state.thread_id || state.threadId || ''),
    robotId: String(worldGraphPayload?.meta?.robotId || ''),
    nodeCount: Array.isArray(worldGraphPayload?.nodes) ? worldGraphPayload.nodes.length : 0,
    edgeCount: Array.isArray(worldGraphPayload?.edges) ? worldGraphPayload.edges.length : 0,
    relationTypeCount: Array.isArray(worldGraphPayload?.relationTypes) ? worldGraphPayload.relationTypes.length : 0,
    storyOutlineLength: String(formatStoryDraftForPrompt(state.story_outline) || '').length,
    finalResponseLength: String(state.final_response || '').length,
    promptLength: userContent.length,
  })
  const response = await modelClient.invokeText(
    resolveNodeModelConfig(state, 'world_graph'),
    composeSystemPrompt(
      resolveCommonPrompt(state),
      `主要故事设定：\n${resolveSystemPrompt(state)}`,
      promptConfig.templates.world_graph_update.system_instruction,
    ),
    userContent,
  )
  const parsedRaw = parseJsonObject(response.text, {})
  const parsedOps = normalizeWorldGraphWritebackOps(parsedRaw)
  const compactedOps = compactWorldGraphWritebackOps(parsedOps)
  graphWritebackLog('[agent:world-graph-update:done]', {
    threadId: String(state.thread_id || state.threadId || ''),
    robotId: String(worldGraphPayload?.meta?.robotId || ''),
    durationMs: Date.now() - startedAt,
    responseLength: String(response?.text || '').length,
    usage: response?.usage || emptyUsage(),
    timing: response?.timing || null,
    parsedRaw,
    parsedOps,
    compactedOps,
    writebackSummary: {
      raw: summarizeWritebackOps(parsedOps),
      compacted: summarizeWritebackOps(compactedOps),
    },
    rawResponseText: response?.text || '',
  })
  return {
    world_graph_update_ops: compactedOps,
    usage: response.usage,
  }
}

export async function answerGraphUpdateNode(state, modelClient) {
  return worldGraphUpdateNode(state, modelClient)
}

export async function worldGraphEvolutionNode(state, modelClient) {
  return worldGraphUpdateNode(state, modelClient)
}

export const worldGraphWritebackNode = worldGraphUpdateNode

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

function projectEventTextAtSequence(event, sequenceIndex) {
  let name = String(event?.name || '').trim()
  let summary = String(event?.summary || '').trim()
  const snapshots = Array.isArray(event?.timelineSnapshots) ? event.timelineSnapshots : []
  for (const snapshot of [...snapshots]
    .sort((left, right) => normalizeSequenceIndex(left?.sequenceIndex, 0) - normalizeSequenceIndex(right?.sequenceIndex, 0))
    .filter((item) => normalizeSequenceIndex(item?.sequenceIndex, 0) <= sequenceIndex)) {
    if (Object.prototype.hasOwnProperty.call(snapshot || {}, 'name')) {
      name = String(snapshot?.name || '').trim()
    }
    if (Object.prototype.hasOwnProperty.call(snapshot || {}, 'summary')) {
      summary = String(snapshot?.summary || '').trim()
    }
  }
  return {
    name: name || String(event?.id || '').trim() || '未命名事件',
    summary,
  }
}

function buildTimelineEventEntries(graph) {
  const entries = []
  for (const event of listTimelineEvents(graph)) {
    const baseSequenceIndex = readEventSequenceIndex(event)
    const baseText = projectEventTextAtSequence(event, baseSequenceIndex)
    entries.push({
      key: `${String(event?.id || '').trim()}@${baseSequenceIndex}@base`,
      eventId: String(event?.id || '').trim(),
      sequenceIndex: baseSequenceIndex,
      name: baseText.name,
      summary: baseText.summary,
      usesTimelineLabel: true,
    })

    for (const snapshot of Array.isArray(event?.timelineSnapshots) ? event.timelineSnapshots : []) {
      const snapshotSequenceIndex = normalizeSequenceIndex(snapshot?.sequenceIndex, -1)
      if (snapshotSequenceIndex < 0 || snapshotSequenceIndex === baseSequenceIndex) {
        continue
      }
      const snapshotText = projectEventTextAtSequence(event, snapshotSequenceIndex)
      entries.push({
        key: `${String(event?.id || '').trim()}@${snapshotSequenceIndex}@snapshot`,
        eventId: String(event?.id || '').trim(),
        sequenceIndex: snapshotSequenceIndex,
        name: snapshotText.name,
        summary: snapshotText.summary,
        usesTimelineLabel: false,
      })
    }
  }

  return entries.sort((left, right) =>
    left.sequenceIndex - right.sequenceIndex
    || Number(right.usesTimelineLabel) - Number(left.usesTimelineLabel)
    || left.name.localeCompare(right.name, 'zh-CN')
    || left.eventId.localeCompare(right.eventId, 'zh-CN'))
}

function summarizeEventEffects(event, limit = 2) {
  const summaries = (Array.isArray(event?.effects) ? event.effects : [])
    .map((item) => String(item?.summary || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(0, limit))
  return summaries.length ? `；影响：${summaries.join('；')}` : ''
}

function getContinuableEventAnchorLabels(graph, eventId) {
  const participantLabels = new Set()
  const locationLabels = new Set()
  const nodesById = new Map((Array.isArray(graph?.nodes) ? graph.nodes : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => [String(item.id || '').trim(), item]))

  for (const edge of Array.isArray(graph?.edges) ? graph.edges : []) {
    if (!edge || typeof edge !== 'object') {
      continue
    }
    const relationTypeCode = String(edge.relationTypeCode || '').trim()
    if (relationTypeCode === 'participates_in' && String(edge.targetNodeId || '').trim() === eventId) {
      const participant = nodesById.get(String(edge.sourceNodeId || '').trim())
      if (participant && ['character', 'organization', 'item'].includes(String(participant.objectType || '').trim())) {
        participantLabels.add(String(participant.name || participant.id || '').trim())
      }
      continue
    }
    if (relationTypeCode === 'associated_location' && String(edge.sourceNodeId || '').trim() === eventId) {
      const location = nodesById.get(String(edge.targetNodeId || '').trim())
      if (location && String(location.objectType || '').trim() === 'location') {
        locationLabels.add(String(location.name || location.id || '').trim())
      }
    }
  }

  return {
    participantLabels: [...participantLabels].filter(Boolean).sort((left, right) => left.localeCompare(right, 'zh-CN')),
    locationLabels: [...locationLabels].filter(Boolean).sort((left, right) => left.localeCompare(right, 'zh-CN')),
  }
}

function formatContinuableEventAnchorLabels(labels) {
  return Array.isArray(labels) && labels.length ? labels.join('、') : '无'
}

function summarizeWorldGraphTimelineText(graph, limit = 8) {
  const entries = buildTimelineEventEntries(graph)
  if (!entries.length) {
    return '无'
  }
  return entries
    .slice(0, Math.max(1, limit))
    .map((entry) => {
      const event = (Array.isArray(graph?.nodes) ? graph.nodes : []).find((item) => item?.id === entry.eventId) || null
      return `- [${entry.sequenceIndex}] ${entry.name}${entry.summary ? `：${entry.summary}` : ''}${summarizeEventEffects(event)}`
    })
    .join('\n')
}

function getWorldGraphMaxSequenceIndex(graph) {
  const values = [
    ...buildTimelineEventEntries(graph).map((item) => item.sequenceIndex),
    ...(Array.isArray(graph?.nodes) ? graph.nodes : []).map((item) => normalizeSequenceIndex(item?.startSequenceIndex, 0)),
    ...(Array.isArray(graph?.nodes) ? graph.nodes : []).flatMap((item) =>
      (Array.isArray(item?.timelineSnapshots) ? item.timelineSnapshots : []).map((snapshot) => normalizeSequenceIndex(snapshot?.sequenceIndex, 0))),
    ...(Array.isArray(graph?.edges) ? graph.edges : []).map((item) => normalizeSequenceIndex(item?.startSequenceIndex, 0)),
    ...(Array.isArray(graph?.edges) ? graph.edges : []).flatMap((item) =>
      (Array.isArray(item?.timelineSnapshots) ? item.timelineSnapshots : []).map((snapshot) => normalizeSequenceIndex(snapshot?.sequenceIndex, 0))),
  ]
  for (const edge of Array.isArray(graph?.edges) ? graph.edges : []) {
    if (edge?.endSequenceIndex !== undefined && edge?.endSequenceIndex !== null) {
      values.push(normalizeSequenceIndex(edge.endSequenceIndex, 0))
    }
  }
  return values.reduce((max, value) => Math.max(max, value), 0)
}

function summarizeContinuableEvents(graph, limit = 8) {
  const latestEntries = new Map()
  for (const entry of buildTimelineEventEntries(graph)) {
    const current = latestEntries.get(entry.eventId)
    if (!current || entry.sequenceIndex >= current.sequenceIndex) {
      latestEntries.set(entry.eventId, entry)
    }
  }
  const candidates = [...latestEntries.values()]
    .sort((left, right) =>
      right.sequenceIndex - left.sequenceIndex
      || left.name.localeCompare(right.name, 'zh-CN')
      || left.eventId.localeCompare(right.eventId, 'zh-CN'))
    .slice(0, Math.max(1, limit))
  if (!candidates.length) {
    return '无'
  }
  return candidates
    .map((entry) => {
      const anchors = getContinuableEventAnchorLabels(graph, entry.eventId)
      return [
        `- ${entry.eventId}`,
        `最近时间点 ${entry.sequenceIndex}`,
        `最新标题 ${entry.name}`,
        `最新摘要 ${entry.summary || '无'}`,
        `参与锚点 ${formatContinuableEventAnchorLabels(anchors.participantLabels)}`,
        `地点锚点 ${formatContinuableEventAnchorLabels(anchors.locationLabels)}`,
      ].join(' | ')
    })
    .join('\n')
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
    `故事设定：${request.story_setting || request.system_prompt || '无'}`,
    `长期记忆：${request.long_term_memory || '无'}`,
    `短期记忆：${request.short_term_memory || '无'}`,
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
    story_outline: normalizeStoryOutlinePayload(state.story_outline || {}),
  })
}
