import { z } from 'zod'

import { getPromptDefaults } from './prompt-config.mjs'

function asObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {}
}

function pickValue(source, keys, fallback = undefined) {
  const object = asObject(source)
  for (const key of keys) {
    if (object[key] !== undefined) {
      return object[key]
    }
  }
  return fallback
}

function normalizeString(value, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }
  return String(value)
}

function normalizeTrimmedString(value, fallback = '') {
  const result = normalizeString(value, fallback).trim()
  return result || fallback
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  const text = normalizeTrimmedString(value).toLowerCase()
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

function normalizeOptionalInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null
}

function normalizeStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeTrimmedString(item))
    .filter(Boolean)
}

export const MemorySchemaOptionSchema = z.object({
  label: z.string().default(''),
  value: z.string().default(''),
})

export const MemorySchemaFieldSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  label: z.string().default(''),
  type: z.enum(['text', 'number', 'enum', 'boolean']).default('text'),
  required: z.boolean().default(false),
  options: z.array(MemorySchemaOptionSchema).default([]),
})

export const MemoryCategorySchemaSchema = z.object({
  id: z.string().default(''),
  label: z.string().default(''),
  description: z.string().default(''),
  extraction_instructions: z.string().default(''),
  fields: z.array(MemorySchemaFieldSchema).default([]),
})

export const MemorySchemaSchema = z.object({
  categories: z.array(MemoryCategorySchemaSchema).default([]),
})

export const StructuredMemoryItemSchema = z.object({
  id: z.string().default(''),
  summary: z.string().default(''),
  source_turn_id: z.string().default(''),
  updated_at: z.string().default(''),
  values: z.record(z.any()).default({}),
})

export const StructuredMemoryCategorySchema = z.object({
  category_id: z.string().default(''),
  label: z.string().default(''),
  description: z.string().default(''),
  updated_at: z.string().default(''),
  items: z.array(StructuredMemoryItemSchema).default([]),
})

export const StructuredMemorySchema = z.object({
  updated_at: z.string().default(''),
  categories: z.array(StructuredMemoryCategorySchema).default([]),
})

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().default(''),
})

export const ModelConfigSchema = z.object({
  provider: z.string().default('openai'),
  base_url: z.string().default(''),
  api_key: z.string().default(''),
  model: z.string().default(''),
  temperature: z.number().nullable().optional().default(0.7),
})

export const RunUserSchema = z.object({
  id: z.string().default(''),
  email: z.string().nullable().optional().default(null),
  display_name: z.string().nullable().optional().default(null),
})

export const RobotProfileSchema = z.object({
  id: z.string().default(''),
  name: z.string().default('当前智能体'),
  avatar: z.string().default(''),
  common_prompt: z.string().default(''),
  system_prompt: z.string().default(''),
  memory_model_config_id: z.string().default(''),
  outline_model_config_id: z.string().default(''),
  numeric_computation_model_config_id: z.string().default(''),
  world_graph_model_config_id: z.string().default(''),
  numeric_computation_enabled: z.boolean().default(false),
  numeric_computation_prompt: z.string().default(''),
  numeric_computation_items: z.array(z.record(z.any())).default([]),
  structured_memory_interval: z.number().int().nullable().optional().default(null),
  structured_memory_history_limit: z.number().int().nullable().optional().default(null),
})

export const AuxiliaryModelConfigsSchema = z.object({
  memory: ModelConfigSchema.nullable().optional().default(null),
  outline: ModelConfigSchema.nullable().optional().default(null),
  numeric_computation: ModelConfigSchema.nullable().optional().default(null),
  world_graph: ModelConfigSchema.nullable().optional().default(null),
})

export const ThreadStateSchema = z.object({
  thread_id: z.string().default(''),
  messages: z.array(ChatMessageSchema).default([]),
  memory_schema: MemorySchemaSchema.default({ categories: [] }),
  structured_memory: StructuredMemorySchema.default({ updated_at: '', categories: [] }),
  numeric_state: z.record(z.any()).default({}),
  story_outline: z.string().default(''),
})

export const GeneratedNumericComputationItemStructuredSchema = z.object({
  name: z.string().default(''),
  currentValue: z.number().default(0),
  description: z.string().default(''),
})

export const GeneratedMemorySchemaOptionStructuredSchema = z.object({
  label: z.string().default(''),
  value: z.string().default(''),
})

export const GeneratedMemorySchemaFieldStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  label: z.string().default(''),
  type: z.enum(['text', 'number', 'enum', 'boolean']).default('text'),
  required: z.boolean().default(false),
  options: z.array(GeneratedMemorySchemaOptionStructuredSchema).default([]),
})

export const GeneratedMemoryCategorySchemaStructuredSchema = z.object({
  id: z.string().default(''),
  label: z.string().default(''),
  description: z.string().default(''),
  extractionInstructions: z.string().default(''),
  fields: z.array(GeneratedMemorySchemaFieldStructuredSchema).default([]),
})

export const GeneratedMemorySchemaPayloadStructuredSchema = z.object({
  categories: z.array(GeneratedMemoryCategorySchemaStructuredSchema).default([]),
})

export const GeneratedWorldGraphMetaStructuredSchema = z.object({
  title: z.string().default(''),
  description: z.string().default(''),
})

export const GeneratedWorldGraphRelationTypeStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  description: z.string().default(''),
  directionality: z.enum(['directed', 'undirected']).default('directed'),
})

export const GeneratedWorldGraphNodeStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  type: z.enum(['character', 'organization', 'location', 'event', 'item']).default('character'),
  description: z.string().default(''),
})

export const GeneratedWorldGraphEdgeStructuredSchema = z.object({
  id: z.string().default(''),
  source: z.string().default(''),
  target: z.string().default(''),
  relationType: z.string().default(''),
  description: z.string().default(''),
})

export const GeneratedWorldGraphTimelineStructuredSchema = z.object({
  sequenceIndex: z.number().int().nonnegative().default(0),
  calendarId: z.string().default(''),
  yearLabel: z.string().default(''),
  monthLabel: z.string().default(''),
  dayLabel: z.string().default(''),
  timeOfDayLabel: z.string().default(''),
  phase: z.string().default(''),
  impactLevel: z.number().int().min(0).max(100).default(0),
  eventType: z.string().default(''),
})

export const GeneratedWorldGraphEventStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  description: z.string().default(''),
  timeline: GeneratedWorldGraphTimelineStructuredSchema.default({
    sequenceIndex: 0,
    calendarId: '',
    yearLabel: '',
    monthLabel: '',
    dayLabel: '',
    timeOfDayLabel: '',
    phase: '',
    impactLevel: 0,
    eventType: '',
  }),
})

export const GeneratedWorldGraphEffectFieldChangeStructuredSchema = z.object({
  fieldKey: z.string().default(''),
  beforeValue: z.string().default(''),
  afterValue: z.string().default(''),
})

export const GeneratedWorldGraphEffectRelationDraftStructuredSchema = z.object({
  targetNodeId: z.string().default(''),
  relationTypeCode: z.string().default(''),
  relationLabel: z.string().default(''),
  summary: z.string().default(''),
  status: z.string().default(''),
  intensity: z.number().int().min(0).max(100).nullable().optional().default(null),
})

export const GeneratedWorldGraphEventEffectStructuredSchema = z.object({
  id: z.string().default(''),
  summary: z.string().default(''),
  targetNodeId: z.string().default(''),
  changeTargetType: z.enum(['node-content', 'relation']).default('node-content'),
  nodeAttributeChanges: z.array(GeneratedWorldGraphEffectFieldChangeStructuredSchema).default([]),
  relationMode: z.enum(['existing', 'create']).default('existing'),
  relationId: z.string().default(''),
  relationChanges: z.array(GeneratedWorldGraphEffectFieldChangeStructuredSchema).default([]),
  relationDraft: GeneratedWorldGraphEffectRelationDraftStructuredSchema.default({
    targetNodeId: '',
    relationTypeCode: '',
    relationLabel: '',
    summary: '',
    status: '',
    intensity: null,
  }),
})

export const GeneratedWorldGraphEventEffectOpStructuredSchema = z.object({
  ref: z.object({
    nodeId: z.string().default(''),
    name: z.string().default(''),
    objectType: z.literal('event').default('event'),
  }).default({
    nodeId: '',
    name: '',
    objectType: 'event',
  }),
  effects: z.array(GeneratedWorldGraphEventEffectStructuredSchema).default([]),
})

export const GeneratedWorldGraphPatchPayloadStructuredSchema = z.object({
  meta: GeneratedWorldGraphMetaStructuredSchema.default({ title: '', description: '' }),
  upsertRelationTypes: z.array(GeneratedWorldGraphRelationTypeStructuredSchema).default([]),
  deleteRelationTypeCodes: z.array(z.string()).default([]),
  upsertNodes: z.array(GeneratedWorldGraphNodeStructuredSchema).default([]),
  deleteNodeIds: z.array(z.string()).default([]),
  upsertEdges: z.array(GeneratedWorldGraphEdgeStructuredSchema).default([]),
  upsertEvents: z.array(GeneratedWorldGraphEventStructuredSchema).default([]),
  appendEventEffects: z.array(GeneratedWorldGraphEventEffectOpStructuredSchema).default([]),
  deleteEdgeIds: z.array(z.string()).default([]),
})

export const GraphRagEntityStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  type: z.enum(['character', 'organization', 'location', 'event', 'item']).default('character'),
  summary: z.string().default(''),
  aliases: z.array(z.string()).default([]),
  communityIds: z.array(z.string()).default([]),
})

export const GraphRagRelationStructuredSchema = z.object({
  id: z.string().default(''),
  sourceId: z.string().default(''),
  targetId: z.string().default(''),
  relationTypeId: z.string().default(''),
  summary: z.string().default(''),
})

export const GraphRagEventStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  summary: z.string().default(''),
  timeline: GeneratedWorldGraphTimelineStructuredSchema.default({
    sequenceIndex: 0,
    calendarId: '',
    yearLabel: '',
    monthLabel: '',
    dayLabel: '',
    timeOfDayLabel: '',
    phase: '',
    impactLevel: 0,
    eventType: '',
  }),
  participantEntityIds: z.array(z.string()).default([]),
  communityIds: z.array(z.string()).default([]),
})

export const GraphRagCommunityStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  summary: z.string().default(''),
  entityIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
})

export const GraphRagChunkStructuredSchema = z.object({
  documentId: z.string().default(''),
  sourceName: z.string().default(''),
  segmentIndex: z.number().int().nonnegative().default(0),
  summary: z.string().default(''),
  excerpt: z.string().default(''),
  entityIds: z.array(z.string()).default([]),
  relationIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
  communityIds: z.array(z.string()).default([]),
})

export const GraphRagGraphPayloadStructuredSchema = z.object({
  meta: z.object({
    title: z.string().default(''),
    summary: z.string().default(''),
  }).default({ title: '', summary: '' }),
  relationTypes: z.array(GeneratedWorldGraphRelationTypeStructuredSchema).default([]),
  entities: z.array(GraphRagEntityStructuredSchema).default([]),
  relations: z.array(GraphRagRelationStructuredSchema).default([]),
  events: z.array(GraphRagEventStructuredSchema).default([]),
  appendEventEffects: z.array(GeneratedWorldGraphEventEffectOpStructuredSchema).default([]),
  communities: z.array(GraphRagCommunityStructuredSchema).default([]),
  chunks: z.array(GraphRagChunkStructuredSchema).default([]),
})

export const GraphRagRetrievedCommunityStructuredSchema = z.object({
  id: z.string().default(''),
  name: z.string().default(''),
  summary: z.string().default(''),
  score: z.number().default(0),
})

export const GraphRagRetrievedChunkStructuredSchema = z.object({
  documentId: z.string().default(''),
  sourceName: z.string().default(''),
  segmentIndex: z.number().int().nonnegative().default(0),
  summary: z.string().default(''),
  excerpt: z.string().default(''),
  score: z.number().default(0),
  entityIds: z.array(z.string()).default([]),
  communityIds: z.array(z.string()).default([]),
  eventIds: z.array(z.string()).default([]),
})

export const GraphRagRetrievePayloadStructuredSchema = z.object({
  summary: z.string().default(''),
  communities: z.array(GraphRagRetrievedCommunityStructuredSchema).default([]),
  entities: z.array(GraphRagEntityStructuredSchema).default([]),
  events: z.array(GraphRagEventStructuredSchema).default([]),
  chunks: z.array(GraphRagRetrievedChunkStructuredSchema).default([]),
})

export const GraphRagWritebackPayloadStructuredSchema = z.object({
  summary: z.string().default(''),
  relationTypes: z.array(GeneratedWorldGraphRelationTypeStructuredSchema).default([]),
  entities: z.array(GraphRagEntityStructuredSchema).default([]),
  relations: z.array(GraphRagRelationStructuredSchema).default([]),
  events: z.array(GraphRagEventStructuredSchema).default([]),
  appendEventEffects: z.array(GeneratedWorldGraphEventEffectOpStructuredSchema).default([]),
})

export const RobotGenerationCorePayloadStructuredSchema = z.object({
  name: z.string().default(''),
  description: z.string().default(''),
  systemPrompt: z.string().default(''),
  commonPrompt: z.string().default(''),
  numericComputationEnabled: z.boolean().default(false),
  numericComputationPrompt: z.string().default(''),
  numericComputationItems: z.array(GeneratedNumericComputationItemStructuredSchema).default([]),
  structuredMemoryInterval: z.number().int().default(3),
  structuredMemoryHistoryLimit: z.number().int().default(12),
  documentSummary: z.string().default(''),
  retrievalSummary: z.string().default(''),
})

function normalizeMemorySchemaOption(input) {
  const source = asObject(input)
  return {
    label: normalizeString(pickValue(source, ['label'])),
    value: normalizeString(pickValue(source, ['value'])),
  }
}

function normalizeMemorySchemaField(input) {
  const source = asObject(input)
  return {
    id: normalizeString(pickValue(source, ['id'])),
    name: normalizeString(pickValue(source, ['name'])),
    label: normalizeString(pickValue(source, ['label'])),
    type: normalizeString(pickValue(source, ['type']), 'text'),
    required: normalizeBoolean(pickValue(source, ['required']), false),
    options: (Array.isArray(pickValue(source, ['options'])) ? pickValue(source, ['options']) : []).map(normalizeMemorySchemaOption),
  }
}

function normalizeMemoryCategorySchema(input) {
  const source = asObject(input)
  return {
    id: normalizeString(pickValue(source, ['id'])),
    label: normalizeString(pickValue(source, ['label'])),
    description: normalizeString(pickValue(source, ['description'])),
    extraction_instructions: normalizeString(pickValue(source, ['extraction_instructions', 'extractionInstructions'])),
    fields: (Array.isArray(pickValue(source, ['fields'])) ? pickValue(source, ['fields']) : []).map(normalizeMemorySchemaField),
  }
}

export function normalizeMemorySchema(input) {
  return MemorySchemaSchema.parse({
    categories: (Array.isArray(pickValue(input, ['categories'])) ? pickValue(input, ['categories']) : []).map(normalizeMemoryCategorySchema),
  })
}

function normalizeStructuredMemoryItem(input) {
  const source = asObject(input)
  const values = asObject(pickValue(source, ['values'], {}))
  return {
    id: normalizeString(pickValue(source, ['id'])),
    summary: normalizeString(pickValue(source, ['summary'])),
    source_turn_id: normalizeString(pickValue(source, ['source_turn_id', 'sourceTurnId'])),
    updated_at: normalizeString(pickValue(source, ['updated_at', 'updatedAt'])),
    values,
  }
}

function normalizeStructuredMemoryCategory(input) {
  const source = asObject(input)
  return {
    category_id: normalizeString(pickValue(source, ['category_id', 'categoryId'])),
    label: normalizeString(pickValue(source, ['label'])),
    description: normalizeString(pickValue(source, ['description'])),
    updated_at: normalizeString(pickValue(source, ['updated_at', 'updatedAt'])),
    items: (Array.isArray(pickValue(source, ['items'])) ? pickValue(source, ['items']) : []).map(normalizeStructuredMemoryItem),
  }
}

export function normalizeStructuredMemoryPayload(input) {
  return StructuredMemorySchema.parse({
    updated_at: normalizeString(pickValue(input, ['updated_at', 'updatedAt'])),
    categories: (Array.isArray(pickValue(input, ['categories'])) ? pickValue(input, ['categories']) : []).map(normalizeStructuredMemoryCategory),
  })
}

function normalizeChatMessage(input) {
  const source = asObject(input)
  return {
    role: normalizeString(pickValue(source, ['role']), 'user'),
    content: normalizeString(pickValue(source, ['content'])),
  }
}

export function normalizeModelConfig(input) {
  return ModelConfigSchema.parse({
    provider: normalizeTrimmedString(pickValue(input, ['provider']), 'openai'),
    base_url: normalizeTrimmedString(pickValue(input, ['base_url', 'baseUrl'])),
    api_key: normalizeString(pickValue(input, ['api_key', 'apiKey'])),
    model: normalizeTrimmedString(pickValue(input, ['model'])),
    temperature: pickValue(input, ['temperature']) == null ? 0.7 : normalizeNumber(pickValue(input, ['temperature']), 0.7),
  })
}

function normalizeRunUser(input) {
  return RunUserSchema.parse({
    id: normalizeString(pickValue(input, ['id'])),
    email: pickValue(input, ['email']) == null ? null : normalizeString(pickValue(input, ['email'])),
    display_name: pickValue(input, ['display_name', 'displayName']) == null ? null : normalizeString(pickValue(input, ['display_name', 'displayName'])),
  })
}

function normalizeRobotProfile(input) {
  const promptDefaults = getPromptDefaults()
  const source = asObject(input)
  return RobotProfileSchema.parse({
    id: normalizeString(pickValue(source, ['id'])),
    name: normalizeString(pickValue(source, ['name']), '当前智能体'),
    avatar: normalizeString(pickValue(source, ['avatar'])),
    common_prompt: normalizeString(pickValue(source, ['common_prompt', 'commonPrompt']), promptDefaults.common_prompt),
    system_prompt: normalizeString(pickValue(source, ['system_prompt', 'systemPrompt']), promptDefaults.system_prompt),
    memory_model_config_id: normalizeString(pickValue(source, ['memory_model_config_id', 'memoryModelConfigId'])),
    outline_model_config_id: normalizeString(pickValue(source, ['outline_model_config_id', 'outlineModelConfigId'])),
    numeric_computation_model_config_id: normalizeString(pickValue(source, ['numeric_computation_model_config_id', 'numericComputationModelConfigId'])),
    world_graph_model_config_id: normalizeString(pickValue(source, ['world_graph_model_config_id', 'worldGraphModelConfigId'])),
    numeric_computation_enabled: normalizeBoolean(pickValue(source, [
      'numeric_computation_enabled',
      'numericComputationEnabled',
      'image_fetch_enabled',
      'imageFetchEnabled',
    ]), false),
    numeric_computation_prompt: normalizeString(pickValue(source, [
      'numeric_computation_prompt',
      'numericComputationPrompt',
      'image_fetch_prompt',
      'imageFetchPrompt',
    ]), promptDefaults.numeric_computation_prompt),
    numeric_computation_items: Array.isArray(pickValue(source, [
      'numeric_computation_items',
      'numericComputationItems',
      'numeric_computation_schema',
      'numericComputationSchema',
    ]))
      ? pickValue(source, [
        'numeric_computation_items',
        'numericComputationItems',
        'numeric_computation_schema',
        'numericComputationSchema',
      ])
      : [],
    structured_memory_interval: pickValue(source, ['structured_memory_interval', 'structuredMemoryInterval']) == null
      ? null
      : normalizeInteger(pickValue(source, ['structured_memory_interval', 'structuredMemoryInterval']), 3),
    structured_memory_history_limit: pickValue(source, ['structured_memory_history_limit', 'structuredMemoryHistoryLimit']) == null
      ? null
      : normalizeInteger(pickValue(source, ['structured_memory_history_limit', 'structuredMemoryHistoryLimit']), 12),
  })
}

function normalizeAuxiliaryModelConfigs(input) {
  const source = asObject(input)
  const normalizeMaybeModel = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null
    }
    const normalized = normalizeModelConfig(value)
    return normalized.model ? normalized : null
  }

  return AuxiliaryModelConfigsSchema.parse({
    memory: normalizeMaybeModel(pickValue(source, ['memory'])),
    outline: normalizeMaybeModel(pickValue(source, ['outline'])),
    numeric_computation: normalizeMaybeModel(pickValue(source, ['numeric_computation', 'numericComputation'])),
    world_graph: normalizeMaybeModel(pickValue(source, ['world_graph', 'worldGraph'])),
  })
}

export function parseRunRequest(input) {
  return z.object({
    thread_id: z.string(),
    session_id: z.string(),
    prompt: z.string(),
    final_response: z.string().default(''),
    user: RunUserSchema,
    model_settings: ModelConfigSchema,
    robot: RobotProfileSchema,
    system_prompt: z.string().default(''),
    history: z.array(ChatMessageSchema).default([]),
    memory_schema: MemorySchemaSchema.default({ categories: [] }),
    structured_memory: StructuredMemorySchema.default({ updated_at: '', categories: [] }),
    structured_memory_interval: z.number().int().nullable().optional().default(null),
    structured_memory_history_limit: z.number().int().nullable().optional().default(null),
    auxiliary_model_configs: AuxiliaryModelConfigsSchema.default({
      memory: null,
      outline: null,
      numeric_computation: null,
      world_graph: null,
    }),
    numeric_stage_completed: z.boolean().default(false),
    story_outline_stage_completed: z.boolean().default(false),
    numeric_state: z.record(z.any()).default({}),
    story_outline: z.string().default(''),
    world_graph: z.record(z.any()).default({}),
  }).parse({
    thread_id: normalizeString(pickValue(input, ['thread_id', 'threadId'])),
    session_id: normalizeString(pickValue(input, ['session_id', 'sessionId'])),
    prompt: normalizeString(pickValue(input, ['prompt'])),
    final_response: normalizeString(pickValue(input, ['final_response', 'finalResponse'])),
    user: normalizeRunUser(pickValue(input, ['user'])),
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    robot: normalizeRobotProfile(pickValue(input, ['robot'])),
    system_prompt: normalizeString(pickValue(input, ['system_prompt', 'systemPrompt'])),
    history: (Array.isArray(pickValue(input, ['history'])) ? pickValue(input, ['history']) : []).map(normalizeChatMessage),
    memory_schema: normalizeMemorySchema(pickValue(input, ['memory_schema', 'memorySchema'])),
    structured_memory: normalizeStructuredMemoryPayload(pickValue(input, ['structured_memory', 'structuredMemory'])),
    structured_memory_interval: pickValue(input, ['structured_memory_interval', 'structuredMemoryInterval']) == null
      ? null
      : normalizeInteger(pickValue(input, ['structured_memory_interval', 'structuredMemoryInterval']), 3),
    structured_memory_history_limit: pickValue(input, ['structured_memory_history_limit', 'structuredMemoryHistoryLimit']) == null
      ? null
      : normalizeInteger(pickValue(input, ['structured_memory_history_limit', 'structuredMemoryHistoryLimit']), 12),
    auxiliary_model_configs: normalizeAuxiliaryModelConfigs(
      pickValue(input, ['auxiliary_model_configs', 'auxiliaryModelConfigs']),
    ),
    numeric_stage_completed: normalizeBoolean(
      pickValue(input, ['numeric_stage_completed', 'numericStageCompleted']),
      false,
    ),
    story_outline_stage_completed: normalizeBoolean(
      pickValue(input, ['story_outline_stage_completed', 'storyOutlineStageCompleted']),
      false,
    ),
    numeric_state: asObject(pickValue(input, ['numeric_state', 'numericState'], {})),
    story_outline: normalizeString(pickValue(input, ['story_outline', 'storyOutline'])),
    world_graph: asObject(pickValue(input, ['world_graph', 'worldGraph'], {})),
  })
}

export function parseDocumentSummaryRequest(input) {
  return z.object({
    model_settings: ModelConfigSchema,
    mode: z.enum(['segment', 'aggregate']).default('segment'),
    source_name: z.string().default(''),
    guidance: z.string().default(''),
    text: z.string().default(''),
    summaries: z.array(z.string()).default([]),
    index: z.number().int().default(0),
    total: z.number().int().default(1),
    round: z.number().int().default(1),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    mode: normalizeString(pickValue(input, ['mode']), 'segment'),
    source_name: normalizeString(pickValue(input, ['source_name', 'sourceName'])),
    guidance: normalizeString(pickValue(input, ['guidance'])),
    text: normalizeString(pickValue(input, ['text'])),
    summaries: (Array.isArray(pickValue(input, ['summaries'])) ? pickValue(input, ['summaries']) : []).map((item) => normalizeString(item)),
    index: normalizeInteger(pickValue(input, ['index']), 0),
    total: normalizeInteger(pickValue(input, ['total']), 1),
    round: normalizeInteger(pickValue(input, ['round']), 1),
  })
}

export function parseRobotGenerationRequest(input) {
  return z.object({
    model_settings: ModelConfigSchema,
    source_name: z.string().default(''),
    guidance: z.string().default(''),
    document_summary: z.string().default(''),
    segment_summaries: z.array(z.string()).default([]),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    source_name: normalizeString(pickValue(input, ['source_name', 'sourceName'])),
    guidance: normalizeString(pickValue(input, ['guidance'])),
    document_summary: normalizeString(pickValue(input, ['document_summary', 'documentSummary'])),
    segment_summaries: (Array.isArray(pickValue(input, ['segment_summaries', 'segmentSummaries'])) ? pickValue(input, ['segment_summaries', 'segmentSummaries']) : []).map((item) => normalizeString(item)),
  })
}

export function parseRobotWorldGraphEvolutionRequest(input) {
  return z.object({
    model_settings: ModelConfigSchema,
    source_name: z.string().default(''),
    guidance: z.string().default(''),
    core: z.object({
      name: z.string().default(''),
      description: z.string().default(''),
    }).default({ name: '', description: '' }),
    segment_summary: z.string().default(''),
    segment_index: z.number().int().default(0),
    segment_total: z.number().int().default(1),
    current_world_graph: z.record(z.any()).default({}),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    source_name: normalizeString(pickValue(input, ['source_name', 'sourceName'])),
    guidance: normalizeString(pickValue(input, ['guidance'])),
    core: {
      name: normalizeString(pickValue(pickValue(input, ['core']), ['name'])),
      description: normalizeString(pickValue(pickValue(input, ['core']), ['description'])),
    },
    segment_summary: normalizeString(pickValue(input, ['segment_summary', 'segmentSummary'])),
    segment_index: normalizeInteger(pickValue(input, ['segment_index', 'segmentIndex']), 0),
    segment_total: normalizeInteger(pickValue(input, ['segment_total', 'segmentTotal']), 1),
    current_world_graph: asObject(pickValue(input, ['current_world_graph', 'currentWorldGraph'], {})),
  })
}

export function parseRetrievalSummaryRequest(input) {
  return z.object({
    model_settings: ModelConfigSchema,
    robot_name: z.string().default(''),
    robot_description: z.string().default(''),
    story_outline: z.string().default(''),
    prompt: z.string().default(''),
    history: z.array(ChatMessageSchema).default([]),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    robot_name: normalizeString(pickValue(input, ['robot_name', 'robotName'])),
    robot_description: normalizeString(pickValue(input, ['robot_description', 'robotDescription'])),
    story_outline: normalizeString(pickValue(input, ['story_outline', 'storyOutline'])),
    prompt: normalizeString(pickValue(input, ['prompt'])),
    history: (Array.isArray(pickValue(input, ['history'])) ? pickValue(input, ['history']) : []).map(normalizeChatMessage),
  })
}

export function parseGraphRagExtractRequest(input) {
  return z.object({
    model_settings: ModelConfigSchema,
    source_name: z.string().default(''),
    guidance: z.string().default(''),
    document_summary: z.string().default(''),
    segment_summaries: z.array(z.string()).default([]),
    core: z.object({
      name: z.string().default(''),
      description: z.string().default(''),
    }).default({ name: '', description: '' }),
    segment_summary: z.string().default(''),
    segment_index: z.number().int().nonnegative().default(0),
    segment_total: z.number().int().positive().default(1),
    current_world_graph: z.record(z.any()).default({}),
    extraction_detail: z.object({
      max_entities_per_segment: z.number().int().positive().default(12),
      max_relations_per_segment: z.number().int().positive().default(16),
      max_events_per_segment: z.number().int().positive().default(8),
      entity_importance_threshold: z.number().min(0).max(1).default(0.35),
      relation_importance_threshold: z.number().min(0).max(1).default(0.35),
      event_importance_threshold: z.number().min(0).max(1).default(0.4),
    }).default({
      max_entities_per_segment: 12,
      max_relations_per_segment: 16,
      max_events_per_segment: 8,
      entity_importance_threshold: 0.35,
      relation_importance_threshold: 0.35,
      event_importance_threshold: 0.4,
    }),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    source_name: normalizeString(pickValue(input, ['source_name', 'sourceName'])),
    guidance: normalizeString(pickValue(input, ['guidance'])),
    document_summary: normalizeString(pickValue(input, ['document_summary', 'documentSummary'])),
    segment_summaries: (Array.isArray(pickValue(input, ['segment_summaries', 'segmentSummaries'])) ? pickValue(input, ['segment_summaries', 'segmentSummaries']) : []).map((item) => normalizeString(item)),
    core: {
      name: normalizeString(pickValue(pickValue(input, ['core']), ['name'])),
      description: normalizeString(pickValue(pickValue(input, ['core']), ['description'])),
    },
    segment_summary: normalizeString(pickValue(input, ['segment_summary', 'segmentSummary'])),
    segment_index: normalizeInteger(pickValue(input, ['segment_index', 'segmentIndex']), 0),
    segment_total: Math.max(1, normalizeInteger(pickValue(input, ['segment_total', 'segmentTotal']), 1)),
    current_world_graph: asObject(pickValue(input, ['current_world_graph', 'currentWorldGraph'], {})),
    extraction_detail: {
      max_entities_per_segment: normalizeInteger(pickValue(pickValue(input, ['extraction_detail', 'extractionDetail']), ['max_entities_per_segment', 'maxEntitiesPerSegment']), 12),
      max_relations_per_segment: normalizeInteger(pickValue(pickValue(input, ['extraction_detail', 'extractionDetail']), ['max_relations_per_segment', 'maxRelationsPerSegment']), 16),
      max_events_per_segment: normalizeInteger(pickValue(pickValue(input, ['extraction_detail', 'extractionDetail']), ['max_events_per_segment', 'maxEventsPerSegment']), 8),
      entity_importance_threshold: normalizeNumber(pickValue(pickValue(input, ['extraction_detail', 'extractionDetail']), ['entity_importance_threshold', 'entityImportanceThreshold']), 0.35),
      relation_importance_threshold: normalizeNumber(pickValue(pickValue(input, ['extraction_detail', 'extractionDetail']), ['relation_importance_threshold', 'relationImportanceThreshold']), 0.35),
      event_importance_threshold: normalizeNumber(pickValue(pickValue(input, ['extraction_detail', 'extractionDetail']), ['event_importance_threshold', 'eventImportanceThreshold']), 0.4),
    },
  })
}

export function parseGraphRagRetrieveRequest(input) {
  const documentSchema = z.object({
    document_id: z.string().default(''),
    source_name: z.string().default(''),
    summary: z.string().default(''),
    retrieval_summary: z.string().default(''),
    graphrag_graph: z.record(z.any()).default({}),
  })
  return z.object({
    model_settings: ModelConfigSchema,
    robot_name: z.string().default(''),
    robot_description: z.string().default(''),
    story_outline: z.string().default(''),
    prompt: z.string().default(''),
    history: z.array(ChatMessageSchema).default([]),
    graphrag_documents: z.array(documentSchema).default([]),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    robot_name: normalizeString(pickValue(input, ['robot_name', 'robotName'])),
    robot_description: normalizeString(pickValue(input, ['robot_description', 'robotDescription'])),
    story_outline: normalizeString(pickValue(input, ['story_outline', 'storyOutline'])),
    prompt: normalizeString(pickValue(input, ['prompt'])),
    history: (Array.isArray(pickValue(input, ['history'])) ? pickValue(input, ['history']) : []).map(normalizeChatMessage),
    graphrag_documents: (Array.isArray(pickValue(input, ['graphrag_documents', 'graphRagDocuments'])) ? pickValue(input, ['graphrag_documents', 'graphRagDocuments']) : []).map((item) => ({
      document_id: normalizeString(pickValue(item, ['document_id', 'documentId'])),
      source_name: normalizeString(pickValue(item, ['source_name', 'sourceName'])),
      summary: normalizeString(pickValue(item, ['summary'])),
      retrieval_summary: normalizeString(pickValue(item, ['retrieval_summary', 'retrievalSummary'])),
      graphrag_graph: asObject(pickValue(item, ['graphrag_graph', 'graphRagGraph'], {})),
    })),
  })
}

export function parseGraphRagWritebackRequest(input) {
  const robot = asObject(pickValue(input, ['robot'], {}))
  return z.object({
    model_settings: ModelConfigSchema,
    robot_name: z.string().default(''),
    robot_description: z.string().default(''),
    prompt: z.string().default(''),
    final_response: z.string().default(''),
    history: z.array(ChatMessageSchema).default([]),
    story_outline: z.string().default(''),
    current_world_graph: z.record(z.any()).default({}),
  }).parse({
    model_settings: normalizeModelConfig(pickValue(input, ['model_config', 'model_settings', 'modelSettings'])),
    robot_name: normalizeString(pickValue(input, ['robot_name', 'robotName']), normalizeString(pickValue(robot, ['name']))),
    robot_description: normalizeString(pickValue(input, ['robot_description', 'robotDescription']), normalizeString(pickValue(robot, ['description']))),
    prompt: normalizeString(pickValue(input, ['prompt'])),
    final_response: normalizeString(pickValue(input, ['final_response', 'finalResponse'])),
    history: (Array.isArray(pickValue(input, ['history'])) ? pickValue(input, ['history']) : []).map(normalizeChatMessage),
    story_outline: normalizeString(pickValue(input, ['story_outline', 'storyOutline'])),
    current_world_graph: asObject(pickValue(input, ['current_world_graph', 'currentWorldGraph', 'world_graph', 'worldGraph'], {})),
  })
}

export function parseThreadState(input) {
  return ThreadStateSchema.parse({
    thread_id: normalizeString(pickValue(input, ['thread_id', 'threadId'])),
    messages: (Array.isArray(pickValue(input, ['messages'])) ? pickValue(input, ['messages']) : []).map(normalizeChatMessage),
    memory_schema: normalizeMemorySchema(pickValue(input, ['memory_schema', 'memorySchema'])),
    structured_memory: normalizeStructuredMemoryPayload(pickValue(input, ['structured_memory', 'structuredMemory'])),
    numeric_state: asObject(pickValue(input, ['numeric_state', 'numericState'], {})),
    story_outline: normalizeString(pickValue(input, ['story_outline', 'storyOutline'])),
  })
}

export function normalizeGeneratedMemorySchemaPayload(input) {
  const source = asObject(input)
  return {
    categories: (Array.isArray(pickValue(source, ['categories'])) ? pickValue(source, ['categories']) : []).map((category) => ({
      id: normalizeString(pickValue(category, ['id'])),
      label: normalizeString(pickValue(category, ['label'])),
      description: normalizeString(pickValue(category, ['description'])),
      extraction_instructions: normalizeString(pickValue(category, ['extraction_instructions', 'extractionInstructions'])),
      fields: (Array.isArray(pickValue(category, ['fields'])) ? pickValue(category, ['fields']) : []).map((field) => ({
        id: normalizeString(pickValue(field, ['id'])),
        name: normalizeString(pickValue(field, ['name'])),
        label: normalizeString(pickValue(field, ['label'])),
        type: normalizeString(pickValue(field, ['type']), 'text'),
        required: normalizeBoolean(pickValue(field, ['required']), false),
        options: (Array.isArray(pickValue(field, ['options'])) ? pickValue(field, ['options']) : []).map(normalizeMemorySchemaOption),
      })),
    })),
  }
}

export function normalizeRobotGenerationCorePayload(input) {
  const source = asObject(input)
  return {
    name: normalizeString(pickValue(source, ['name'])),
    description: normalizeString(pickValue(source, ['description'])),
    system_prompt: normalizeString(pickValue(source, ['system_prompt', 'systemPrompt'])),
    common_prompt: normalizeString(pickValue(source, ['common_prompt', 'commonPrompt'])),
    numeric_computation_enabled: normalizeBoolean(pickValue(source, ['numeric_computation_enabled', 'numericComputationEnabled']), false),
    numeric_computation_prompt: normalizeString(pickValue(source, ['numeric_computation_prompt', 'numericComputationPrompt'])),
    numeric_computation_items: (Array.isArray(pickValue(source, ['numeric_computation_items', 'numericComputationItems'])) ? pickValue(source, ['numeric_computation_items', 'numericComputationItems']) : []).map((item) => ({
      name: normalizeString(pickValue(item, ['name'])),
      current_value: normalizeNumber(pickValue(item, ['current_value', 'currentValue']), 0),
      description: normalizeString(pickValue(item, ['description'])),
    })),
    structured_memory_interval: normalizeInteger(pickValue(source, ['structured_memory_interval', 'structuredMemoryInterval']), 3),
    structured_memory_history_limit: normalizeInteger(pickValue(source, ['structured_memory_history_limit', 'structuredMemoryHistoryLimit']), 12),
    document_summary: normalizeString(pickValue(source, ['document_summary', 'documentSummary'])),
    retrieval_summary: normalizeString(pickValue(source, ['retrieval_summary', 'retrievalSummary'])),
  }
}

export function normalizeGeneratedWorldGraphPatchPayload(input) {
  const source = asObject(input)
  return {
    meta: {
      title: normalizeString(pickValue(pickValue(source, ['meta']), ['title'])),
      description: normalizeString(pickValue(pickValue(source, ['meta']), ['description', 'summary'])),
    },
    upsert_relation_types: (Array.isArray(pickValue(source, ['upsert_relation_types', 'upsertRelationTypes'])) ? pickValue(source, ['upsert_relation_types', 'upsertRelationTypes']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      name: normalizeString(pickValue(item, ['name', 'label'])),
      description: normalizeString(pickValue(item, ['description'])),
      directionality: normalizeString(pickValue(item, ['directionality']), 'directed') === 'undirected' ? 'undirected' : 'directed',
    })),
    delete_relation_type_codes: normalizeStringArray(pickValue(source, ['delete_relation_type_codes', 'deleteRelationTypeCodes'])),
    upsert_nodes: (Array.isArray(pickValue(source, ['upsert_nodes', 'upsertNodes'])) ? pickValue(source, ['upsert_nodes', 'upsertNodes']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      name: normalizeString(pickValue(item, ['name'])),
      type: normalizeString(pickValue(item, ['type', 'objectType', 'object_type']), 'character'),
      description: normalizeString(pickValue(item, ['description', 'summary'])),
    })),
    delete_node_ids: normalizeStringArray(pickValue(source, ['delete_node_ids', 'deleteNodeIds'])),
    upsert_edges: (Array.isArray(pickValue(source, ['upsert_edges', 'upsertEdges'])) ? pickValue(source, ['upsert_edges', 'upsertEdges']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      source: normalizeString(pickValue(item, ['source', 'sourceNodeId', 'source_node_id'])),
      target: normalizeString(pickValue(item, ['target', 'targetNodeId', 'target_node_id'])),
      relation_type: normalizeString(pickValue(item, ['relation_type', 'relationType', 'relationTypeCode', 'relation_type_code'])),
      description: normalizeString(pickValue(item, ['description', 'summary'])),
    })),
    upsert_events: (Array.isArray(pickValue(source, ['upsert_events', 'upsertEvents'])) ? pickValue(source, ['upsert_events', 'upsertEvents']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      name: normalizeString(pickValue(item, ['name'])),
      description: normalizeString(pickValue(item, ['description', 'summary'])),
      timeline: {
        sequenceIndex: normalizeInteger(pickValue(pickValue(item, ['timeline']), ['sequenceIndex', 'sequence_index']), 0),
        calendarId: normalizeString(pickValue(pickValue(item, ['timeline']), ['calendarId', 'calendar_id'])),
        yearLabel: normalizeString(pickValue(pickValue(item, ['timeline']), ['yearLabel', 'year_label'])),
        monthLabel: normalizeString(pickValue(pickValue(item, ['timeline']), ['monthLabel', 'month_label'])),
        dayLabel: normalizeString(pickValue(pickValue(item, ['timeline']), ['dayLabel', 'day_label'])),
        timeOfDayLabel: normalizeString(pickValue(pickValue(item, ['timeline']), ['timeOfDayLabel', 'time_of_day_label'])),
        phase: normalizeString(pickValue(pickValue(item, ['timeline']), ['phase'])),
        impactLevel: normalizeInteger(pickValue(pickValue(item, ['timeline']), ['impactLevel', 'impact_level']), 0),
        eventType: normalizeString(pickValue(pickValue(item, ['timeline']), ['eventType', 'event_type'])),
      },
    })),
    append_event_effects: (Array.isArray(pickValue(source, ['append_event_effects', 'appendEventEffects'])) ? pickValue(source, ['append_event_effects', 'appendEventEffects']) : []).map((item) => ({
      ref: {
        nodeId: normalizeString(pickValue(pickValue(item, ['ref', 'eventRef', 'event_ref']), ['nodeId', 'node_id', 'id'])),
        name: normalizeString(pickValue(pickValue(item, ['ref', 'eventRef', 'event_ref']), ['name'])),
        objectType: 'event',
      },
      effects: (Array.isArray(pickValue(item, ['effects'])) ? pickValue(item, ['effects']) : [pickValue(item, ['effect'])])
        .filter(Boolean)
        .map((effect) => ({
          id: normalizeString(pickValue(effect, ['id'])),
          summary: normalizeString(pickValue(effect, ['summary'])),
          targetNodeId: normalizeString(pickValue(effect, ['targetNodeId', 'target_node_id'])),
          changeTargetType: normalizeString(pickValue(effect, ['changeTargetType', 'change_target_type']), 'node-content') === 'relation' ? 'relation' : 'node-content',
          nodeAttributeChanges: (Array.isArray(pickValue(effect, ['nodeAttributeChanges', 'node_attribute_changes'])) ? pickValue(effect, ['nodeAttributeChanges', 'node_attribute_changes']) : []).map((change) => ({
            fieldKey: normalizeString(pickValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(pickValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(pickValue(change, ['afterValue', 'after_value'])),
          })),
          relationMode: normalizeString(pickValue(effect, ['relationMode', 'relation_mode']), 'existing') === 'create' ? 'create' : 'existing',
          relationId: normalizeString(pickValue(effect, ['relationId', 'relation_id'])),
          relationChanges: (Array.isArray(pickValue(effect, ['relationChanges', 'relation_changes'])) ? pickValue(effect, ['relationChanges', 'relation_changes']) : []).map((change) => ({
            fieldKey: normalizeString(pickValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(pickValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(pickValue(change, ['afterValue', 'after_value'])),
          })),
          relationDraft: {
            targetNodeId: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['targetNodeId', 'target_node_id'])),
            relationTypeCode: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['relationTypeCode', 'relation_type_code'])),
            relationLabel: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['relationLabel', 'relation_label'])),
            summary: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['summary'])),
            status: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['status'])),
            intensity: (() => {
              const intensity = pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['intensity'])
              return intensity === null || intensity === undefined ? null : normalizeInteger(intensity, 0)
            })(),
          },
        })),
    })),
    delete_edge_ids: normalizeStringArray(pickValue(source, ['delete_edge_ids', 'deleteEdgeIds'])),
  }
}

function normalizeGraphRagEntity(input) {
  const source = asObject(input)
  return {
    id: normalizeString(pickValue(source, ['id'])),
    name: normalizeString(pickValue(source, ['name'])),
    type: normalizeString(pickValue(source, ['type', 'objectType', 'object_type']), 'character'),
    summary: normalizeString(pickValue(source, ['summary', 'description'])),
    aliases: normalizeStringArray(pickValue(source, ['aliases'])),
    community_ids: normalizeStringArray(pickValue(source, ['community_ids', 'communityIds'])),
  }
}

function normalizeGraphRagRelation(input) {
  const source = asObject(input)
  return {
    id: normalizeString(pickValue(source, ['id'])),
    source_id: normalizeString(pickValue(source, ['source_id', 'sourceId', 'source'])),
    target_id: normalizeString(pickValue(source, ['target_id', 'targetId', 'target'])),
    relation_type_id: normalizeString(pickValue(source, ['relation_type_id', 'relationTypeId', 'relationTypeCode', 'relation_type_code'])),
    summary: normalizeString(pickValue(source, ['summary', 'description'])),
  }
}

function normalizeGraphRagEvent(input) {
  const source = asObject(input)
  return {
    id: normalizeString(pickValue(source, ['id'])),
    name: normalizeString(pickValue(source, ['name'])),
    summary: normalizeString(pickValue(source, ['summary', 'description'])),
    timeline: {
      sequenceIndex: normalizeOptionalInteger(pickValue(pickValue(source, ['timeline']), ['sequenceIndex', 'sequence_index'])),
      calendarId: normalizeString(pickValue(pickValue(source, ['timeline']), ['calendarId', 'calendar_id'])),
      yearLabel: normalizeString(pickValue(pickValue(source, ['timeline']), ['yearLabel', 'year_label'])),
      monthLabel: normalizeString(pickValue(pickValue(source, ['timeline']), ['monthLabel', 'month_label'])),
      dayLabel: normalizeString(pickValue(pickValue(source, ['timeline']), ['dayLabel', 'day_label'])),
      timeOfDayLabel: normalizeString(pickValue(pickValue(source, ['timeline']), ['timeOfDayLabel', 'time_of_day_label'])),
      phase: normalizeString(pickValue(pickValue(source, ['timeline']), ['phase'])),
      impactLevel: normalizeInteger(pickValue(pickValue(source, ['timeline']), ['impactLevel', 'impact_level']), 0),
      eventType: normalizeString(pickValue(pickValue(source, ['timeline']), ['eventType', 'event_type'])),
    },
    participant_entity_ids: normalizeStringArray(pickValue(source, ['participant_entity_ids', 'participantEntityIds'])),
    community_ids: normalizeStringArray(pickValue(source, ['community_ids', 'communityIds'])),
  }
}

function normalizeGraphRagCommunity(input) {
  const source = asObject(input)
  return {
    id: normalizeString(pickValue(source, ['id'])),
    name: normalizeString(pickValue(source, ['name'])),
    summary: normalizeString(pickValue(source, ['summary', 'description'])),
    entity_ids: normalizeStringArray(pickValue(source, ['entity_ids', 'entityIds'])),
    event_ids: normalizeStringArray(pickValue(source, ['event_ids', 'eventIds'])),
    keywords: normalizeStringArray(pickValue(source, ['keywords'])),
  }
}

function normalizeGraphRagChunk(input) {
  const source = asObject(input)
  return {
    document_id: normalizeString(pickValue(source, ['document_id', 'documentId'])),
    source_name: normalizeString(pickValue(source, ['source_name', 'sourceName'])),
    segment_index: normalizeInteger(pickValue(source, ['segment_index', 'segmentIndex']), 0),
    summary: normalizeString(pickValue(source, ['summary'])),
    excerpt: normalizeString(pickValue(source, ['excerpt'])),
    entity_ids: normalizeStringArray(pickValue(source, ['entity_ids', 'entityIds'])),
    relation_ids: normalizeStringArray(pickValue(source, ['relation_ids', 'relationIds'])),
    event_ids: normalizeStringArray(pickValue(source, ['event_ids', 'eventIds'])),
    community_ids: normalizeStringArray(pickValue(source, ['community_ids', 'communityIds'])),
  }
}

export function normalizeGraphRagGraphPayload(input) {
  const source = asObject(input)
  return {
    meta: {
      title: normalizeString(pickValue(pickValue(source, ['meta']), ['title'])),
      summary: normalizeString(pickValue(pickValue(source, ['meta']), ['summary', 'description'])),
    },
    relation_types: (Array.isArray(pickValue(source, ['relation_types', 'relationTypes'])) ? pickValue(source, ['relation_types', 'relationTypes']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      name: normalizeString(pickValue(item, ['name', 'label'])),
      description: normalizeString(pickValue(item, ['description'])),
      directionality: normalizeString(pickValue(item, ['directionality']), 'directed') === 'undirected' ? 'undirected' : 'directed',
    })),
    entities: (Array.isArray(pickValue(source, ['entities'])) ? pickValue(source, ['entities']) : []).map(normalizeGraphRagEntity),
    relations: (Array.isArray(pickValue(source, ['relations'])) ? pickValue(source, ['relations']) : []).map(normalizeGraphRagRelation),
    events: (Array.isArray(pickValue(source, ['events'])) ? pickValue(source, ['events']) : []).map(normalizeGraphRagEvent),
    append_event_effects: (Array.isArray(pickValue(source, ['append_event_effects', 'appendEventEffects'])) ? pickValue(source, ['append_event_effects', 'appendEventEffects']) : []).map((item) => ({
      ref: {
        nodeId: normalizeString(pickValue(pickValue(item, ['ref', 'eventRef', 'event_ref']), ['nodeId', 'node_id', 'id'])),
        name: normalizeString(pickValue(pickValue(item, ['ref', 'eventRef', 'event_ref']), ['name'])),
        objectType: 'event',
      },
      effects: (Array.isArray(pickValue(item, ['effects'])) ? pickValue(item, ['effects']) : [pickValue(item, ['effect'])])
        .filter(Boolean)
        .map((effect) => ({
          id: normalizeString(pickValue(effect, ['id'])),
          summary: normalizeString(pickValue(effect, ['summary'])),
          targetNodeId: normalizeString(pickValue(effect, ['targetNodeId', 'target_node_id'])),
          changeTargetType: normalizeString(pickValue(effect, ['changeTargetType', 'change_target_type']), 'node-content') === 'relation' ? 'relation' : 'node-content',
          nodeAttributeChanges: (Array.isArray(pickValue(effect, ['nodeAttributeChanges', 'node_attribute_changes'])) ? pickValue(effect, ['nodeAttributeChanges', 'node_attribute_changes']) : []).map((change) => ({
            fieldKey: normalizeString(pickValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(pickValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(pickValue(change, ['afterValue', 'after_value'])),
          })),
          relationMode: normalizeString(pickValue(effect, ['relationMode', 'relation_mode']), 'existing') === 'create' ? 'create' : 'existing',
          relationId: normalizeString(pickValue(effect, ['relationId', 'relation_id'])),
          relationChanges: (Array.isArray(pickValue(effect, ['relationChanges', 'relation_changes'])) ? pickValue(effect, ['relationChanges', 'relation_changes']) : []).map((change) => ({
            fieldKey: normalizeString(pickValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(pickValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(pickValue(change, ['afterValue', 'after_value'])),
          })),
          relationDraft: {
            targetNodeId: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['targetNodeId', 'target_node_id'])),
            relationTypeCode: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['relationTypeCode', 'relation_type_code'])),
            relationLabel: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['relationLabel', 'relation_label'])),
            summary: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['summary'])),
            status: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['status'])),
            intensity: (() => {
              const intensity = pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['intensity'])
              return intensity === null || intensity === undefined ? null : normalizeInteger(intensity, 0)
            })(),
          },
        })),
    })),
    communities: (Array.isArray(pickValue(source, ['communities'])) ? pickValue(source, ['communities']) : []).map(normalizeGraphRagCommunity),
    chunks: (Array.isArray(pickValue(source, ['chunks'])) ? pickValue(source, ['chunks']) : []).map(normalizeGraphRagChunk),
  }
}

export function normalizeGraphRagRetrievePayload(input) {
  const source = asObject(input)
  return {
    summary: normalizeString(pickValue(source, ['summary'])),
    communities: (Array.isArray(pickValue(source, ['communities'])) ? pickValue(source, ['communities']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      name: normalizeString(pickValue(item, ['name'])),
      summary: normalizeString(pickValue(item, ['summary', 'description'])),
      score: normalizeNumber(pickValue(item, ['score']), 0),
    })),
    entities: (Array.isArray(pickValue(source, ['entities'])) ? pickValue(source, ['entities']) : []).map(normalizeGraphRagEntity),
    events: (Array.isArray(pickValue(source, ['events'])) ? pickValue(source, ['events']) : []).map(normalizeGraphRagEvent),
    chunks: (Array.isArray(pickValue(source, ['chunks'])) ? pickValue(source, ['chunks']) : []).map((item) => ({
      document_id: normalizeString(pickValue(item, ['document_id', 'documentId'])),
      source_name: normalizeString(pickValue(item, ['source_name', 'sourceName'])),
      segment_index: normalizeInteger(pickValue(item, ['segment_index', 'segmentIndex']), 0),
      summary: normalizeString(pickValue(item, ['summary'])),
      excerpt: normalizeString(pickValue(item, ['excerpt'])),
      score: normalizeNumber(pickValue(item, ['score']), 0),
      entity_ids: normalizeStringArray(pickValue(item, ['entity_ids', 'entityIds'])),
      community_ids: normalizeStringArray(pickValue(item, ['community_ids', 'communityIds'])),
      event_ids: normalizeStringArray(pickValue(item, ['event_ids', 'eventIds'])),
    })),
  }
}

export function normalizeGraphRagWritebackPayload(input) {
  const source = asObject(input)
  return {
    summary: normalizeString(pickValue(source, ['summary'])),
    relation_types: (Array.isArray(pickValue(source, ['relation_types', 'relationTypes'])) ? pickValue(source, ['relation_types', 'relationTypes']) : []).map((item) => ({
      id: normalizeString(pickValue(item, ['id'])),
      name: normalizeString(pickValue(item, ['name', 'label'])),
      description: normalizeString(pickValue(item, ['description'])),
      directionality: normalizeString(pickValue(item, ['directionality']), 'directed') === 'undirected' ? 'undirected' : 'directed',
    })),
    entities: (Array.isArray(pickValue(source, ['entities'])) ? pickValue(source, ['entities']) : []).map(normalizeGraphRagEntity),
    relations: (Array.isArray(pickValue(source, ['relations'])) ? pickValue(source, ['relations']) : []).map(normalizeGraphRagRelation),
    events: (Array.isArray(pickValue(source, ['events'])) ? pickValue(source, ['events']) : []).map(normalizeGraphRagEvent),
    append_event_effects: (Array.isArray(pickValue(source, ['append_event_effects', 'appendEventEffects'])) ? pickValue(source, ['append_event_effects', 'appendEventEffects']) : []).map((item) => ({
      ref: {
        nodeId: normalizeString(pickValue(pickValue(item, ['ref', 'eventRef', 'event_ref']), ['nodeId', 'node_id', 'id'])),
        name: normalizeString(pickValue(pickValue(item, ['ref', 'eventRef', 'event_ref']), ['name'])),
        objectType: 'event',
      },
      effects: (Array.isArray(pickValue(item, ['effects'])) ? pickValue(item, ['effects']) : [pickValue(item, ['effect'])])
        .filter(Boolean)
        .map((effect) => ({
          id: normalizeString(pickValue(effect, ['id'])),
          summary: normalizeString(pickValue(effect, ['summary'])),
          targetNodeId: normalizeString(pickValue(effect, ['targetNodeId', 'target_node_id'])),
          changeTargetType: normalizeString(pickValue(effect, ['changeTargetType', 'change_target_type']), 'node-content') === 'relation' ? 'relation' : 'node-content',
          nodeAttributeChanges: (Array.isArray(pickValue(effect, ['nodeAttributeChanges', 'node_attribute_changes'])) ? pickValue(effect, ['nodeAttributeChanges', 'node_attribute_changes']) : []).map((change) => ({
            fieldKey: normalizeString(pickValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(pickValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(pickValue(change, ['afterValue', 'after_value'])),
          })),
          relationMode: normalizeString(pickValue(effect, ['relationMode', 'relation_mode']), 'existing') === 'create' ? 'create' : 'existing',
          relationId: normalizeString(pickValue(effect, ['relationId', 'relation_id'])),
          relationChanges: (Array.isArray(pickValue(effect, ['relationChanges', 'relation_changes'])) ? pickValue(effect, ['relationChanges', 'relation_changes']) : []).map((change) => ({
            fieldKey: normalizeString(pickValue(change, ['fieldKey', 'field_key'])),
            beforeValue: normalizeString(pickValue(change, ['beforeValue', 'before_value'])),
            afterValue: normalizeString(pickValue(change, ['afterValue', 'after_value'])),
          })),
          relationDraft: {
            targetNodeId: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['targetNodeId', 'target_node_id'])),
            relationTypeCode: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['relationTypeCode', 'relation_type_code'])),
            relationLabel: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['relationLabel', 'relation_label'])),
            summary: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['summary'])),
            status: normalizeString(pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['status'])),
            intensity: (() => {
              const intensity = pickValue(pickValue(effect, ['relationDraft', 'relation_draft']), ['intensity'])
              return intensity === null || intensity === undefined ? null : normalizeInteger(intensity, 0)
            })(),
          },
        })),
    })),
  }
}

export function validateStructuredSchema(schema, value) {
  return schema.parse(value)
}
