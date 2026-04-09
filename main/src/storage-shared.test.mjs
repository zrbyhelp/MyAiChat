import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSessionSummary, normalizeSession, normalizeReplyMode } from './storage-shared.mjs'

test('normalizes reply mode and defaults missing values to default', () => {
  assert.equal(normalizeReplyMode('story_guidance'), 'story_guidance')
  assert.equal(normalizeReplyMode('protagonist_speech'), 'protagonist_speech')
  assert.equal(normalizeReplyMode(''), 'default')
  assert.equal(normalizeReplyMode('unknown-mode'), 'default')
})

test('session summary exposes reply mode for session list and detail hydration', () => {
  const session = normalizeSession({
    id: 'session-1',
    title: '测试会话',
    replyMode: 'protagonist_speech',
    messages: [],
  })

  const summary = buildSessionSummary(session)

  assert.equal(summary.replyMode, 'protagonist_speech')
})
