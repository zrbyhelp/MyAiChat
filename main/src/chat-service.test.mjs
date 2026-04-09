import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWorldGraphWritebackToSessionGraph,
  buildWorldGraphBackgroundAgentRequest,
  extractAgentServiceErrorMessage,
  hydrateBackgroundAgentRequest,
  mapAgentEventToChatEvents,
  mergeSessionPostProcessingResult,
  resolveEffectiveMemorySchema,
  shouldRunWorldGraphBackgroundJob,
} from './chat-service.mjs'

test('extracts agent service detail/message from non-200 payloads', () => {
  assert.equal(
    extractAgentServiceErrorMessage('{"detail":"聊天失败：智能体「当前智能体」主回复阶段失败：上游超时"}'),
    '聊天失败：智能体「当前智能体」主回复阶段失败：上游超时',
  )
  assert.equal(
    extractAgentServiceErrorMessage('{"message":"结构化记忆后台任务失败"}'),
    '结构化记忆后台任务失败',
  )
  assert.equal(extractAgentServiceErrorMessage('not-json'), '')
})

test('prefers updated requested memory schema over stale session schema', () => {
  const resolved = resolveEffectiveMemorySchema(
    {
      categories: [
        {
          id: 'old',
          label: '旧类别',
          description: '',
          fields: [{ id: 'name', name: 'name', label: '名称', type: 'text', required: true }],
        },
      ],
    },
    {
      categories: [
        {
          id: 'character',
          label: '角色',
          description: '',
          fields: [{ id: 'name', name: 'name', label: '名称', type: 'text', required: true }],
        },
      ],
    },
  )

  assert.equal(resolved.categories[0]?.id, 'character')
})

test('hydrates background agent request with latest structural state but keeps snapshot runtime context', () => {
  const hydrated = hydrateBackgroundAgentRequest(
    {
      prompt: '继续',
      final_response: '最新回复',
      history: [{ role: 'user', content: '旧历史' }],
      memory_schema: {
        categories: [
          {
            id: 'old',
            label: '旧类别',
            description: '',
            fields: [{ id: 'name', name: 'name', label: '名称', type: 'text', required: true }],
          },
        ],
      },
      structured_memory: { updated_at: '', categories: [] },
      numeric_state: { hp: 1 },
      story_outline: '旧梗概',
      world_graph: { meta: { robotId: 'robot-1', graphVersion: 1 }, nodes: [], edges: [], relationTypes: [] },
    },
    {
      memorySchema: {
        categories: [
          {
            id: 'character',
            label: '角色',
            description: '',
            fields: [{ id: 'name', name: 'name', label: '名称', type: 'text', required: true }],
          },
        ],
      },
      structuredMemory: {
        updatedAt: '2026-04-01T00:00:00Z',
        categories: [{ categoryId: 'character', label: '角色', description: '', updatedAt: '', items: [] }],
      },
      numericState: { hp: 10 },
      storyOutline: '新梗概',
      worldGraph: { meta: { robotId: 'robot-1', graphVersion: 2 }, nodes: [], edges: [], relationTypes: [] },
    },
  )

  assert.equal(hydrated.prompt, '继续')
  assert.deepEqual(hydrated.history, [{ role: 'user', content: '旧历史' }])
  assert.equal(hydrated.memory_schema.categories[0]?.id, 'character')
  assert.equal(hydrated.structured_memory.updatedAt, '2026-04-01T00:00:00Z')
  assert.deepEqual(hydrated.numeric_state, { hp: 1 })
  assert.deepEqual(hydrated.story_outline, {
    storyDraft: { characters: [], items: [], organizations: [], locations: [], events: [] },
    retrievalQuery: '',
  })
  assert.equal(hydrated.world_graph.meta.graphVersion, 2)
})

test('omits memory schema from world graph background request while keeping latest structural context', () => {
  const requestBody = buildWorldGraphBackgroundAgentRequest(
    {
      prompt: '继续',
      final_response: '最新回复',
      history: [{ role: 'user', content: '旧历史' }],
      memory_schema: {
        categories: [
          {
            id: 'old',
            label: '旧类别',
            description: '',
            fields: [{ id: 'name', name: 'name', label: '名称', type: 'text', required: true }],
          },
        ],
      },
      structured_memory: { updated_at: '', categories: [] },
      numeric_state: { hp: 1 },
      story_outline: '旧梗概',
      world_graph: { meta: { robotId: 'robot-1', graphVersion: 1 }, nodes: [], edges: [], relationTypes: [] },
    },
    {
      memorySchema: {
        categories: [
          {
            id: 'character',
            label: '角色',
            description: '',
            fields: [{ id: 'name', name: 'name', label: '名称', type: 'text', required: true }],
          },
        ],
      },
      structuredMemory: {
        updatedAt: '2026-04-01T00:00:00Z',
        categories: [{ categoryId: 'character', label: '角色', description: '', updatedAt: '', items: [] }],
      },
      worldGraph: { meta: { robotId: 'robot-1', graphVersion: 2 }, nodes: [], edges: [], relationTypes: [] },
    },
  )

  assert.equal('memory_schema' in requestBody, false)
  assert.equal('memorySchema' in requestBody, false)
  assert.equal(requestBody.structured_memory.updatedAt, '2026-04-01T00:00:00Z')
  assert.equal(requestBody.world_graph.meta.graphVersion, 2)
  assert.deepEqual(requestBody.numeric_state, { hp: 1 })
  assert.deepEqual(requestBody.story_outline, {
    storyDraft: { characters: [], items: [], organizations: [], locations: [], events: [] },
    retrievalQuery: '',
  })
})

test('merges post-processing results with a single usage accumulation', () => {
  const merged = mergeSessionPostProcessingResult(
    {
      id: 'session-1',
      threadId: 'thread-1',
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      usage: { promptTokens: 10, completionTokens: 6 },
      structuredMemory: {
        updatedAt: '2026-04-01T00:00:00Z',
        longTermMemory: '旧长期记忆',
        shortTermMemory: '旧短期记忆',
      },
      worldGraph: {
        meta: { robotId: 'robot-1', graphVersion: 1 },
        relationTypes: [],
        nodes: [],
        edges: [],
      },
      messages: [],
    },
    {
      memory: {
        updatedAt: '2026-04-02T00:00:00Z',
        longTermMemory: '新长期记忆',
        shortTermMemory: '新短期记忆',
      },
      usage: { promptTokens: 2, completionTokens: 1 },
    },
    {
      graph: {
        meta: { robotId: 'robot-1', graphVersion: 2 },
        relationTypes: [],
        nodes: [{ id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] }],
        edges: [],
      },
      usage: { promptTokens: 3, completionTokens: 4 },
    },
  )

  assert.equal(merged.structuredMemory.longTermMemory, '新长期记忆')
  assert.equal(merged.structuredMemory.shortTermMemory, '新短期记忆')
  assert.equal(merged.worldGraph.meta.graphVersion, 2)
  assert.equal(merged.usage.promptTokens, 15)
  assert.equal(merged.usage.completionTokens, 11)
})

test('merges post-processing results without overwriting the healthy side on partial failure', () => {
  const merged = mergeSessionPostProcessingResult(
    {
      id: 'session-1',
      threadId: 'thread-1',
      createdAt: '2026-04-01T00:00:00Z',
      updatedAt: '2026-04-01T00:00:00Z',
      usage: { promptTokens: 5, completionTokens: 5 },
      structuredMemory: {
        updatedAt: '2026-04-01T00:00:00Z',
        longTermMemory: '保留旧长期记忆',
        shortTermMemory: '保留旧短期记忆',
      },
      worldGraph: {
        meta: { robotId: 'robot-1', graphVersion: 1 },
        relationTypes: [],
        nodes: [],
        edges: [],
      },
      messages: [],
    },
    {
      memory: {
        updatedAt: '2026-04-02T00:00:00Z',
        longTermMemory: '新的长期记忆',
        shortTermMemory: '新的短期记忆',
      },
      usage: { promptTokens: 1, completionTokens: 1 },
    },
    {
      graph: null,
      usage: { promptTokens: 0, completionTokens: 0 },
    },
  )

  assert.equal(merged.structuredMemory.longTermMemory, '新的长期记忆')
  assert.equal(merged.worldGraph.meta.graphVersion, 1)
  assert.equal(merged.usage.promptTokens, 6)
  assert.equal(merged.usage.completionTokens, 6)
})

test('applies world graph writeback only to session snapshot state', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 2, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '初始状态', attributes: {}, timelineSnapshots: [] },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    upsert_nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '会话内更新后的状态' },
      { id: 'new-event', objectType: 'event', name: '发现古墓', summary: '新事件' },
    ],
  })

  assert.equal(result.persistenceMode, 'session-snapshot')
  assert.equal(result.appliedNodeCount, 2)
  assert.equal(result.graph.meta.graphVersion, 3)
  assert.equal(originalGraph.meta.graphVersion, 2)
  assert.equal(originalGraph.nodes[0]?.summary, '初始状态')
  assert.equal(result.graph.nodes.find((item) => item.id === 'hero')?.summary, '会话内更新后的状态')
  assert.equal(result.graph.nodes.find((item) => item.id === 'new-event')?.objectType, 'event')
})

test('keeps event timeline and appended effects in session snapshot writeback', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 1, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '初始状态', attributes: {}, timelineSnapshots: [] },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    upsert_events: [
      {
        id: 'event-1',
        objectType: 'event',
        name: '进入墓道',
        summary: '吴邪进入墓道。',
        timeline: { sequenceIndex: 1, phase: '入墓', impactLevel: 60, eventType: 'arrival' },
      },
    ],
    append_event_effects: [
      {
        ref: { nodeId: 'event-1' },
        effects: [
          {
            id: 'event-1-effect-1',
            summary: '吴邪从好奇转为警惕。',
            targetNodeId: 'hero',
            changeTargetType: 'node-content',
            nodeAttributeChanges: [
              { fieldKey: 'currentStatus', beforeValue: '好奇', afterValue: '警惕' },
            ],
          },
        ],
      },
    ],
  })

  assert.equal(result.graph.nodes.find((item) => item.id === 'event-1')?.timeline?.sequenceIndex, 1)
  assert.equal(result.graph.nodes.find((item) => item.id === 'event-1')?.effects[0]?.targetNodeId, 'hero')
})

test('materializes event-stream writeback into timeline events and relation edges', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 3, title: '模板图谱' },
    relationTypes: [
      {
        id: 'relation-type:ally',
        code: 'ally',
        label: '同伴',
        description: '',
        directionality: 'directed',
        sourceObjectTypes: ['character'],
        targetObjectTypes: ['character'],
        isBuiltin: false,
      },
    ],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'partner', objectType: 'character', name: '小哥', summary: '同伴', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-4',
        objectType: 'event',
        name: '旧事件',
        summary: '已有事件',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 4,
        timeline: { sequenceIndex: 4, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    events: [
      {
        id: 'event-5',
        name: '正式结盟',
        summary: '两人决定同行。',
        changes: [
          { id: 'hero', type: 'character.status', content: '警惕' },
          { id: 'hero|ally|partner', type: 'relation.summary', content: '正式结盟' },
        ],
      },
      {
        id: 'event-6',
        name: '关系加深',
        summary: '协作更加稳定。',
        changes: [
          { id: 'hero|ally|partner', type: 'relation.status', content: '稳定' },
        ],
      },
    ],
  })

  const createdEdge = result.graph.edges.find((item) => item.id === 'hero|ally|partner')
  assert.equal(result.graph.nodes.find((item) => item.id === 'event-5')?.timeline?.sequenceIndex, 5)
  assert.equal(result.graph.nodes.find((item) => item.id === 'event-6')?.timeline?.sequenceIndex, 6)
  assert.equal(createdEdge?.startSequenceIndex, 5)
  assert.equal(createdEdge?.summary, '正式结盟')
  assert.equal(createdEdge?.timelineSnapshots[0]?.sequenceIndex, 6)
  assert.equal(createdEdge?.timelineSnapshots[0]?.status, '稳定')
})

test('materializes compact event-stream writeback and falls back event summary to name', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 2, title: '模板图谱' },
    relationTypes: [
      {
        id: 'relation-type:located_in',
        code: 'located_in',
        label: '位于',
        description: '',
        directionality: 'directed',
        sourceObjectTypes: ['character'],
        targetObjectTypes: ['location'],
        isBuiltin: false,
      },
    ],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-2',
        objectType: 'event',
        name: '旧事件',
        summary: '已有事件',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 2,
        timeline: { sequenceIndex: 2, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-3',
        n: '进入角色创建空间',
        c: [
          { i: 'hero', t: 'character.summary', v: '吴邪开始确认当前位置。' },
          { i: 'hero', t: 'c.tp', v: '进入角色创建阶段' },
          { i: 'location_character_creation_space', t: 'l.n', v: '角色创建空间' },
          { i: 'location_character_creation_space', t: 'l.s', v: '虚拟角色创建界面。' },
          { i: 'hero|located_in|location_character_creation_space', t: 'r.s', v: '吴邪目前位于角色创建空间。' },
        ],
      },
    ],
  })

  const createdEvent = result.graph.nodes.find((item) => item.id === 'event-3')
  const updatedHero = result.graph.nodes.find((item) => item.id === 'hero')
  const createdLocation = result.graph.nodes.find((item) => item.id === 'location_character_creation_space')
  const createdEdge = result.graph.edges.find((item) => item.id === 'hero|located_in|location_character_creation_space')
  const eventParticipantEdge = result.graph.edges.find((item) => item.id === 'hero|participates_in|event-3')
  const eventLocationEdge = result.graph.edges.find((item) => item.id === 'event-3|associated_location|location_character_creation_space')

  assert.equal(createdEvent?.timeline?.sequenceIndex, 3)
  assert.equal(createdEvent?.summary, '进入角色创建空间')
  assert.equal(updatedHero?.timelineSnapshots[0]?.taskProgress, '进入角色创建阶段')
  assert.equal(createdLocation?.name, '角色创建空间')
  assert.equal(createdLocation?.summary, '虚拟角色创建界面。')
  assert.equal(createdEdge?.summary, '吴邪目前位于角色创建空间。')
  assert.equal(eventParticipantEdge?.sourceNodeId, 'hero')
  assert.equal(eventParticipantEdge?.targetNodeId, 'event-3')
  assert.equal(eventParticipantEdge?.summary, '')
  assert.equal(eventLocationEdge?.sourceNodeId, 'event-3')
  assert.equal(eventLocationEdge?.targetNodeId, 'location_character_creation_space')
  assert.equal(eventLocationEdge?.relationTypeCode, 'associated_location')
  assert.equal(result.graph.relationTypes.some((item) => item.code === 'associated_location'), true)
})

test('folds malformed top-level node and relation records back into the preceding event', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 3, title: '模板图谱' },
    relationTypes: [
      {
        id: 'relation-type:participates_in',
        code: 'participates_in',
        label: '参与',
        description: '',
        directionality: 'directed',
        sourceObjectTypes: ['character'],
        targetObjectTypes: ['event'],
        isBuiltin: false,
      },
    ],
    nodes: [
      { id: 'character-1', objectType: 'character', name: 'CCC', summary: '玩家', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-3',
        objectType: 'event',
        name: '旧事件',
        summary: '已有事件',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 3,
        timeline: { sequenceIndex: 3, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-4',
        n: '玩家CCC选择天使阵营',
        s: '玩家CCC在阵营分支选择中确认了天使阵营。',
        c: [
          { i: 'event-4', t: 'c.n', v: '玩家CCC选择天使阵营' },
          { i: 'event-4', t: 'c.s', v: '玩家CCC在阵营分支选择中确认了天使阵营。' },
        ],
      },
      {
        i: 'character-1',
        n: 'CCC',
        c: [
          { i: 'character-1', t: 'c.st', v: '角色创建中' },
          { i: 'character-1', t: 'c.kf', v: '已选择天使阵营。' },
          { i: 'character-1', t: 'c.tp', v: '步骤4：选择初始职业方向' },
        ],
      },
      {
        i: 'character-1|participates_in|event-4',
        c: [
          { i: 'character-1|participates_in|event-4', t: 'r.s', v: '玩家CCC完成了阵营选择。' },
        ],
      },
    ],
  })

  const eventNode = result.graph.nodes.find((item) => item.id === 'event-4')
  const characterNode = result.graph.nodes.find((item) => item.id === 'character-1')
  const relationEdge = result.graph.edges.find((item) => item.id === 'character-1|participates_in|event-4')

  assert.equal(eventNode?.objectType, 'event')
  assert.equal(eventNode?.timeline?.sequenceIndex, 4)
  assert.equal(characterNode?.objectType, 'character')
  assert.equal(characterNode?.timelineSnapshots[0]?.status, '角色创建中')
  assert.equal(characterNode?.timelineSnapshots[0]?.taskProgress, '步骤4：选择初始职业方向')
  assert.equal(relationEdge?.summary, '')
  assert.match(result.warnings.join('\n'), /顶层节点记录/)
  assert.match(result.warnings.join('\n'), /指向了事件自身/)
  assert.match(result.warnings.join('\n'), /后端自动补齐/)
})

test('auto-completes current event anchor relations and ignores model-returned event anchor edges', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 1, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'character_new_player', objectType: 'character', name: '新玩家', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'location_spawn_room', objectType: 'location', name: '出生房间', summary: '初始场景', attributes: {}, timelineSnapshots: [] },
      { id: 'character_hidden_npc', objectType: 'character', name: '无关角色', summary: '不应被当前事件牵连', attributes: {}, timelineSnapshots: [] },
      { id: 'location_hidden_forest', objectType: 'location', name: '无关地点', summary: '不应被当前事件牵连', attributes: {}, timelineSnapshots: [] },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-2',
        n: '玩家确认出生位置',
        c: [
          { i: 'character_new_player', t: 'c.st', v: '等待选择职业' },
          { i: 'location_spawn_room', t: 'l.s', v: '角色创建后的等待区。' },
          { i: 'character_new_player|participates_in|event-2', t: 'r.s', v: '玩家完成位置确认。' },
          { i: 'event-2|associated_location|location_spawn_room', t: 'r.s', v: '当前事件与出生房间相关。' },
          { i: 'character_hidden_npc|participates_in|event-2', t: 'r.s', v: '无关角色被模型误判为参与当前事件。' },
          { i: 'event-2|associated_location|location_hidden_forest', t: 'r.s', v: '无关地点被模型误判为当前事件关联地点。' },
        ],
      },
    ],
  })

  const participantEdge = result.graph.edges.find((item) => item.id === 'character_new_player|participates_in|event-2')
  const locationEdge = result.graph.edges.find((item) => item.id === 'event-2|associated_location|location_spawn_room')
  const unrelatedParticipantEdge = result.graph.edges.find((item) => item.id === 'character_hidden_npc|participates_in|event-2')
  const unrelatedLocationEdge = result.graph.edges.find((item) => item.id === 'event-2|associated_location|location_hidden_forest')

  assert.equal(participantEdge?.summary, '')
  assert.equal(locationEdge?.summary, '')
  assert.equal(participantEdge?.startSequenceIndex, 1)
  assert.equal(locationEdge?.startSequenceIndex, 1)
  assert.equal(unrelatedParticipantEdge, undefined)
  assert.equal(unrelatedLocationEdge, undefined)
  assert.equal(result.graph.relationTypes.some((item) => item.code === 'participates_in'), true)
  assert.equal(result.graph.relationTypes.some((item) => item.code === 'associated_location'), true)
  assert.match(result.warnings.join('\n'), /后端自动补齐/)
})

test('auto-completes event anchor relations from stable relation endpoints', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 3, title: '模板图谱' },
    relationTypes: [
      {
        id: 'relation-type:ally',
        code: 'ally',
        label: '同伴',
        description: '',
        directionality: 'directed',
        sourceObjectTypes: ['character'],
        targetObjectTypes: ['character'],
        isBuiltin: false,
      },
    ],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'partner', objectType: 'character', name: '小哥', summary: '同伴', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-3',
        objectType: 'event',
        name: '旧事件',
        summary: '已有事件',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 3,
        timeline: { sequenceIndex: 3, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-4',
        n: '双方正式结盟',
        c: [
          { i: 'hero|ally|partner', t: 'r.s', v: '双方决定结成稳定同盟。' },
        ],
      },
    ],
  })

  const heroEventEdge = result.graph.edges.find((item) => item.id === 'hero|participates_in|event-4')
  const partnerEventEdge = result.graph.edges.find((item) => item.id === 'partner|participates_in|event-4')

  assert.equal(heroEventEdge?.sourceNodeId, 'hero')
  assert.equal(heroEventEdge?.targetNodeId, 'event-4')
  assert.equal(partnerEventEdge?.sourceNodeId, 'partner')
  assert.equal(partnerEventEdge?.targetNodeId, 'event-4')
})

test('auto-repairs polluted event nodes whose ids clearly belong to non-event objects', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 5, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      {
        id: 'character-1',
        objectType: 'event',
        name: 'CCC',
        summary: '被错误写成事件的角色',
        knownFacts: '仍然保留角色事实',
        taskProgress: '步骤4：选择职业',
        status: '角色创建中',
        attributes: { race: '天使' },
        timelineSnapshots: [],
        startSequenceIndex: 4,
        timeline: { sequenceIndex: 4, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, null)
  const repairedNode = result.graph.nodes.find((item) => item.id === 'character-1')

  assert.equal(repairedNode?.objectType, 'character')
  assert.equal(repairedNode?.timeline, null)
  assert.equal(Array.isArray(repairedNode?.effects) ? repairedNode.effects.length : 0, 0)
  assert.equal(repairedNode?.status, '角色创建中')
  assert.equal(repairedNode?.taskProgress, '步骤4：选择职业')
  assert.equal(repairedNode?.attributes?.race, '天使')
})

test('updates an existing relation when event-stream change id is a relation id', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 1, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'partner', objectType: 'character', name: '小哥', summary: '同伴', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-1',
        objectType: 'event',
        name: '相遇',
        summary: '第一次相遇',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 1,
        timeline: { sequenceIndex: 1, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [
      {
        id: 'edge-hero-partner',
        sourceNodeId: 'hero',
        targetNodeId: 'partner',
        relationTypeCode: 'ally',
        relationLabel: '同伴',
        summary: '初步合作',
        directionality: 'directed',
        intensity: 30,
        status: '观察',
        startSequenceIndex: 1,
        endSequenceIndex: null,
        timelineSnapshots: [],
      },
    ],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    events: [
      {
        id: 'event-2',
        name: '协作升级',
        summary: '双方建立更稳固的联系。',
        changes: [
          { id: 'edge-hero-partner', type: 'relation.summary', content: '默契显著提升' },
          { id: 'edge-hero-partner', type: 'relation.intensity', content: 80 },
        ],
      },
    ],
  })

  const updatedEdge = result.graph.edges.find((item) => item.id === 'edge-hero-partner')
  assert.equal(result.graph.nodes.find((item) => item.id === 'event-2')?.timeline?.sequenceIndex, 2)
  assert.equal(updatedEdge?.timelineSnapshots[0]?.summary, '默契显著提升')
  assert.equal(updatedEdge?.timelineSnapshots[0]?.intensity, 80)
})

test('generates a fallback event id when compact event-stream record omits its id', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 2, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'character-1', objectType: 'character', name: 'CCC', summary: '玩家', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-2',
        objectType: 'event',
        name: '旧事件',
        summary: '已有事件',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 2,
        timeline: { sequenceIndex: 2, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: '',
        n: 'CCC接受调查任务',
        c: [
          { i: 'character-1', t: 'c.tp', v: '接受了新的调查任务' },
        ],
      },
    ],
  })

  const generatedEvent = result.graph.nodes.find((item) => item.objectType === 'event' && item.name === 'CCC接受调查任务')
  const characterNode = result.graph.nodes.find((item) => item.id === 'character-1')

  assert.ok(generatedEvent)
  assert.match(generatedEvent.id, /^event-auto-/)
  assert.equal(generatedEvent.timeline?.sequenceIndex, 3)
  assert.equal(characterNode?.timelineSnapshots[0]?.taskProgress, '接受了新的调查任务')
  assert.match(result.warnings.join('\n'), /缺少 id/)
})

test('continues an existing event on a new sequence point without creating a duplicate event node', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 2, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-2',
        objectType: 'event',
        name: '调查启动',
        summary: '调查刚刚开始。',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 2,
        timeline: { sequenceIndex: 2, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-2',
        m: 'continue',
        n: '调查推进到取证阶段',
        c: [
          { i: 'hero', t: 'c.tp', v: '开始整理取证结果' },
        ],
      },
    ],
  })

  const eventNodes = result.graph.nodes.filter((item) => item.id === 'event-2')
  const eventNode = eventNodes[0]
  const heroNode = result.graph.nodes.find((item) => item.id === 'hero')
  const participantEdge = result.graph.edges.find((item) => item.id === 'hero|participates_in|event-2')

  assert.equal(eventNodes.length, 1)
  assert.equal(eventNode?.timeline?.sequenceIndex, 2)
  assert.equal(eventNode?.timelineSnapshots[0]?.sequenceIndex, 3)
  assert.equal(eventNode?.timelineSnapshots[0]?.name, '调查推进到取证阶段')
  assert.equal(eventNode?.timelineSnapshots[0]?.summary, '调查刚刚开始。')
  assert.equal(heroNode?.timelineSnapshots[0]?.sequenceIndex, 3)
  assert.equal(heroNode?.timelineSnapshots[0]?.taskProgress, '开始整理取证结果')
  assert.equal(participantEdge?.targetNodeId, 'event-2')
  assert.equal(participantEdge?.startSequenceIndex, 3)
})

test('does not warn for continue when current anchors still overlap the historical event anchors', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 2, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'location_archive', objectType: 'location', name: '档案室', summary: '调查地点', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-2',
        objectType: 'event',
        name: '调查启动',
        summary: '调查刚刚开始。',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 2,
        timeline: { sequenceIndex: 2, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [
      {
        id: 'hero|participates_in|event-2',
        sourceNodeId: 'hero',
        targetNodeId: 'event-2',
        relationTypeCode: 'participates_in',
        relationLabel: '参与',
        summary: '',
        directionality: 'directed',
        intensity: null,
        status: '',
        startSequenceIndex: 2,
        endSequenceIndex: null,
        timelineSnapshots: [],
      },
      {
        id: 'event-2|associated_location|location_archive',
        sourceNodeId: 'event-2',
        targetNodeId: 'location_archive',
        relationTypeCode: 'associated_location',
        relationLabel: '关联地点',
        summary: '',
        directionality: 'directed',
        intensity: null,
        status: '',
        startSequenceIndex: 2,
        endSequenceIndex: null,
        timelineSnapshots: [],
      },
    ],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-2',
        m: 'continue',
        n: '调查进入档案比对阶段',
        s: '吴邪继续在档案室比对旧记录，准备缩小目标范围。',
        c: [
          { i: 'hero', t: 'c.tp', v: '开始比对旧记录' },
          { i: 'location_archive', t: 'l.s', v: '档案室里堆满了待核对的旧卷宗。' },
        ],
      },
    ],
  })

  assert.equal(result.graph.nodes.find((item) => item.id === 'event-2')?.timelineSnapshots[0]?.name, '调查进入档案比对阶段')
  assert.equal(result.warnings.some((item) => item.includes('疑似误续写')), false)
})

test('warns but keeps writeback when continue event anchors and title drift away from the historical event', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 2, title: '模板图谱' },
    relationTypes: [
      {
        id: 'relation-type:located_in',
        code: 'located_in',
        label: '位于',
        description: '',
        directionality: 'directed',
        sourceObjectTypes: ['character'],
        targetObjectTypes: ['location'],
        isBuiltin: false,
      },
    ],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'villain', objectType: 'character', name: '森林狼', summary: '遭遇敌人', attributes: {}, timelineSnapshots: [] },
      { id: 'location_archive', objectType: 'location', name: '档案室', summary: '调查地点', attributes: {}, timelineSnapshots: [] },
      { id: 'location_ruins', objectType: 'location', name: '废墟外围', summary: '野外地点', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-2',
        objectType: 'event',
        name: '调查启动',
        summary: '调查刚刚开始。',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 2,
        timeline: { sequenceIndex: 2, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [
      {
        id: 'hero|participates_in|event-2',
        sourceNodeId: 'hero',
        targetNodeId: 'event-2',
        relationTypeCode: 'participates_in',
        relationLabel: '参与',
        summary: '',
        directionality: 'directed',
        intensity: null,
        status: '',
        startSequenceIndex: 2,
        endSequenceIndex: null,
        timelineSnapshots: [],
      },
      {
        id: 'event-2|associated_location|location_archive',
        sourceNodeId: 'event-2',
        targetNodeId: 'location_archive',
        relationTypeCode: 'associated_location',
        relationLabel: '关联地点',
        summary: '',
        directionality: 'directed',
        intensity: null,
        status: '',
        startSequenceIndex: 2,
        endSequenceIndex: null,
        timelineSnapshots: [],
      },
    ],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-2',
        m: 'continue',
        n: '野外遭遇战爆发',
        s: '角色在废墟外围与森林狼展开战斗。',
        c: [
          { i: 'villain', t: 'c.st', v: '已锁定目标' },
          { i: 'location_ruins', t: 'l.s', v: '废墟外围已经变成临时战场。' },
          { i: 'villain|located_in|location_ruins', t: 'r.s', v: '森林狼盘踞在废墟外围。' },
        ],
      },
    ],
  })

  assert.equal(result.graph.nodes.find((item) => item.id === 'event-2')?.timelineSnapshots[0]?.name, '野外遭遇战爆发')
  assert.match(result.warnings.join('\n'), /疑似误续写：事件 event-2 当前 continue 与历史事件锚点脱节/)
  assert.match(result.warnings.join('\n'), /疑似误续写：事件 event-2 的标题或概述疑似切换到新事件/)
})

test('supports multiple main event records including repeated continue records for the same event', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 4, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      {
        id: 'event-2',
        objectType: 'event',
        name: '调查启动',
        summary: '调查刚刚开始。',
        attributes: {},
        timelineSnapshots: [],
        startSequenceIndex: 2,
        timeline: { sequenceIndex: 2, calendarId: 'default-world-calendar', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        effects: [],
      },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    e: [
      {
        i: 'event-2',
        m: 'continue',
        n: '调查进入分析阶段',
        c: [
          { i: 'hero', t: 'c.tp', v: '分析第一批线索' },
        ],
      },
      {
        i: 'event-3',
        m: 'new',
        n: '新增支线事件',
        c: [
          { i: 'hero', t: 'c.kf', v: '发现了新的支线线索。' },
        ],
      },
      {
        i: 'event-2',
        m: 'continue',
        n: '调查进入交叉验证阶段',
        c: [
          { i: 'hero', t: 'c.tp', v: '交叉验证第二批线索' },
        ],
      },
    ],
  })

  const event2 = result.graph.nodes.find((item) => item.id === 'event-2')
  const event3 = result.graph.nodes.find((item) => item.id === 'event-3')
  const heroNode = result.graph.nodes.find((item) => item.id === 'hero')
  const participantEdge2 = result.graph.edges.find((item) => item.id === 'hero|participates_in|event-2')
  const participantEdge3 = result.graph.edges.find((item) => item.id === 'hero|participates_in|event-3')

  assert.equal(event2?.timeline?.sequenceIndex, 2)
  assert.deepEqual(
    (event2?.timelineSnapshots || []).map((item) => [item.sequenceIndex, item.name]),
    [
      [3, '调查进入分析阶段'],
      [5, '调查进入交叉验证阶段'],
    ],
  )
  assert.equal(event3?.timeline?.sequenceIndex, 4)
  assert.deepEqual(
    (heroNode?.timelineSnapshots || []).map((item) => [item.sequenceIndex, item.taskProgress, item.knownFacts]),
    [
      [3, '分析第一批线索', ''],
      [4, '分析第一批线索', '发现了新的支线线索。'],
      [5, '交叉验证第二批线索', '发现了新的支线线索。'],
    ],
  )
  assert.equal(participantEdge2?.startSequenceIndex, 3)
  assert.equal(participantEdge3?.startSequenceIndex, 4)
})

test('accepts legacy edge alias fields in session snapshot writeback', () => {
  const originalGraph = {
    meta: { robotId: 'robot-1', graphVersion: 1, title: '模板图谱' },
    relationTypes: [],
    nodes: [
      { id: 'hero', objectType: 'character', name: '吴邪', summary: '主角', attributes: {}, timelineSnapshots: [] },
      { id: 'partner', objectType: 'character', name: '小哥', summary: '同伴', attributes: {}, timelineSnapshots: [] },
    ],
    edges: [],
  }

  const result = applyWorldGraphWritebackToSessionGraph(originalGraph, null, {
    upsert_edges: [
      {
        id: 'edge-1',
        sourceId: 'hero',
        targetId: 'partner',
        relationTypeId: 'ally',
        relationLabel: '同伴',
        summary: '一起行动',
      },
    ],
  })

  const edge = result.graph.edges.find((item) => item.id === 'edge-1')
  assert.equal(edge?.sourceNodeId, 'hero')
  assert.equal(edge?.targetNodeId, 'partner')
  assert.equal(edge?.relationTypeCode, 'ally')
  assert.equal(edge?.summary, '一起行动')
})

test('runs world graph background job when robot template exists', () => {
  assert.equal(
    shouldRunWorldGraphBackgroundJob({
      world_graph: {
        meta: { robotId: 'robot-1', graphVersion: 0 },
        relationTypes: [],
        nodes: [],
        edges: [],
      },
    }),
    true,
  )
})

test('runs world graph background job for existing session-only graph context without robot id', () => {
  assert.equal(
    shouldRunWorldGraphBackgroundJob({
      world_graph: {
        meta: { robotId: '', graphVersion: 4 },
        relationTypes: [],
        nodes: [{ id: 'hero', objectType: 'character', name: '吴邪' }],
        edges: [],
      },
    }),
    true,
  )
})

test('skips world graph background job when there is no robot template and no existing graph context', () => {
  assert.equal(
    shouldRunWorldGraphBackgroundJob({
      world_graph: {
        meta: { robotId: '', graphVersion: 0 },
        relationTypes: [],
        nodes: [],
        edges: [],
      },
    }),
    false,
  )
})

test('maps world graph writeback started to ui loading message', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'world_graph_writeback_started' }),
    [{ type: 'ui_loading', message: '正在写回世界图谱' }],
  )
})

test('ignores story outline started because only post-processing steps are surfaced to chat status', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'story_outline_started' }),
    [],
  )
})

test('ignores message_done because structured ui is parsed from the main reply stream', () => {
  assert.deepEqual(mapAgentEventToChatEvents({ type: 'message_done' }), [])
})

test('ignores response completed because done is emitted by the main service after history is saved', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'response_completed' }),
    [],
  )
})

test('ignores ready-only world graph events for chat status mapping', () => {
  assert.deepEqual(mapAgentEventToChatEvents({ type: 'world_graph_writeback_ready' }), [])
})
