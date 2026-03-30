import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStructuredStreamParser,
  consumeStructuredStreamChunk,
  extractStructuredPayloadsFromText,
  finalizeStructuredStream,
} from './structured.mjs'

test('extracts suggestions from the main reply and strips the visible text', () => {
  const result = extractStructuredPayloadsFromText(
    '先给出正文。<suggestions>[{"t":"继续","p":"继续"}]</suggestions>',
  )

  assert.equal(result.text, '先给出正文。')
  assert.deepEqual(result.suggestions, [{ title: '继续', prompt: '继续' }])
  assert.equal(result.form, null)
})

test('extracts a form from streamed chunks and keeps only visible text in the delta output', () => {
  const state = createStructuredStreamParser()
  const visibleChunks = [
    consumeStructuredStreamChunk(state, '请先补充资料。<fo'),
    consumeStructuredStreamChunk(state, 'rm>{"ti":"登记","fs":[{"n":"name","l":"姓名","t":"input","r":true}]}</form>'),
  ]

  const finalized = finalizeStructuredStream(state)

  assert.deepEqual(visibleChunks, ['', '请先补充资料。'])
  assert.equal(finalized.text, '')
  assert.equal(finalized.suggestions.length, 0)
  assert.deepEqual(finalized.form, {
    title: '登记',
    description: '',
    submitText: '提交',
    fields: [
      {
        name: 'name',
        label: '姓名',
        type: 'input',
        placeholder: '',
        required: true,
        inputType: 'text',
        multiple: false,
        options: [],
        defaultValue: '',
      },
    ],
  })
})
