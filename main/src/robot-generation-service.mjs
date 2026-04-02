import { createHash } from 'node:crypto'
import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractDocumentText } from './document-import-service.mjs'
import {
  createGraphRagArtifact,
  createRobotGenerationTask,
  createRobotKnowledgeDocument,
  getRobotGenerationTask,
  initializeRobotGenerationStore,
  listGraphRagArtifacts,
  listRobotKnowledgeDocuments,
  updateRobotGenerationTask,
  updateRobotKnowledgeDocument,
} from './robot-generation-store.mjs'
import { readModelConfigs, readRobots, writeRobots } from './storage.mjs'
import { normalizeMemorySchema, normalizeRobots } from './storage-shared.mjs'
import { createEmbeddings, resolveKnowledgeCollectionName, searchKnowledgeVectors, upsertKnowledgeVectors } from './vector-knowledge-service.mjs'
import {
  applyWorldGraphWritebackToSnapshot,
  createEmptyWorldGraphSnapshot,
  normalizeWorldGraphSnapshot,
  replaceWorldGraph,
} from './world-graph-service.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMP_DIR = join(__dirname, '..', 'data', 'robot-imports')
const DEFAULT_AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000'
const DEFAULT_MAX_CONCURRENCY = Math.max(1, Number(process.env.ROBOT_GENERATION_CONCURRENCY || 1) || 1)
const DEFAULT_WORLD_GRAPH_SEGMENT_ATTEMPTS = Math.max(1, Number(process.env.ROBOT_WORLD_GRAPH_SEGMENT_ATTEMPTS || 2) || 2)
export const DEFAULT_EXTRACTION_DETAIL = Object.freeze({
  targetSegmentChars: 180000,
  maxEntitiesPerSegment: 12,
  maxRelationsPerSegment: 16,
  maxEventsPerSegment: 8,
  entityImportanceThreshold: 0.35,
  relationImportanceThreshold: 0.35,
  eventImportanceThreshold: 0.4,
})

let runningCount = 0
const pendingJobs = []
const cancelRequestedTaskKeys = new Set()

class RobotGenerationCanceledError extends Error {
  constructor(message = '已取消文档生成') {
    super(message)
    this.name = 'RobotGenerationCanceledError'
  }
}

function buildUserTaskKey(user, taskId) {
  return `${String(user?.id || '').trim()}:${String(taskId || '').trim()}`
}

function clearRobotGenerationCancellation(user, taskId) {
  cancelRequestedTaskKeys.delete(buildUserTaskKey(user, taskId))
}

async function isRobotGenerationCancellationRequested(user, taskId) {
  const taskKey = buildUserTaskKey(user, taskId)
  if (cancelRequestedTaskKeys.has(taskKey)) {
    return true
  }

  const task = await getRobotGenerationTask(user, taskId)
  return task?.status === 'canceling' || task?.status === 'canceled'
}

async function throwIfRobotGenerationCanceled(user, taskId) {
  if (await isRobotGenerationCancellationRequested(user, taskId)) {
    throw new RobotGenerationCanceledError()
  }
}

async function markRobotGenerationTaskCanceled(user, taskId, message = '已取消文档生成') {
  const existing = await getRobotGenerationTask(user, taskId)
  if (!existing) {
    return null
  }

  clearRobotGenerationCancellation(user, taskId)
  return updateRobotGenerationTask(user, taskId, {
    status: 'canceled',
    stage: 'canceled',
    progress: normalizeProgress(existing.progress, 0),
    message,
    error: '',
    completedAt: new Date().toISOString(),
  })
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || '').replace(/\/+$/, '')
}

function getAgentServiceUrl() {
  return sanitizeBaseUrl(DEFAULT_AGENT_SERVICE_URL)
}

function buildRobotId() {
  return `robot-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function buildDocumentId() {
  return `doc-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function buildGraphRagArtifactId(kind = 'extract') {
  const normalizedKind = String(kind || 'extract').trim() || 'extract'
  return `graphrag-${normalizedKind}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function buildKnowledgePointId(documentId, segmentIndex) {
  const seed = `${normalizeString(documentId, 'document')}:${Math.max(0, Number(segmentIndex || 0) || 0)}`
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  digest[12] = '5'
  const variant = Number.parseInt(digest[16] || '0', 16)
  digest[16] = ['8', '9', 'a', 'b'][Number.isNaN(variant) ? 0 : variant % 4]
  return [
    digest.slice(0, 8).join(''),
    digest.slice(8, 12).join(''),
    digest.slice(12, 16).join(''),
    digest.slice(16, 20).join(''),
    digest.slice(20, 32).join(''),
  ].join('-')
}

function buildTaskId() {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function normalizeProgress(value, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : fallback
}

function normalizeGuidance(value) {
  return String(value || '').trim()
}

function normalizeExtractionLimit(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(1, Math.round(numeric)) : fallback
}

function normalizeTargetSegmentChars(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(10000, Math.round(numeric)) : fallback
}

function normalizeExtractionThreshold(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric)) : fallback
}

export function normalizeExtractionDetail(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return {
    targetSegmentChars: normalizeTargetSegmentChars(
      source.targetSegmentChars ?? source.target_segment_chars,
      DEFAULT_EXTRACTION_DETAIL.targetSegmentChars,
    ),
    maxEntitiesPerSegment: normalizeExtractionLimit(
      source.maxEntitiesPerSegment ?? source.max_entities_per_segment,
      DEFAULT_EXTRACTION_DETAIL.maxEntitiesPerSegment,
    ),
    maxRelationsPerSegment: normalizeExtractionLimit(
      source.maxRelationsPerSegment ?? source.max_relations_per_segment,
      DEFAULT_EXTRACTION_DETAIL.maxRelationsPerSegment,
    ),
    maxEventsPerSegment: normalizeExtractionLimit(
      source.maxEventsPerSegment ?? source.max_events_per_segment,
      DEFAULT_EXTRACTION_DETAIL.maxEventsPerSegment,
    ),
    entityImportanceThreshold: normalizeExtractionThreshold(
      source.entityImportanceThreshold ?? source.entity_importance_threshold,
      DEFAULT_EXTRACTION_DETAIL.entityImportanceThreshold,
    ),
    relationImportanceThreshold: normalizeExtractionThreshold(
      source.relationImportanceThreshold ?? source.relation_importance_threshold,
      DEFAULT_EXTRACTION_DETAIL.relationImportanceThreshold,
    ),
    eventImportanceThreshold: normalizeExtractionThreshold(
      source.eventImportanceThreshold ?? source.event_importance_threshold,
      DEFAULT_EXTRACTION_DETAIL.eventImportanceThreshold,
    ),
  }
}

function compactText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeString(value, fallback = '') {
  const normalized = String(value ?? '').trim()
  return normalized || String(fallback || '').trim()
}

function mergeUsage(...items) {
  return items.reduce((total, usage) => ({
    prompt_tokens: total.prompt_tokens + Math.max(0, Number(usage?.prompt_tokens || 0) || 0),
    completion_tokens: total.completion_tokens + Math.max(0, Number(usage?.completion_tokens || 0) || 0),
  }), { prompt_tokens: 0, completion_tokens: 0 })
}

function robotGenerationLog(label, payload, level = 'info') {
  const logger = typeof console[level] === 'function' ? console[level] : console.info
  logger(label, payload)
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => normalizeString(item)).filter(Boolean))]
}

function sampleLogValues(values, limit = 3) {
  return (Array.isArray(values) ? values : []).filter(Boolean).slice(0, limit)
}

function summarizeWorldGraphSnapshotForLog(graph) {
  const snapshot = normalizeWorldGraphSnapshot(graph)
  return {
    graphVersion: Number(snapshot?.meta?.graphVersion || 0),
    relationTypeCount: Array.isArray(snapshot.relationTypes) ? snapshot.relationTypes.length : 0,
    nodeCount: Array.isArray(snapshot.nodes) ? snapshot.nodes.length : 0,
    edgeCount: Array.isArray(snapshot.edges) ? snapshot.edges.length : 0,
    eventCount: (Array.isArray(snapshot.nodes) ? snapshot.nodes : []).filter((item) => item?.objectType === 'event').length,
    relationTypeSamples: sampleLogValues((snapshot.relationTypes || []).map((item) => item.code || item.label)),
    nodeSamples: sampleLogValues((snapshot.nodes || []).map((item) => item.id || item.name)),
    edgeSamples: sampleLogValues((snapshot.edges || []).map((item) => item.id)),
  }
}

function summarizeWorldGraphPatchForLog(patchInput) {
  const patch = normalizeRobotGenerationWorldGraphPatch(patchInput)
  const summary = {
    title: patch.meta.title,
    summaryLength: patch.meta.summary.length,
    upsertRelationTypeCount: patch.upsertRelationTypes.length,
    deleteRelationTypeCount: patch.deleteRelationTypeCodes.length,
    upsertNodeCount: patch.upsertNodes.length,
    deleteNodeCount: patch.deleteNodeIds.length,
    upsertEdgeCount: patch.upsertEdges.length,
    deleteEdgeCount: patch.deleteEdgeIds.length,
    upsertEventCount: patch.upsertEvents.length,
    appendEventEffectCount: patch.appendEventEffects.length,
    relationTypeSamples: sampleLogValues(patch.upsertRelationTypes.map((item) => item.code || item.label)),
    nodeSamples: sampleLogValues(patch.upsertNodes.map((item) => item.id || item.name)),
    edgeSamples: sampleLogValues(patch.upsertEdges.map((item) => item.id)),
    eventSamples: sampleLogValues(patch.upsertEvents.map((item) => item.id || item.name)),
  }
  return {
    ...summary,
    isEmptyStructuralPatch:
      summary.upsertRelationTypeCount === 0
      && summary.deleteRelationTypeCount === 0
      && summary.upsertNodeCount === 0
      && summary.deleteNodeCount === 0
      && summary.upsertEdgeCount === 0
      && summary.deleteEdgeCount === 0
      && summary.upsertEventCount === 0
      && summary.appendEventEffectCount === 0,
  }
}

function normalizeRobotGenerationRelationType(input = {}) {
  return {
    id: normalizeString(input.id),
    code: normalizeString(input.code || input.id),
    label: normalizeString(input.label || input.name),
    description: normalizeString(input.description),
    directionality: normalizeString(input.directionality),
  }
}

function normalizeRobotGenerationNode(input = {}) {
  return {
    id: normalizeString(input.id),
    name: normalizeString(input.name),
    objectType: normalizeString(input.objectType || input.object_type || input.type),
    summary: normalizeString(input.summary || input.description),
  }
}

function normalizeRobotGenerationEdge(input = {}) {
  return {
    id: normalizeString(input.id),
    sourceNodeId: normalizeString(input.sourceNodeId || input.source_node_id || input.source),
    targetNodeId: normalizeString(input.targetNodeId || input.target_node_id || input.target),
    relationTypeCode: normalizeString(input.relationTypeCode || input.relation_type_code || input.relationType || input.relation_type),
    relationLabel: normalizeString(input.relationLabel || input.relation_label),
    summary: normalizeString(input.summary || input.description),
  }
}

function normalizeRobotGenerationTimeline(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  return {
    sequenceIndex: Math.max(0, Number.parseInt(String(source.sequenceIndex ?? source.sequence_index ?? 0), 10) || 0),
    calendarId: normalizeString(source.calendarId || source.calendar_id),
    yearLabel: normalizeString(source.yearLabel || source.year_label),
    monthLabel: normalizeString(source.monthLabel || source.month_label),
    dayLabel: normalizeString(source.dayLabel || source.day_label),
    timeOfDayLabel: normalizeString(source.timeOfDayLabel || source.time_of_day_label),
    phase: normalizeString(source.phase),
    impactLevel: Math.max(0, Math.min(100, Number.parseInt(String(source.impactLevel ?? source.impact_level ?? 0), 10) || 0)),
    eventType: normalizeString(source.eventType || source.event_type),
  }
}

function normalizeRobotGenerationEvent(input = {}) {
  return {
    id: normalizeString(input.id),
    name: normalizeString(input.name),
    objectType: 'event',
    summary: normalizeString(input.summary || input.description),
    timeline: normalizeRobotGenerationTimeline(input.timeline),
  }
}

function normalizeRobotGenerationEffectFieldChange(input = {}) {
  return {
    fieldKey: normalizeString(input.fieldKey || input.field_key),
    beforeValue: normalizeString(input.beforeValue || input.before_value),
    afterValue: normalizeString(input.afterValue || input.after_value),
  }
}

function normalizeRobotGenerationEffectRelationDraft(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const rawIntensity = source.intensity
  return {
    targetNodeId: normalizeString(source.targetNodeId || source.target_node_id),
    relationTypeCode: normalizeString(source.relationTypeCode || source.relation_type_code),
    relationLabel: normalizeString(source.relationLabel || source.relation_label),
    summary: normalizeString(source.summary),
    status: normalizeString(source.status),
    intensity: rawIntensity === null || rawIntensity === undefined
      ? null
      : Math.max(0, Math.min(100, Number.parseInt(String(rawIntensity), 10) || 0)),
  }
}

function normalizeRobotGenerationEventEffect(input = {}) {
  return {
    id: normalizeString(input.id),
    summary: normalizeString(input.summary),
    targetNodeId: normalizeString(input.targetNodeId || input.target_node_id),
    changeTargetType: normalizeString(input.changeTargetType || input.change_target_type, 'node-content') === 'relation' ? 'relation' : 'node-content',
    nodeAttributeChanges: (Array.isArray(input.nodeAttributeChanges) ? input.nodeAttributeChanges : input.node_attribute_changes || [])
      .map((item) => normalizeRobotGenerationEffectFieldChange(item))
      .filter((item) => item.fieldKey),
    relationMode: normalizeString(input.relationMode || input.relation_mode, 'existing') === 'create' ? 'create' : 'existing',
    relationId: normalizeString(input.relationId || input.relation_id),
    relationChanges: (Array.isArray(input.relationChanges) ? input.relationChanges : input.relation_changes || [])
      .map((item) => normalizeRobotGenerationEffectFieldChange(item))
      .filter((item) => item.fieldKey),
    relationDraft: normalizeRobotGenerationEffectRelationDraft(input.relationDraft || input.relation_draft || {}),
  }
}

function normalizeRobotGenerationEventEffectOp(input = {}) {
  const ref = input.ref || input.eventRef || input.event_ref || input
  return {
    ref: {
      nodeId: normalizeString(ref.nodeId || ref.node_id || ref.id),
      name: normalizeString(ref.name),
      objectType: 'event',
    },
    effects: (Array.isArray(input.effects) ? input.effects : [input.effect])
      .filter(Boolean)
      .map((item) => normalizeRobotGenerationEventEffect(item))
      .filter((item) => item.id || item.summary),
  }
}

function ensureRobotGenerationPatchField(path, value) {
  if (!String(value || '').trim()) {
    throw new Error(`世界图谱 patch 非法：${path} 不能为空`)
  }
}

function ensureRobotGenerationWorldGraphPatch(patch) {
  const allowedDirectionality = new Set(['directed', 'undirected'])
  const allowedNodeTypes = new Set(['character', 'organization', 'location', 'event', 'item'])

  for (const [index, item] of patch.upsertRelationTypes.entries()) {
    ensureRobotGenerationPatchField(`upsertRelationTypes[${index}].id`, item.id)
    ensureRobotGenerationPatchField(`upsertRelationTypes[${index}].name`, item.label)
    ensureRobotGenerationPatchField(`upsertRelationTypes[${index}].description`, item.description)
    ensureRobotGenerationPatchField(`upsertRelationTypes[${index}].directionality`, item.directionality)
    if (!allowedDirectionality.has(item.directionality)) {
      throw new Error(`世界图谱 patch 非法：upsertRelationTypes[${index}].directionality 必须为 directed 或 undirected`)
    }
  }

  for (const [index, item] of patch.upsertNodes.entries()) {
    ensureRobotGenerationPatchField(`upsertNodes[${index}].id`, item.id)
    ensureRobotGenerationPatchField(`upsertNodes[${index}].name`, item.name)
    ensureRobotGenerationPatchField(`upsertNodes[${index}].type`, item.objectType)
    ensureRobotGenerationPatchField(`upsertNodes[${index}].description`, item.summary)
    if (!allowedNodeTypes.has(item.objectType)) {
      throw new Error(`世界图谱 patch 非法：upsertNodes[${index}].type 必须为 character、organization、location、event、item 之一`)
    }
  }

  for (const [index, item] of patch.upsertEdges.entries()) {
    ensureRobotGenerationPatchField(`upsertEdges[${index}].id`, item.id)
    ensureRobotGenerationPatchField(`upsertEdges[${index}].source`, item.sourceNodeId)
    ensureRobotGenerationPatchField(`upsertEdges[${index}].target`, item.targetNodeId)
    ensureRobotGenerationPatchField(`upsertEdges[${index}].relationType`, item.relationTypeCode)
    ensureRobotGenerationPatchField(`upsertEdges[${index}].description`, item.summary)
  }

  for (const [index, item] of patch.upsertEvents.entries()) {
    ensureRobotGenerationPatchField(`upsertEvents[${index}].id`, item.id)
    ensureRobotGenerationPatchField(`upsertEvents[${index}].name`, item.name)
    ensureRobotGenerationPatchField(`upsertEvents[${index}].description`, item.summary)
  }

  for (const [index, item] of patch.appendEventEffects.entries()) {
    if (!String(item.ref.nodeId || '').trim() && !String(item.ref.name || '').trim()) {
      throw new Error(`世界图谱 patch 非法：appendEventEffects[${index}].ref.nodeId 或 ref.name 至少要提供一个`)
    }
    if (!item.effects.length) {
      throw new Error(`世界图谱 patch 非法：appendEventEffects[${index}].effects 至少要有一项`)
    }
    for (const [effectIndex, effect] of item.effects.entries()) {
      ensureRobotGenerationPatchField(`appendEventEffects[${index}].effects[${effectIndex}].id`, effect.id)
      ensureRobotGenerationPatchField(`appendEventEffects[${index}].effects[${effectIndex}].summary`, effect.summary)
    }
  }
}

export function normalizeRobotGenerationWorldGraphPatch(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const metaSource = source.meta && typeof source.meta === 'object' && !Array.isArray(source.meta) ? source.meta : {}
  const patch = {
    meta: {
      title: normalizeString(metaSource.title),
      summary: normalizeString(metaSource.summary || metaSource.description),
    },
    upsertRelationTypes: (Array.isArray(source.upsertRelationTypes) ? source.upsertRelationTypes : source.upsert_relation_types || [])
      .map((item) => normalizeRobotGenerationRelationType(item)),
    deleteRelationTypeCodes: uniqueStrings(source.deleteRelationTypeCodes || source.delete_relation_type_codes),
    upsertNodes: (Array.isArray(source.upsertNodes) ? source.upsertNodes : source.upsert_nodes || [])
      .map((item) => normalizeRobotGenerationNode(item)),
    deleteNodeIds: uniqueStrings(source.deleteNodeIds || source.delete_node_ids),
    upsertEdges: (Array.isArray(source.upsertEdges) ? source.upsertEdges : source.upsert_edges || [])
      .map((item) => normalizeRobotGenerationEdge(item)),
    upsertEvents: (Array.isArray(source.upsertEvents) ? source.upsertEvents : source.upsert_events || [])
      .map((item) => normalizeRobotGenerationEvent(item)),
    appendEventEffects: (Array.isArray(source.appendEventEffects) ? source.appendEventEffects : source.append_event_effects || [])
      .map((item) => normalizeRobotGenerationEventEffectOp(item))
      .filter((item) => (item.ref.nodeId || item.ref.name) && item.effects.length),
    deleteEdgeIds: uniqueStrings(source.deleteEdgeIds || source.delete_edge_ids),
  }
  ensureRobotGenerationWorldGraphPatch(patch)
  return patch
}

function relationTypeSemanticallyEqual(left, right) {
  return left.code === right.code
    && left.label === right.label
    && left.description === right.description
    && left.directionality === right.directionality
}

function nodeSemanticallyEqual(left, right) {
  return left.id === right.id
    && left.name === right.name
    && left.objectType === right.objectType
    && left.summary === right.summary
}

function edgeSemanticallyEqual(left, right) {
  return left.id === right.id
    && left.sourceNodeId === right.sourceNodeId
    && left.targetNodeId === right.targetNodeId
    && left.relationTypeCode === right.relationTypeCode
    && left.relationLabel === right.relationLabel
    && left.summary === right.summary
}

export function applyRobotGenerationWorldGraphPatch(currentGraph, patchInput, overrides = {}) {
  const snapshot = normalizeWorldGraphSnapshot(currentGraph, overrides)
  const patch = normalizeRobotGenerationWorldGraphPatch(patchInput)
  let changed = false

  let relationTypes = [...snapshot.relationTypes]
  let nodes = [...snapshot.nodes]
  let edges = [...snapshot.edges]

  const edgeDeleteIds = new Set(patch.deleteEdgeIds)
  if (edgeDeleteIds.size) {
    const nextEdges = edges.filter((item) => !edgeDeleteIds.has(item.id))
    changed = changed || nextEdges.length !== edges.length
    edges = nextEdges
  }

  const nodeDeleteIds = new Set(patch.deleteNodeIds)
  if (nodeDeleteIds.size) {
    const nextNodes = nodes.filter((item) => !nodeDeleteIds.has(item.id))
    const nextEdges = edges.filter((item) => !nodeDeleteIds.has(item.sourceNodeId) && !nodeDeleteIds.has(item.targetNodeId))
    changed = changed || nextNodes.length !== nodes.length || nextEdges.length !== edges.length
    nodes = nextNodes
    edges = nextEdges
  }

  const relationTypeDeleteCodes = new Set(patch.deleteRelationTypeCodes)
  if (relationTypeDeleteCodes.size) {
    const nextRelationTypes = relationTypes.filter((item) => !relationTypeDeleteCodes.has(item.code))
    const nextEdges = edges.filter((item) => !relationTypeDeleteCodes.has(item.relationTypeCode))
    changed = changed || nextRelationTypes.length !== relationTypes.length || nextEdges.length !== edges.length
    relationTypes = nextRelationTypes
    edges = nextEdges
  }

  const relationTypeMap = new Map(relationTypes.map((item) => [item.code, item]))
  for (const item of patch.upsertRelationTypes) {
    if (!item.code) {
      throw new Error('世界图谱 patch 非法：relation type 缺少 id/code')
    }
    const existing = relationTypeMap.get(item.code)
    const next = {
      ...existing,
      ...item,
      id: item.id || existing?.id || item.code,
      code: item.code,
      label: item.label || existing?.label || item.code,
    }
    if (!existing || !relationTypeSemanticallyEqual(existing, next)) {
      changed = true
    }
    relationTypeMap.set(next.code, next)
  }
  relationTypes = [...relationTypeMap.values()]

  const nodeMap = new Map(nodes.map((item) => [item.id, item]))
  for (const item of patch.upsertNodes) {
    if (!item.id) {
      throw new Error('世界图谱 patch 非法：node 缺少 id')
    }
    const existing = nodeMap.get(item.id)
    const next = {
      ...existing,
      ...item,
      id: item.id,
      name: item.name || existing?.name || item.id,
      objectType: item.objectType || existing?.objectType || 'character',
      summary: item.summary || existing?.summary || '',
    }
    if (!existing || !nodeSemanticallyEqual(existing, next)) {
      changed = true
    }
    nodeMap.set(next.id, next)
  }
  nodes = [...nodeMap.values()]

  const validNodeIds = new Set(nodes.map((item) => item.id))
  const relationTypeLabelMap = new Map(relationTypes.map((item) => [item.code, item.label]))
  const validRelationTypeCodes = new Set(relationTypes.map((item) => item.code))
  const edgeMap = new Map(edges.map((item) => [item.id, item]))
  for (const item of patch.upsertEdges) {
    if (!item.id) {
      throw new Error('世界图谱 patch 非法：edge 缺少 id')
    }
    if (!validNodeIds.has(item.sourceNodeId) || !validNodeIds.has(item.targetNodeId)) {
      throw new Error(`世界图谱 patch 非法：edge ${item.id} 引用了不存在的节点`)
    }
    if (!validRelationTypeCodes.has(item.relationTypeCode)) {
      throw new Error(`世界图谱 patch 非法：edge ${item.id} 引用了不存在的关系类型`)
    }
    const existing = edgeMap.get(item.id)
    const next = {
      ...existing,
      ...item,
      id: item.id,
      sourceNodeId: item.sourceNodeId,
      targetNodeId: item.targetNodeId,
      relationTypeCode: item.relationTypeCode,
      relationLabel: item.relationLabel || existing?.relationLabel || relationTypeLabelMap.get(item.relationTypeCode) || item.relationTypeCode,
      summary: item.summary || existing?.summary || '',
    }
    if (!existing || !edgeSemanticallyEqual(existing, next)) {
      changed = true
    }
    edgeMap.set(next.id, next)
  }
  edges = [...edgeMap.values()]

  const nextTitle = normalizeString(patch.meta.title, snapshot.meta.title)
  const nextSummary = normalizeString(patch.meta.summary, snapshot.meta.summary)
  if (nextTitle !== snapshot.meta.title || nextSummary !== snapshot.meta.summary) {
    changed = true
  }

  const baseGraph = normalizeWorldGraphSnapshot({
    ...snapshot,
    meta: {
      ...snapshot.meta,
      title: nextTitle,
      summary: nextSummary,
      graphVersion: Math.max(0, Number(snapshot.meta.graphVersion || 0) || 0),
    },
    relationTypes,
    nodes,
    edges,
  }, overrides)

  const eventWriteback = applyWorldGraphWritebackToSnapshot(baseGraph, {
    upsert_events: patch.upsertEvents,
    append_event_effects: patch.appendEventEffects,
  })
  const hasEventChanges = eventWriteback.appliedNodeCount > 0 || eventWriteback.appliedEffectCount > 0

  if (!changed && !hasEventChanges) {
    return snapshot
  }

  return normalizeWorldGraphSnapshot({
    ...eventWriteback.graph,
    meta: {
      ...eventWriteback.graph.meta,
      title: nextTitle,
      summary: nextSummary,
      graphVersion: Math.max(0, Number(snapshot.meta.graphVersion || 0) || 0) + 1,
    },
  }, overrides)
}

function buildAgentModelPayload(modelConfig, temperatureFallback) {
  return {
    provider: modelConfig.provider,
    base_url: modelConfig.baseUrl,
    api_key: modelConfig.apiKey,
    model: modelConfig.model,
    temperature: typeof modelConfig.temperature === 'number' ? modelConfig.temperature : temperatureFallback,
  }
}

function sampleCompressedText(text, maxChars = 12000, sampleCount = 6) {
  const normalized = compactText(text)
  if (normalized.length <= maxChars) {
    return normalized
  }

  const normalizedCount = Math.max(3, Math.min(8, sampleCount))
  const sliceSize = Math.max(600, Math.floor(maxChars / normalizedCount) - 32)
  const parts = []
  for (let index = 0; index < normalizedCount; index += 1) {
    const position = normalizedCount === 1
      ? 0
      : Math.floor(((normalized.length - sliceSize) * index) / (normalizedCount - 1))
    const segment = normalized.slice(position, position + sliceSize).trim()
    if (segment) {
      parts.push(`[片段 ${index + 1}] ${segment}`)
    }
  }
  return parts.join('\n\n')
}

function buildAnalysisSegments(text, options = {}) {
  const normalized = compactText(text)
  if (!normalized) {
    return []
  }

  const approxTargetRawChars = Math.max(
    10000,
    Number(options.targetSegmentChars || process.env.ROBOT_IMPORT_TARGET_SEGMENT_CHARS || 180000) || 180000,
  )
  const maxSegments = Math.max(6, Number(process.env.ROBOT_IMPORT_MAX_SEGMENTS || 48) || 48)
  const segmentCount = Math.min(maxSegments, Math.max(1, Math.ceil(normalized.length / approxTargetRawChars)))
  const baseSize = Math.ceil(normalized.length / segmentCount)
  const segments = []

  for (let index = 0; index < segmentCount; index += 1) {
    const start = index * baseSize
    if (start >= normalized.length) {
      break
    }
    const end = index === segmentCount - 1 ? normalized.length : Math.min(normalized.length, (index + 1) * baseSize)
    const rawText = normalized.slice(start, end).trim()
    if (!rawText) {
      continue
    }
    segments.push({
      index,
      rawText,
      excerpt: sampleCompressedText(rawText),
      characterCount: rawText.length,
    })
  }

  return segments
}

async function requestAgentJson(path, body, actionLabel) {
  const response = await fetch(`${getAgentServiceUrl()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const rawText = await response.text()
    const message = extractAgentErrorMessage(rawText)
    if (message) {
      throw new Error(message)
    }
    if (rawText) {
      throw new Error(rawText || `${actionLabel}失败`)
    }
    throw new Error(`${actionLabel}失败`)
  }

  return response.json()
}

export function extractAgentErrorMessage(rawText) {
  try {
    const parsed = JSON.parse(String(rawText || ''))
    const message = String(parsed?.detail || parsed?.message || '').trim()
    return message || ''
  } catch {
    return ''
  }
}

async function resolveTaskModelConfig(user, modelConfigId = '') {
  const modelConfigs = await readModelConfigs(user)
  const resolvedId = String(modelConfigId || modelConfigs.activeModelConfigId || '').trim()
  const target = modelConfigs.configs.find((item) => item.id === resolvedId) || modelConfigs.configs[0]
  if (!target?.model) {
    throw new Error('当前没有可用的模型配置，无法生成智能体')
  }
  return target
}

async function resolveRequiredModelConfig(user, modelConfigId = '', emptyMessage, invalidMessage) {
  const resolvedId = String(modelConfigId || '').trim()
  if (!resolvedId) {
    throw new Error(emptyMessage)
  }
  const modelConfigs = await readModelConfigs(user)
  const target = modelConfigs.configs.find((item) => item.id === resolvedId)
  if (!target?.model) {
    throw new Error(invalidMessage)
  }
  return target
}

async function resolvePreferredModelConfig(user, preferredModelConfigId = '', fallbackModelConfigId = '') {
  const modelConfigs = await readModelConfigs(user)
  const candidates = [
    String(preferredModelConfigId || '').trim(),
    String(fallbackModelConfigId || '').trim(),
    String(modelConfigs.activeModelConfigId || '').trim(),
  ].filter(Boolean)
  const target = candidates
    .map((candidateId) => modelConfigs.configs.find((item) => item.id === candidateId))
    .find(Boolean) || modelConfigs.configs[0]
  if (!target?.model) {
    throw new Error('当前没有可用的模型配置，无法执行请求')
  }
  return target
}

function resolveEmbeddingConfig(modelConfig) {
  return {
    provider: String(process.env.KNOWLEDGE_EMBEDDING_PROVIDER || modelConfig.provider || 'openai'),
    baseUrl: String(process.env.KNOWLEDGE_EMBEDDING_BASE_URL || modelConfig.baseUrl || ''),
    apiKey: String(process.env.KNOWLEDGE_EMBEDDING_API_KEY || modelConfig.apiKey || ''),
    model: String(process.env.KNOWLEDGE_EMBEDDING_MODEL || modelConfig.model || ''),
  }
}

async function setTaskProgress(user, taskId, patch) {
  return updateRobotGenerationTask(user, taskId, patch)
}

async function summarizeAnalysisSegments(user, taskId, modelConfig, sourceName, guidance, segments, checkForCancellation = null) {
  const summaries = []
  for (const [segmentIndex, segment] of segments.entries()) {
    if (typeof checkForCancellation === 'function') {
      await checkForCancellation()
    }
    const response = await requestAgentJson('/runs/document-summary', {
      model_config: buildAgentModelPayload(modelConfig, 0.3),
      mode: 'segment',
      source_name: sourceName,
      guidance,
      index: segment.index,
      total: segments.length,
      text: segment.excerpt,
    }, '文档分段摘要')

    summaries.push({
      index: segment.index,
      summary: compactText(response?.summary || ''),
      excerpt: segment.excerpt,
      characterCount: segment.characterCount,
    })

    await setTaskProgress(user, taskId, {
      stage: 'summarizing',
      progress: normalizeProgress(22 + ((segmentIndex + 1) / Math.max(segments.length, 1)) * 33, 40),
      message: `正在总结文档片段 ${segmentIndex + 1}/${segments.length}`,
      stats: {
        summarySegmentCount: summaries.length,
      },
    })
    if (typeof checkForCancellation === 'function') {
      await checkForCancellation()
    }
  }

  return summaries
}

async function reduceSummaries(modelConfig, sourceName, guidance, summaries, checkForCancellation = null) {
  let current = summaries.map((item) => String(item?.summary || '').trim()).filter(Boolean)
  let round = 1
  while (current.length > 8) {
    const next = []
    for (let index = 0; index < current.length; index += 6) {
      if (typeof checkForCancellation === 'function') {
        await checkForCancellation()
      }
      const batch = current.slice(index, index + 6)
      const response = await requestAgentJson('/runs/document-summary', {
        model_config: buildAgentModelPayload(modelConfig, 0.3),
        mode: 'aggregate',
        source_name: sourceName,
        guidance,
        round,
        summaries: batch,
      }, '文档聚合摘要')
      next.push(compactText(response?.summary || ''))
      if (typeof checkForCancellation === 'function') {
        await checkForCancellation()
      }
    }
    current = next.filter(Boolean)
    round += 1
  }

  return current.join('\n\n')
}

function buildGeneratedRobotPayload(generated, robotId) {
  const normalized = normalizeRobots([{
    id: robotId,
    name: String(generated?.name || '').trim(),
    description: String(generated?.description || '').trim(),
    avatar: '',
    persistToServer: true,
    commonPrompt: String(generated?.commonPrompt || generated?.common_prompt || '').trim(),
    systemPrompt: String(generated?.systemPrompt || generated?.system_prompt || ''),
    memoryModelConfigId: '',
    outlineModelConfigId: '',
    knowledgeRetrievalModelConfigId: '',
    numericComputationModelConfigId: '',
    worldGraphModelConfigId: '',
    numericComputationEnabled: Boolean(
      generated?.numericComputationEnabled
      ?? generated?.numeric_computation_enabled
      ?? (Array.isArray(generated?.numericComputationItems || generated?.numeric_computation_items)
        && (generated.numericComputationItems || generated.numeric_computation_items).length > 0),
    ),
    numericComputationPrompt: String(
      generated?.numericComputationPrompt || generated?.numeric_computation_prompt || '',
    ).trim(),
    numericComputationItems:
      generated?.numericComputationItems || generated?.numeric_computation_items || [],
    structuredMemoryInterval: Math.max(1, Math.round(Number(generated?.structuredMemoryInterval || generated?.structured_memory_interval || 3) || 3)),
    structuredMemoryHistoryLimit: Math.max(1, Math.round(Number(generated?.structuredMemoryHistoryLimit || generated?.structured_memory_history_limit || 12) || 12)),
    memorySchema: normalizeMemorySchema(generated?.memorySchema || generated?.memory_schema),
  }])[0]

  return normalized
}

function summarizeGraphRagPayloadForLog(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  return {
    relationTypeCount: Array.isArray(source.relation_types || source.relationTypes) ? (source.relation_types || source.relationTypes).length : 0,
    entityCount: Array.isArray(source.entities) ? source.entities.length : 0,
    relationCount: Array.isArray(source.relations) ? source.relations.length : 0,
    eventCount: Array.isArray(source.events) ? source.events.length : 0,
    communityCount: Array.isArray(source.communities) ? source.communities.length : 0,
    chunkCount: Array.isArray(source.chunks) ? source.chunks.length : 0,
  }
}

function normalizeGraphRagObjectType(value, fallback = 'character') {
  return ['character', 'organization', 'location', 'event', 'item'].includes(String(value || '').trim())
    ? String(value).trim()
    : fallback
}

function normalizeGraphRagDirectionality(value) {
  return String(value || '').trim() === 'undirected' ? 'undirected' : 'directed'
}

function buildGraphRagRelationTypeCode(value, fallback = 'relation') {
  const normalized = normalizeString(value)
  return normalized || fallback
}

function hasGraphRagContent(payload) {
  const summary = summarizeGraphRagPayloadForLog(payload)
  return Object.values(summary).some((value) => Number(value || 0) > 0)
}

function hasWorldGraphContent(graph) {
  const summary = summarizeWorldGraphSnapshotForLog(graph)
  return summary.relationTypeCount > 0 || summary.nodeCount > 0 || summary.edgeCount > 0 || summary.eventCount > 0
}

function normalizeGraphRagSequenceIndex(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null
  }
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null
}

function normalizeGraphRagAppendEventEffects(input) {
  return (Array.isArray(input) ? input : [])
    .map((item) => {
      const ref = item && typeof item === 'object' && !Array.isArray(item) ? (item.ref || item.eventRef || item.event_ref || {}) : {}
      const effects = (Array.isArray(item?.effects) ? item.effects : [item?.effect])
        .filter(Boolean)
        .map((effect) => ({
          id: normalizeString(effect?.id),
          summary: normalizeString(effect?.summary),
          targetNodeId: normalizeString(effect?.targetNodeId || effect?.target_node_id),
          changeTargetType: normalizeString(effect?.changeTargetType || effect?.change_target_type, 'node-content') === 'relation' ? 'relation' : 'node-content',
          nodeAttributeChanges: Array.isArray(effect?.nodeAttributeChanges || effect?.node_attribute_changes)
            ? (effect.nodeAttributeChanges || effect.node_attribute_changes)
            : [],
          relationMode: normalizeString(effect?.relationMode || effect?.relation_mode, 'existing') === 'create' ? 'create' : 'existing',
          relationId: normalizeString(effect?.relationId || effect?.relation_id),
          relationChanges: Array.isArray(effect?.relationChanges || effect?.relation_changes)
            ? (effect.relationChanges || effect.relation_changes)
            : [],
          relationDraft: effect?.relationDraft || effect?.relation_draft || {},
        }))
        .filter((effect) => effect.id || effect.summary)
      if (!effects.length) {
        return null
      }
      return {
        ref: {
          nodeId: normalizeString(ref.nodeId || ref.node_id || ref.id),
          name: normalizeString(ref.name),
          objectType: 'event',
        },
        effects,
      }
    })
    .filter(Boolean)
}

function readWorldGraphMaxSequenceIndex(graph) {
  const snapshot = normalizeWorldGraphSnapshot(graph)
  return snapshot.nodes.reduce((max, item) => (
    item?.objectType === 'event'
      ? Math.max(max, Math.max(0, Number(item?.timeline?.sequenceIndex ?? item?.startSequenceIndex ?? 0) || 0))
      : max
  ), 0)
}

function createEmptyGraphRagGraphPayload(meta = {}) {
  return {
    meta: {
      title: normalizeString(meta.title),
      summary: normalizeString(meta.summary),
    },
    relation_types: [],
    entities: [],
    relations: [],
    events: [],
    append_event_effects: [],
    communities: [],
    chunks: [],
  }
}

function upsertGraphRagCollectionById(items, incoming, keySelector) {
  const map = new Map((Array.isArray(items) ? items : []).map((item) => [keySelector(item), item]).filter(([key]) => key))
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const key = keySelector(item)
    if (!key) {
      continue
    }
    map.set(key, item)
  }
  return [...map.values()]
}

function mergeGraphRagGraphPayload(currentInput, incomingInput, options = {}) {
  const current = currentInput && typeof currentInput === 'object' && !Array.isArray(currentInput)
    ? currentInput
    : createEmptyGraphRagGraphPayload()
  const incoming = incomingInput && typeof incomingInput === 'object' && !Array.isArray(incomingInput)
    ? incomingInput
    : createEmptyGraphRagGraphPayload()
  const nextMetaTitle = normalizeString(incoming?.meta?.title || incoming?.meta?.name, normalizeString(current?.meta?.title))
  const nextMetaSummary = normalizeString(incoming?.meta?.summary || incoming?.meta?.description, normalizeString(current?.meta?.summary))

  return supplementGraphRagGraphPayload({
    meta: {
      title: nextMetaTitle,
      summary: nextMetaSummary || normalizeString(options.defaultSummary),
    },
    relation_types: upsertGraphRagCollectionById(
      current.relation_types || current.relationTypes,
      incoming.relation_types || incoming.relationTypes,
      (item) => buildGraphRagRelationTypeCode(item?.id || item?.code),
    ),
    entities: upsertGraphRagCollectionById(current.entities, incoming.entities, (item) => normalizeString(item?.id)),
    relations: upsertGraphRagCollectionById(current.relations, incoming.relations, (item) => normalizeString(item?.id)),
    events: upsertGraphRagCollectionById(current.events, incoming.events, (item) => normalizeString(item?.id)),
    append_event_effects: upsertGraphRagCollectionById(
      normalizeGraphRagAppendEventEffects(current.append_event_effects || current.appendEventEffects),
      normalizeGraphRagAppendEventEffects(incoming.append_event_effects || incoming.appendEventEffects),
      (item) => normalizeString(item?.ref?.nodeId || item?.ref?.name),
    ),
    communities: upsertGraphRagCollectionById(current.communities, incoming.communities, (item) => normalizeString(item?.id)),
    chunks: upsertGraphRagCollectionById(current.chunks, incoming.chunks, (item) => {
      const segmentIndex = Math.max(0, Number(item?.segment_index ?? item?.segmentIndex ?? 0) || 0)
      const sourceName = normalizeString(item?.source_name || item?.sourceName)
      return `${sourceName}:${segmentIndex}`
    }),
  })
}

function buildGraphRagTemporalMetadata(source) {
  const chunks = Array.isArray(source?.chunks) ? source.chunks : []
  const events = Array.isArray(source?.events) ? source.events : []
  const relations = Array.isArray(source?.relations) ? source.relations : []
  const explicitEffectOps = normalizeGraphRagAppendEventEffects(source?.append_event_effects || source?.appendEventEffects)

  const chunkEntityMinIndex = new Map()
  const chunkRelationMinIndex = new Map()
  const chunkEventMinIndex = new Map()

  for (const [chunkOrder, chunk] of chunks.entries()) {
    const rawSegmentIndex = chunk?.segment_index ?? chunk?.segmentIndex ?? chunkOrder
    const segmentIndex = Number.isFinite(Number(rawSegmentIndex)) ? Math.max(0, Math.round(Number(rawSegmentIndex))) : chunkOrder
    for (const entityId of uniqueStrings(chunk?.entity_ids || chunk?.entityIds)) {
      const current = chunkEntityMinIndex.get(entityId)
      if (current === undefined || segmentIndex < current) {
        chunkEntityMinIndex.set(entityId, segmentIndex)
      }
    }
    for (const relationId of uniqueStrings(chunk?.relation_ids || chunk?.relationIds)) {
      const current = chunkRelationMinIndex.get(relationId)
      if (current === undefined || segmentIndex < current) {
        chunkRelationMinIndex.set(relationId, segmentIndex)
      }
    }
    for (const eventId of uniqueStrings(chunk?.event_ids || chunk?.eventIds)) {
      const current = chunkEventMinIndex.get(eventId)
      if (current === undefined || segmentIndex < current) {
        chunkEventMinIndex.set(eventId, segmentIndex)
      }
    }
  }

  const eventRecords = events.map((item, index) => {
    const id = normalizeString(item?.id, `event-${index + 1}`)
    const explicitSequenceIndex = normalizeGraphRagSequenceIndex(item?.timeline?.sequenceIndex ?? item?.timeline?.sequence_index)
    const chunkOrder = chunkEventMinIndex.has(id) ? chunkEventMinIndex.get(id) : index
    return {
      id,
      index,
      chunkOrder,
      explicitSequenceIndex,
      item,
    }
  })

  const explicitSequenceValues = eventRecords
    .map((item) => item.explicitSequenceIndex)
    .filter((item) => item !== null)
  const shouldReassignSequence =
    eventRecords.length > 1
    && (
      explicitSequenceValues.length !== eventRecords.length
      || new Set(explicitSequenceValues).size <= 1
    )

  const sortedRecords = [...eventRecords].sort((left, right) =>
    left.chunkOrder - right.chunkOrder
    || left.index - right.index
    || left.id.localeCompare(right.id, 'zh-CN'),
  )

  const chunkSequenceMap = new Map()
  let nextSequenceIndex = 0
  for (const record of sortedRecords) {
    if (!chunkSequenceMap.has(record.chunkOrder)) {
      chunkSequenceMap.set(record.chunkOrder, nextSequenceIndex)
      nextSequenceIndex += 1
    }
  }

  const eventSequenceMap = new Map()
  const normalizedEvents = eventRecords.map((record) => {
    const nextSequence =
      shouldReassignSequence
        ? chunkSequenceMap.get(record.chunkOrder)
        : (record.explicitSequenceIndex ?? chunkSequenceMap.get(record.chunkOrder) ?? record.index)
    eventSequenceMap.set(record.id, Math.max(0, Number(nextSequence || 0) || 0))
    return {
      ...record.item,
      id: record.id,
      timeline: {
        ...(record.item?.timeline && typeof record.item.timeline === 'object' ? record.item.timeline : {}),
        sequenceIndex: Math.max(0, Number(nextSequence || 0) || 0),
      },
    }
  })

  const entityStartSequenceMap = new Map()
  const relationStartSequenceMap = new Map()

  const bumpStartSequence = (map, id, sequenceIndex) => {
    const normalizedId = normalizeString(id)
    if (!normalizedId || !Number.isFinite(sequenceIndex)) {
      return
    }
    const nextValue = Math.max(0, Math.round(sequenceIndex))
    const current = map.get(normalizedId)
    if (current === undefined || nextValue < current) {
      map.set(normalizedId, nextValue)
    }
  }

  for (const [entityId, segmentIndex] of chunkEntityMinIndex.entries()) {
    bumpStartSequence(entityStartSequenceMap, entityId, segmentIndex)
  }
  for (const [relationId, segmentIndex] of chunkRelationMinIndex.entries()) {
    bumpStartSequence(relationStartSequenceMap, relationId, segmentIndex)
  }

  for (const event of normalizedEvents) {
    const eventId = normalizeString(event?.id)
    const eventSequenceIndex = eventSequenceMap.get(eventId) ?? 0
    for (const entityId of uniqueStrings(event?.participant_entity_ids || event?.participantEntityIds)) {
      bumpStartSequence(entityStartSequenceMap, entityId, eventSequenceIndex)
    }
  }

  for (const item of explicitEffectOps) {
    const eventId = normalizeString(item?.ref?.nodeId)
    const eventSequenceIndex = eventSequenceMap.get(eventId)
    if (eventSequenceIndex === undefined) {
      continue
    }
    for (const effect of Array.isArray(item?.effects) ? item.effects : []) {
      bumpStartSequence(entityStartSequenceMap, effect?.targetNodeId, eventSequenceIndex)
      bumpStartSequence(relationStartSequenceMap, effect?.relationId, eventSequenceIndex)
      bumpStartSequence(entityStartSequenceMap, effect?.relationDraft?.targetNodeId, eventSequenceIndex)
    }
  }

  for (const relation of relations) {
    const relationId = normalizeString(relation?.id)
    const sourceNodeId = normalizeString(relation?.source_id || relation?.sourceId || relation?.source)
    const targetNodeId = normalizeString(relation?.target_id || relation?.targetId || relation?.target)
    const fallbackStartSequence = Math.max(
      entityStartSequenceMap.get(sourceNodeId) ?? 0,
      entityStartSequenceMap.get(targetNodeId) ?? 0,
    )
    if (!relationStartSequenceMap.has(relationId)) {
      relationStartSequenceMap.set(relationId, fallbackStartSequence)
    } else {
      relationStartSequenceMap.set(relationId, Math.max(relationStartSequenceMap.get(relationId) ?? 0, fallbackStartSequence))
    }
  }

  return {
    normalizedEvents,
    appendEventEffects: explicitEffectOps,
    eventSequenceMap,
    entityStartSequenceMap,
    relationStartSequenceMap,
  }
}

export function supplementGraphRagGraphPayload(graphInput) {
  const source = graphInput && typeof graphInput === 'object' && !Array.isArray(graphInput) ? graphInput : {}
  const { normalizedEvents, appendEventEffects } = buildGraphRagTemporalMetadata(source)

  return {
    ...source,
    events: normalizedEvents,
    append_event_effects: appendEventEffects,
  }
}

function buildGraphRagRelationTypes(relationTypesInput, relationsInput) {
  const relationTypeMap = new Map()
  for (const [index, item] of (Array.isArray(relationTypesInput) ? relationTypesInput : []).entries()) {
    const code = buildGraphRagRelationTypeCode(item?.id || item?.code, `relation-type-${index + 1}`)
    relationTypeMap.set(code, {
      id: normalizeString(item?.id, code),
      code,
      label: normalizeString(item?.name || item?.label, code),
      description: normalizeString(item?.description, `GraphRAG 抽取的关系类型：${normalizeString(item?.name || item?.label, code)}`),
      directionality: normalizeGraphRagDirectionality(item?.directionality),
    })
  }

  for (const [index, item] of (Array.isArray(relationsInput) ? relationsInput : []).entries()) {
    const code = buildGraphRagRelationTypeCode(item?.relation_type_id || item?.relationTypeId || item?.relationTypeCode, `relation-${index + 1}`)
    if (!relationTypeMap.has(code)) {
      relationTypeMap.set(code, {
        id: code,
        code,
        label: code,
        description: `GraphRAG 召回或写回隐式引用的关系类型：${code}`,
        directionality: 'directed',
      })
    }
  }

  return [...relationTypeMap.values()]
}

export function mergeGraphRagRelationTypesIntoWorldGraph(currentGraph, relationTypesInput) {
  const snapshot = normalizeWorldGraphSnapshot(currentGraph)
  const nextRelationTypes = buildGraphRagRelationTypes(relationTypesInput, [])
  if (!nextRelationTypes.length) {
    return {
      graph: snapshot,
      appliedRelationTypeCount: 0,
    }
  }

  const relationTypeMap = new Map(snapshot.relationTypes.map((item) => [item.code, item]))
  let changed = false
  let appliedRelationTypeCount = 0

  for (const item of nextRelationTypes) {
    const existing = relationTypeMap.get(item.code)
    const next = {
      ...existing,
      ...item,
      id: item.id || existing?.id || item.code,
      code: item.code,
      label: item.label || existing?.label || item.code,
      description: item.description || existing?.description || '',
      directionality: item.directionality || existing?.directionality || 'directed',
    }
    if (
      !existing
      || existing.label !== next.label
      || existing.description !== next.description
      || existing.directionality !== next.directionality
    ) {
      changed = true
      appliedRelationTypeCount += 1
    }
    relationTypeMap.set(next.code, next)
  }

  if (!changed) {
    return {
      graph: snapshot,
      appliedRelationTypeCount: 0,
    }
  }

  return {
    graph: normalizeWorldGraphSnapshot({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        graphVersion: Math.max(0, Number(snapshot.meta.graphVersion || 0) || 0) + 1,
      },
      relationTypes: [...relationTypeMap.values()],
    }),
    appliedRelationTypeCount,
  }
}

export function mapGraphRagGraphToWorldGraphSnapshot(graphInput, options = {}) {
  const source = supplementGraphRagGraphPayload(graphInput)
  const temporal = buildGraphRagTemporalMetadata(source)
  const robotId = normalizeString(options.robotId)
  const robotName = normalizeString(options.robotName)
  const relationTypes = buildGraphRagRelationTypes(source.relation_types || source.relationTypes, source.relations)
  const relationTypeMap = new Map(relationTypes.map((item) => [item.code, item]))

  const nodeMap = new Map()
  for (const item of Array.isArray(source.entities) ? source.entities : []) {
    const id = normalizeString(item?.id)
    if (!id) {
      continue
    }
    nodeMap.set(id, {
      id,
      objectType: normalizeGraphRagObjectType(item?.type),
      name: normalizeString(item?.name, id),
      summary: normalizeString(item?.summary),
      startSequenceIndex: Math.max(0, Number(temporal.entityStartSequenceMap.get(id) ?? 0) || 0),
      attributes: {
        aliases: (Array.isArray(item?.aliases) ? item.aliases : []).filter(Boolean).join(' | '),
        communityIds: (Array.isArray(item?.community_ids || item?.communityIds) ? (item.community_ids || item.communityIds) : []).filter(Boolean).join(','),
      },
    })
  }

  for (const item of temporal.normalizedEvents) {
    const id = normalizeString(item?.id)
    if (!id) {
      continue
    }
    const eventSequenceIndex = Math.max(0, Number(temporal.eventSequenceMap.get(id) ?? item?.timeline?.sequenceIndex ?? 0) || 0)
    nodeMap.set(id, {
      id,
      objectType: 'event',
      name: normalizeString(item?.name, id),
      summary: normalizeString(item?.summary),
      startSequenceIndex: eventSequenceIndex,
      timeline: {
        sequenceIndex: eventSequenceIndex,
        calendarId: normalizeString(item?.timeline?.calendarId || item?.timeline?.calendar_id),
        yearLabel: normalizeString(item?.timeline?.yearLabel || item?.timeline?.year_label),
        monthLabel: normalizeString(item?.timeline?.monthLabel || item?.timeline?.month_label),
        dayLabel: normalizeString(item?.timeline?.dayLabel || item?.timeline?.day_label),
        timeOfDayLabel: normalizeString(item?.timeline?.timeOfDayLabel || item?.timeline?.time_of_day_label),
        phase: normalizeString(item?.timeline?.phase),
        impactLevel: Math.max(0, Math.min(100, Number(item?.timeline?.impactLevel || item?.timeline?.impact_level || 0) || 0)),
        eventType: normalizeString(item?.timeline?.eventType || item?.timeline?.event_type),
      },
      attributes: {
        participantEntityIds: (Array.isArray(item?.participant_entity_ids || item?.participantEntityIds) ? (item.participant_entity_ids || item.participantEntityIds) : []).filter(Boolean).join(','),
        communityIds: (Array.isArray(item?.community_ids || item?.communityIds) ? (item.community_ids || item.communityIds) : []).filter(Boolean).join(','),
      },
    })
  }

  const validNodeIds = new Set(nodeMap.keys())
  const edges = (Array.isArray(source.relations) ? source.relations : [])
    .map((item, index) => {
      const sourceNodeId = normalizeString(item?.source_id || item?.sourceId || item?.source)
      const targetNodeId = normalizeString(item?.target_id || item?.targetId || item?.target)
      const relationTypeCode = buildGraphRagRelationTypeCode(
        item?.relation_type_id || item?.relationTypeId || item?.relationTypeCode,
        `relation-${index + 1}`,
      )
      if (!sourceNodeId || !targetNodeId || !validNodeIds.has(sourceNodeId) || !validNodeIds.has(targetNodeId)) {
        return null
      }
      const fallbackStartSequenceIndex = Math.max(
        Number(nodeMap.get(sourceNodeId)?.startSequenceIndex || 0) || 0,
        Number(nodeMap.get(targetNodeId)?.startSequenceIndex || 0) || 0,
      )
      return {
        id: normalizeString(item?.id, `edge-${index + 1}`),
        sourceNodeId,
        targetNodeId,
        relationTypeCode,
        relationLabel: relationTypeMap.get(relationTypeCode)?.label || relationTypeCode,
        summary: normalizeString(item?.summary),
        directionality: relationTypeMap.get(relationTypeCode)?.directionality || 'directed',
        startSequenceIndex: Math.max(
          fallbackStartSequenceIndex,
          Number(temporal.relationStartSequenceMap.get(normalizeString(item?.id)) ?? fallbackStartSequenceIndex) || fallbackStartSequenceIndex,
        ),
      }
    })
    .filter(Boolean)

  const baseSnapshot = normalizeWorldGraphSnapshot({
    meta: {
      robotId,
      title: normalizeString(source?.meta?.title, robotName ? `${robotName} 世界设定` : ''),
      summary: normalizeString(source?.meta?.summary || source?.meta?.description, normalizeString(options.documentSummary)),
      graphVersion: relationTypes.length || nodeMap.size || edges.length ? 1 : 0,
    },
    relationTypes,
    nodes: [...nodeMap.values()],
    edges,
  }, { robotId, robotName })

  const snapshot = temporal.appendEventEffects.length
    ? normalizeWorldGraphSnapshot({
      ...applyWorldGraphWritebackToSnapshot(baseSnapshot, {
        append_event_effects: temporal.appendEventEffects,
      }).graph,
      meta: {
        ...baseSnapshot.meta,
      },
    }, { robotId, robotName })
    : baseSnapshot

  if (!hasWorldGraphContent(snapshot)) {
    throw new Error('GraphRAG 抽取结果为空，无法生成世界图谱')
  }

  return snapshot
}

export function mapGraphRagWritebackToWorldGraphUpdate(input, options = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const relationTypes = buildGraphRagRelationTypes(source.relation_types || source.relationTypes, source.relations)
  const relationTypeMap = new Map(relationTypes.map((item) => [item.code, item]))
  const currentGraph = normalizeWorldGraphSnapshot(options.currentGraph || null)
  const currentMaxSequenceIndex = readWorldGraphMaxSequenceIndex(currentGraph)
  const normalizedEffectOps = normalizeGraphRagAppendEventEffects(source.append_event_effects || source.appendEventEffects)
  const rawEvents = Array.isArray(source.events) ? source.events : []
  const eventSequenceMap = new Map()

  for (const [index, item] of rawEvents.entries()) {
    const id = normalizeString(item?.id)
    if (!id) {
      continue
    }
    const explicitSequenceIndex = normalizeGraphRagSequenceIndex(item?.timeline?.sequenceIndex ?? item?.timeline?.sequence_index)
    eventSequenceMap.set(id, explicitSequenceIndex ?? (currentMaxSequenceIndex + index + 1))
  }

  const nodeStartSequenceMap = new Map()
  const relationStartSequenceMap = new Map()
  const setStartSequence = (map, id, sequenceIndex) => {
    const normalizedId = normalizeString(id)
    if (!normalizedId || !Number.isFinite(sequenceIndex)) {
      return
    }
    const nextValue = Math.max(0, Math.round(sequenceIndex))
    const current = map.get(normalizedId)
    if (current === undefined || nextValue < current) {
      map.set(normalizedId, nextValue)
    }
  }

  const defaultWritebackSequenceIndex =
    eventSequenceMap.size > 0
      ? Math.max(...eventSequenceMap.values())
      : currentMaxSequenceIndex

  for (const item of normalizedEffectOps) {
    const eventSequenceIndex = eventSequenceMap.get(normalizeString(item?.ref?.nodeId))
    if (eventSequenceIndex === undefined) {
      continue
    }
    for (const effect of Array.isArray(item?.effects) ? item.effects : []) {
      setStartSequence(nodeStartSequenceMap, effect?.targetNodeId, eventSequenceIndex)
      setStartSequence(relationStartSequenceMap, effect?.relationId, eventSequenceIndex)
      setStartSequence(nodeStartSequenceMap, effect?.relationDraft?.targetNodeId, eventSequenceIndex)
    }
  }

  const upsertNodes = (Array.isArray(source.entities) ? source.entities : [])
    .map((item) => {
      const id = normalizeString(item?.id)
      if (!id) {
        return null
      }
      const next = {
        id,
        objectType: normalizeGraphRagObjectType(item?.type),
      }
      const name = normalizeString(item?.name)
      const summary = normalizeString(item?.summary)
      if (name) {
        next.name = name
      }
      if (summary) {
        next.summary = summary
      }
      next.startSequenceIndex = Math.max(0, Number(nodeStartSequenceMap.get(id) ?? defaultWritebackSequenceIndex) || defaultWritebackSequenceIndex)
      return next
    })
    .filter(Boolean)

  const upsertEvents = rawEvents
    .map((item) => {
      const id = normalizeString(item?.id)
      if (!id) {
        return null
      }
      const eventSequenceIndex = Math.max(0, Number(eventSequenceMap.get(id) ?? defaultWritebackSequenceIndex) || defaultWritebackSequenceIndex)
      const next = {
        id,
        objectType: 'event',
        startSequenceIndex: eventSequenceIndex,
      }
      const name = normalizeString(item?.name)
      const summary = normalizeString(item?.summary)
      if (name) {
        next.name = name
      }
      if (summary) {
        next.summary = summary
      }
      next.timeline = {
        sequenceIndex: eventSequenceIndex,
        calendarId: normalizeString(item?.timeline?.calendarId || item?.timeline?.calendar_id),
        yearLabel: normalizeString(item?.timeline?.yearLabel || item?.timeline?.year_label),
        monthLabel: normalizeString(item?.timeline?.monthLabel || item?.timeline?.month_label),
        dayLabel: normalizeString(item?.timeline?.dayLabel || item?.timeline?.day_label),
        timeOfDayLabel: normalizeString(item?.timeline?.timeOfDayLabel || item?.timeline?.time_of_day_label),
        phase: normalizeString(item?.timeline?.phase),
        impactLevel: Math.max(0, Math.min(100, Number(item?.timeline?.impactLevel || item?.timeline?.impact_level || 0) || 0)),
        eventType: normalizeString(item?.timeline?.eventType || item?.timeline?.event_type),
      }
      return next
    })
    .filter(Boolean)

  const upsertEdges = (Array.isArray(source.relations) ? source.relations : [])
    .map((item, index) => {
      const sourceNodeId = normalizeString(item?.source_id || item?.sourceId || item?.source)
      const targetNodeId = normalizeString(item?.target_id || item?.targetId || item?.target)
      const relationTypeCode = buildGraphRagRelationTypeCode(
        item?.relation_type_id || item?.relationTypeId || item?.relationTypeCode,
        `relation-${index + 1}`,
      )
      if (!sourceNodeId || !targetNodeId) {
        return null
      }
      const next = {
        id: normalizeString(item?.id, `edge-${index + 1}`),
        sourceNodeId,
        targetNodeId,
        relationTypeCode,
        relationLabel: relationTypeMap.get(relationTypeCode)?.label || relationTypeCode,
      }
      const summary = normalizeString(item?.summary)
      if (summary) {
        next.summary = summary
      }
      const endpointFloor = Math.max(
        Number(nodeStartSequenceMap.get(sourceNodeId) ?? currentGraph.nodes.find((node) => node.id === sourceNodeId)?.startSequenceIndex ?? 0) || 0,
        Number(nodeStartSequenceMap.get(targetNodeId) ?? currentGraph.nodes.find((node) => node.id === targetNodeId)?.startSequenceIndex ?? 0) || 0,
      )
      next.startSequenceIndex = Math.max(
        endpointFloor,
        Number(relationStartSequenceMap.get(next.id) ?? defaultWritebackSequenceIndex) || defaultWritebackSequenceIndex,
      )
      return next
    })
    .filter(Boolean)

  return {
    summary: normalizeString(source.summary),
    relationTypes,
    writebackOps: {
      upsert_nodes: upsertNodes,
      upsert_edges: upsertEdges,
      upsert_events: upsertEvents,
      append_event_effects: normalizedEffectOps,
    },
  }
}

async function persistGraphRagArtifact(user, input) {
  try {
    return await createGraphRagArtifact(user, input)
  } catch (error) {
    robotGenerationLog('[graphrag:artifact:failed]', {
      kind: input?.kind || '',
      robotId: input?.robotId || '',
      documentId: input?.documentId || '',
      sessionId: input?.sessionId || '',
      message: error instanceof Error ? error.message : 'GraphRAG artifact 保存失败',
    }, 'warn')
    return null
  }
}

function ensureGraphRagSegmentChunk(graphInput, segment, sourceName, documentId = '') {
  const source = graphInput && typeof graphInput === 'object' && !Array.isArray(graphInput) ? graphInput : {}
  const chunks = Array.isArray(source.chunks) ? source.chunks : []
  const hasCurrentSegmentChunk = chunks.some((item) => Math.max(0, Number(item?.segment_index ?? item?.segmentIndex ?? -1) || -1) === Math.max(0, Number(segment?.index ?? 0) || 0))
  if (hasCurrentSegmentChunk) {
    return source
  }

  return {
    ...source,
    chunks: [
      ...chunks,
      {
        document_id: normalizeString(documentId),
        source_name: normalizeString(sourceName),
        segment_index: Math.max(0, Number(segment?.index ?? 0) || 0),
        summary: normalizeString(segment?.summary),
        excerpt: normalizeString(segment?.excerpt),
        entity_ids: [],
        relation_ids: [],
        event_ids: [],
        community_ids: [],
      },
    ],
  }
}

async function saveGeneratedRobot(user, robot, worldGraph) {
  const existingRobots = await readRobots(user)
  await writeRobots(user, [...existingRobots, { ...robot, worldGraph: undefined }])

  if (worldGraph && typeof worldGraph === 'object') {
    const snapshot = normalizeWorldGraphSnapshot(worldGraph, {
      robotId: robot.id,
      robotName: robot.name,
      meta: {
        title: `${robot.name} 世界设定`,
      },
    })
    await replaceWorldGraph(user, robot.id, snapshot)
    return snapshot
  }

  return createEmptyWorldGraphSnapshot(robot.id, robot.name)
}

async function indexKnowledgeSummaries(user, document, summaries, embeddingConfig) {
  const collectionName = resolveKnowledgeCollectionName(embeddingConfig.provider, embeddingConfig.model)
  const inputs = summaries.map((item) => item.summary || item.excerpt).filter(Boolean)
  const vectors = await createEmbeddings(embeddingConfig, inputs)
  if (!vectors.length) {
    throw new Error('未生成任何知识向量')
  }

  await upsertKnowledgeVectors(
    collectionName,
    vectors.map((vector, index) => ({
      id: buildKnowledgePointId(document.id, summaries[index]?.index ?? index),
      vector,
      payload: {
        userId: user.id,
        robotId: document.robotId,
        documentId: document.id,
        sourceName: document.sourceName,
        sourceType: document.sourceType,
        segmentIndex: summaries[index]?.index ?? index,
        summary: String(summaries[index]?.summary || ''),
        excerpt: String(summaries[index]?.excerpt || ''),
        characterCount: Number(summaries[index]?.characterCount || 0),
        createdAt: new Date().toISOString(),
      },
    })),
    Array.isArray(vectors[0]) ? vectors[0].length : 0,
  )

  return collectionName
}

export async function evolveWorldGraphFromSummaries(options) {
  const {
    modelConfig,
    sourceName,
    guidance,
    summaries,
    core,
    robotId = '',
    robotName = '',
    requestAgent = requestAgentJson,
    onProgress = null,
    checkForCancellation = null,
  } = options || {}

  let worldGraph = createEmptyWorldGraphSnapshot(robotId, robotName)
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  const warnings = []
  const items = Array.isArray(summaries) ? summaries : []
  let processedSegmentCount = 0
  let failedSegmentCount = 0
  let nonEmptyPatchSegmentCount = 0
  let emptyPatchSegmentCount = 0

  for (const [segmentIndex, item] of items.entries()) {
    if (typeof checkForCancellation === 'function') {
      await checkForCancellation()
    }
    const segmentSummary = compactText(item?.summary || '')
    if (!segmentSummary) {
      continue
    }
    processedSegmentCount += 1

    if (typeof onProgress === 'function') {
      await onProgress({
        segmentIndex,
        total: items.length,
        worldGraph,
      })
    }

    const currentGraphSummary = summarizeWorldGraphSnapshotForLog(worldGraph)
    robotGenerationLog('[robot-generation:world-graph:segment:started]', {
      segmentIndex: segmentIndex + 1,
      segmentTotal: items.length,
      sourceSegmentIndex: Number(item?.index ?? segmentIndex) || 0,
      segmentSummaryLength: segmentSummary.length,
      currentGraph: currentGraphSummary,
    })

    let attempt = 0
    let segmentResolved = false
    let lastError = null
    while (attempt < DEFAULT_WORLD_GRAPH_SEGMENT_ATTEMPTS && !segmentResolved) {
      attempt += 1
      try {
        const response = await requestAgent('/runs/robot-world-graph-evolution', {
          model_config: buildAgentModelPayload(modelConfig, 0.7),
          source_name: sourceName,
          guidance,
          core: {
            name: String(core?.name || '').trim(),
            description: String(core?.description || '').trim(),
          },
          segment_summary: segmentSummary,
          segment_index: Number(item?.index ?? segmentIndex) || 0,
          segment_total: items.length,
          current_world_graph: worldGraph,
        }, '世界图谱演化')

        const patchSummary = summarizeWorldGraphPatchForLog(response?.worldGraphPatch || response?.world_graph_patch || {})
        robotGenerationLog('[robot-generation:world-graph:segment:response]', {
          segmentIndex: segmentIndex + 1,
          segmentTotal: items.length,
          attempt,
          usage: response?.usage || null,
          patch: patchSummary,
        })
        if (patchSummary.isEmptyStructuralPatch) {
          emptyPatchSegmentCount += 1
          robotGenerationLog('[robot-generation:world-graph:segment:empty-patch]', {
            segmentIndex: segmentIndex + 1,
            segmentTotal: items.length,
            attempt,
            sourceSegmentIndex: Number(item?.index ?? segmentIndex) || 0,
            segmentSummaryLength: segmentSummary.length,
            currentGraph: currentGraphSummary,
            patch: patchSummary,
          }, 'warn')
        } else {
          nonEmptyPatchSegmentCount += 1
        }

        worldGraph = applyRobotGenerationWorldGraphPatch(
          worldGraph,
          response?.worldGraphPatch || response?.world_graph_patch || {},
          { robotId, robotName },
        )
        robotGenerationLog('[robot-generation:world-graph:segment:applied]', {
          segmentIndex: segmentIndex + 1,
          segmentTotal: items.length,
          attempt,
          nextGraph: summarizeWorldGraphSnapshotForLog(worldGraph),
        })
        usage = mergeUsage(usage, response?.usage || null)
        if (typeof checkForCancellation === 'function') {
          await checkForCancellation()
        }
        segmentResolved = true
      } catch (error) {
        if (error instanceof RobotGenerationCanceledError) {
          throw error
        }
        lastError = error
        if (attempt < DEFAULT_WORLD_GRAPH_SEGMENT_ATTEMPTS) {
          robotGenerationLog('[robot-generation:world-graph:segment:retrying]', {
            segmentIndex: segmentIndex + 1,
            segmentTotal: items.length,
            attempt,
            nextAttempt: attempt + 1,
            sourceSegmentIndex: Number(item?.index ?? segmentIndex) || 0,
            segmentSummaryLength: segmentSummary.length,
            currentGraph: currentGraphSummary,
            message: error instanceof Error ? error.message : '未知错误',
          }, 'warn')
          continue
        }
      }
    }

    if (!segmentResolved) {
      failedSegmentCount += 1
      robotGenerationLog('[robot-generation:world-graph:segment:failed]', {
        segmentIndex: segmentIndex + 1,
        segmentTotal: items.length,
        attempts: attempt,
        sourceSegmentIndex: Number(item?.index ?? segmentIndex) || 0,
        segmentSummaryLength: segmentSummary.length,
        currentGraph: currentGraphSummary,
        message: lastError instanceof Error ? lastError.message : '未知错误',
      }, 'error')
      warnings.push(`文档片段 ${segmentIndex + 1}/${items.length} 图谱演化失败（已重试 ${Math.max(0, attempt - 1)} 次）：${lastError instanceof Error ? lastError.message : '未知错误'}`)
    }
  }

  robotGenerationLog('[robot-generation:world-graph:finished]', {
    segmentCount: items.length,
    processedSegmentCount,
    failedSegmentCount,
    nonEmptyPatchSegmentCount,
    emptyPatchSegmentCount,
    warningCount: warnings.length,
    usage,
    finalGraph: summarizeWorldGraphSnapshotForLog(worldGraph),
  })

  if (
    processedSegmentCount > 0
    && nonEmptyPatchSegmentCount === 0
    && summarizeWorldGraphSnapshotForLog(worldGraph).relationTypeCount === 0
    && summarizeWorldGraphSnapshotForLog(worldGraph).nodeCount === 0
    && summarizeWorldGraphSnapshotForLog(worldGraph).edgeCount === 0
    && summarizeWorldGraphSnapshotForLog(worldGraph).eventCount === 0
  ) {
    throw new Error('世界图谱生成失败：所有文档片段都未产出有效 patch')
  }

  return {
    worldGraph,
    usage,
    warnings,
    stats: {
      processedSegmentCount,
      failedSegmentCount,
      nonEmptyPatchSegmentCount,
      emptyPatchSegmentCount,
    },
  }
}

async function processRobotGenerationTask(job) {
  const {
    user,
    taskId,
    tempFilePath,
    sourceName,
    sourceSize,
    guidance,
    modelConfigId,
    embeddingModelConfigId,
    extractionDetail: rawExtractionDetail,
  } = job
  const extractionDetail = normalizeExtractionDetail(rawExtractionDetail)
  const checkForCancellation = async () => throwIfRobotGenerationCanceled(user, taskId)
  await checkForCancellation()
  const modelConfig = await resolveRequiredModelConfig(
    user,
    modelConfigId,
    '请选择文档生成模型',
    '文档生成模型不存在或不可用',
  )
  const robotId = buildRobotId()
  const documentId = buildDocumentId()

  await setTaskProgress(user, taskId, {
    status: 'processing',
    stage: 'parsing',
    progress: 5,
    message: '正在解析导入文档',
    startedAt: new Date().toISOString(),
    modelConfigId: modelConfig.id,
    embeddingModelConfigId: String(embeddingModelConfigId || '').trim(),
    robotId,
    documentId,
  })
  await checkForCancellation()

  const { sourceType, text } = await extractDocumentText(tempFilePath, sourceName)
  await checkForCancellation()
  if (!text) {
    throw new Error('文档解析完成，但没有提取到可用文本')
  }

  const segments = buildAnalysisSegments(text, {
    targetSegmentChars: extractionDetail.targetSegmentChars,
  })
  if (!segments.length) {
    throw new Error('文档内容过短，无法生成智能体')
  }

  await setTaskProgress(user, taskId, {
    stage: 'segmenting',
    progress: 18,
    message: '正在整理文档片段',
    sourceType,
    sourceSize,
    guidance,
    stats: {
      characterCount: text.length,
      analysisSegmentCount: segments.length,
      extractionDetail,
    },
  })
  await checkForCancellation()

  const summaries = await summarizeAnalysisSegments(
    user,
    taskId,
    modelConfig,
    sourceName,
    guidance,
    segments,
    checkForCancellation,
  )
  const reducedSummary = await reduceSummaries(
    modelConfig,
    sourceName,
    guidance,
    summaries,
    checkForCancellation,
  )
  await checkForCancellation()

  await setTaskProgress(user, taskId, {
    stage: 'generating',
    progress: 56,
    message: '正在生成智能体设定与记忆结构',
    stats: {
      characterCount: text.length,
      analysisSegmentCount: segments.length,
      summarySegmentCount: summaries.length,
      extractionDetail,
    },
  })
  await checkForCancellation()

  const generated = await requestAgentJson('/runs/robot-generation', {
    model_config: buildAgentModelPayload(modelConfig, 0.7),
    source_name: sourceName,
    guidance,
    document_summary: reducedSummary,
    segment_summaries: summaries.map((item) => item.summary),
  }, '智能体生成')
  await checkForCancellation()

  const robot = buildGeneratedRobotPayload(generated, robotId)
  await setTaskProgress(user, taskId, {
    stage: 'graphing',
    progress: 60,
    message: '正在抽取 GraphRAG 图谱',
  })
  await checkForCancellation()

  let graphRagGraph = createEmptyGraphRagGraphPayload({
    summary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
  })
  let worldGraphUsage = { prompt_tokens: 0, completion_tokens: 0 }
  const graphWarnings = []
  const graphRagSegmentArtifactIds = []

  for (const [segmentOffset, segment] of summaries.entries()) {
    await setTaskProgress(user, taskId, {
      stage: 'graphing',
      progress: normalizeProgress(60 + ((segmentOffset + 1) / Math.max(summaries.length, 1)) * 14, 74),
      message: `正在抽取 GraphRAG 图谱 ${segmentOffset + 1}/${summaries.length}`,
      stats: {
        graphSegmentCount: segmentOffset + 1,
        summarySegmentCount: summaries.length,
        extractionDetail,
      },
    })
    await checkForCancellation()

    let lastError = null
    let segmentResolved = false
    for (let attempt = 1; attempt <= DEFAULT_WORLD_GRAPH_SEGMENT_ATTEMPTS; attempt += 1) {
      try {
        const currentWorldGraph = hasGraphRagContent(graphRagGraph)
          ? mapGraphRagGraphToWorldGraphSnapshot(graphRagGraph, {
            robotId,
            robotName: robot.name,
            documentSummary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
          })
          : createEmptyWorldGraphSnapshot(robotId, robot.name)
        const graphRagResponse = await requestAgentJson('/runs/graphrag-extract', {
          model_config: buildAgentModelPayload(modelConfig, 0.4),
          source_name: sourceName,
          guidance,
          core: {
            name: robot.name,
            description: robot.description,
          },
          document_summary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
          segment_summary: segment.summary,
          segment_index: segmentOffset,
          segment_total: summaries.length,
          current_world_graph: currentWorldGraph,
          extraction_detail: extractionDetail,
        }, 'GraphRAG 抽取')
        await checkForCancellation()

        const segmentGraph = ensureGraphRagSegmentChunk(
          supplementGraphRagGraphPayload(
            graphRagResponse?.graphrag_graph || graphRagResponse?.graphRagGraph || {},
          ),
          segment,
          sourceName,
          documentId,
        )
        graphRagGraph = mergeGraphRagGraphPayload(graphRagGraph, segmentGraph, {
          defaultSummary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
        })
        worldGraphUsage = mergeUsage(worldGraphUsage, graphRagResponse?.usage || null)

        const segmentArtifact = await persistGraphRagArtifact(user, {
          id: buildGraphRagArtifactId('extract'),
          robotId,
          documentId,
          kind: 'extract',
          summary: normalizeString(segmentGraph?.meta?.summary || segment.summary),
          payload: segmentGraph,
          meta: {
            phase: 'extract-segment',
            sourceName,
            sourceType,
            modelConfigId: modelConfig.id,
            segmentIndex: segment.index,
            segmentOffset,
            segmentTotal: summaries.length,
            extractionDetail,
            graph: summarizeGraphRagPayloadForLog(segmentGraph),
          },
        })
        if (segmentArtifact?.id) {
          graphRagSegmentArtifactIds.push(segmentArtifact.id)
        }

        robotGenerationLog('[robot-generation:graphrag:extract:segment]', {
          robotId,
          documentId,
          sourceName,
          segmentIndex: segment.index,
          segmentOffset: segmentOffset + 1,
          segmentTotal: summaries.length,
          attempt,
          usage: graphRagResponse?.usage || null,
          graph: summarizeGraphRagPayloadForLog(segmentGraph),
          mergedGraph: summarizeGraphRagPayloadForLog(graphRagGraph),
        })
        segmentResolved = true
        break
      } catch (error) {
        lastError = error
        if (attempt >= DEFAULT_WORLD_GRAPH_SEGMENT_ATTEMPTS) {
          graphWarnings.push(`文档片段 ${segmentOffset + 1}/${summaries.length} GraphRAG 抽取失败（已重试 ${Math.max(0, attempt - 1)} 次）：${error instanceof Error ? error.message : '未知错误'}`)
        }
      }
    }

    if (!segmentResolved && lastError instanceof RobotGenerationCanceledError) {
      throw lastError
    }
  }

  const worldGraph = mapGraphRagGraphToWorldGraphSnapshot(graphRagGraph, {
    robotId,
    robotName: robot.name,
    documentSummary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
  })
  const graphRagArtifactSeedId = buildGraphRagArtifactId('extract')

  const graphRagArtifact = await persistGraphRagArtifact(user, {
    id: graphRagArtifactSeedId,
    robotId,
    documentId,
    kind: 'extract',
    summary: normalizeString(graphRagGraph?.meta?.summary || graphRagGraph?.meta?.description, compactText(generated?.retrievalSummary || generated?.retrieval_summary || reducedSummary)),
    payload: graphRagGraph,
    meta: {
      sourceName,
      sourceType,
      modelConfigId: modelConfig.id,
      summarySegmentCount: summaries.length,
      extractionDetail,
      segmentArtifactIds: graphRagSegmentArtifactIds,
      warningCount: graphWarnings.length,
      phase: 'extract-merged',
      graph: summarizeGraphRagPayloadForLog(graphRagGraph),
    },
  })
  const graphRagArtifactId = graphRagArtifact?.id || ''
  await checkForCancellation()
  await setTaskProgress(user, taskId, {
    stage: 'graphing',
    progress: 74,
    message: 'GraphRAG 图谱抽取完成',
    result: {
      graphWarnings,
      worldGraphUsage,
      graphRagArtifactId,
      graphRagSegmentArtifactIds,
    },
  })
  await checkForCancellation()
  await saveGeneratedRobot(user, robot, worldGraph)
  await checkForCancellation()
  const embeddingBaseConfig = await resolveRequiredModelConfig(
    user,
    embeddingModelConfigId,
    '请选择向量 Embedding 模型',
    '向量 Embedding 模型不存在或不可用',
  )
  const embeddingConfig = resolveEmbeddingConfig(embeddingBaseConfig)
  await checkForCancellation()

  await createRobotKnowledgeDocument(user, {
    id: documentId,
    robotId,
    status: 'processing',
    sourceName,
    sourceType,
    sourceSize,
    guidance,
    summary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
    retrievalSummary: compactText(generated?.retrievalSummary || generated?.retrieval_summary || reducedSummary),
    chunkCount: summaries.length,
    characterCount: text.length,
    embeddingModelConfigId: embeddingBaseConfig.id,
    embeddingModel: embeddingConfig.model,
    meta: {
      generatedAt: new Date().toISOString(),
      segmentCharacterCounts: summaries.map((item) => item.characterCount),
      graphWarnings,
      graphRagArtifactId,
      graphRagSegmentArtifactIds,
      extractionDetail,
    },
  })
  job.documentId = documentId

  await setTaskProgress(user, taskId, {
    stage: 'indexing',
    progress: 78,
    message: '正在写入向量知识库',
    result: {
      robotId,
      robotName: robot.name,
      description: robot.description,
      documentId,
    },
  })
  await checkForCancellation()

  let knowledgeWarning = ''

  try {
    await checkForCancellation()
    const collectionName = await indexKnowledgeSummaries(user, {
      id: documentId,
      robotId,
      sourceName,
      sourceType,
    }, summaries, embeddingConfig)
    await checkForCancellation()

    await updateRobotKnowledgeDocument(user, documentId, {
      status: 'ready',
      qdrantCollection: collectionName,
      embeddingModelConfigId: embeddingBaseConfig.id,
      embeddingModel: embeddingConfig.model,
      summary: compactText(generated?.documentSummary || generated?.document_summary || reducedSummary),
      retrievalSummary: compactText(generated?.retrievalSummary || generated?.retrieval_summary || reducedSummary),
      meta: {
        knowledgeIndexed: true,
        worldGraphVersion: worldGraph?.meta?.graphVersion || 1,
        graphWarnings,
        graphRagArtifactId,
        graphRagSegmentArtifactIds,
        extractionDetail,
      },
    })
  } catch (error) {
    if (error instanceof RobotGenerationCanceledError) {
      throw error
    }
    knowledgeWarning = error instanceof Error ? error.message : '知识库索引失败'
    await updateRobotKnowledgeDocument(user, documentId, {
      status: 'failed',
      meta: {
        knowledgeIndexed: false,
        error: knowledgeWarning,
        graphWarnings,
        graphRagArtifactId,
        graphRagSegmentArtifactIds,
        extractionDetail,
      },
    })
  }

  const completedAt = new Date().toISOString()
  clearRobotGenerationCancellation(user, taskId)
  await setTaskProgress(user, taskId, {
    status: 'completed',
    stage: 'completed',
    progress: 100,
    message: knowledgeWarning
      ? `智能体已生成，知识库索引失败：${knowledgeWarning}`
      : graphWarnings.length
        ? '智能体生成完成，世界图谱部分切片未生效'
        : '智能体生成完成',
    completedAt,
      result: {
        robotId,
        robotName: robot.name,
        description: robot.description,
        documentId,
        graphRagArtifactId,
        embeddingModelConfigId: embeddingBaseConfig.id,
        knowledgeWarning,
        graphWarnings,
        worldGraphUsage,
        graphRagSegmentArtifactIds,
        extractionDetail,
      },
    })
}

function pumpQueue() {
  while (runningCount < DEFAULT_MAX_CONCURRENCY && pendingJobs.length) {
    const job = pendingJobs.shift()
    if (!job) {
      return
    }
    runningCount += 1
    Promise.resolve()
      .then(() => processRobotGenerationTask(job))
      .catch(async (error) => {
        if (error instanceof RobotGenerationCanceledError) {
          if (job.documentId) {
            await updateRobotKnowledgeDocument(job.user, job.documentId, {
              status: 'failed',
              meta: {
                canceled: true,
                error: error.message,
              },
            }).catch(() => {})
          }
          await markRobotGenerationTaskCanceled(job.user, job.taskId, error.message)
          return
        }
        clearRobotGenerationCancellation(job.user, job.taskId)
        await updateRobotGenerationTask(job.user, job.taskId, {
          status: 'failed',
          stage: 'failed',
          progress: 100,
          message: error instanceof Error ? error.message : '智能体生成失败',
          error: error instanceof Error ? error.message : '智能体生成失败',
          completedAt: new Date().toISOString(),
        })
      })
      .finally(async () => {
        try {
          if (job.tempFilePath) {
            await unlink(job.tempFilePath)
          }
        } catch {
          // ignore cleanup errors
        }
        clearRobotGenerationCancellation(job.user, job.taskId)
        runningCount = Math.max(0, runningCount - 1)
        pumpQueue()
      })
  }
}

export async function initializeRobotGenerationService() {
  await initializeRobotGenerationStore()
  await mkdir(TEMP_DIR, { recursive: true })
}

export function getRobotImportTempDir() {
  return TEMP_DIR
}

export async function createRobotGenerationImportTask(user, input) {
  const modelConfigId = String(input.modelConfigId || '').trim()
  const embeddingModelConfigId = String(input.embeddingModelConfigId || '').trim()
  const extractionDetail = normalizeExtractionDetail(input.extractionDetail)
  if (!modelConfigId) {
    throw new Error('请选择文档生成模型')
  }
  if (!embeddingModelConfigId) {
    throw new Error('请选择向量 Embedding 模型')
  }

  const task = await createRobotGenerationTask(user, {
    id: buildTaskId(),
    status: 'pending',
    stage: 'queued',
    progress: 0,
    message: '任务已进入队列',
    sourceName: input.sourceName,
    sourceType: input.sourceType,
    sourceSize: input.sourceSize,
    guidance: normalizeGuidance(input.guidance),
    modelConfigId,
    embeddingModelConfigId,
    stats: {
      extractionDetail,
    },
    result: {},
  })

  pendingJobs.push({
    user,
    taskId: task.id,
    tempFilePath: input.tempFilePath,
    sourceName: input.sourceName,
    sourceSize: input.sourceSize,
    guidance: normalizeGuidance(input.guidance),
    modelConfigId,
    embeddingModelConfigId,
    extractionDetail,
  })
  pumpQueue()
  return task
}

export async function readRobotGenerationTask(user, taskId) {
  const task = await getRobotGenerationTask(user, taskId)
  if (!task) {
    return null
  }
  return task
}

export async function cancelRobotGenerationImportTask(user, taskId) {
  const task = await getRobotGenerationTask(user, taskId)
  if (!task) {
    return null
  }

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
    return task
  }

  const taskKey = buildUserTaskKey(user, taskId)
  cancelRequestedTaskKeys.add(taskKey)
  const pendingIndex = pendingJobs.findIndex((job) => buildUserTaskKey(job.user, job.taskId) === taskKey)
  if (pendingIndex >= 0) {
    const [pendingJob] = pendingJobs.splice(pendingIndex, 1)
    try {
      if (pendingJob?.tempFilePath) {
        await unlink(pendingJob.tempFilePath)
      }
    } catch {
      // ignore cleanup errors
    }
    const canceledTask = await markRobotGenerationTaskCanceled(user, taskId)
    pumpQueue()
    return canceledTask
  }

  if (task.status === 'canceling') {
    return task
  }

  return updateRobotGenerationTask(user, taskId, {
    status: 'canceling',
    stage: 'canceling',
    message: '正在取消生成任务',
  })
}

export function __resetRobotGenerationRuntimeForTests() {
  runningCount = 0
  pendingJobs.length = 0
  cancelRequestedTaskKeys.clear()
}

export function __pushPendingRobotGenerationJobForTests(job) {
  pendingJobs.push(job)
}

export async function retrieveRobotKnowledgeByGraphRag(user, options) {
  const robotId = String(options?.robotId || '').trim()
  if (!robotId) {
    return {
      summary: '',
      communities: [],
      entities: [],
      events: [],
      chunks: [],
      usage: null,
    }
  }

  const documents = (await listRobotKnowledgeDocuments(user, robotId)).filter((item) => item.status === 'ready')
  if (!documents.length) {
    return {
      summary: '',
      communities: [],
      entities: [],
      events: [],
      chunks: [],
      usage: null,
    }
  }

  let artifacts = []
  try {
    artifacts = await listGraphRagArtifacts(user, { robotId, kind: 'extract' })
  } catch (error) {
    robotGenerationLog('[graphrag:retrieve:list-artifacts-failed]', {
      robotId,
      message: error instanceof Error ? error.message : 'GraphRAG artifact 查询失败',
    }, 'warn')
    return {
      summary: '',
      communities: [],
      entities: [],
      events: [],
      chunks: [],
      usage: null,
    }
  }

  const latestArtifactByDocumentId = new Map()
  for (const item of artifacts) {
    if (!item?.documentId || latestArtifactByDocumentId.has(item.documentId)) {
      continue
    }
    latestArtifactByDocumentId.set(item.documentId, item)
  }

  const graphRagDocuments = documents
    .map((document) => {
      const artifact = latestArtifactByDocumentId.get(document.id)
      const graph = artifact?.payload && typeof artifact.payload === 'object' ? artifact.payload : {}
      if (!hasGraphRagContent(graph)) {
        return null
      }
      return {
        document_id: document.id,
        source_name: document.sourceName,
        summary: document.summary,
        retrieval_summary: document.retrievalSummary,
        graphrag_graph: graph,
      }
    })
    .filter(Boolean)

  if (!graphRagDocuments.length) {
    return {
      summary: '',
      communities: [],
      entities: [],
      events: [],
      chunks: [],
      usage: null,
    }
  }

  const modelConfig = await resolvePreferredModelConfig(
    user,
    options?.knowledgeRetrievalModelConfigId,
    options?.modelConfigId,
  )
  const response = await requestAgentJson('/runs/graphrag-retrieve', {
    model_config: buildAgentModelPayload(modelConfig, 0.2),
    robot_name: String(options?.robotName || ''),
    robot_description: String(options?.robotDescription || ''),
    story_outline: String(options?.storyOutline || ''),
    prompt: String(options?.prompt || ''),
    history: Array.isArray(options?.history) ? options.history : [],
    graphrag_documents: graphRagDocuments,
  }, 'GraphRAG 召回')

  const retrieval = response?.graphrag_retrieval || response?.graphRagRetrieval || {}
  const result = {
    summary: normalizeString(retrieval?.summary),
    communities: Array.isArray(retrieval?.communities) ? retrieval.communities : [],
    entities: Array.isArray(retrieval?.entities) ? retrieval.entities : [],
    events: Array.isArray(retrieval?.events) ? retrieval.events : [],
    chunks: Array.isArray(retrieval?.chunks) ? retrieval.chunks : [],
    usage: response?.usage || null,
  }

  await persistGraphRagArtifact(user, {
    id: buildGraphRagArtifactId('retrieve'),
    robotId,
    sessionId: String(options?.sessionId || ''),
    kind: 'retrieve',
    summary: result.summary,
    payload: result,
    meta: {
      sourceDocumentCount: graphRagDocuments.length,
      sourceDocumentIds: graphRagDocuments.map((item) => item.document_id),
      promptLength: String(options?.prompt || '').trim().length,
      historyLength: Array.isArray(options?.history) ? options.history.length : 0,
    },
  })

  return result
}

export async function retrieveRobotKnowledgeBySummary(user, options) {
  const robotId = String(options?.robotId || '').trim()
  if (!robotId) {
    return { summary: '', items: [], usage: null }
  }

  const documents = (await listRobotKnowledgeDocuments(user, robotId)).filter(
    (item) => item.status === 'ready' && item.qdrantCollection && item.embeddingModel,
  )
  if (!documents.length) {
    return { summary: '', items: [], usage: null }
  }

  const modelConfig = await resolvePreferredModelConfig(
    user,
    options?.knowledgeRetrievalModelConfigId,
    options?.modelConfigId,
  )
  const retrievalSummaryResponse = await requestAgentJson('/runs/retrieval-summary', {
    model_config: {
      provider: modelConfig.provider,
      base_url: modelConfig.baseUrl,
      api_key: modelConfig.apiKey,
      model: modelConfig.model,
      temperature: typeof modelConfig.temperature === 'number' ? modelConfig.temperature : 0.2,
    },
    robot_name: String(options?.robotName || ''),
    robot_description: String(options?.robotDescription || ''),
    story_outline: String(options?.storyOutline || ''),
    prompt: String(options?.prompt || ''),
    history: Array.isArray(options?.history) ? options.history : [],
  }, '检索摘要生成')

  const retrievalSummary = compactText(retrievalSummaryResponse?.summary || '')
  if (!retrievalSummary) {
    return { summary: '', items: [], usage: retrievalSummaryResponse?.usage || null }
  }

  const groupedDocuments = documents.reduce((map, item) => {
    const key = [
      item.qdrantCollection,
      item.embeddingModelConfigId,
      item.embeddingModel,
    ].join('|')
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key).push(item)
    return map
  }, new Map())

  const allResults = []
  for (const [, group] of groupedDocuments.entries()) {
    const baseConfig = await resolveTaskModelConfig(user, group[0]?.embeddingModelConfigId || options?.modelConfigId)
    const embeddingConfig = resolveEmbeddingConfig({
      ...baseConfig,
      model: group[0]?.embeddingModel || baseConfig.model,
    })
    const [vector] = await createEmbeddings(embeddingConfig, [retrievalSummary])
    if (!Array.isArray(vector) || !vector.length) {
      continue
    }
    const documentIds = group.map((item) => item.id)
    const results = await searchKnowledgeVectors(
      group[0].qdrantCollection,
      vector,
      {
        must: [
          { key: 'userId', match: { value: user.id } },
          { key: 'robotId', match: { value: robotId } },
          { key: 'documentId', match: { any: documentIds } },
        ],
      },
      Number(process.env.ROBOT_KNOWLEDGE_TOP_K || 6),
    )
    allResults.push(...results)
  }

  const items = allResults
    .sort((left, right) => Number(right?.score || 0) - Number(left?.score || 0))
    .slice(0, Number(process.env.ROBOT_KNOWLEDGE_TOP_K || 6))
    .map((item) => ({
      score: Number(item?.score || 0),
      summary: String(item?.payload?.summary || ''),
      excerpt: String(item?.payload?.excerpt || ''),
      sourceName: String(item?.payload?.sourceName || ''),
      documentId: String(item?.payload?.documentId || ''),
    }))

  return {
    summary: retrievalSummary,
    items,
    usage: retrievalSummaryResponse?.usage || null,
  }
}
