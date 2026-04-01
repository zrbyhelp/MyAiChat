import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyWorldGraphWritebackToSessionGraph,
  buildWorldGraphBackgroundAgentRequest,
  extractAgentServiceErrorMessage,
  hydrateBackgroundAgentRequest,
  mapAgentEventToChatEvents,
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
  assert.equal(hydrated.story_outline, '旧梗概')
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
  assert.equal(requestBody.story_outline, '旧梗概')
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
