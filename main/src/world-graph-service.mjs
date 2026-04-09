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

function readOptionalNormalizedString(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key)
    ? normalizeString(source[key])
    : undefined
}

function readOptionalNormalizedStringArray(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key)
    ? normalizeStringArray(source[key])
    : undefined
}

function readOptionalNormalizedAttributes(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key)
    ? normalizeAttributes(source[key])
    : undefined
}

function normalizeObjectType(value, fallback = 'character') {
  const objectType = String(value || '').trim().toLowerCase()
  return WORLD_OBJECT_TYPES.includes(objectType) ? objectType : fallback
}

function inferObjectTypeFromId(value) {
  const normalized = normalizeString(value).toLowerCase()
  if (!normalized) {
    return ''
  }
  for (const objectType of WORLD_OBJECT_TYPES) {
    if (
      normalized === objectType
      || normalized.startsWith(`${objectType}-`)
      || normalized.startsWith(`${objectType}_`)
      || normalized.startsWith(`${objectType}:`)
    ) {
      return objectType
    }
  }
  return ''
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
    name: readOptionalNormalizedString(source, 'name'),
    summary: readOptionalNormalizedString(source, 'summary'),
    status: readOptionalNormalizedString(source, 'status'),
    knownFacts: readOptionalNormalizedString(source, 'knownFacts'),
    preferencesAndConstraints: readOptionalNormalizedString(source, 'preferencesAndConstraints'),
    taskProgress: readOptionalNormalizedString(source, 'taskProgress'),
    longTermMemory: readOptionalNormalizedString(source, 'longTermMemory'),
    tags: readOptionalNormalizedStringArray(source, 'tags'),
    attributes: readOptionalNormalizedAttributes(source, 'attributes'),
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
    knownFacts: normalizeString(input?.knownFacts, fallback.knownFacts),
    preferencesAndConstraints: normalizeString(input?.preferencesAndConstraints, fallback.preferencesAndConstraints),
    taskProgress: normalizeString(input?.taskProgress, fallback.taskProgress),
    longTermMemory: normalizeString(input?.longTermMemory, fallback.longTermMemory),
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

function hasPollutedEventNodeSignature(node) {
  if (!node || node.objectType !== 'event') {
    return false
  }
  if (
    normalizeString(node.status)
    || normalizeString(node.knownFacts)
    || normalizeString(node.preferencesAndConstraints)
    || normalizeString(node.taskProgress)
    || normalizeString(node.longTermMemory)
  ) {
    return true
  }
  if (Array.isArray(node.tags) && node.tags.length) {
    return true
  }
  if (node.attributes && typeof node.attributes === 'object' && Object.keys(node.attributes).length) {
    return true
  }
  return (Array.isArray(node.timelineSnapshots) ? node.timelineSnapshots : []).some((snapshot) =>
    snapshot?.status !== undefined
    || snapshot?.knownFacts !== undefined
    || snapshot?.preferencesAndConstraints !== undefined
    || snapshot?.taskProgress !== undefined
    || snapshot?.longTermMemory !== undefined
    || (Array.isArray(snapshot?.tags) && snapshot.tags.length)
    || (snapshot?.attributes && typeof snapshot.attributes === 'object' && Object.keys(snapshot.attributes).length),
  )
}

function repairPossiblyPollutedEventNode(node) {
  const normalized = normalizeNode(node)
  const inferredObjectType = inferObjectTypeFromId(normalized.id)
  if (
    normalized.objectType !== 'event'
    || !inferredObjectType
    || inferredObjectType === 'event'
    || !hasPollutedEventNodeSignature(normalized)
  ) {
    return normalized
  }
  return normalizeNode({
    ...normalized,
    objectType: inferredObjectType,
    timeline: null,
    effects: [],
  })
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

function normalizeRelationType(input, fallback = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const code = normalizeString(source.code, fallback.code)
  const builtin = BUILTIN_WORLD_RELATION_TYPES.find((item) => item.code === code)
  return {
    id: normalizeString(source.id, fallback.id || builtin?.id || `relation-type:${code || randomUUID()}`),
    code,
    label: normalizeString(source.label, fallback.label || builtin?.label || code),
    description: normalizeString(source.description, fallback.description || builtin?.description),
    directionality: normalizeDirectionality(source.directionality || fallback.directionality || builtin?.directionality),
    sourceObjectTypes: normalizeStringArray(source.sourceObjectTypes ?? fallback.sourceObjectTypes ?? builtin?.sourceObjectTypes)
      .filter((item) => WORLD_OBJECT_TYPES.includes(item)),
    targetObjectTypes: normalizeStringArray(source.targetObjectTypes ?? fallback.targetObjectTypes ?? builtin?.targetObjectTypes)
      .filter((item) => WORLD_OBJECT_TYPES.includes(item)),
    isBuiltin: Boolean(source.isBuiltin ?? fallback.isBuiltin ?? builtin),
    createdAt: normalizeString(source.createdAt, fallback.createdAt || nowIso()),
    updatedAt: normalizeString(source.updatedAt, fallback.updatedAt || nowIso()),
  }
}

function normalizeRelationTypes(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizeRelationType(item))
    .filter((item) => item.code)
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
    knownFacts: row.knownFacts,
    preferencesAndConstraints: row.preferencesAndConstraints,
    taskProgress: row.taskProgress,
    longTermMemory: row.longTermMemory,
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
        n.known_facts AS knownFacts,
        n.preferences_and_constraints AS preferencesAndConstraints,
        n.task_progress AS taskProgress,
        n.long_term_memory AS longTermMemory,
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
        n.known_facts AS knownFacts,
        n.preferences_and_constraints AS preferencesAndConstraints,
        n.task_progress AS taskProgress,
        n.long_term_memory AS longTermMemory,
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

export async function getConfiguredWorldGraph(user, robotId) {
  const ownership = await ensureOwnedRobot(user, robotId)
  const { RobotWorldGraph } = getModels()
  const recordId = scopeId(user, `world-graph:${robotId}`)
  const row = await RobotWorldGraph.findByPk(recordId)
  if (!row) {
    return null
  }

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

export function normalizeWorldGraphSnapshot(input, fallback = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const fallbackMeta = fallback.meta && typeof fallback.meta === 'object' ? fallback.meta : {}
  const robotId = normalizeString(
    source.meta?.robotId ?? source.meta?.robot_id ?? source.robotId,
    fallbackMeta.robotId || fallback.robotId || '',
  )
  const robotName = normalizeString(source.robotName, fallback.robotName || '')
  return {
    meta: {
      robotId,
      title: normalizeString(
        source.meta?.title,
        fallbackMeta.title || (robotName ? `${robotName} 世界设定` : ''),
      ),
      summary: normalizeString(source.meta?.summary, fallbackMeta.summary || ''),
      graphVersion: Math.max(
        0,
        Math.round(
          normalizeFiniteNumber(
            source.meta?.graphVersion ?? source.meta?.graph_version,
            normalizeFiniteNumber(fallbackMeta.graphVersion, 0),
          ),
        ),
      ),
      calendar: normalizeCalendar(source.meta?.calendar ?? fallbackMeta.calendar),
      layout: normalizeLayout(source.meta?.layout ?? fallbackMeta.layout),
    },
    relationTypes: normalizeRelationTypes(source.relationTypes ?? source.relation_types ?? fallback.relationTypes),
    nodes: (Array.isArray(source.nodes) ? source.nodes : Array.isArray(fallback.nodes) ? fallback.nodes : []).map((item) =>
      repairPossiblyPollutedEventNode(item),
    ),
    edges: (Array.isArray(source.edges) ? source.edges : Array.isArray(fallback.edges) ? fallback.edges : []).map((item) =>
      normalizeEdge(item),
    ),
  }
}

export function createEmptyWorldGraphSnapshot(robotId = '', robotName = '') {
  return normalizeWorldGraphSnapshot(
    {
      meta: {
        robotId: normalizeString(robotId),
        title: robotName ? `${robotName} 世界设定` : '',
        summary: '',
        graphVersion: 0,
        calendar: DEFAULT_WORLD_CALENDAR,
        layout: DEFAULT_WORLD_LAYOUT,
      },
      relationTypes: [],
      nodes: [],
      edges: [],
    },
    { robotId, robotName },
  )
}

export function cloneWorldGraphSnapshot(graph, overrides = {}) {
  return normalizeWorldGraphSnapshot(JSON.parse(JSON.stringify(graph || {})), overrides)
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

export async function replaceWorldGraph(user, robotId, input) {
  const { ownership, row } = await ensureGraphMeta(user, robotId)
  const snapshot = normalizeWorldGraphSnapshot(
    {
      ...(input && typeof input === 'object' ? input : {}),
      meta: {
        ...(input?.meta && typeof input.meta === 'object' ? input.meta : {}),
        robotId,
      },
    },
    {
      robotId,
      robotName: ownership.robot.name,
    },
  )
  const customRelationTypes = snapshot.relationTypes.filter((item) => item.code && !item.isBuiltin)
  const { sequelize, RobotWorldRelationType } = getModels()

  await sequelize.transaction(async (transaction) => {
    await row.update({
      title: snapshot.meta.title || `${ownership.robot.name} 世界设定`,
      summary: snapshot.meta.summary,
      calendarJson: JSON.stringify(snapshot.meta.calendar),
      lastLayoutJson: JSON.stringify(snapshot.meta.layout),
    }, { transaction })

    await RobotWorldRelationType.destroy({
      where: {
        userId: ownership.userId,
        robotId: ownership.scopedRobotId,
      },
      transaction,
    })

    for (const relationType of customRelationTypes) {
      await RobotWorldRelationType.create({
        id: scopeId(user, `world-relation-type:${randomUUID()}`),
        userId: ownership.userId,
        robotId: ownership.scopedRobotId,
        code: relationType.code,
        label: relationType.label,
        description: relationType.description,
        directionality: relationType.directionality,
        sourceObjectTypesJson: JSON.stringify(relationType.sourceObjectTypes),
        targetObjectTypesJson: JSON.stringify(relationType.targetObjectTypes),
        isBuiltin: false,
      }, { transaction })
    }
  })

  await runNeo4jQuery(
    `
      MATCH (n:WorldNode {robot_id: $robotId})
      DETACH DELETE n
    `,
    { robotId },
  )

  for (const node of snapshot.nodes) {
    await saveWorldNode(user, robotId, node)
  }

  for (const edge of snapshot.edges) {
    await saveWorldEdge(user, robotId, edge)
  }

  await row.reload()
  await row.update({
    graphVersion: Math.max(snapshot.meta.graphVersion, 1),
  })

  return getWorldGraph(user, robotId)
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
        n.known_facts = $knownFacts,
        n.preferences_and_constraints = $preferencesAndConstraints,
        n.task_progress = $taskProgress,
        n.long_term_memory = $longTermMemory,
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
      knownFacts: node.knownFacts,
      preferencesAndConstraints: node.preferencesAndConstraints,
      taskProgress: node.taskProgress,
      longTermMemory: node.longTermMemory,
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

function normalizeWritebackNodeRef(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    nodeId: normalizeString(source.nodeId || source.node_id || source.id),
    name: normalizeString(source.name),
    objectType: normalizeString(source.objectType || source.object_type),
  }
}

function normalizeWritebackEdgeRef(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    edgeId: normalizeString(source.edgeId || source.edge_id || source.id),
    sourceNodeId: normalizeString(source.sourceNodeId || source.source_node_id || source.sourceId || source.source_id || source.source),
    targetNodeId: normalizeString(source.targetNodeId || source.target_node_id || source.targetId || source.target_id || source.target),
    relationTypeCode: normalizeString(source.relationTypeCode || source.relation_type_code || source.relationTypeId || source.relation_type_id || source.relationType || source.relation_type),
  }
}

function normalizeWritebackNodeSnapshotOp(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    ref: normalizeWritebackNodeRef(source.ref || source.nodeRef || source.node_ref || source),
    snapshot: normalizeNodeSnapshot(source.snapshot || source),
  }
}

function normalizeWritebackEdgeSnapshotOp(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    ref: normalizeWritebackEdgeRef(source.ref || source.edgeRef || source.edge_ref || source),
    snapshot: normalizeEdgeSnapshot(source.snapshot || source),
  }
}

function normalizeWritebackEventEffectOp(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    ref: normalizeWritebackNodeRef(source.ref || source.eventRef || source.event_ref || source),
    effects: (Array.isArray(source.effects) ? source.effects : [source.effect]).filter(Boolean).map(normalizeTimelineEffect),
  }
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
  const type = normalizeString(value)
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

function normalizeWritebackEventChangeContent(value) {
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

function normalizeWritebackEventChange(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    id: normalizeString(readOwnValue(source, 'id', 'i')),
    type: expandWritebackTypeAlias(readOwnValue(source, 'type', 't')),
    content: normalizeWritebackEventChangeContent(readOwnValue(source, 'content', 'v')),
  }
}

function normalizeWritebackEventMode(value) {
  return normalizeString(value).toLowerCase() === 'continue' ? 'continue' : 'new'
}

function normalizeWritebackEventRecord(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return {
    id: normalizeString(readOwnValue(source, 'id', 'i')),
    mode: normalizeWritebackEventMode(readOwnValue(source, 'mode', 'm')),
    name: normalizeString(readOwnValue(source, 'name', 'n')),
    summary: normalizeString(readOwnValue(source, 'summary', 's')),
    changes: (Array.isArray(readOwnValue(source, 'changes', 'c')) ? readOwnValue(source, 'changes', 'c') : []).map(normalizeWritebackEventChange),
  }
}

function parseRelationCompositeId(value) {
  const segments = normalizeString(value).split('|').map((item) => item.trim())
  if (segments.length !== 3 || segments.some((item) => !item)) {
    return null
  }
  return {
    sourceNodeId: segments[0],
    relationTypeCode: segments[1],
    targetNodeId: segments[2],
  }
}

const EVENT_AUTO_RELATION_CODES = Object.freeze({
  participatesIn: 'participates_in',
  associatedLocation: 'associated_location',
})

function buildRelationCompositeId(sourceNodeId, relationTypeCode, targetNodeId) {
  return `${normalizeString(sourceNodeId)}|${normalizeString(relationTypeCode)}|${normalizeString(targetNodeId)}`
}

function ensureBuiltinRelationTypes(relationTypes, relationTypeCodes = []) {
  const normalized = Array.isArray(relationTypes) ? relationTypes.map((item) => normalizeRelationType(item)) : []
  const nextRelationTypes = [...normalized]
  const existingCodes = new Set(nextRelationTypes.map((item) => item.code).filter(Boolean))

  for (const relationTypeCode of relationTypeCodes.map((item) => normalizeString(item)).filter(Boolean)) {
    if (existingCodes.has(relationTypeCode)) {
      continue
    }
    const builtin = BUILTIN_WORLD_RELATION_TYPES.find((item) => item.code === relationTypeCode)
    if (!builtin) {
      continue
    }
    nextRelationTypes.push(normalizeRelationType(builtin))
    existingCodes.add(relationTypeCode)
  }

  return nextRelationTypes
}

function isAutoManagedCurrentEventRelation(relationRef, eventId) {
  if (!relationRef?.sourceNodeId || !relationRef?.targetNodeId || !relationRef?.relationTypeCode || !eventId) {
    return false
  }

  if (
    relationRef.relationTypeCode === EVENT_AUTO_RELATION_CODES.participatesIn &&
    relationRef.targetNodeId === eventId
  ) {
    return true
  }

  if (
    relationRef.relationTypeCode === EVENT_AUTO_RELATION_CODES.associatedLocation &&
    relationRef.sourceNodeId === eventId
  ) {
    return true
  }

  if (
    relationRef.relationTypeCode === 'located_in' &&
    relationRef.sourceNodeId === eventId
  ) {
    return true
  }

  return false
}

const WRITEBACK_NODE_FIELDS = new Set([
  'name',
  'summary',
  'status',
  'knownFacts',
  'preferencesAndConstraints',
  'taskProgress',
  'longTermMemory',
  'tag',
])

const WRITEBACK_RELATION_FIELDS = new Set(['summary', 'status', 'intensity', 'label'])

function parseWritebackNodeChangeType(value) {
  const type = normalizeString(value)
  if (!type) {
    return null
  }
  const parts = type.split('.').map((item) => item.trim()).filter(Boolean)
  if (parts.length < 2) {
    return null
  }
  const objectType = normalizeObjectType(parts[0], '')
  if (!objectType) {
    return null
  }
  if (parts[1] === 'attribute' && parts.length >= 3) {
    return { objectType, field: `attribute.${parts.slice(2).join('.')}` }
  }
  if (parts.length === 2 && WRITEBACK_NODE_FIELDS.has(parts[1])) {
    return { objectType, field: parts[1] }
  }
  return null
}

function parseWritebackRelationChangeType(value) {
  const type = normalizeString(value)
  if (!type) {
    return null
  }
  const parts = type.split('.').map((item) => item.trim()).filter(Boolean)
  if (parts.length === 2 && parts[0] === 'relation' && WRITEBACK_RELATION_FIELDS.has(parts[1])) {
    return { field: parts[1] }
  }
  return null
}

function createGeneratedWritebackEventId(usedIds) {
  let counter = 1
  while (usedIds.has(`event-auto-${counter}`)) {
    counter += 1
  }
  const nextId = `event-auto-${counter}`
  usedIds.add(nextId)
  return nextId
}

function appendSyntheticWritebackChange(changes, nextChange) {
  if (!nextChange?.id || !nextChange?.type) {
    return changes
  }
  const list = Array.isArray(changes) ? changes : []
  const exists = list.some((item) => item.id === nextChange.id && item.type === nextChange.type)
  return exists ? list : [nextChange, ...list]
}

function classifyMalformedTopLevelWritebackRecord(record, snapshot) {
  const recordId = normalizeString(record?.id)
  if (!recordId) {
    return null
  }

  const existingNode = (Array.isArray(snapshot?.nodes) ? snapshot.nodes : []).find((item) => item.id === recordId) || null
  if (existingNode && existingNode.objectType !== 'event') {
    return { kind: 'node', recordId, objectType: existingNode.objectType }
  }

  if ((Array.isArray(snapshot?.edges) ? snapshot.edges : []).some((item) => item.id === recordId) || parseRelationCompositeId(recordId)) {
    return { kind: 'relation', recordId }
  }

  if (inferObjectTypeFromId(recordId) === 'event') {
    return null
  }

  const changes = Array.isArray(record?.changes) ? record.changes : []
  if (!changes.length) {
    return null
  }
  if (changes.some((change) => normalizeString(change?.id) !== recordId)) {
    return null
  }

  let inferredNodeType = ''
  let relationOnly = true
  for (const change of changes) {
    const relationInfo = parseWritebackRelationChangeType(change?.type)
    if (relationInfo) {
      continue
    }
    relationOnly = false
    const nodeInfo = parseWritebackNodeChangeType(change?.type)
    if (!nodeInfo) {
      return null
    }
    if (!inferredNodeType) {
      inferredNodeType = nodeInfo.objectType
      continue
    }
    if (inferredNodeType !== nodeInfo.objectType) {
      return null
    }
  }

  if (relationOnly) {
    return { kind: 'relation', recordId }
  }
  if (inferredNodeType) {
    return { kind: 'node', recordId, objectType: inferredNodeType }
  }
  return null
}

function buildSpilloverWritebackChanges(record, spillover) {
  const recordId = normalizeString(record?.id)
  let changes = (Array.isArray(record?.changes) ? record.changes : [])
    .map(normalizeWritebackEventChange)
    .filter((item) => item.id && item.type)

  if (spillover?.kind === 'node' && spillover.objectType) {
    if (normalizeString(record?.summary)) {
      changes = appendSyntheticWritebackChange(changes, {
        id: recordId,
        type: `${spillover.objectType}.summary`,
        content: normalizeString(record.summary),
      })
    }
    if (normalizeString(record?.name)) {
      changes = appendSyntheticWritebackChange(changes, {
        id: recordId,
        type: `${spillover.objectType}.name`,
        content: normalizeString(record.name),
      })
    }
    return changes
  }

  if (spillover?.kind === 'relation') {
    if (normalizeString(record?.summary)) {
      changes = appendSyntheticWritebackChange(changes, {
        id: recordId,
        type: 'relation.summary',
        content: normalizeString(record.summary),
      })
    }
    if (normalizeString(record?.name)) {
      changes = appendSyntheticWritebackChange(changes, {
        id: recordId,
        type: 'relation.label',
        content: normalizeString(record.name),
      })
    }
  }

  return changes
}

function sanitizeEventStreamWritebackRecords(snapshot, records) {
  const rawRecords = Array.isArray(records) ? records : []
  const warnings = []
  const usedIds = new Set((Array.isArray(snapshot?.nodes) ? snapshot.nodes : []).map((item) => item.id))
  const sanitizedEvents = []
  let currentEvent = null

  for (const rawRecord of rawRecords) {
    const spillover = classifyMalformedTopLevelWritebackRecord(rawRecord, snapshot)
    if (spillover) {
      if (!currentEvent) {
        const generatedId = createGeneratedWritebackEventId(usedIds)
        const generatedName = normalizeString(
          rawRecord?.name,
          normalizeString(rawRecord?.summary, `补录事件 ${sanitizedEvents.length + 1}`),
        )
        currentEvent = {
          id: generatedId,
          mode: 'new',
          name: generatedName,
          summary: normalizeString(rawRecord?.summary, generatedName),
          changes: [],
        }
        sanitizedEvents.push(currentEvent)
        warnings.push(`写回协议偏离：检测到顶层${spillover.kind === 'node' ? '节点' : '关系'}记录 ${spillover.recordId}，已自动创建补录事件 ${generatedId}`)
      } else {
        warnings.push(`写回协议偏离：检测到顶层${spillover.kind === 'node' ? '节点' : '关系'}记录 ${spillover.recordId}，已自动折叠到事件 ${currentEvent.id}`)
      }
      currentEvent.changes = [
        ...(Array.isArray(currentEvent.changes) ? currentEvent.changes : []),
        ...buildSpilloverWritebackChanges(rawRecord, spillover),
      ]
      continue
    }

    let eventId = normalizeString(rawRecord?.id)
    const eventMode = normalizeWritebackEventMode(rawRecord?.mode)
    const eventName = normalizeString(rawRecord?.name)
    if (!eventId && eventMode === 'new' && eventName) {
      eventId = createGeneratedWritebackEventId(usedIds)
      warnings.push(`写回协议偏离：事件 ${eventName} 缺少 id，已自动生成 ${eventId}`)
    }
    if (!eventId || !eventName) {
      warnings.push('事件写回失败：事件 id 或名称不能为空')
      currentEvent = null
      continue
    }
    usedIds.add(eventId)

    const sanitizedChanges = []
    for (const change of Array.isArray(rawRecord?.changes) ? rawRecord.changes : []) {
      const normalizedChange = normalizeWritebackEventChange(change)
      if (!normalizedChange.id || !normalizedChange.type) {
        continue
      }
      if (normalizedChange.id === eventId) {
        warnings.push(`写回协议偏离：事件 ${eventId} 的 change ${normalizedChange.type} 指向了事件自身，已自动忽略`)
        continue
      }
      sanitizedChanges.push(normalizedChange)
    }

    currentEvent = {
      id: eventId,
      mode: eventMode,
      name: eventName,
      summary: normalizeString(rawRecord?.summary),
      changes: sanitizedChanges,
    }
    sanitizedEvents.push(currentEvent)
  }

  return { events: sanitizedEvents, warnings }
}

function normalizeWorldGraphWritebackOps(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const readList = (...keys) => {
    const matchedKey = keys.find((key) => Array.isArray(source[key]))
    const raw = matchedKey ? source[matchedKey] : undefined
    return Array.isArray(raw) ? raw : []
  }
  return {
    events: readList('events', 'e')
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item))
      .map(normalizeWritebackEventRecord),
    upsertNodes: readList('upsertNodes', 'upsert_nodes', 'un')
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item)),
    upsertEdges: readList('upsertEdges', 'upsert_edges', 'ue')
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item)),
    upsertEvents: readList('upsertEvents', 'upsert_events', 'uv')
      .filter((item) => item && typeof item === 'object' && !Array.isArray(item)),
    appendNodeSnapshots: readList('appendNodeSnapshots', 'append_node_snapshots', 'ans')
      .map(normalizeWritebackNodeSnapshotOp)
      .filter((item) => item.ref.nodeId || item.ref.name),
    appendEdgeSnapshots: readList('appendEdgeSnapshots', 'append_edge_snapshots', 'aes')
      .map(normalizeWritebackEdgeSnapshotOp)
      .filter((item) => item.ref.edgeId || (item.ref.sourceNodeId && item.ref.targetNodeId && item.ref.relationTypeCode)),
    appendEventEffects: readList('appendEventEffects', 'append_event_effects', 'aef')
      .map(normalizeWritebackEventEffectOp)
      .filter((item) => (item.ref.nodeId || item.ref.name) && item.effects.length),
  }
}

function upsertArrayItem(items, nextItem) {
  const list = Array.isArray(items) ? items : []
  const existingIndex = list.findIndex((item) => item.id === nextItem.id)
  if (existingIndex === -1) {
    return [...list, nextItem]
  }
  const nextList = [...list]
  nextList[existingIndex] = nextItem
  return nextList
}

function replaceSnapshotBySequence(items, snapshot) {
  return [...(Array.isArray(items) ? items : []).filter((item) => item.sequenceIndex !== snapshot.sequenceIndex), snapshot]
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
}

function upsertEffectById(items, effect) {
  const list = Array.isArray(items) ? items : []
  const index = list.findIndex((item) => item.id === effect.id)
  if (index === -1) {
    return [...list, effect]
  }
  const next = [...list]
  next[index] = effect
  return next
}

function mergeNormalizedWritebackOps(base, extra) {
  return {
    events: [
      ...(Array.isArray(base?.events) ? base.events : []),
      ...(Array.isArray(extra?.events) ? extra.events : []),
    ],
    upsertNodes: [
      ...(Array.isArray(base?.upsertNodes) ? base.upsertNodes : []),
      ...(Array.isArray(extra?.upsertNodes) ? extra.upsertNodes : []),
    ],
    upsertEdges: [
      ...(Array.isArray(base?.upsertEdges) ? base.upsertEdges : []),
      ...(Array.isArray(extra?.upsertEdges) ? extra.upsertEdges : []),
    ],
    upsertEvents: [
      ...(Array.isArray(base?.upsertEvents) ? base.upsertEvents : []),
      ...(Array.isArray(extra?.upsertEvents) ? extra.upsertEvents : []),
    ],
    appendNodeSnapshots: [
      ...(Array.isArray(base?.appendNodeSnapshots) ? base.appendNodeSnapshots : []),
      ...(Array.isArray(extra?.appendNodeSnapshots) ? extra.appendNodeSnapshots : []),
    ],
    appendEdgeSnapshots: [
      ...(Array.isArray(base?.appendEdgeSnapshots) ? base.appendEdgeSnapshots : []),
      ...(Array.isArray(extra?.appendEdgeSnapshots) ? extra.appendEdgeSnapshots : []),
    ],
    appendEventEffects: [
      ...(Array.isArray(base?.appendEventEffects) ? base.appendEventEffects : []),
      ...(Array.isArray(extra?.appendEventEffects) ? extra.appendEventEffects : []),
    ],
  }
}

function projectNodeAtSequenceForWriteback(node, sequenceIndex) {
  if (!node || sequenceIndex < normalizeFiniteNumber(node.startSequenceIndex, 0)) {
    return null
  }

  const projected = normalizeNode(node, node)
  const snapshots = [...(Array.isArray(node.timelineSnapshots) ? node.timelineSnapshots : [])]
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
    .filter((snapshot) => snapshot.sequenceIndex <= sequenceIndex)

  for (const snapshot of snapshots) {
    if (snapshot.name !== undefined) {
      projected.name = snapshot.name
    }
    if (snapshot.summary !== undefined) {
      projected.summary = snapshot.summary
    }
    if (snapshot.status !== undefined) {
      projected.status = snapshot.status
      projected.attributes = { ...projected.attributes, currentStatus: snapshot.status }
    }
    if (snapshot.knownFacts !== undefined) {
      projected.knownFacts = snapshot.knownFacts
    }
    if (snapshot.preferencesAndConstraints !== undefined) {
      projected.preferencesAndConstraints = snapshot.preferencesAndConstraints
    }
    if (snapshot.taskProgress !== undefined) {
      projected.taskProgress = snapshot.taskProgress
    }
    if (snapshot.longTermMemory !== undefined) {
      projected.longTermMemory = snapshot.longTermMemory
    }
    if (snapshot.tags !== undefined) {
      projected.tags = [...snapshot.tags]
    }
    if (snapshot.attributes !== undefined) {
      projected.attributes = { ...projected.attributes, ...snapshot.attributes }
    }
  }

  return projected
}

function projectEdgeAtSequenceForWriteback(edge, sequenceIndex) {
  if (!edge || sequenceIndex < normalizeFiniteNumber(edge.startSequenceIndex, 0)) {
    return null
  }
  if (typeof edge.endSequenceIndex === 'number' && Number.isFinite(edge.endSequenceIndex) && sequenceIndex > edge.endSequenceIndex) {
    return null
  }

  const projected = normalizeEdge(edge, edge)
  const snapshots = [...(Array.isArray(edge.timelineSnapshots) ? edge.timelineSnapshots : [])]
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
    .filter((snapshot) => snapshot.sequenceIndex <= sequenceIndex)

  for (const snapshot of snapshots) {
    if (snapshot.relationTypeCode) {
      projected.relationTypeCode = snapshot.relationTypeCode
    }
    if (snapshot.relationLabel) {
      projected.relationLabel = snapshot.relationLabel
    }
    if (snapshot.summary) {
      projected.summary = snapshot.summary
    }
    if (snapshot.status) {
      projected.status = snapshot.status
    }
    if (snapshot.intensity !== undefined && snapshot.intensity !== null) {
      projected.intensity = snapshot.intensity
    }
  }

  return projected
}

function getWorldGraphMaxSequenceIndexForWriteback(graph) {
  const values = [
    ...(Array.isArray(graph?.nodes) ? graph.nodes : []).map((item) =>
      Math.max(
        normalizeFiniteNumber(item?.startSequenceIndex, 0),
        normalizeFiniteNumber(item?.timeline?.sequenceIndex, normalizeFiniteNumber(item?.startSequenceIndex, 0)),
      )),
    ...(Array.isArray(graph?.nodes) ? graph.nodes : []).flatMap((item) =>
      (Array.isArray(item?.timelineSnapshots) ? item.timelineSnapshots : []).map((snapshot) =>
        normalizeFiniteNumber(snapshot?.sequenceIndex, 0))),
    ...(Array.isArray(graph?.edges) ? graph.edges : []).map((item) =>
      Math.max(
        normalizeFiniteNumber(item?.startSequenceIndex, 0),
        normalizeFiniteNumber(item?.endSequenceIndex, 0),
      )),
    ...(Array.isArray(graph?.edges) ? graph.edges : []).flatMap((item) =>
      (Array.isArray(item?.timelineSnapshots) ? item.timelineSnapshots : []).map((snapshot) =>
        normalizeFiniteNumber(snapshot?.sequenceIndex, 0))),
  ]
  return values.reduce((max, value) => Math.max(max, Math.max(0, Math.round(value))), 0)
}

function normalizeVisibleTextForOverlap(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
}

function hasVisibleTextOverlap(left, right) {
  const normalizedLeft = normalizeVisibleTextForOverlap(left)
  const normalizedRight = normalizeVisibleTextForOverlap(right)
  if (!normalizedLeft || !normalizedRight) {
    return false
  }
  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true
  }
  const shorter = normalizedLeft.length <= normalizedRight.length ? normalizedLeft : normalizedRight
  const longer = shorter === normalizedLeft ? normalizedRight : normalizedLeft
  if (shorter.length < 2) {
    return shorter === longer
  }
  for (let index = 0; index < shorter.length - 1; index += 1) {
    if (longer.includes(shorter.slice(index, index + 2))) {
      return true
    }
  }
  return false
}

function buildNodeLabelMap(nodes) {
  return new Map((Array.isArray(nodes) ? nodes : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => [String(item.id || '').trim(), String(item.name || item.id || '').trim()]))
}

function buildNodeTypeMap(nodes) {
  return new Map((Array.isArray(nodes) ? nodes : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => [String(item.id || '').trim(), String(item.objectType || '').trim()]))
}

function formatAnchorNodeIds(nodes, ids) {
  const labelMap = buildNodeLabelMap(nodes)
  const normalizedIds = [...new Set((Array.isArray(ids) ? ids : []).map((item) => normalizeString(item)).filter(Boolean))]
  const labels = normalizedIds
    .map((item) => labelMap.get(item) || item)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'zh-CN'))
  return labels.length ? labels.join('、') : '无'
}

function collectEventAnchorNodeIdsByType(nodes, edges, eventId) {
  const typeMap = buildNodeTypeMap(nodes)
  const participantNodeIds = new Set()
  const locationNodeIds = new Set()

  for (const edge of Array.isArray(edges) ? edges : []) {
    if (!edge || typeof edge !== 'object') {
      continue
    }
    const relationTypeCode = normalizeString(edge.relationTypeCode)
    if (relationTypeCode === EVENT_AUTO_RELATION_CODES.participatesIn && normalizeString(edge.targetNodeId) === eventId) {
      const sourceNodeId = normalizeString(edge.sourceNodeId)
      if (['character', 'organization', 'item'].includes(typeMap.get(sourceNodeId) || '')) {
        participantNodeIds.add(sourceNodeId)
      }
      continue
    }
    if (relationTypeCode === EVENT_AUTO_RELATION_CODES.associatedLocation && normalizeString(edge.sourceNodeId) === eventId) {
      const targetNodeId = normalizeString(edge.targetNodeId)
      if ((typeMap.get(targetNodeId) || '') === 'location') {
        locationNodeIds.add(targetNodeId)
      }
    }
  }

  return {
    participantNodeIds: [...participantNodeIds],
    locationNodeIds: [...locationNodeIds],
  }
}

function collectCurrentWritebackAnchorNodeIds(nodes, anchorNodeIds) {
  const typeMap = buildNodeTypeMap(nodes)
  const participantNodeIds = []
  const locationNodeIds = []

  for (const nodeId of [...new Set((Array.isArray(anchorNodeIds) ? anchorNodeIds : []).map((item) => normalizeString(item)).filter(Boolean))]) {
    const objectType = typeMap.get(nodeId) || ''
    if (['character', 'organization', 'item'].includes(objectType)) {
      participantNodeIds.push(nodeId)
      continue
    }
    if (objectType === 'location') {
      locationNodeIds.push(nodeId)
    }
  }

  return { participantNodeIds, locationNodeIds }
}

function appendSuspiciousContinueWarnings({
  eventId,
  eventName,
  eventSummary,
  historicalEventText,
  currentAnchorNodeIds,
  nodes,
  edges,
  warnings,
}) {
  const historicalAnchors = collectEventAnchorNodeIdsByType(nodes, edges, eventId)
  const currentAnchors = collectCurrentWritebackAnchorNodeIds(nodes, currentAnchorNodeIds)
  const historicalCombined = new Set([...historicalAnchors.participantNodeIds, ...historicalAnchors.locationNodeIds])
  const currentCombined = [...new Set([...currentAnchors.participantNodeIds, ...currentAnchors.locationNodeIds])]

  if (historicalCombined.size > 0 && currentCombined.length > 0) {
    const hasSharedAnchor = currentCombined.some((item) => historicalCombined.has(item))
    if (!hasSharedAnchor) {
      warnings.push(
        `疑似误续写：事件 ${eventId} 当前 continue 与历史事件锚点脱节（历史锚点：${formatAnchorNodeIds(nodes, [...historicalCombined])}；本轮锚点：${formatAnchorNodeIds(nodes, currentCombined)}）`,
      )
    }
  }

  const historicalText = [historicalEventText?.name, historicalEventText?.summary].filter(Boolean).join(' ')
  const currentText = [normalizeString(eventName), normalizeString(eventSummary)].filter(Boolean).join(' ')
  if (historicalText && currentText && !hasVisibleTextOverlap(historicalText, currentText)) {
    warnings.push(`疑似误续写：事件 ${eventId} 的标题或概述疑似切换到新事件`)
  }
}

function materializeEventDrivenWritebackOps(graph, input) {
  const payload = normalizeWorldGraphWritebackOps(input)
  const snapshot = normalizeWorldGraphSnapshot(graph)
  const sanitized = sanitizeEventStreamWritebackRecords(snapshot, payload.events)
  const events = Array.isArray(sanitized.events) ? sanitized.events : []
  const warnings = [...sanitized.warnings]
  let relationTypes = ensureBuiltinRelationTypes(snapshot.relationTypes)
  if (!events.length) {
    return {
      ops: {
        upsertNodes: [],
        upsertEdges: [],
        upsertEvents: [],
        appendNodeSnapshots: [],
        appendEdgeSnapshots: [],
        appendEventEffects: [],
      },
      warnings,
      relationTypes,
    }
  }

  let nodes = [...snapshot.nodes]
  let edges = [...snapshot.edges]
  let nextSequenceIndex = getWorldGraphMaxSequenceIndexForWriteback(snapshot) + 1
  const ops = {
    upsertNodes: [],
    upsertEdges: [],
    upsertEvents: [],
    appendNodeSnapshots: [],
    appendEdgeSnapshots: [],
    appendEventEffects: [],
  }
  const existingEventIds = new Set(nodes.filter((item) => item.objectType === 'event').map((item) => item.id))

  for (const rawEvent of events) {
    const eventId = normalizeString(rawEvent?.id)
    const eventName = normalizeString(rawEvent?.name)
    const eventMode = normalizeWritebackEventMode(rawEvent?.mode)
    let historicalEventText = { name: '', summary: '' }
    if (!eventId || !eventName) {
      warnings.push('事件写回失败：事件 id 或名称不能为空')
      continue
    }

    let currentEventNode = findNodeByRef(nodes, { nodeId: eventId })
    if (eventMode === 'continue') {
      if (!currentEventNode || currentEventNode.objectType !== 'event') {
        warnings.push(`事件写回失败：续写事件 ${eventId} 不存在或不是事件节点`)
        continue
      }
      const sequenceIndex = nextSequenceIndex
      nextSequenceIndex += 1
      const projectedEvent =
        projectNodeAtSequenceForWriteback(currentEventNode, Math.max(0, sequenceIndex - 1))
        || normalizeNode(currentEventNode, currentEventNode)
      historicalEventText = {
        name: normalizeString(projectedEvent?.name),
        summary: normalizeString(projectedEvent?.summary),
      }
      const snapshotRecord = normalizeNodeSnapshot({
        sequenceIndex,
        name: eventName,
        summary: normalizeString(rawEvent?.summary, projectedEvent.summary || eventName),
      })
      ops.appendNodeSnapshots.push({
        ref: { nodeId: currentEventNode.id },
        snapshot: snapshotRecord,
      })
      currentEventNode = normalizeNode({
        ...currentEventNode,
        timelineSnapshots: replaceSnapshotBySequence(currentEventNode.timelineSnapshots, snapshotRecord),
      }, currentEventNode)
      nodes = upsertArrayItem(nodes, currentEventNode)
    } else {
      if (existingEventIds.has(eventId)) {
        warnings.push(`事件写回失败：事件 ${eventId} 已存在，m:new 只能追加新事件`)
        continue
      }
      const sequenceIndex = nextSequenceIndex
      nextSequenceIndex += 1
      const eventWriteInput = {
        id: eventId,
        objectType: 'event',
        name: eventName,
        summary: normalizeString(rawEvent?.summary, eventName),
        startSequenceIndex: sequenceIndex,
        timeline: {
          sequenceIndex,
          calendarId: snapshot.meta?.calendar?.calendarId || DEFAULT_WORLD_CALENDAR.calendarId,
          yearLabel: '',
          monthLabel: '',
          dayLabel: '',
          timeOfDayLabel: '',
          phase: '',
          impactLevel: 0,
          eventType: '',
        },
        effects: [],
      }
      ops.upsertEvents.push(eventWriteInput)
      currentEventNode = normalizeNode(eventWriteInput)
      nodes = upsertArrayItem(nodes, currentEventNode)
      existingEventIds.add(eventId)
    }

    const sequenceIndex = eventMode === 'continue'
      ? normalizeFiniteNumber(
        (Array.isArray(currentEventNode?.timelineSnapshots) ? currentEventNode.timelineSnapshots : [])
          .map((item) => normalizeFiniteNumber(item?.sequenceIndex, 0))
          .sort((left, right) => right - left)[0],
        normalizeFiniteNumber(currentEventNode?.timeline?.sequenceIndex, currentEventNode?.startSequenceIndex),
      )
      : normalizeFiniteNumber(currentEventNode?.timeline?.sequenceIndex, currentEventNode?.startSequenceIndex)

    const nodeGroups = new Map()
    const relationGroups = new Map()
    const eventAnchorNodeIds = new Set()
    for (const rawChange of Array.isArray(rawEvent?.changes) ? rawEvent.changes : []) {
      const changeId = normalizeString(rawChange?.id)
      const changeType = normalizeString(rawChange?.type)
      if (!changeId || !changeType) {
        warnings.push(`事件 ${eventId} 写回失败：change 缺少 id 或 type`)
        continue
      }

      const parts = changeType.split('.').map((item) => item.trim()).filter(Boolean)
      if (!parts.length) {
        warnings.push(`事件 ${eventId} 写回失败：change type 非法`)
        continue
      }

      if (parts[0] === 'relation') {
        const relationField = parts[1]
        if (!['summary', 'status', 'intensity', 'label'].includes(relationField) || parts.length !== 2) {
          warnings.push(`事件 ${eventId} 写回失败：关系 change type ${changeType} 不受支持`)
          continue
        }
        const current = relationGroups.get(changeId) || {
          id: changeId,
          summary: undefined,
          status: undefined,
          intensity: undefined,
          label: undefined,
        }
        if (relationField === 'intensity') {
          const numericValue = typeof rawChange.content === 'number' ? rawChange.content : Number(rawChange.content)
          if (!Number.isFinite(numericValue)) {
            warnings.push(`事件 ${eventId} 写回失败：关系强度必须是数字`)
            continue
          }
          current.intensity = Math.max(0, Math.min(100, Math.round(numericValue)))
        } else if (relationField === 'label') {
          current.label = normalizeString(rawChange.content)
        } else if (relationField === 'summary') {
          current.summary = normalizeString(rawChange.content)
        } else if (relationField === 'status') {
          current.status = normalizeString(rawChange.content)
        }
        relationGroups.set(changeId, current)
        const relationRefFromId = parseRelationCompositeId(changeId)
        const existingEdgeById = relationRefFromId ? null : findEdgeByRef(edges, { edgeId: changeId })
        const relationRef = existingEdgeById
          ? {
              sourceNodeId: existingEdgeById.sourceNodeId,
              targetNodeId: existingEdgeById.targetNodeId,
              relationTypeCode: existingEdgeById.relationTypeCode,
            }
          : relationRefFromId
        if (relationRef && !isAutoManagedCurrentEventRelation(relationRef, eventId)) {
          if (relationRef.sourceNodeId && relationRef.sourceNodeId !== eventId) {
            eventAnchorNodeIds.add(relationRef.sourceNodeId)
          }
          if (relationRef.targetNodeId && relationRef.targetNodeId !== eventId) {
            eventAnchorNodeIds.add(relationRef.targetNodeId)
          }
        }
        continue
      }

      const objectType = normalizeObjectType(parts[0], '')
      if (!objectType) {
        warnings.push(`事件 ${eventId} 写回失败：节点 change type ${changeType} 不受支持`)
        continue
      }

      const current = nodeGroups.get(changeId) || {
        id: changeId,
        objectType,
        name: undefined,
        summary: undefined,
        status: undefined,
        knownFacts: undefined,
        preferencesAndConstraints: undefined,
        taskProgress: undefined,
        longTermMemory: undefined,
        tags: undefined,
        attributes: {},
      }
      if (current.objectType !== objectType) {
        warnings.push(`事件 ${eventId} 写回失败：节点 ${changeId} 的对象类型冲突`)
        continue
      }

      if (parts[1] === 'attribute' && parts.length >= 3) {
        const attributeKey = parts.slice(2).join('.')
        current.attributes[attributeKey] = normalizeWritebackEventChangeContent(rawChange.content)
        if (attributeKey === 'currentStatus' && current.status === undefined) {
          current.status = normalizeString(rawChange.content)
        }
        nodeGroups.set(changeId, current)
        continue
      }

      if (parts.length !== 2) {
        warnings.push(`事件 ${eventId} 写回失败：节点 change type ${changeType} 不受支持`)
        continue
      }

      const nodeField = parts[1]
      if (nodeField === 'name') {
        current.name = normalizeString(rawChange.content)
      } else if (nodeField === 'summary') {
        current.summary = normalizeString(rawChange.content)
      } else if (nodeField === 'status') {
        current.status = normalizeString(rawChange.content)
      } else if (nodeField === 'knownFacts') {
        current.knownFacts = normalizeString(rawChange.content)
      } else if (nodeField === 'preferencesAndConstraints') {
        current.preferencesAndConstraints = normalizeString(rawChange.content)
      } else if (nodeField === 'taskProgress') {
        current.taskProgress = normalizeString(rawChange.content)
      } else if (nodeField === 'longTermMemory') {
        current.longTermMemory = normalizeString(rawChange.content)
      } else if (nodeField === 'tag') {
        const nextTag = normalizeString(rawChange.content)
        current.tags = nextTag
          ? [...(Array.isArray(current.tags) ? current.tags : []), nextTag]
          : Array.isArray(current.tags) ? current.tags : []
      } else {
        warnings.push(`事件 ${eventId} 写回失败：节点字段 ${changeType} 不受支持`)
        continue
      }
      nodeGroups.set(changeId, current)
      eventAnchorNodeIds.add(changeId)
    }

    for (const group of nodeGroups.values()) {
      const existingNode = findNodeByRef(nodes, { nodeId: group.id })
      if (!existingNode) {
        const attributes = { ...(group.attributes || {}) }
        const status = group.status !== undefined
          ? group.status
          : Object.prototype.hasOwnProperty.call(attributes, 'currentStatus')
            ? normalizeString(attributes.currentStatus)
            : ''
        if (status && !Object.prototype.hasOwnProperty.call(attributes, 'currentStatus')) {
          attributes.currentStatus = status
        }
        const newNodeInput = {
          id: group.id,
          objectType: group.objectType,
          name: group.name || group.id,
          summary: group.summary || '',
          knownFacts: group.knownFacts || '',
          preferencesAndConstraints: group.preferencesAndConstraints || '',
          taskProgress: group.taskProgress || '',
          longTermMemory: group.longTermMemory || '',
          status,
          tags: Array.isArray(group.tags) ? group.tags : [],
          attributes,
          startSequenceIndex: sequenceIndex,
        }
        ops.upsertNodes.push(newNodeInput)
        nodes = upsertArrayItem(nodes, normalizeNode(newNodeInput))
        continue
      }

      const projectedNode = projectNodeAtSequenceForWriteback(existingNode, Math.max(0, sequenceIndex - 1)) || normalizeNode(existingNode, existingNode)
      const nextAttributes = { ...(projectedNode.attributes || {}), ...(group.attributes || {}) }
      const nextStatus = group.status !== undefined
        ? group.status
        : Object.prototype.hasOwnProperty.call(group.attributes || {}, 'currentStatus')
          ? normalizeString(group.attributes.currentStatus)
          : projectedNode.status
      if (nextStatus) {
        nextAttributes.currentStatus = nextStatus
      }
      const snapshotRecord = normalizeNodeSnapshot({
        sequenceIndex,
        name: group.name !== undefined ? group.name : projectedNode.name,
        summary: group.summary !== undefined ? group.summary : projectedNode.summary,
        status: nextStatus,
        knownFacts: group.knownFacts !== undefined ? group.knownFacts : projectedNode.knownFacts,
        preferencesAndConstraints:
          group.preferencesAndConstraints !== undefined ? group.preferencesAndConstraints : projectedNode.preferencesAndConstraints,
        taskProgress: group.taskProgress !== undefined ? group.taskProgress : projectedNode.taskProgress,
        longTermMemory: group.longTermMemory !== undefined ? group.longTermMemory : projectedNode.longTermMemory,
        tags: group.tags !== undefined ? group.tags : projectedNode.tags,
        attributes: nextAttributes,
      })
      ops.appendNodeSnapshots.push({
        ref: { nodeId: existingNode.id },
        snapshot: snapshotRecord,
      })
      nodes = upsertArrayItem(nodes, normalizeNode({
        ...existingNode,
        timelineSnapshots: replaceSnapshotBySequence(existingNode.timelineSnapshots, snapshotRecord),
      }, existingNode))
    }

    for (const group of relationGroups.values()) {
      const existingEdgeById = findEdgeByRef(edges, { edgeId: group.id })
      const parsedRelationRef = parseRelationCompositeId(group.id)
      const relationRef = existingEdgeById
        ? {
            sourceNodeId: existingEdgeById.sourceNodeId,
            targetNodeId: existingEdgeById.targetNodeId,
            relationTypeCode: existingEdgeById.relationTypeCode,
          }
        : parsedRelationRef

      if (!relationRef) {
        warnings.push(`事件 ${eventId} 写回失败：关系 id ${group.id} 既不是现有关系 id，也不是合法的组合键`)
        continue
      }
      if (isAutoManagedCurrentEventRelation(relationRef, eventId)) {
        warnings.push(`事件 ${eventId} 写回提示：当前事件锚定关系 ${group.id} 由后端自动补齐，已忽略模型返回`)
        continue
      }
      if (relationRef.sourceNodeId && relationRef.sourceNodeId !== eventId) {
        eventAnchorNodeIds.add(relationRef.sourceNodeId)
      }
      if (relationRef.targetNodeId && relationRef.targetNodeId !== eventId) {
        eventAnchorNodeIds.add(relationRef.targetNodeId)
      }
      if (!findNodeByRef(nodes, { nodeId: relationRef.sourceNodeId }) || !findNodeByRef(nodes, { nodeId: relationRef.targetNodeId })) {
        warnings.push(`事件 ${eventId} 写回失败：关系 ${group.id} 引用了不存在的节点`)
        continue
      }

      const existingEdge =
        existingEdgeById
        || findEdgeByRef(edges, relationRef)
      if (!existingEdge) {
        if (!parsedRelationRef) {
          warnings.push(`事件 ${eventId} 写回失败：关系 id ${group.id} 不存在，且无法从 id 推断新关系`)
          continue
        }
        const relationType = relationTypes.find((item) => item.code === relationRef.relationTypeCode) || null
        const newEdgeInput = {
          id: group.id,
          sourceNodeId: relationRef.sourceNodeId,
          targetNodeId: relationRef.targetNodeId,
          relationTypeCode: relationRef.relationTypeCode,
          relationLabel: group.label || relationType?.label || relationRef.relationTypeCode,
          summary: group.summary || '',
          status: group.status || '',
          intensity: group.intensity ?? null,
          startSequenceIndex: sequenceIndex,
          endSequenceIndex: null,
          timelineSnapshots: [],
        }
        ops.upsertEdges.push(newEdgeInput)
        edges = upsertArrayItem(edges, normalizeEdge(newEdgeInput))
        continue
      }

      const projectedEdge = projectEdgeAtSequenceForWriteback(existingEdge, Math.max(0, sequenceIndex - 1)) || normalizeEdge(existingEdge, existingEdge)
      const effectiveRelationTypeCode = normalizeString(projectedEdge.relationTypeCode, relationRef.relationTypeCode)
      const relationType = relationTypes.find((item) => item.code === effectiveRelationTypeCode) || null
      const snapshotRecord = normalizeEdgeSnapshot({
        sequenceIndex,
        relationTypeCode: effectiveRelationTypeCode,
        relationLabel: group.label || projectedEdge.relationLabel || relationType?.label || effectiveRelationTypeCode,
        summary: group.summary !== undefined ? group.summary : projectedEdge.summary,
        status: group.status !== undefined ? group.status : projectedEdge.status,
        intensity: group.intensity !== undefined ? group.intensity : projectedEdge.intensity,
      })
      ops.appendEdgeSnapshots.push({
        ref: { edgeId: existingEdge.id },
        snapshot: snapshotRecord,
      })
      edges = upsertArrayItem(edges, normalizeEdge({
        ...existingEdge,
        timelineSnapshots: replaceSnapshotBySequence(existingEdge.timelineSnapshots, snapshotRecord),
      }, existingEdge))
    }

    if (eventMode === 'continue') {
      appendSuspiciousContinueWarnings({
        eventId,
        eventName,
        eventSummary: normalizeString(rawEvent?.summary),
        historicalEventText,
        currentAnchorNodeIds: [...eventAnchorNodeIds],
        nodes,
        edges,
        warnings,
      })
    }

    for (const nodeId of eventAnchorNodeIds) {
      const candidateNode = findNodeByRef(nodes, { nodeId })
      if (!candidateNode || candidateNode.id === eventId) {
        continue
      }

      if (['character', 'organization', 'item'].includes(candidateNode.objectType)) {
        const autoRelationRef = {
          sourceNodeId: candidateNode.id,
          targetNodeId: eventId,
          relationTypeCode: EVENT_AUTO_RELATION_CODES.participatesIn,
        }
        if (!findEdgeByRef(edges, autoRelationRef)) {
          relationTypes = ensureBuiltinRelationTypes(relationTypes, [EVENT_AUTO_RELATION_CODES.participatesIn])
          const relationType = relationTypes.find((item) => item.code === EVENT_AUTO_RELATION_CODES.participatesIn) || null
          const nextEdgeInput = {
            id: buildRelationCompositeId(candidateNode.id, EVENT_AUTO_RELATION_CODES.participatesIn, eventId),
            sourceNodeId: candidateNode.id,
            targetNodeId: eventId,
            relationTypeCode: EVENT_AUTO_RELATION_CODES.participatesIn,
            relationLabel: relationType?.label || EVENT_AUTO_RELATION_CODES.participatesIn,
            summary: '',
            status: '',
            intensity: null,
            startSequenceIndex: sequenceIndex,
            endSequenceIndex: null,
            timelineSnapshots: [],
          }
          ops.upsertEdges.push(nextEdgeInput)
          edges = upsertArrayItem(edges, normalizeEdge(nextEdgeInput))
        }
      }

      if (candidateNode.objectType === 'location') {
        const autoRelationRef = {
          sourceNodeId: eventId,
          targetNodeId: candidateNode.id,
          relationTypeCode: EVENT_AUTO_RELATION_CODES.associatedLocation,
        }
        if (!findEdgeByRef(edges, autoRelationRef)) {
          relationTypes = ensureBuiltinRelationTypes(relationTypes, [EVENT_AUTO_RELATION_CODES.associatedLocation])
          const relationType = relationTypes.find((item) => item.code === EVENT_AUTO_RELATION_CODES.associatedLocation) || null
          const nextEdgeInput = {
            id: buildRelationCompositeId(eventId, EVENT_AUTO_RELATION_CODES.associatedLocation, candidateNode.id),
            sourceNodeId: eventId,
            targetNodeId: candidateNode.id,
            relationTypeCode: EVENT_AUTO_RELATION_CODES.associatedLocation,
            relationLabel: relationType?.label || EVENT_AUTO_RELATION_CODES.associatedLocation,
            summary: '',
            status: '',
            intensity: null,
            startSequenceIndex: sequenceIndex,
            endSequenceIndex: null,
            timelineSnapshots: [],
          }
          ops.upsertEdges.push(nextEdgeInput)
          edges = upsertArrayItem(edges, normalizeEdge(nextEdgeInput))
        }
      }
    }
  }

  return { ops, warnings, relationTypes }
}

function findNodeByRef(nodes, ref) {
  if (ref.nodeId) {
    return nodes.find((item) => item.id === ref.nodeId) || null
  }
  if (!ref.name) {
    return null
  }
  const objectType = normalizeObjectType(ref.objectType, '')
  return nodes.find((item) => item.name === ref.name && (!objectType || item.objectType === objectType)) || null
}

function findEdgeByRef(edges, ref) {
  if (ref.edgeId) {
    return edges.find((item) => item.id === ref.edgeId) || null
  }
  if (!ref.sourceNodeId || !ref.targetNodeId || !ref.relationTypeCode) {
    return null
  }
  return edges.find((item) =>
    item.sourceNodeId === ref.sourceNodeId
      && item.targetNodeId === ref.targetNodeId
      && item.relationTypeCode === ref.relationTypeCode,
  ) || null
}

function buildNodeWriteInput(input, fallback = {}, forceObjectType = '') {
  return {
    ...fallback,
    ...input,
    id: normalizeString(input?.id, fallback.id),
    objectType: forceObjectType || normalizeObjectType(input?.objectType || input?.object_type, fallback.objectType || 'character'),
    startSequenceIndex:
      input?.startSequenceIndex !== undefined
        ? input.startSequenceIndex
        : input?.start_sequence_index !== undefined
          ? input.start_sequence_index
          : fallback.startSequenceIndex,
    timelineSnapshots:
      input?.timelineSnapshots !== undefined
        ? input.timelineSnapshots
        : input?.timeline_snapshots !== undefined
          ? input.timeline_snapshots
          : fallback.timelineSnapshots,
    timeline:
      input?.timeline !== undefined
        ? input.timeline
        : fallback.timeline,
    effects:
      input?.effects !== undefined
        ? input.effects
        : fallback.effects,
  }
}

function buildEdgeWriteInput(input, fallback = {}) {
  return {
    ...fallback,
    ...input,
    id: normalizeString(input?.id, fallback.id),
    sourceNodeId: normalizeString(
      input?.sourceNodeId || input?.source_node_id || input?.sourceId || input?.source_id || input?.source,
      fallback.sourceNodeId,
    ),
    targetNodeId: normalizeString(
      input?.targetNodeId || input?.target_node_id || input?.targetId || input?.target_id || input?.target,
      fallback.targetNodeId,
    ),
    relationTypeCode: normalizeString(
      input?.relationTypeCode || input?.relation_type_code || input?.relationTypeId || input?.relation_type_id || input?.relationType || input?.relation_type,
      fallback.relationTypeCode,
    ),
    relationLabel: normalizeString(input?.relationLabel || input?.relation_label, fallback.relationLabel),
    startSequenceIndex:
      input?.startSequenceIndex !== undefined
        ? input.startSequenceIndex
        : input?.start_sequence_index !== undefined
          ? input.start_sequence_index
          : fallback.startSequenceIndex,
    endSequenceIndex:
      input?.endSequenceIndex !== undefined
        ? input.endSequenceIndex
        : input?.end_sequence_index !== undefined
          ? input.end_sequence_index
          : fallback.endSequenceIndex,
    timelineSnapshots:
      input?.timelineSnapshots !== undefined
        ? input.timelineSnapshots
        : input?.timeline_snapshots !== undefined
          ? input.timeline_snapshots
          : fallback.timelineSnapshots,
  }
}

export function applyWorldGraphWritebackToSnapshot(graph, input) {
  const snapshot = normalizeWorldGraphSnapshot(graph)
  const normalizedOps = normalizeWorldGraphWritebackOps(input)
  const materialized = materializeEventDrivenWritebackOps(snapshot, normalizedOps)
  const ops = mergeNormalizedWritebackOps(normalizedOps, materialized.ops)
  let nodes = [...snapshot.nodes]
  let edges = [...snapshot.edges]
  const warnings = [...materialized.warnings]
  let appliedNodeCount = 0
  let appliedEdgeCount = 0
  let appliedEffectCount = 0
  let appliedSnapshotCount = 0

  for (const rawNode of [...ops.upsertNodes, ...ops.upsertEvents.map((item) => ({ ...item, objectType: 'event' }))]) {
    try {
      const fallback = findNodeByRef(nodes, normalizeWritebackNodeRef(rawNode)) || undefined
      const nextNode = normalizeNode(
        buildNodeWriteInput(rawNode, fallback, rawNode.objectType === 'event' ? 'event' : ''),
        fallback,
      )
      nodes = upsertArrayItem(nodes, nextNode)
      appliedNodeCount += 1
    } catch (error) {
      warnings.push(`节点写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const rawEdge of ops.upsertEdges) {
    try {
      const fallback = findEdgeByRef(edges, normalizeWritebackEdgeRef(rawEdge)) || undefined
      const nextEdge = normalizeEdge(buildEdgeWriteInput(rawEdge, fallback), fallback)
      edges = upsertArrayItem(edges, nextEdge)
      appliedEdgeCount += 1
    } catch (error) {
      warnings.push(`关系写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const item of ops.appendNodeSnapshots) {
    try {
      const target = findNodeByRef(nodes, item.ref)
      if (!target) {
        warnings.push('节点快照写回失败：目标节点不存在')
        continue
      }
      nodes = upsertArrayItem(nodes, normalizeNode({
        ...target,
        timelineSnapshots: replaceSnapshotBySequence(target.timelineSnapshots, item.snapshot),
      }, target))
      appliedSnapshotCount += 1
    } catch (error) {
      warnings.push(`节点快照写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const item of ops.appendEdgeSnapshots) {
    try {
      const target = findEdgeByRef(edges, item.ref)
      if (!target) {
        warnings.push('关系快照写回失败：目标关系不存在')
        continue
      }
      edges = upsertArrayItem(edges, normalizeEdge({
        ...target,
        timelineSnapshots: replaceSnapshotBySequence(target.timelineSnapshots, item.snapshot),
      }, target))
      appliedSnapshotCount += 1
    } catch (error) {
      warnings.push(`关系快照写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const item of ops.appendEventEffects) {
    try {
      const target = findNodeByRef(nodes, item.ref)
      if (!target || target.objectType !== 'event') {
        warnings.push('事件影响写回失败：目标事件不存在')
        continue
      }
      const nextEffects = item.effects.reduce((collection, effect) => upsertEffectById(collection, effect), target.effects)
      nodes = upsertArrayItem(nodes, normalizeNode({
        ...target,
        effects: nextEffects,
      }, target))
      appliedEffectCount += item.effects.length
    } catch (error) {
      warnings.push(`事件影响写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  return {
    graph: normalizeWorldGraphSnapshot({
      ...snapshot,
      meta: {
        ...snapshot.meta,
        graphVersion: Math.max(snapshot.meta.graphVersion, 0) + (appliedNodeCount || appliedEdgeCount || appliedEffectCount || appliedSnapshotCount ? 1 : 0),
      },
      relationTypes: materialized.relationTypes,
      nodes,
      edges,
    }),
    appliedNodeCount,
    appliedEdgeCount,
    appliedEffectCount,
    appliedSnapshotCount,
    warnings,
  }
}

export async function applyWorldGraphWritebackOps(user, robotId, input) {
  await ensureGraphMeta(user, robotId)
  const currentGraph = await getConfiguredWorldGraph(user, robotId)
  const normalizedOps = normalizeWorldGraphWritebackOps(input)
  const materialized = materializeEventDrivenWritebackOps(currentGraph, normalizedOps)
  const ops = mergeNormalizedWritebackOps(normalizedOps, materialized.ops)
  let nodes = [...currentGraph.nodes]
  let edges = [...currentGraph.edges]
  const warnings = [...materialized.warnings]
  let appliedNodeCount = 0
  let appliedEdgeCount = 0
  let appliedEffectCount = 0
  let appliedSnapshotCount = 0

  for (const rawNode of [...ops.upsertNodes, ...ops.upsertEvents.map((item) => ({ ...item, objectType: 'event' }))]) {
    try {
      const fallback = findNodeByRef(nodes, normalizeWritebackNodeRef(rawNode)) || undefined
      const saved = await saveWorldNode(
        user,
        robotId,
        buildNodeWriteInput(rawNode, fallback, rawNode.objectType === 'event' ? 'event' : ''),
      )
      nodes = upsertArrayItem(nodes, saved)
      appliedNodeCount += 1
    } catch (error) {
      warnings.push(`节点写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const rawEdge of ops.upsertEdges) {
    try {
      const fallback = findEdgeByRef(edges, normalizeWritebackEdgeRef(rawEdge)) || undefined
      const saved = await saveWorldEdge(user, robotId, buildEdgeWriteInput(rawEdge, fallback))
      edges = upsertArrayItem(edges, saved)
      appliedEdgeCount += 1
    } catch (error) {
      warnings.push(`关系写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const item of ops.appendNodeSnapshots) {
    try {
      const target = findNodeByRef(nodes, item.ref)
      if (!target) {
        warnings.push('节点快照写回失败：目标节点不存在')
        continue
      }
      const saved = await saveWorldNode(user, robotId, {
        ...target,
        timelineSnapshots: replaceSnapshotBySequence(target.timelineSnapshots, item.snapshot),
      })
      nodes = upsertArrayItem(nodes, saved)
      appliedSnapshotCount += 1
    } catch (error) {
      warnings.push(`节点快照写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const item of ops.appendEdgeSnapshots) {
    try {
      const target = findEdgeByRef(edges, item.ref)
      if (!target) {
        warnings.push('关系快照写回失败：目标关系不存在')
        continue
      }
      const saved = await saveWorldEdge(user, robotId, {
        ...target,
        timelineSnapshots: replaceSnapshotBySequence(target.timelineSnapshots, item.snapshot),
      })
      edges = upsertArrayItem(edges, saved)
      appliedSnapshotCount += 1
    } catch (error) {
      warnings.push(`关系快照写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  for (const item of ops.appendEventEffects) {
    try {
      const target = findNodeByRef(nodes, item.ref)
      if (!target || target.objectType !== 'event') {
        warnings.push('事件影响写回失败：目标事件不存在')
        continue
      }
      const nextEffects = item.effects.reduce((collection, effect) => upsertEffectById(collection, effect), target.effects)
      const saved = await saveWorldNode(user, robotId, {
        ...target,
        effects: nextEffects,
      })
      nodes = upsertArrayItem(nodes, saved)
      appliedEffectCount += item.effects.length
    } catch (error) {
      warnings.push(`事件影响写回失败：${error instanceof Error ? error.message : '未知错误'}`)
    }
  }

  return {
    appliedNodeCount,
    appliedEdgeCount,
    appliedEffectCount,
    appliedSnapshotCount,
    warnings,
  }
}
