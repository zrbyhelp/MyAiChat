import { randomUUID } from 'node:crypto'

import { getModels } from './sequelize.mjs'
import { mapNeo4jRows, runNeo4jQuery } from './neo4j-http.mjs'
import {
  BUILTIN_WORLD_RELATION_TYPES,
  DEFAULT_WORLD_CALENDAR,
  DEFAULT_WORLD_LAYOUT,
  WORLD_OBJECT_TYPES,
} from './world-graph-defaults.mjs'

function resolveUserId(user) {
  const userId = String(user?.id || '').trim()
  if (!userId) {
    throw new Error('未授权访问')
  }
  return userId
}

function scopeId(user, id) {
  return `${resolveUserId(user)}:${String(id || '').trim()}`
}

function safeJsonParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback
  } catch {
    return fallback
  }
}

function nowIso() {
  return new Date().toISOString()
}

function normalizeFiniteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeString(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

function normalizeStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function normalizeObjectType(value, fallback = 'character') {
  const objectType = String(value || '').trim().toLowerCase()
  return WORLD_OBJECT_TYPES.includes(objectType) ? objectType : fallback
}

function normalizeDirectionality(value) {
  return String(value || '').trim() === 'undirected' ? 'undirected' : 'directed'
}

function normalizeAttributes(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const entries = Object.entries(source)
    .map(([key, item]) => {
      const normalizedKey = String(key || '').trim()
      if (!normalizedKey) {
        return null
      }
      if (
        item === null ||
        typeof item === 'string' ||
        typeof item === 'number' ||
        typeof item === 'boolean'
      ) {
        return [normalizedKey, item]
      }
      return [normalizedKey, String(item ?? '')]
    })
    .filter(Boolean)

  return Object.fromEntries(entries)
}

function normalizeNodeStatus(attributes, inputStatus, fallbackStatus) {
  if (Object.prototype.hasOwnProperty.call(attributes, 'currentStatus')) {
    const currentStatus = normalizeString(attributes.currentStatus)
    if (currentStatus) {
      attributes.currentStatus = currentStatus
    } else {
      delete attributes.currentStatus
    }
    return currentStatus
  }

  const status = normalizeString(inputStatus, normalizeString(fallbackStatus))
  if (status) {
    attributes.currentStatus = status
  }
  return status
}

function normalizeTimeline(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    sequenceIndex: Math.max(0, Math.round(normalizeFiniteNumber(source.sequenceIndex, 0))),
    calendarId: normalizeString(source.calendarId, DEFAULT_WORLD_CALENDAR.calendarId),
    yearLabel: normalizeString(source.yearLabel),
    monthLabel: normalizeString(source.monthLabel),
    dayLabel: normalizeString(source.dayLabel),
    timeOfDayLabel: normalizeString(source.timeOfDayLabel),
    phase: normalizeString(source.phase),
    impactLevel: Math.max(0, Math.min(100, Math.round(normalizeFiniteNumber(source.impactLevel, 0)))),
    eventType: normalizeString(source.eventType),
  }
}

function normalizeTimelineEffectNodeAttributeChange(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    fieldKey: normalizeString(source.fieldKey),
    beforeValue: normalizeString(source.beforeValue),
    afterValue: normalizeString(source.afterValue),
  }
}

function normalizeTimelineEffectRelationChange(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    fieldKey: normalizeString(source.fieldKey),
    beforeValue: normalizeString(source.beforeValue),
    afterValue: normalizeString(source.afterValue),
  }
}

function normalizeTimelineEffectRelationDraft(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    targetNodeId: normalizeString(source.targetNodeId),
    relationTypeCode: normalizeString(source.relationTypeCode),
    relationLabel: normalizeString(source.relationLabel),
    summary: normalizeString(source.summary),
    status: normalizeString(source.status),
    intensity:
      typeof source.intensity === 'number' && Number.isFinite(source.intensity)
        ? Math.max(0, Math.min(100, Math.round(source.intensity)))
        : null,
  }
}

function normalizeTimelineEffect(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const legacyTargetKind = String(source.targetKind || '').trim() === 'relation' ? 'relation' : 'node'
  const hasStructuredFields =
    Object.prototype.hasOwnProperty.call(source, 'changeTargetType') ||
    Object.prototype.hasOwnProperty.call(source, 'targetNodeId') ||
    Object.prototype.hasOwnProperty.call(source, 'nodeAttributeChanges') ||
    Object.prototype.hasOwnProperty.call(source, 'relationMode') ||
    Object.prototype.hasOwnProperty.call(source, 'relationId') ||
    Object.prototype.hasOwnProperty.call(source, 'relationDraft') ||
    Object.prototype.hasOwnProperty.call(source, 'relationChanges')

  if (!hasStructuredFields) {
    const legacyFieldKey = normalizeString(source.changeKind, legacyTargetKind === 'relation' ? 'summary' : 'currentStatus')
    return {
      id: normalizeString(source.id, `effect-${randomUUID()}`),
      summary: normalizeString(source.summary),
      targetNodeId: legacyTargetKind === 'node' ? normalizeString(source.targetId) : '',
      changeTargetType: legacyTargetKind === 'relation' ? 'relation' : 'node-content',
      nodeAttributeChanges:
        legacyTargetKind === 'node' && normalizeString(source.targetId)
          ? [normalizeTimelineEffectNodeAttributeChange({ fieldKey: legacyFieldKey, beforeValue: source.beforeValue, afterValue: source.afterValue })]
          : [],
      relationMode: 'existing',
      relationId: legacyTargetKind === 'relation' ? normalizeString(source.targetId) : '',
      relationChanges:
        legacyTargetKind === 'relation' && normalizeString(source.targetId)
          ? [normalizeTimelineEffectRelationChange({ fieldKey: legacyFieldKey, beforeValue: source.beforeValue, afterValue: source.afterValue })]
          : [],
      relationDraft: normalizeTimelineEffectRelationDraft(null),
      targetKind: legacyTargetKind,
      targetId: normalizeString(source.targetId),
      changeKind: normalizeString(source.changeKind),
      beforeValue: normalizeString(source.beforeValue),
      afterValue: normalizeString(source.afterValue),
    }
  }

  return {
    id: normalizeString(source.id, `effect-${randomUUID()}`),
    summary: normalizeString(source.summary),
    targetNodeId: normalizeString(source.targetNodeId),
    changeTargetType: normalizeString(source.changeTargetType) === 'relation' ? 'relation' : 'node-content',
    nodeAttributeChanges: (Array.isArray(source.nodeAttributeChanges) ? source.nodeAttributeChanges : [])
      .map(normalizeTimelineEffectNodeAttributeChange)
      .filter((item) => item.fieldKey),
    relationMode: normalizeString(source.relationMode) === 'create' ? 'create' : 'existing',
    relationId: normalizeString(source.relationId),
    relationChanges: (Array.isArray(source.relationChanges) ? source.relationChanges : [])
      .map(normalizeTimelineEffectRelationChange)
      .filter((item) => item.fieldKey),
    relationDraft: normalizeTimelineEffectRelationDraft(source.relationDraft),
    targetKind: legacyTargetKind,
    targetId: normalizeString(source.targetId),
    changeKind: normalizeString(source.changeKind),
    beforeValue: normalizeString(source.beforeValue),
    afterValue: normalizeString(source.afterValue),
  }
}

function normalizeNodeSnapshot(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    sequenceIndex: Math.max(0, Math.round(normalizeFiniteNumber(source.sequenceIndex, 0))),
    name: normalizeString(source.name),
    summary: normalizeString(source.summary),
    status: normalizeString(source.status),
    tags: normalizeStringArray(source.tags),
    attributes: normalizeAttributes(source.attributes),
  }
}

function normalizeNodeSnapshots(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeNodeSnapshot)
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
}

function normalizeEdgeSnapshot(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    sequenceIndex: Math.max(0, Math.round(normalizeFiniteNumber(source.sequenceIndex, 0))),
    relationTypeCode: normalizeString(source.relationTypeCode),
    relationLabel: normalizeString(source.relationLabel),
    summary: normalizeString(source.summary),
    status: normalizeString(source.status),
    intensity:
      typeof source.intensity === 'number' && Number.isFinite(source.intensity)
        ? Math.max(0, Math.min(100, Math.round(source.intensity)))
        : null,
  }
}

function normalizeEdgeSnapshots(value) {
  return (Array.isArray(value) ? value : [])
    .map(normalizeEdgeSnapshot)
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
}

function normalizeNode(input, fallback = {}) {
  const objectType = normalizeObjectType(input?.objectType, fallback.objectType || 'character')
  const attributes = normalizeAttributes(
    input?.attributes === undefined ? fallback.attributes : input?.attributes,
  )
  const status = normalizeNodeStatus(attributes, input?.status, fallback.status)
  const fallbackStartSequenceIndex =
    objectType === 'event'
      ? normalizeFiniteNumber(fallback.startSequenceIndex, normalizeFiniteNumber(fallback.timeline?.sequenceIndex, 0))
      : normalizeFiniteNumber(fallback.startSequenceIndex, 0)
  const startSequenceIndex = Math.max(
    0,
    Math.round(
      normalizeFiniteNumber(
        input?.startSequenceIndex,
        objectType === 'event'
          ? normalizeFiniteNumber(input?.timeline?.sequenceIndex, fallbackStartSequenceIndex)
          : fallbackStartSequenceIndex,
      ),
    ),
  )
  return {
    id: normalizeString(input?.id, fallback.id || `node-${randomUUID()}`),
    objectType,
    name: normalizeString(input?.name, objectType === 'event' ? '新事件' : '未命名对象'),
    summary: normalizeString(input?.summary),
    status,
    tags: normalizeStringArray(input?.tags),
    attributes,
    position: {
      x: normalizeFiniteNumber(input?.position?.x, fallback.position?.x ?? 120),
      y: normalizeFiniteNumber(input?.position?.y, fallback.position?.y ?? 120),
    },
    startSequenceIndex,
    timelineSnapshots: normalizeNodeSnapshots(
      input?.timelineSnapshots === undefined ? fallback.timelineSnapshots : input?.timelineSnapshots,
    ),
    timeline: objectType === 'event' ? normalizeTimeline(input?.timeline) : null,
    effects: objectType === 'event' ? (Array.isArray(input?.effects) ? input.effects : []).map(normalizeTimelineEffect) : [],
    createdAt: normalizeString(input?.createdAt, fallback.createdAt || nowIso()),
    updatedAt: nowIso(),
  }
}

function normalizeEdge(input, fallback = {}) {
  const startSequenceIndex = Math.max(
    0,
    Math.round(
      normalizeFiniteNumber(input?.startSequenceIndex, normalizeFiniteNumber(fallback.startSequenceIndex, 0)),
    ),
  )
  const endSequenceIndex =
    input?.endSequenceIndex === null
      ? null
      : typeof input?.endSequenceIndex === 'number' && Number.isFinite(input.endSequenceIndex)
        ? Math.max(startSequenceIndex, Math.round(input.endSequenceIndex))
        : fallback.endSequenceIndex === null
          ? null
          : typeof fallback.endSequenceIndex === 'number' && Number.isFinite(fallback.endSequenceIndex)
            ? Math.max(startSequenceIndex, Math.round(fallback.endSequenceIndex))
            : null
  return {
    id: normalizeString(input?.id, fallback.id || `edge-${randomUUID()}`),
    sourceNodeId: normalizeString(input?.sourceNodeId, fallback.sourceNodeId),
    targetNodeId: normalizeString(input?.targetNodeId, fallback.targetNodeId),
    relationTypeCode: normalizeString(input?.relationTypeCode, fallback.relationTypeCode),
    relationLabel: normalizeString(input?.relationLabel),
    summary: normalizeString(input?.summary),
    directionality: normalizeDirectionality(input?.directionality || fallback.directionality),
    intensity:
      typeof input?.intensity === 'number' && Number.isFinite(input.intensity)
        ? Math.max(0, Math.min(100, Math.round(input.intensity)))
        : typeof fallback.intensity === 'number' && Number.isFinite(fallback.intensity)
          ? fallback.intensity
          : null,
    status: normalizeString(input?.status),
    startSequenceIndex,
    endSequenceIndex,
    timelineSnapshots: normalizeEdgeSnapshots(
      input?.timelineSnapshots === undefined ? fallback.timelineSnapshots : input?.timelineSnapshots,
    ),
    createdAt: normalizeString(input?.createdAt, fallback.createdAt || nowIso()),
    updatedAt: nowIso(),
  }
}

function normalizeCalendar(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    calendarId: normalizeString(source.calendarId, DEFAULT_WORLD_CALENDAR.calendarId),
    calendarName: normalizeString(source.calendarName, DEFAULT_WORLD_CALENDAR.calendarName),
    eras: normalizeStringArray(source.eras).length ? normalizeStringArray(source.eras) : DEFAULT_WORLD_CALENDAR.eras,
    monthNames:
      normalizeStringArray(source.monthNames).length
        ? normalizeStringArray(source.monthNames)
        : DEFAULT_WORLD_CALENDAR.monthNames,
    dayNames:
      normalizeStringArray(source.dayNames).length
        ? normalizeStringArray(source.dayNames)
        : DEFAULT_WORLD_CALENDAR.dayNames,
    timeOfDayLabels:
      normalizeStringArray(source.timeOfDayLabels).length
        ? normalizeStringArray(source.timeOfDayLabels)
        : DEFAULT_WORLD_CALENDAR.timeOfDayLabels,
    formatTemplate: normalizeString(source.formatTemplate, DEFAULT_WORLD_CALENDAR.formatTemplate),
  }
}

function normalizeLayout(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    viewportX: normalizeFiniteNumber(source.viewportX, DEFAULT_WORLD_LAYOUT.viewportX),
    viewportY: normalizeFiniteNumber(source.viewportY, DEFAULT_WORLD_LAYOUT.viewportY),
    zoom: normalizeFiniteNumber(source.zoom, DEFAULT_WORLD_LAYOUT.zoom),
  }
}

function mapRelationTypeRow(row) {
  return {
    id: String(row.id || ''),
    code: String(row.code || ''),
    label: String(row.label || ''),
    description: String(row.description || ''),
    directionality: normalizeDirectionality(row.directionality),
    sourceObjectTypes: normalizeStringArray(safeJsonParse(row.sourceObjectTypesJson, [])),
    targetObjectTypes: normalizeStringArray(safeJsonParse(row.targetObjectTypesJson, [])),
    isBuiltin: Boolean(row.isBuiltin),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
  }
}

function deserializeNode(row) {
  return normalizeNode({
    id: row.id,
    objectType: row.objectType,
    name: row.name,
    summary: row.summary,
    status: row.status,
    tags: safeJsonParse(row.tagsJson, []),
    attributes: safeJsonParse(row.attributesJson, {}),
    position: {
      x: row.positionX,
      y: row.positionY,
    },
    startSequenceIndex: row.startSequenceIndex,
    timelineSnapshots: safeJsonParse(row.snapshotsJson, []),
    timeline: safeJsonParse(row.timelineJson, null),
    effects: safeJsonParse(row.effectsJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

function deserializeEdge(row) {
  return normalizeEdge({
    id: row.id,
    sourceNodeId: row.sourceNodeId,
    targetNodeId: row.targetNodeId,
    relationTypeCode: row.relationTypeCode,
    relationLabel: row.relationLabel,
    summary: row.summary,
    directionality: row.directionality,
    intensity: row.intensity,
    status: row.status,
    startSequenceIndex: row.startSequenceIndex,
    endSequenceIndex: row.endSequenceIndex,
    timelineSnapshots: safeJsonParse(row.snapshotsJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })
}

async function ensureOwnedRobot(user, robotId) {
  const userId = resolveUserId(user)
  const { Robot } = getModels()
  const robot = await Robot.findOne({
    where: {
      id: scopeId(user, robotId),
      userId,
    },
  })

  if (!robot) {
    throw new Error('智能体不存在或无权访问')
  }

  return {
    userId,
    robot,
    scopedRobotId: robot.id,
    robotId: String(robotId || ''),
  }
}

async function ensureGraphMeta(user, robotId) {
  const ownership = await ensureOwnedRobot(user, robotId)
  const { RobotWorldGraph } = getModels()
  const recordId = scopeId(user, `world-graph:${robotId}`)
  const [row] = await RobotWorldGraph.findOrCreate({
    where: {
      id: recordId,
    },
    defaults: {
      id: recordId,
      userId: ownership.userId,
      robotId: ownership.scopedRobotId,
      title: `${ownership.robot.name} 世界设定`,
      summary: '',
      graphVersion: 1,
      calendarJson: JSON.stringify(DEFAULT_WORLD_CALENDAR),
      lastLayoutJson: JSON.stringify(DEFAULT_WORLD_LAYOUT),
    },
  })

  return { ownership, row }
}

async function bumpGraphVersion(user, robotId) {
  const { row } = await ensureGraphMeta(user, robotId)
  await row.increment('graphVersion')
  await row.reload()
  return row
}

async function listCustomRelationTypes(user, robotId) {
  const { ownership } = await ensureGraphMeta(user, robotId)
  const { RobotWorldRelationType } = getModels()
  const rows = await RobotWorldRelationType.findAll({
    where: {
      userId: ownership.userId,
      robotId: ownership.scopedRobotId,
    },
    order: [['createdAt', 'ASC']],
  })

  return rows.map(mapRelationTypeRow)
}

export async function listWorldRelationTypes(user, robotId) {
  const custom = await listCustomRelationTypes(user, robotId)
  return [...BUILTIN_WORLD_RELATION_TYPES, ...custom]
}

export async function createWorldRelationType(user, robotId, input) {
  const { ownership } = await ensureGraphMeta(user, robotId)
  const { RobotWorldRelationType } = getModels()
  const code = normalizeString(input?.code).toLowerCase().replace(/\s+/g, '_')
  if (!code) {
    throw new Error('关系类型编码不能为空')
  }
  if (BUILTIN_WORLD_RELATION_TYPES.some((item) => item.code === code)) {
    throw new Error('关系类型编码与平台内置类型冲突')
  }

  const sourceObjectTypes = normalizeStringArray(input?.sourceObjectTypes).filter((item) => WORLD_OBJECT_TYPES.includes(item))
  const targetObjectTypes = normalizeStringArray(input?.targetObjectTypes).filter((item) => WORLD_OBJECT_TYPES.includes(item))

  const row = await RobotWorldRelationType.create({
    id: scopeId(user, `world-relation-type:${randomUUID()}`),
    userId: ownership.userId,
    robotId: ownership.scopedRobotId,
    code,
    label: normalizeString(input?.label, code),
    description: normalizeString(input?.description),
    directionality: normalizeDirectionality(input?.directionality),
    sourceObjectTypesJson: JSON.stringify(sourceObjectTypes),
    targetObjectTypesJson: JSON.stringify(targetObjectTypes),
    isBuiltin: false,
  })

  await bumpGraphVersion(user, robotId)
  return mapRelationTypeRow(row)
}

export async function updateWorldRelationType(user, robotId, typeId, input) {
  const { ownership } = await ensureGraphMeta(user, robotId)
  const { RobotWorldRelationType } = getModels()
  const row = await RobotWorldRelationType.findOne({
    where: {
      id: typeId,
      userId: ownership.userId,
      robotId: ownership.scopedRobotId,
    },
  })

  if (!row) {
    throw new Error('关系类型不存在')
  }
  if (row.isBuiltin) {
    throw new Error('平台内置关系类型不可修改')
  }

  const sourceObjectTypes = normalizeStringArray(input?.sourceObjectTypes).filter((item) => WORLD_OBJECT_TYPES.includes(item))
  const targetObjectTypes = normalizeStringArray(input?.targetObjectTypes).filter((item) => WORLD_OBJECT_TYPES.includes(item))

  await row.update({
    label: normalizeString(input?.label, row.label),
    description: normalizeString(input?.description, row.description),
    directionality: normalizeDirectionality(input?.directionality || row.directionality),
    sourceObjectTypesJson: JSON.stringify(sourceObjectTypes),
    targetObjectTypesJson: JSON.stringify(targetObjectTypes),
  })

  await bumpGraphVersion(user, robotId)
  return mapRelationTypeRow(row)
}

async function countEdgesByRelationType(robotId, relationTypeCode) {
  const result = await runNeo4jQuery(
    `
      MATCH (:WorldNode {robot_id: $robotId})-[r:WORLD_EDGE {robot_id: $robotId, relation_type_code: $relationTypeCode}]->(:WorldNode {robot_id: $robotId})
      RETURN count(r) AS count
    `,
    { robotId, relationTypeCode },
  )
  const [row] = mapNeo4jRows(result)
  return Number(row?.count || 0)
}

export async function deleteWorldRelationType(user, robotId, typeId) {
  const { ownership } = await ensureGraphMeta(user, robotId)
  const { RobotWorldRelationType } = getModels()
  const row = await RobotWorldRelationType.findOne({
    where: {
      id: typeId,
      userId: ownership.userId,
      robotId: ownership.scopedRobotId,
    },
  })

  if (!row) {
    throw new Error('关系类型不存在')
  }
  if (row.isBuiltin) {
    throw new Error('平台内置关系类型不可删除')
  }
  if ((await countEdgesByRelationType(robotId, row.code)) > 0) {
    throw new Error('该关系类型已被图中的关系使用，请先删除或替换相关关系')
  }

  await row.destroy()
  await bumpGraphVersion(user, robotId)
  return { deletedTypeId: row.id }
}

async function listWorldNodes(robotId) {
  const result = await runNeo4jQuery(
    `
      MATCH (n:WorldNode {robot_id: $robotId})
      RETURN
        n.node_id AS id,
        n.object_type AS objectType,
        n.name AS name,
        n.summary AS summary,
        n.status AS status,
        n.tags_json AS tagsJson,
        n.attributes_json AS attributesJson,
        n.start_sequence_index AS startSequenceIndex,
        n.snapshots_json AS snapshotsJson,
        n.timeline_json AS timelineJson,
        n.effects_json AS effectsJson,
        n.position_x AS positionX,
        n.position_y AS positionY,
        n.created_at AS createdAt,
        n.updated_at AS updatedAt
      ORDER BY n.created_at ASC
    `,
    { robotId },
  )

  return mapNeo4jRows(result).map(deserializeNode)
}

async function listWorldEdges(robotId) {
  const result = await runNeo4jQuery(
    `
      MATCH (source:WorldNode {robot_id: $robotId})-[r:WORLD_EDGE {robot_id: $robotId}]->(target:WorldNode {robot_id: $robotId})
      RETURN
        r.edge_id AS id,
        source.node_id AS sourceNodeId,
        target.node_id AS targetNodeId,
        r.relation_type_code AS relationTypeCode,
        r.relation_label AS relationLabel,
        r.summary AS summary,
        r.directionality AS directionality,
        r.intensity AS intensity,
        r.status AS status,
        r.start_sequence_index AS startSequenceIndex,
        r.end_sequence_index AS endSequenceIndex,
        r.snapshots_json AS snapshotsJson,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt
      ORDER BY r.created_at ASC
    `,
    { robotId },
  )

  return mapNeo4jRows(result).map(deserializeEdge)
}

async function getWorldNodeById(robotId, nodeId) {
  const result = await runNeo4jQuery(
    `
      MATCH (n:WorldNode {robot_id: $robotId, node_id: $nodeId})
      RETURN
        n.node_id AS id,
        n.object_type AS objectType,
        n.name AS name,
        n.summary AS summary,
        n.status AS status,
        n.tags_json AS tagsJson,
        n.attributes_json AS attributesJson,
        n.start_sequence_index AS startSequenceIndex,
        n.snapshots_json AS snapshotsJson,
        n.timeline_json AS timelineJson,
        n.effects_json AS effectsJson,
        n.position_x AS positionX,
        n.position_y AS positionY,
        n.created_at AS createdAt,
        n.updated_at AS updatedAt
      LIMIT 1
    `,
    { robotId, nodeId },
  )

  const [row] = mapNeo4jRows(result)
  return row ? deserializeNode(row) : null
}

async function getWorldEdgeById(robotId, edgeId) {
  const result = await runNeo4jQuery(
    `
      MATCH (source:WorldNode {robot_id: $robotId})-[r:WORLD_EDGE {robot_id: $robotId, edge_id: $edgeId}]->(target:WorldNode {robot_id: $robotId})
      RETURN
        r.edge_id AS id,
        source.node_id AS sourceNodeId,
        target.node_id AS targetNodeId,
        r.relation_type_code AS relationTypeCode,
        r.relation_label AS relationLabel,
        r.summary AS summary,
        r.directionality AS directionality,
        r.intensity AS intensity,
        r.status AS status,
        r.start_sequence_index AS startSequenceIndex,
        r.end_sequence_index AS endSequenceIndex,
        r.snapshots_json AS snapshotsJson,
        r.created_at AS createdAt,
        r.updated_at AS updatedAt
      LIMIT 1
    `,
    { robotId, edgeId },
  )

  const [row] = mapNeo4jRows(result)
  return row ? deserializeEdge(row) : null
}

export async function getWorldGraph(user, robotId) {
  const { ownership, row } = await ensureGraphMeta(user, robotId)
  const [nodes, edges, relationTypes] = await Promise.all([
    listWorldNodes(robotId),
    listWorldEdges(robotId),
    listWorldRelationTypes(user, robotId),
  ])

  return {
    meta: {
      robotId: ownership.robotId,
      title: row.title,
      summary: row.summary,
      graphVersion: row.graphVersion,
      calendar: normalizeCalendar(safeJsonParse(row.calendarJson, DEFAULT_WORLD_CALENDAR)),
      layout: normalizeLayout(safeJsonParse(row.lastLayoutJson, DEFAULT_WORLD_LAYOUT)),
    },
    relationTypes,
    nodes,
    edges,
  }
}

export async function updateWorldGraphMeta(user, robotId, input) {
  const { row, ownership } = await ensureGraphMeta(user, robotId)
  const currentCalendar = normalizeCalendar(safeJsonParse(row.calendarJson, DEFAULT_WORLD_CALENDAR))
  const currentLayout = normalizeLayout(safeJsonParse(row.lastLayoutJson, DEFAULT_WORLD_LAYOUT))
  await row.update({
    title: normalizeString(input?.title, row.title),
    summary: normalizeString(input?.summary, row.summary),
    calendarJson: JSON.stringify(input?.calendar ? normalizeCalendar(input.calendar) : currentCalendar),
    lastLayoutJson: JSON.stringify(input?.layout ? normalizeLayout(input.layout) : currentLayout),
  })

  return {
    robotId: ownership.robotId,
    title: row.title,
    summary: row.summary,
    graphVersion: row.graphVersion,
    calendar: normalizeCalendar(safeJsonParse(row.calendarJson, DEFAULT_WORLD_CALENDAR)),
    layout: normalizeLayout(safeJsonParse(row.lastLayoutJson, DEFAULT_WORLD_LAYOUT)),
  }
}

export async function updateWorldGraphLayout(user, robotId, layout) {
  return updateWorldGraphMeta(user, robotId, { layout })
}

export async function saveWorldNode(user, robotId, input) {
  await ensureGraphMeta(user, robotId)
  const previous = input?.id ? await getWorldNodeById(robotId, String(input.id)) : null
  const node = normalizeNode(input, previous || undefined)

  await runNeo4jQuery(
    `
      MERGE (n:WorldNode {robot_id: $robotId, node_id: $nodeId})
      SET
        n.owner_user_id = $userId,
        n.object_type = $objectType,
        n.name = $name,
        n.summary = $summary,
        n.status = $status,
        n.tags_json = $tagsJson,
        n.attributes_json = $attributesJson,
        n.start_sequence_index = $startSequenceIndex,
        n.snapshots_json = $snapshotsJson,
        n.timeline_json = $timelineJson,
        n.effects_json = $effectsJson,
        n.position_x = $positionX,
        n.position_y = $positionY,
        n.created_at = coalesce(n.created_at, $createdAt),
        n.updated_at = $updatedAt
      RETURN n.node_id AS id
    `,
    {
      robotId,
      nodeId: node.id,
      userId: resolveUserId(user),
      objectType: node.objectType,
      name: node.name,
      summary: node.summary,
      status: node.status,
      tagsJson: JSON.stringify(node.tags),
      attributesJson: JSON.stringify(node.attributes),
      startSequenceIndex: node.startSequenceIndex,
      snapshotsJson: JSON.stringify(node.timelineSnapshots),
      timelineJson: JSON.stringify(node.timeline || {}),
      effectsJson: JSON.stringify(node.effects),
      positionX: node.position.x,
      positionY: node.position.y,
      createdAt: previous?.createdAt || node.createdAt,
      updatedAt: node.updatedAt,
    },
  )

  await bumpGraphVersion(user, robotId)
  return (await getWorldNodeById(robotId, node.id)) || node
}

export async function deleteWorldNode(user, robotId, nodeId) {
  await ensureGraphMeta(user, robotId)
  const node = await getWorldNodeById(robotId, nodeId)
  if (!node) {
    throw new Error('节点不存在')
  }

  const edgeCountResult = await runNeo4jQuery(
    `
      MATCH (n:WorldNode {robot_id: $robotId, node_id: $nodeId})
      OPTIONAL MATCH (n)-[r:WORLD_EDGE]-()
      RETURN count(r) AS count
    `,
    { robotId, nodeId },
  )
  const [countRow] = mapNeo4jRows(edgeCountResult)
  if (Number(countRow?.count || 0) > 0) {
    throw new Error('该节点仍有关联关系，请先删除相关连线')
  }

  await runNeo4jQuery(
    `
      MATCH (n:WorldNode {robot_id: $robotId, node_id: $nodeId})
      DELETE n
    `,
    { robotId, nodeId },
  )

  await bumpGraphVersion(user, robotId)
  return { deletedNodeId: nodeId }
}

async function validateEdgeAgainstRelationType(user, robotId, edge, sourceNodeId, targetNodeId) {
  const relationTypes = await listWorldRelationTypes(user, robotId)
  const relationType = relationTypes.find((item) => item.code === edge.relationTypeCode)
  if (!relationType) {
    throw new Error('关系类型不存在')
  }

  const [sourceNode, targetNode] = await Promise.all([
    getWorldNodeById(robotId, sourceNodeId),
    getWorldNodeById(robotId, targetNodeId),
  ])

  if (!sourceNode || !targetNode) {
    throw new Error('源节点或目标节点不存在')
  }
  if (
    relationType.sourceObjectTypes.length &&
    !relationType.sourceObjectTypes.includes(sourceNode.objectType)
  ) {
    throw new Error('该关系类型不支持当前源对象类型')
  }
  if (
    relationType.targetObjectTypes.length &&
    !relationType.targetObjectTypes.includes(targetNode.objectType)
  ) {
    throw new Error('该关系类型不支持当前目标对象类型')
  }

  return relationType
}

export async function saveWorldEdge(user, robotId, input) {
  await ensureGraphMeta(user, robotId)
  const previous = input?.id ? await getWorldEdgeById(robotId, String(input.id)) : null
  const edge = normalizeEdge(input, previous || undefined)
  if (!edge.sourceNodeId || !edge.targetNodeId) {
    throw new Error('关系必须指定源节点和目标节点')
  }
  const relationType = await validateEdgeAgainstRelationType(
    user,
    robotId,
    edge,
    edge.sourceNodeId,
    edge.targetNodeId,
  )

  await runNeo4jQuery(
    `
      MATCH (source:WorldNode {robot_id: $robotId, node_id: $sourceNodeId})
      MATCH (target:WorldNode {robot_id: $robotId, node_id: $targetNodeId})
      MERGE (source)-[r:WORLD_EDGE {robot_id: $robotId, edge_id: $edgeId}]->(target)
      SET
        r.owner_user_id = $userId,
        r.relation_type_code = $relationTypeCode,
        r.relation_label = $relationLabel,
        r.summary = $summary,
        r.directionality = $directionality,
        r.intensity = $intensity,
        r.status = $status,
        r.start_sequence_index = $startSequenceIndex,
        r.end_sequence_index = $endSequenceIndex,
        r.snapshots_json = $snapshotsJson,
        r.created_at = coalesce(r.created_at, $createdAt),
        r.updated_at = $updatedAt
      RETURN r.edge_id AS id
    `,
    {
      robotId,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      edgeId: edge.id,
      userId: resolveUserId(user),
      relationTypeCode: edge.relationTypeCode,
      relationLabel: edge.relationLabel || relationType.label,
      summary: edge.summary,
      directionality: relationType.directionality,
      intensity: edge.intensity,
      status: edge.status,
      startSequenceIndex: edge.startSequenceIndex,
      endSequenceIndex: edge.endSequenceIndex,
      snapshotsJson: JSON.stringify(edge.timelineSnapshots),
      createdAt: previous?.createdAt || edge.createdAt,
      updatedAt: edge.updatedAt,
    },
  )

  await bumpGraphVersion(user, robotId)
  return (await getWorldEdgeById(robotId, edge.id)) || edge
}

export async function deleteWorldEdge(user, robotId, edgeId) {
  await ensureGraphMeta(user, robotId)
  const edge = await getWorldEdgeById(robotId, edgeId)
  if (!edge) {
    throw new Error('关系不存在')
  }

  await runNeo4jQuery(
    `
      MATCH (:WorldNode {robot_id: $robotId})-[r:WORLD_EDGE {robot_id: $robotId, edge_id: $edgeId}]->(:WorldNode {robot_id: $robotId})
      DELETE r
    `,
    { robotId, edgeId },
  )

  await bumpGraphVersion(user, robotId)
  return { deletedEdgeId: edgeId }
}

export async function updateTimelineOrder(user, robotId, eventIds) {
  await ensureGraphMeta(user, robotId)
  const ids = normalizeStringArray(eventIds)
  if (!ids.length) {
    return []
  }

  for (let index = 0; index < ids.length; index += 1) {
    const node = await getWorldNodeById(robotId, ids[index])
    if (!node || node.objectType !== 'event') {
      throw new Error('时间线排序只支持事件节点')
    }
    node.timeline = normalizeTimeline({
      ...(node.timeline || {}),
      sequenceIndex: index,
    })
    await saveWorldNode(user, robotId, node)
  }

  return (await listWorldNodes(robotId)).filter((item) => item.objectType === 'event')
    .sort((left, right) => normalizeFiniteNumber(left.timeline?.sequenceIndex, 0) - normalizeFiniteNumber(right.timeline?.sequenceIndex, 0))
}

export async function addTimelineEffect(user, robotId, eventId, input) {
  const node = await getWorldNodeById(robotId, eventId)
  if (!node || node.objectType !== 'event') {
    throw new Error('事件不存在')
  }

  node.effects = [...node.effects, normalizeTimelineEffect(input)]
  return saveWorldNode(user, robotId, node)
}

export async function updateTimelineEffect(user, robotId, effectId, input) {
  await ensureGraphMeta(user, robotId)
  const events = (await listWorldNodes(robotId)).filter((item) => item.objectType === 'event')
  const targetEvent = events.find((eventNode) => eventNode.effects.some((effect) => effect.id === effectId))
  if (!targetEvent) {
    throw new Error('事件影响记录不存在')
  }

  targetEvent.effects = targetEvent.effects.map((effect) =>
    effect.id === effectId ? normalizeTimelineEffect({ ...effect, ...input, id: effect.id }) : effect,
  )
  return saveWorldNode(user, robotId, targetEvent)
}

export async function deleteTimelineEffect(user, robotId, effectId) {
  await ensureGraphMeta(user, robotId)
  const events = (await listWorldNodes(robotId)).filter((item) => item.objectType === 'event')
  const targetEvent = events.find((eventNode) => eventNode.effects.some((effect) => effect.id === effectId))
  if (!targetEvent) {
    throw new Error('事件影响记录不存在')
  }

  targetEvent.effects = targetEvent.effects.filter((effect) => effect.id !== effectId)
  const saved = await saveWorldNode(user, robotId, targetEvent)
  return {
    event: saved,
    deletedEffectId: effectId,
  }
}
