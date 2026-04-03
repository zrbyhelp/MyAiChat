import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { ChatOpenAI } from '@langchain/openai'

import {
  GeneratedMemorySchemaPayloadStructuredSchema,
  GeneratedWorldGraphPatchPayloadStructuredSchema,
  RobotGenerationCorePayloadStructuredSchema,
  normalizeGeneratedMemorySchemaPayload,
  normalizeGeneratedWorldGraphPatchPayload,
  normalizeRobotGenerationCorePayload,
  validateStructuredSchema,
} from './schemas.mjs'
import { parseJsonObject } from './runtime.mjs'

function sanitizeBaseUrl(baseUrl = '') {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function resolveModelBaseUrl(config) {
  const baseUrl = sanitizeBaseUrl(config?.base_url || config?.baseUrl || '')
  if (String(config?.provider || 'openai').trim().toLowerCase() === 'ollama' && baseUrl && !baseUrl.endsWith('/v1')) {
    return `${baseUrl}/v1`
  }
  return baseUrl
}

function resolveModelApiKey(config) {
  const apiKey = String(config?.api_key || config?.apiKey || '').trim()
  if (apiKey) {
    return apiKey
  }
  if (String(config?.provider || 'openai').trim().toLowerCase() === 'ollama') {
    return 'ollama'
  }
  return ''
}

export function extractUsage(message) {
  const usage = message?.usage_metadata || message?.usageMetadata || {}
  return {
    prompt_tokens: Number(usage?.input_tokens || usage?.inputTokens || 0) || 0,
    completion_tokens: Number(usage?.output_tokens || usage?.outputTokens || 0) || 0,
  }
}

export function chunkText(chunk) {
  const content = chunk?.content ?? ''
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') {
        return item
      }
      if (item && typeof item === 'object' && typeof item.text === 'string') {
        return item.text
      }
      return ''
    }).join('')
  }
  return String(content || '')
}

function toLangChainMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => {
    if (message?.role === 'system') {
      return new SystemMessage(String(message.content || ''))
    }
    if (message?.role === 'user') {
      return new HumanMessage(String(message.content || ''))
    }
    return {
      role: String(message?.role || 'user'),
      content: String(message?.content || ''),
    }
  })
}

function collectStructuredCandidates(raw) {
  const candidates = []
  if (!raw) {
    return candidates
  }

  const content = chunkText(raw).trim()
  if (content) {
    candidates.push(content)
  }

  for (const item of Array.isArray(raw?.tool_calls) ? raw.tool_calls : []) {
    if (item?.args != null) {
      candidates.push(item.args)
    }
  }

  for (const item of Array.isArray(raw?.additional_kwargs?.tool_calls) ? raw.additional_kwargs.tool_calls : []) {
    if (item?.function?.arguments != null) {
      candidates.push(item.function.arguments)
    }
  }

  for (const item of Array.isArray(raw?.invalid_tool_calls) ? raw.invalid_tool_calls : []) {
    if (item?.args != null) {
      candidates.push(item.args)
    }
  }

  return candidates
}

function truncateForLog(value, limit = 800) {
  const text = String(value ?? '')
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, Math.max(0, limit - 3))}...`
}

function safeJsonForLog(value, limit = 800) {
  try {
    return truncateForLog(JSON.stringify(value), limit)
  } catch {
    return truncateForLog(String(value ?? ''), limit)
  }
}

function summarizeStructuredCandidate(candidate) {
  if (typeof candidate === 'string') {
    return {
      type: 'string',
      preview: truncateForLog(candidate, 400),
    }
  }
  if (candidate && typeof candidate === 'object') {
    return {
      type: 'object',
      keys: Object.keys(candidate).slice(0, 20),
      preview: safeJsonForLog(candidate, 400),
    }
  }
  return {
    type: typeof candidate,
    preview: truncateForLog(String(candidate ?? ''), 200),
  }
}

function summarizeWorldGraphPatchPayload(payload) {
  const normalized = normalizeGeneratedWorldGraphPatchPayload(payload)
  return {
    title: String(normalized?.meta?.title || ''),
    upsertRelationTypeCount: Array.isArray(normalized.upsert_relation_types) ? normalized.upsert_relation_types.length : 0,
    deleteRelationTypeCount: Array.isArray(normalized.delete_relation_type_codes) ? normalized.delete_relation_type_codes.length : 0,
    upsertNodeCount: Array.isArray(normalized.upsert_nodes) ? normalized.upsert_nodes.length : 0,
    deleteNodeCount: Array.isArray(normalized.delete_node_ids) ? normalized.delete_node_ids.length : 0,
    upsertEdgeCount: Array.isArray(normalized.upsert_edges) ? normalized.upsert_edges.length : 0,
    deleteEdgeCount: Array.isArray(normalized.delete_edge_ids) ? normalized.delete_edge_ids.length : 0,
    upsertEventCount: Array.isArray(normalized.upsert_events) ? normalized.upsert_events.length : 0,
    appendEventEffectCount: Array.isArray(normalized.append_event_effects) ? normalized.append_event_effects.length : 0,
  }
}

function isEmptyWorldGraphPatchSummary(summary) {
  return summary.upsertRelationTypeCount === 0
    && summary.deleteRelationTypeCount === 0
    && summary.upsertNodeCount === 0
    && summary.deleteNodeCount === 0
    && summary.upsertEdgeCount === 0
    && summary.deleteEdgeCount === 0
    && summary.upsertEventCount === 0
    && summary.appendEventEffectCount === 0
}

function buildStructuredDebugPayload({ method, schemaKind, raw, parsed, parsingError = null, recovered = false }) {
  const candidates = collectStructuredCandidates(raw)
  return {
    method,
    schemaKind,
    recovered,
    parsingError: parsingError ? String(parsingError.message || parsingError) : '',
    rawKeys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 20) : [],
    rawTextPreview: truncateForLog(chunkText(raw), 1200),
    parsedPreview: safeJsonForLog(parsed, 800),
    candidateCount: candidates.length,
    candidatePreview: candidates.slice(0, 2).map(summarizeStructuredCandidate),
  }
}

function getStructuredNormalizer(schemaKind) {
  if (schemaKind === 'robot_generation_core') {
    return {
      schema: RobotGenerationCorePayloadStructuredSchema,
      normalize: normalizeRobotGenerationCorePayload,
      coerceStructuredValue: coerceRobotGenerationCoreStructuredValue,
    }
  }
  if (schemaKind === 'memory_schema') {
    return {
      schema: GeneratedMemorySchemaPayloadStructuredSchema,
      normalize: normalizeGeneratedMemorySchemaPayload,
      coerceStructuredValue: coerceMemorySchemaStructuredValue,
    }
  }
  if (schemaKind === 'world_graph_patch') {
    return {
      schema: GeneratedWorldGraphPatchPayloadStructuredSchema,
      normalize: normalizeGeneratedWorldGraphPatchPayload,
      coerceStructuredValue: coerceWorldGraphPatchStructuredValue,
    }
  }
  throw new Error(`Unknown structured schema kind: ${schemaKind}`)
}

function asObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {}
}

function readValue(source, keys, fallback = undefined) {
  const object = asObject(source)
  for (const key of keys) {
    if (object[key] !== undefined) {
      return object[key]
    }
  }
  return fallback
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  const text = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(text)) {
    return true
  }
  if (['false', '0', 'no', 'n', 'off'].includes(text)) {
    return false
  }
  return fallback
}

function normalizeNumber(value, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function normalizeInteger(value, fallback = 0) {
  return Math.trunc(normalizeNumber(value, fallback))
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }
  return String(value)
}

function coerceRobotGenerationCoreStructuredValue(input) {
  const source = asObject(input)
  return {
    name: normalizeString(readValue(source, ['name'])),
    description: normalizeString(readValue(source, ['description'])),
    systemPrompt: normalizeString(readValue(source, ['systemPrompt', 'system_prompt'])),
    commonPrompt: normalizeString(readValue(source, ['commonPrompt', 'common_prompt'])),
    documentSummary: normalizeString(readValue(source, ['documentSummary', 'document_summary'])),
    retrievalSummary: normalizeString(readValue(source, ['retrievalSummary', 'retrieval_summary'])),
  }
}

function coerceMemorySchemaStructuredValue(input) {
  const source = asObject(input)
  return {
    categories: (Array.isArray(readValue(source, ['categories'])) ? readValue(source, ['categories']) : []).map((category) => ({
      id: normalizeString(readValue(category, ['id'])),
      label: normalizeString(readValue(category, ['label'])),
      description: normalizeString(readValue(category, ['description'])),
      extractionInstructions: normalizeString(readValue(category, ['extractionInstructions', 'extraction_instructions'])),
      fields: (Array.isArray(readValue(category, ['fields'])) ? readValue(category, ['fields']) : []).map((field) => ({
        id: normalizeString(readValue(field, ['id'])),
        name: normalizeString(readValue(field, ['name'])),
        label: normalizeString(readValue(field, ['label'])),
        type: normalizeString(readValue(field, ['type']), 'text'),
        required: normalizeBoolean(readValue(field, ['required']), false),
        options: (Array.isArray(readValue(field, ['options'])) ? readValue(field, ['options']) : []).map((option) => ({
          label: normalizeString(readValue(option, ['label'])),
          value: normalizeString(readValue(option, ['value'])),
        })),
      })),
    })),
  }
}

function coerceWorldGraphPatchStructuredValue(input) {
  const source = asObject(input)
  return {
    meta: {
      title: normalizeString(readValue(readValue(source, ['meta']), ['title'])),
      description: normalizeString(readValue(readValue(source, ['meta']), ['description', 'summary'])),
    },
    upsertRelationTypes: (Array.isArray(readValue(source, ['upsertRelationTypes', 'upsert_relation_types'])) ? readValue(source, ['upsertRelationTypes', 'upsert_relation_types']) : []).map((item) => ({
      id: normalizeString(readValue(item, ['id'])),
      name: normalizeString(readValue(item, ['name', 'label'])),
      description: normalizeString(readValue(item, ['description'])),
      directionality: normalizeString(readValue(item, ['directionality'])),
    })),
    deleteRelationTypeCodes: (Array.isArray(readValue(source, ['deleteRelationTypeCodes', 'delete_relation_type_codes'])) ? readValue(source, ['deleteRelationTypeCodes', 'delete_relation_type_codes']) : []).map((item) => normalizeString(item)).filter(Boolean),
    upsertNodes: (Array.isArray(readValue(source, ['upsertNodes', 'upsert_nodes'])) ? readValue(source, ['upsertNodes', 'upsert_nodes']) : []).map((item) => ({
      id: normalizeString(readValue(item, ['id'])),
      name: normalizeString(readValue(item, ['name'])),
      type: normalizeString(readValue(item, ['type', 'objectType', 'object_type'])),
      description: normalizeString(readValue(item, ['description', 'summary'])),
    })),
    deleteNodeIds: (Array.isArray(readValue(source, ['deleteNodeIds', 'delete_node_ids'])) ? readValue(source, ['deleteNodeIds', 'delete_node_ids']) : []).map((item) => normalizeString(item)).filter(Boolean),
    upsertEdges: (Array.isArray(readValue(source, ['upsertEdges', 'upsert_edges'])) ? readValue(source, ['upsertEdges', 'upsert_edges']) : []).map((item) => ({
      id: normalizeString(readValue(item, ['id'])),
      source: normalizeString(readValue(item, ['source', 'sourceNodeId', 'source_node_id'])),
      target: normalizeString(readValue(item, ['target', 'targetNodeId', 'target_node_id'])),
      relationType: normalizeString(readValue(item, ['relationType', 'relation_type', 'relationTypeCode', 'relation_type_code'])),
      description: normalizeString(readValue(item, ['description', 'summary'])),
    })),
    upsertEvents: (Array.isArray(readValue(source, ['upsertEvents', 'upsert_events'])) ? readValue(source, ['upsertEvents', 'upsert_events']) : []).map((item) => ({
      id: normalizeString(readValue(item, ['id'])),
      name: normalizeString(readValue(item, ['name'])),
      description: normalizeString(readValue(item, ['description', 'summary'])),
      timeline: {
        sequenceIndex: normalizeInteger(readValue(readValue(item, ['timeline']), ['sequenceIndex', 'sequence_index']), 0),
        calendarId: normalizeString(readValue(readValue(item, ['timeline']), ['calendarId', 'calendar_id'])),
        yearLabel: normalizeString(readValue(readValue(item, ['timeline']), ['yearLabel', 'year_label'])),
        monthLabel: normalizeString(readValue(readValue(item, ['timeline']), ['monthLabel', 'month_label'])),
        dayLabel: normalizeString(readValue(readValue(item, ['timeline']), ['dayLabel', 'day_label'])),
        timeOfDayLabel: normalizeString(readValue(readValue(item, ['timeline']), ['timeOfDayLabel', 'time_of_day_label'])),
        phase: normalizeString(readValue(readValue(item, ['timeline']), ['phase'])),
        impactLevel: normalizeInteger(readValue(readValue(item, ['timeline']), ['impactLevel', 'impact_level']), 0),
        eventType: normalizeString(readValue(readValue(item, ['timeline']), ['eventType', 'event_type'])),
      },
    })),
    appendEventEffects: (Array.isArray(readValue(source, ['appendEventEffects', 'append_event_effects'])) ? readValue(source, ['appendEventEffects', 'append_event_effects']) : []).map((item) => ({
      ref: {
        nodeId: normalizeString(readValue(readValue(item, ['ref', 'eventRef', 'event_ref']), ['nodeId', 'node_id', 'id'])),
        name: normalizeString(readValue(readValue(item, ['ref', 'eventRef', 'event_ref']), ['name'])),
        objectType: 'event',
      },
      effects: (Array.isArray(readValue(item, ['effects'])) ? readValue(item, ['effects']) : [readValue(item, ['effect'])])
        .filter(Boolean)
        .map((effect) => ({
          id: normalizeString(readValue(effect, ['id'])),
          summary: normalizeString(readValue(effect, ['summary'])),
          targetNodeId: normalizeString(readValue(effect, ['targetNodeId', 'target_node_id'])),
          changeTargetType: normalizeString(readValue(effect, ['changeTargetType', 'change_target_type']), 'node-content') === 'relation' ? 'relation' : 'node-content',
          nodeAttributeChanges: (Array.isArray(readValue(effect, ['nodeAttributeChanges', 'node_attribute_changes'])) ? readValue(effect, ['nodeAttributeChanges', 'node_attribute_changes']) : []).map((change) => ({
            fieldKey: normalizeString(readValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(readValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(readValue(change, ['afterValue', 'after_value'])),
          })),
          relationMode: normalizeString(readValue(effect, ['relationMode', 'relation_mode']), 'existing') === 'create' ? 'create' : 'existing',
          relationId: normalizeString(readValue(effect, ['relationId', 'relation_id'])),
          relationChanges: (Array.isArray(readValue(effect, ['relationChanges', 'relation_changes'])) ? readValue(effect, ['relationChanges', 'relation_changes']) : []).map((change) => ({
            fieldKey: normalizeString(readValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(readValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(readValue(change, ['afterValue', 'after_value'])),
          })),
          relationDraft: {
            targetNodeId: normalizeString(readValue(readValue(effect, ['relationDraft', 'relation_draft']), ['targetNodeId', 'target_node_id'])),
            relationTypeCode: normalizeString(readValue(readValue(effect, ['relationDraft', 'relation_draft']), ['relationTypeCode', 'relation_type_code'])),
            relationLabel: normalizeString(readValue(readValue(effect, ['relationDraft', 'relation_draft']), ['relationLabel', 'relation_label'])),
            summary: normalizeString(readValue(readValue(effect, ['relationDraft', 'relation_draft']), ['summary'])),
            status: normalizeString(readValue(readValue(effect, ['relationDraft', 'relation_draft']), ['status'])),
            intensity: (() => {
              const intensity = readValue(readValue(effect, ['relationDraft', 'relation_draft']), ['intensity'])
              return intensity === null || intensity === undefined ? null : normalizeInteger(intensity, 0)
            })(),
          },
        })),
    })),
    deleteEdgeIds: (Array.isArray(readValue(source, ['deleteEdgeIds', 'delete_edge_ids'])) ? readValue(source, ['deleteEdgeIds', 'delete_edge_ids']) : []).map((item) => normalizeString(item)).filter(Boolean),
  }
}

function ensureWorldGraphPatchField(path, value) {
  if (!String(value || '').trim()) {
    throw new Error(`世界图谱 patch 非法：${path} 不能为空`)
  }
}

function ensureWorldGraphPatchPayload(payload) {
  for (const [index, item] of (Array.isArray(payload?.upsertRelationTypes) ? payload.upsertRelationTypes : []).entries()) {
    ensureWorldGraphPatchField(`upsertRelationTypes[${index}].id`, item?.id)
    ensureWorldGraphPatchField(`upsertRelationTypes[${index}].name`, item?.name)
    ensureWorldGraphPatchField(`upsertRelationTypes[${index}].description`, item?.description)
  }
  for (const [index, item] of (Array.isArray(payload?.upsertNodes) ? payload.upsertNodes : []).entries()) {
    ensureWorldGraphPatchField(`upsertNodes[${index}].id`, item?.id)
    ensureWorldGraphPatchField(`upsertNodes[${index}].name`, item?.name)
    ensureWorldGraphPatchField(`upsertNodes[${index}].type`, item?.type)
    ensureWorldGraphPatchField(`upsertNodes[${index}].description`, item?.description)
  }
  for (const [index, item] of (Array.isArray(payload?.upsertEdges) ? payload.upsertEdges : []).entries()) {
    ensureWorldGraphPatchField(`upsertEdges[${index}].id`, item?.id)
    ensureWorldGraphPatchField(`upsertEdges[${index}].source`, item?.source)
    ensureWorldGraphPatchField(`upsertEdges[${index}].target`, item?.target)
    ensureWorldGraphPatchField(`upsertEdges[${index}].relationType`, item?.relationType)
    ensureWorldGraphPatchField(`upsertEdges[${index}].description`, item?.description)
  }
  for (const [index, item] of (Array.isArray(payload?.upsertEvents) ? payload.upsertEvents : []).entries()) {
    ensureWorldGraphPatchField(`upsertEvents[${index}].id`, item?.id)
    ensureWorldGraphPatchField(`upsertEvents[${index}].name`, item?.name)
    ensureWorldGraphPatchField(`upsertEvents[${index}].description`, item?.description)
  }
  for (const [index, item] of (Array.isArray(payload?.appendEventEffects) ? payload.appendEventEffects : []).entries()) {
    const ref = item?.ref || {}
    if (!String(ref.nodeId || '').trim() && !String(ref.name || '').trim()) {
      throw new Error(`世界图谱 patch 非法：appendEventEffects[${index}].ref.nodeId 或 ref.name 至少要提供一个`)
    }
    const effects = Array.isArray(item?.effects) ? item.effects : []
    if (!effects.length) {
      throw new Error(`世界图谱 patch 非法：appendEventEffects[${index}].effects 至少要有一项`)
    }
    for (const [effectIndex, effect] of effects.entries()) {
      ensureWorldGraphPatchField(`appendEventEffects[${index}].effects[${effectIndex}].id`, effect?.id)
      ensureWorldGraphPatchField(`appendEventEffects[${index}].effects[${effectIndex}].summary`, effect?.summary)
    }
  }
}

function finalizeStructuredPayload(schemaKind, schema, value) {
  const validated = validateStructuredSchema(schema, value)
  if (schemaKind === 'world_graph_patch') {
    ensureWorldGraphPatchPayload(validated)
  }
  return validated
}

function recoverStructuredPayload(schemaKind, raw) {
  const { schema, coerceStructuredValue } = getStructuredNormalizer(schemaKind)
  let lastError = null
  for (const candidate of collectStructuredCandidates(raw)) {
    try {
      const value = typeof candidate === 'string' ? parseJsonObject(candidate, {}) : candidate
      return {
        data: finalizeStructuredPayload(schemaKind, schema, coerceStructuredValue(value)),
        error: null,
      }
    } catch (error) {
      lastError = error
      // keep trying
    }
  }
  return {
    data: null,
    error: lastError,
  }
}

export function createDefaultLangChainModel(config) {
  return new ChatOpenAI({
    model: config.model,
    apiKey: resolveModelApiKey(config),
    configuration: resolveModelBaseUrl(config) ? { baseURL: resolveModelBaseUrl(config) } : undefined,
    temperature: typeof config.temperature === 'number' ? config.temperature : 0.7,
    streamUsage: true,
  })
}

async function invokeRunnable(runnable, input) {
  if (runnable && typeof runnable.invoke === 'function') {
    return runnable.invoke(input)
  }
  if (runnable && typeof runnable.ainvoke === 'function') {
    return runnable.ainvoke(input)
  }
  throw new Error('LangChain runnable does not implement invoke()')
}

async function streamRunnable(runnable, input) {
  let stream = null
  if (runnable && typeof runnable.stream === 'function') {
    stream = await runnable.stream(input)
  }
  if (!stream && runnable && typeof runnable.astream === 'function') {
    stream = await runnable.astream(input)
  }
  if (stream && (typeof stream[Symbol.asyncIterator] === 'function' || typeof stream[Symbol.iterator] === 'function')) {
    return stream
  }
  throw new Error('LangChain runnable does not implement stream() or did not return an iterable stream')
}

export function createModelClient(options = {}) {
  const createModel = options.createModel || createDefaultLangChainModel

  return {
    async invokeText(config, systemInstruction, userContent) {
      const model = createModel(config)
      const response = await invokeRunnable(model, toLangChainMessages([
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userContent },
      ]))
      return {
        text: chunkText(response).trim(),
        usage: extractUsage(response),
        raw: response,
      }
    },

    async streamText(config, messages, onChunk) {
      const model = createModel(config)
      let text = ''
      let usage = { prompt_tokens: 0, completion_tokens: 0 }
      const stream = await streamRunnable(model, toLangChainMessages(messages))
      for await (const chunk of stream) {
        const delta = chunkText(chunk)
        if (delta) {
          text += delta
          await onChunk?.(delta)
        }
        const chunkUsage = extractUsage(chunk)
        if (chunkUsage.prompt_tokens || chunkUsage.completion_tokens) {
          usage = chunkUsage
        }
      }
      return {
        text,
        usage,
      }
    },

    async invokeStructured(config, systemInstruction, userContent, schemaKind, stageLabel) {
      const { schema } = getStructuredNormalizer(schemaKind)
      const methods = String(config?.provider || 'openai').trim().toLowerCase() === 'ollama'
        ? ['jsonMode', 'functionCalling']
        : ['jsonSchema', 'jsonMode', 'functionCalling']
      let lastError = null

      for (const method of methods) {
        try {
          const model = createModel(config)
          const structuredOutputConfig = {
            method,
            includeRaw: true,
          }
          if (method !== 'jsonMode') {
            structuredOutputConfig.strict = true
          }
          const runnable = model.withStructuredOutput(schema, structuredOutputConfig)

          const result = await invokeRunnable(runnable, toLangChainMessages([
            {
              role: 'system',
              content: method === 'jsonMode'
                ? `${systemInstruction}\n\n你必须只输出单个 JSON 对象，不要输出解释、Markdown、代码块或多个 JSON 对象。`
                : systemInstruction,
            },
            { role: 'user', content: userContent },
          ]))

          const parsed = result?.parsed ?? result
          const raw = result?.raw ?? null
          const parsingError = result?.parsingError ?? null
          if (parsingError) {
            const recovered = recoverStructuredPayload(schemaKind, raw)
            if (recovered.data) {
              return {
                data: recovered.data,
                usage: extractUsage(raw),
                debug: buildStructuredDebugPayload({
                  method,
                  schemaKind,
                  raw,
                  parsed: recovered.data,
                  parsingError,
                  recovered: true,
                }),
              }
            }
            throw recovered.error || parsingError
          }

          if (!parsed) {
            const recovered = recoverStructuredPayload(schemaKind, raw)
            if (recovered.data) {
              return {
                data: recovered.data,
                usage: extractUsage(raw),
                debug: buildStructuredDebugPayload({
                  method,
                  schemaKind,
                  raw,
                  parsed: recovered.data,
                  recovered: true,
                }),
              }
            }
            throw recovered.error || new Error('模型没有返回结构化结果')
          }

          let validated = null
          try {
            validated = finalizeStructuredPayload(schemaKind, schema, parsed)
          } catch (validationError) {
            const recovered = recoverStructuredPayload(schemaKind, raw)
            if (recovered.data) {
              return {
                data: recovered.data,
                usage: extractUsage(raw),
                debug: buildStructuredDebugPayload({
                  method,
                  schemaKind,
                  raw,
                  parsed: recovered.data,
                  recovered: true,
                }),
              }
            }
            throw recovered.error || validationError
          }
          if (schemaKind === 'world_graph_patch') {
            const patchSummary = summarizeWorldGraphPatchPayload(validated)
            if (isEmptyWorldGraphPatchSummary(patchSummary)) {
              const recovered = recoverStructuredPayload(schemaKind, raw)
              const recoveredSummary = recovered.data ? summarizeWorldGraphPatchPayload(recovered.data) : null
              if (recovered.data && recoveredSummary && !isEmptyWorldGraphPatchSummary(recoveredSummary)) {
                const debug = buildStructuredDebugPayload({
                  method,
                  schemaKind,
                  raw,
                  parsed: recovered.data,
                  recovered: true,
                })
                return {
                  data: recovered.data,
                  usage: extractUsage(raw),
                  debug,
                }
              }
              if (collectStructuredCandidates(raw).length && recovered.error) {
                throw recovered.error
              }
              const debug = buildStructuredDebugPayload({
                method,
                schemaKind,
                raw,
                parsed: validated,
              })
              return {
                data: validated,
                usage: extractUsage(raw),
                debug,
              }
            }
          }

          const debug = buildStructuredDebugPayload({
            method,
            schemaKind,
            raw,
            parsed: validated,
          })

          return {
            data: validated,
            usage: extractUsage(raw),
            debug,
          }
        } catch (error) {
          lastError = error
        }
      }

      const detail = lastError instanceof Error ? lastError.message : String(lastError || '')
      throw new Error(`${stageLabel}生成失败：${detail || stageLabel}`)
    },
  }
}
