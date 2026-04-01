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
    numericComputationEnabled: normalizeBoolean(readValue(source, [
      'numericComputationEnabled',
      'numeric_computation_enabled',
      'imageFetchEnabled',
      'image_fetch_enabled',
    ]), false),
    numericComputationPrompt: normalizeString(readValue(source, [
      'numericComputationPrompt',
      'numeric_computation_prompt',
      'imageFetchPrompt',
      'image_fetch_prompt',
    ])),
    numericComputationItems: (Array.isArray(readValue(source, ['numericComputationItems', 'numeric_computation_items'])) ? readValue(source, ['numericComputationItems', 'numeric_computation_items']) : []).map((item) => ({
      name: normalizeString(readValue(item, ['name'])),
      currentValue: normalizeNumber(readValue(item, ['currentValue', 'current_value']), 0),
      description: normalizeString(readValue(item, ['description'])),
    })),
    structuredMemoryInterval: normalizeInteger(readValue(source, ['structuredMemoryInterval', 'structured_memory_interval']), 3),
    structuredMemoryHistoryLimit: normalizeInteger(readValue(source, ['structuredMemoryHistoryLimit', 'structured_memory_history_limit']), 12),
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
      directionality: normalizeString(readValue(item, ['directionality']), 'directed') === 'undirected' ? 'undirected' : 'directed',
    })),
    deleteRelationTypeCodes: (Array.isArray(readValue(source, ['deleteRelationTypeCodes', 'delete_relation_type_codes'])) ? readValue(source, ['deleteRelationTypeCodes', 'delete_relation_type_codes']) : []).map((item) => normalizeString(item)).filter(Boolean),
    upsertNodes: (Array.isArray(readValue(source, ['upsertNodes', 'upsert_nodes'])) ? readValue(source, ['upsertNodes', 'upsert_nodes']) : []).map((item) => ({
      id: normalizeString(readValue(item, ['id'])),
      name: normalizeString(readValue(item, ['name'])),
      type: normalizeString(readValue(item, ['type', 'objectType', 'object_type']), 'character'),
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
    deleteEdgeIds: (Array.isArray(readValue(source, ['deleteEdgeIds', 'delete_edge_ids'])) ? readValue(source, ['deleteEdgeIds', 'delete_edge_ids']) : []).map((item) => normalizeString(item)).filter(Boolean),
  }
}

function recoverStructuredPayload(schemaKind, raw) {
  const { schema, coerceStructuredValue } = getStructuredNormalizer(schemaKind)
  for (const candidate of collectStructuredCandidates(raw)) {
    try {
      const value = typeof candidate === 'string' ? parseJsonObject(candidate, {}) : candidate
      return validateStructuredSchema(schema, coerceStructuredValue(value))
    } catch {
      // keep trying
    }
  }
  return null
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
            if (recovered) {
              return { data: recovered, usage: extractUsage(raw) }
            }
            throw parsingError
          }

          if (!parsed) {
            const recovered = recoverStructuredPayload(schemaKind, raw)
            if (recovered) {
              return { data: recovered, usage: extractUsage(raw) }
            }
            throw new Error('模型没有返回结构化结果')
          }

          return {
            data: validateStructuredSchema(schema, parsed),
            usage: extractUsage(raw),
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
