import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createStructuredStreamParser,
  consumeStructuredStreamChunk,
  extractStructuredPayloadsFromText,
  finalizeStructuredStream,
  getUnstreamedStructuredTextSuffix,
  reconcileAssistantStructuredOutput,
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

test('does not synthesize a generic form when the assistant only asks for more input in plain text', () => {
  const result = reconcileAssistantStructuredOutput(
    '请补充一下你想要的角色背景和性格设定。',
    [{ title: '示例选项', prompt: '示例选项' }],
    null,
  )

  assert.equal(result.form, null)
  assert.deepEqual(result.suggestions, [{ title: '示例选项', prompt: '示例选项' }])
})

test('falls back to a continue suggestion when the assistant returns no form or options', () => {
  const result = reconcileAssistantStructuredOutput('剧情先推进到这里。', [], null)

  assert.equal(result.form, null)
  assert.deepEqual(result.suggestions, [{ title: '继续', prompt: '继续' }])
})

test('returns the missing visible suffix when structured parsing held back the tail', () => {
  assert.equal(
    getUnstreamedStructuredTextSuffix('稳了。\n\n“是怎么在动手', '稳了。\n\n“是怎么在动手脚的？”'),
    '脚的？”',
  )
})
