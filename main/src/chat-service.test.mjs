import assert from 'node:assert/strict'
import test from 'node:test'

import { mapAgentEventToChatEvents } from './chat-service.mjs'

test('maps world graph context started to ui loading message', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'world_graph_context_started' }),
    [{ type: 'ui_loading', message: '正在分析世界图谱' }],
  )
})

test('maps world graph writeback started to ui loading message', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'world_graph_writeback_started' }),
    [{ type: 'ui_loading', message: '正在写回世界图谱' }],
  )
})

test('ignores ready-only world graph events for chat status mapping', () => {
  assert.deepEqual(mapAgentEventToChatEvents({ type: 'world_graph_context_ready' }), [])
  assert.deepEqual(mapAgentEventToChatEvents({ type: 'world_graph_writeback_ready' }), [])
})
