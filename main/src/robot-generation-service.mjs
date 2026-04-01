import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { extractDocumentText } from './document-import-service.mjs'
import {
  createRobotGenerationTask,
  createRobotKnowledgeDocument,
  getRobotGenerationTask,
  initializeRobotGenerationStore,
  listRobotKnowledgeDocuments,
  updateRobotGenerationTask,
  updateRobotKnowledgeDocument,
} from './robot-generation-store.mjs'
import { readModelConfigs, readRobots, writeRobots } from './storage.mjs'
import { normalizeMemorySchema, normalizeRobots } from './storage-shared.mjs'
import { createEmbeddings, resolveKnowledgeCollectionName, searchKnowledgeVectors, upsertKnowledgeVectors } from './vector-knowledge-service.mjs'
import { createEmptyWorldGraphSnapshot, normalizeWorldGraphSnapshot, replaceWorldGraph } from './world-graph-service.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMP_DIR = join(__dirname, '..', 'data', 'robot-imports')
const DEFAULT_AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://127.0.0.1:8000'
const DEFAULT_MAX_CONCURRENCY = Math.max(1, Number(process.env.ROBOT_GENERATION_CONCURRENCY || 1) || 1)

let runningCount = 0
const pendingJobs = []

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

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => normalizeString(item)).filter(Boolean))]
}

function normalizeRobotGenerationRelationType(input = {}) {
  return {
    id: normalizeString(input.id),
    code: normalizeString(input.code || input.id),
    label: normalizeString(input.label || input.name || input.id),
    description: normalizeString(input.description),
    directionality: String(input.directionality || '').trim() === 'undirected' ? 'undirected' : 'directed',
  }
}

function normalizeRobotGenerationNode(input = {}) {
  return {
    id: normalizeString(input.id),
    name: normalizeString(input.name || input.id),
    objectType: normalizeString(input.objectType || input.object_type || input.type, 'character'),
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

export function normalizeRobotGenerationWorldGraphPatch(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const metaSource = source.meta && typeof source.meta === 'object' && !Array.isArray(source.meta) ? source.meta : {}
  return {
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
    deleteEdgeIds: uniqueStrings(source.deleteEdgeIds || source.delete_edge_ids),
  }
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

  if (!changed) {
    return snapshot
  }

  return normalizeWorldGraphSnapshot({
    ...snapshot,
    meta: {
      ...snapshot.meta,
      title: nextTitle,
      summary: nextSummary,
      graphVersion: Math.max(0, Number(snapshot.meta.graphVersion || 0) || 0) + 1,
    },
    relationTypes,
    nodes,
    edges,
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

function buildAnalysisSegments(text) {
  const normalized = compactText(text)
  if (!normalized) {
    return []
  }

  const approxTargetRawChars = Math.max(60000, Number(process.env.ROBOT_IMPORT_TARGET_SEGMENT_CHARS || 180000) || 180000)
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

async function summarizeAnalysisSegments(user, taskId, modelConfig, sourceName, guidance, segments) {
  const summaries = []
  for (const [segmentIndex, segment] of segments.entries()) {
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
  }

  return summaries
}

async function reduceSummaries(modelConfig, sourceName, guidance, summaries) {
  let current = summaries.map((item) => String(item?.summary || '').trim()).filter(Boolean)
  let round = 1
  while (current.length > 8) {
    const next = []
    for (let index = 0; index < current.length; index += 6) {
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
      id: `${document.id}:${summaries[index]?.index ?? index}`,
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
  } = options || {}

  let worldGraph = createEmptyWorldGraphSnapshot(robotId, robotName)
  let usage = { prompt_tokens: 0, completion_tokens: 0 }
  const warnings = []
  const items = Array.isArray(summaries) ? summaries : []

  for (const [segmentIndex, item] of items.entries()) {
    const segmentSummary = compactText(item?.summary || '')
    if (!segmentSummary) {
      continue
    }

    if (typeof onProgress === 'function') {
      await onProgress({
        segmentIndex,
        total: items.length,
        worldGraph,
      })
    }

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

      worldGraph = applyRobotGenerationWorldGraphPatch(
        worldGraph,
        response?.worldGraphPatch || response?.world_graph_patch || {},
        { robotId, robotName },
      )
      usage = mergeUsage(usage, response?.usage || null)
    } catch (error) {
      warnings.push(`文档片段 ${segmentIndex + 1}/${items.length} 图谱演化失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  return {
    worldGraph,
    usage,
    warnings,
  }
}

async function processRobotGenerationTask(job) {
  const { user, taskId, tempFilePath, sourceName, sourceSize, guidance, modelConfigId, embeddingModelConfigId } = job
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

  const { sourceType, text } = await extractDocumentText(tempFilePath, sourceName)
  if (!text) {
    throw new Error('文档解析完成，但没有提取到可用文本')
  }

  const segments = buildAnalysisSegments(text)
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
    },
  })

  const summaries = await summarizeAnalysisSegments(user, taskId, modelConfig, sourceName, guidance, segments)
  const reducedSummary = await reduceSummaries(modelConfig, sourceName, guidance, summaries)

  await setTaskProgress(user, taskId, {
    stage: 'generating',
    progress: 56,
    message: '正在生成智能体设定与记忆结构',
    stats: {
      characterCount: text.length,
      analysisSegmentCount: segments.length,
      summarySegmentCount: summaries.length,
    },
  })

  const generated = await requestAgentJson('/runs/robot-generation', {
    model_config: buildAgentModelPayload(modelConfig, 0.7),
    source_name: sourceName,
    guidance,
    document_summary: reducedSummary,
    segment_summaries: summaries.map((item) => item.summary),
  }, '智能体生成')

  const robot = buildGeneratedRobotPayload(generated, robotId)
  const { worldGraph, usage: worldGraphUsage, warnings: graphWarnings } = await evolveWorldGraphFromSummaries({
    modelConfig,
    sourceName,
    guidance,
    summaries,
    core: {
      name: robot.name,
      description: robot.description,
    },
    robotId,
    robotName: robot.name,
    onProgress: async ({ segmentIndex, total }) => {
      await setTaskProgress(user, taskId, {
        stage: 'graphing',
        progress: normalizeProgress(60 + ((segmentIndex + 1) / Math.max(total, 1)) * 14, 60),
        message: `正在演化世界图谱 ${segmentIndex + 1}/${total}`,
        stats: {
          graphSegmentCount: segmentIndex + 1,
        },
      })
    },
  })
  await setTaskProgress(user, taskId, {
    stage: 'graphing',
    progress: 74,
    message: graphWarnings.length ? '世界图谱演化完成，部分切片失败' : '世界图谱演化完成',
    result: {
      graphWarnings,
      worldGraphUsage,
    },
  })
  await saveGeneratedRobot(user, robot, worldGraph)
  const embeddingBaseConfig = await resolveRequiredModelConfig(
    user,
    embeddingModelConfigId,
    '请选择向量 Embedding 模型',
    '向量 Embedding 模型不存在或不可用',
  )
  const embeddingConfig = resolveEmbeddingConfig(embeddingBaseConfig)

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
    },
  })

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

  let knowledgeWarning = ''

  try {
    const collectionName = await indexKnowledgeSummaries(user, {
      id: documentId,
      robotId,
      sourceName,
      sourceType,
    }, summaries, embeddingConfig)

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
      },
    })
  } catch (error) {
    knowledgeWarning = error instanceof Error ? error.message : '知识库索引失败'
    await updateRobotKnowledgeDocument(user, documentId, {
      status: 'failed',
      meta: {
        knowledgeIndexed: false,
        error: knowledgeWarning,
        graphWarnings,
      },
    })
  }

  const completedAt = new Date().toISOString()
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
        embeddingModelConfigId: embeddingBaseConfig.id,
        knowledgeWarning,
        graphWarnings,
        worldGraphUsage,
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
    stats: {},
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
