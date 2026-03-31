import assert from 'node:assert/strict'
import test from 'node:test'

import { mapAgentEventToChatEvents } from './chat-service.mjs'

test('maps world graph writeback started to ui loading message', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'world_graph_writeback_started' }),
    [{ type: 'ui_loading', message: '正在写回世界图谱' }],
  )
})

test('maps story outline started to ui loading message', () => {
  assert.deepEqual(
    mapAgentEventToChatEvents({ type: 'story_outline_started' }),
    [{ type: 'ui_loading', message: '正在生成故事梗概' }],
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
