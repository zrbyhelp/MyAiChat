import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { extractDocumentText } from './document-import-service.mjs'

test('extracts markdown with structural semantic blocks', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'markdown-import-'))
  const filePath = join(tempDir, 'knowledge.md')
  await writeFile(filePath, [
    '# 总览',
    '',
    '这里是第一段说明。',
    '',
    '## 清单',
    '',
    '- 第一项',
    '- 第二项',
    '',
    '> 引用内容',
    '',
    '```ts',
    'const answer = 42',
    '```',
    '',
    '| 列 1 | 列 2 |',
    '| --- | --- |',
    '| A | B |',
  ].join('\n'), 'utf8')

  const result = await extractDocumentText(filePath, 'knowledge.md')

  assert.equal(result.sourceType, 'md')
  assert.equal(result.semanticMeta.headingCount, 2)
  assert.equal(result.semanticMeta.listCount, 1)
  assert.equal(result.semanticMeta.quoteCount, 1)
  assert.equal(result.semanticMeta.codeBlockCount, 1)
  assert.equal(result.semanticMeta.tableCount, 1)
  assert.ok(Array.isArray(result.semanticBlocks))
  assert.ok(result.semanticBlocks.some((item) => item.kind === 'heading' && item.text.includes('标题：总览')))
  assert.ok(result.semanticBlocks.some((item) => item.kind === 'list' && item.text.includes('1. 第一项')))
  assert.ok(result.semanticBlocks.some((item) => item.kind === 'quote' && item.text.includes('引用内容')))
  assert.ok(result.semanticBlocks.some((item) => item.kind === 'code' && item.text.includes('const answer = 42')))
  assert.ok(result.semanticBlocks.some((item) => item.kind === 'table' && item.text.includes('第 1 行')))
  assert.match(result.text, /章节：总览 \/ 清单/)
})
