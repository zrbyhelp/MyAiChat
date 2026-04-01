import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createApp } from './app.mjs'
import { createModelClient } from './model-client.mjs'
import { getPromptDefaults, resetPromptConfigCache } from './prompt-config.mjs'
import { buildAnswererMessages, buildInitialState, normalizeStructuredMemory, refreshStateMemoryContext, storyOutlineNode, worldGraphWritebackNode } from './runtime.mjs'
import { ThreadStore } from './thread-store.mjs'

class CapturingModelClient {
  constructor() {
    this.calls = []
  }

  async invokeText(config, systemInstruction, userContent) {
    this.calls.push({ kind: 'text', config, systemInstruction, userContent })
    if (config.model === 'numeric-model') {
      return { text: '{"hp":10}', usage: { prompt_tokens: 11, completion_tokens: 7 } }
    }
    if (config.model === 'memory-model') {
      return {
        text: '{"updated_at":"2026-03-27T00:00:00Z","categories":[]}',
        usage: { prompt_tokens: 17, completion_tokens: 6 },
      }
    }
    if (config.model === 'graph-model') {
      return {
        text: '{"upsert_nodes":[],"upsert_edges":[],"upsert_events":[]}',
        usage: { prompt_tokens: 13, completion_tokens: 5 },
      }
    }
    if (config.model === 'outline-capture-model') {
      return {
        text: '先描述误会升级，再安排角色正面回应。',
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }
    }
    return { text: 'stub-final', usage: { prompt_tokens: 19, completion_tokens: 9 } }
  }

  async streamText(config, messages, onChunk) {
    this.calls.push({ kind: 'stream', config, messages })
    await onChunk?.('stub-')
    await onChunk?.('final')
    return {
      text: 'stub-final',
      usage: { prompt_tokens: 19, completion_tokens: 9 },
    }
  }

  async invokeStructured(config, _systemInstruction, _userContent, schemaKind) {
    this.calls.push({ kind: 'structured', config, schemaKind })
    if (schemaKind === 'robot_generation_core') {
      return {
        data: {
          name: '盗墓搭档',
          description: '陪伴用户探索盗墓世界设定的智能体。',
          systemPrompt: '你是熟悉盗墓笔记世界观的中文叙事助手。',
          commonPrompt: '',
          numericComputationEnabled: false,
          numericComputationPrompt: '',
          numericComputationItems: [],
          structuredMemoryInterval: 3,
          structuredMemoryHistoryLimit: 12,
          documentSummary: '盗墓题材文档摘要',
          retrievalSummary: '盗墓、吴邪、张起灵、古墓线索',
        },
        usage: { prompt_tokens: 5, completion_tokens: 3 },
      }
    }
    if (schemaKind === 'memory_schema') {
      return {
        data: {
          categories: [
            {
              id: 'character',
              label: '角色',
              description: '角色信息',
              extractionInstructions: '提取关键角色。',
              fields: [
                { id: 'name', name: 'name', label: '名称', type: 'text', required: true, options: [] },
              ],
            },
            {
              id: 'clue',
              label: '线索',
              description: '线索信息',
              extractionInstructions: '提取关键线索。',
              fields: [
                { id: 'detail', name: 'detail', label: '细节', type: 'text', required: true, options: [] },
              ],
            },
          ],
        },
        usage: { prompt_tokens: 7, completion_tokens: 4 },
      }
    }
    if (schemaKind === 'world_graph_patch') {
      return {
        data: {
          meta: { title: '盗墓世界图谱', description: '增量演化后摘要' },
          upsertRelationTypes: [
            { id: 'companion', name: '同伴', description: '同行关系', directionality: 'undirected' },
          ],
          deleteRelationTypeCodes: ['obsolete-relation'],
          upsertNodes: [
            { id: 'wu-xie', name: '吴邪', type: 'character', description: '主角' },
          ],
          deleteNodeIds: ['old-node'],
          upsertEdges: [
            { id: 'edge-1', source: 'wu-xie', target: 'zhang-qi-ling', relationType: 'companion', description: '共同探墓' },
          ],
          deleteEdgeIds: ['old-edge'],
        },
        usage: { prompt_tokens: 6, completion_tokens: 2 },
      }
    }
    throw new Error(`unexpected schema kind: ${schemaKind}`)
  }
}

async function withServer(app, callback) {
  const server = createServer(app)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    return await callback(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
}

async function createTempStore() {
  const dir = await mkdtemp(join(os.tmpdir(), 'agent-test-'))
  return {
    dir,
    store: new ThreadStore({ mode: 'file', fileDir: dir }),
  }
}

test('thread store supports file round trip', async () => {
  const { dir, store } = await createTempStore()
  try {
    await store.save({
      thread_id: 'thread-store-test',
      messages: [{ role: 'user', content: 'hello' }],
      memory_schema: { categories: [] },
      structured_memory: { updated_at: '', categories: [] },
      numeric_state: { hp: 1 },
      story_outline: '',
    })
    const loaded = await store.load('thread-store-test')
    assert.ok(loaded)
    assert.equal(loaded.thread_id, 'thread-store-test')
    assert.deepEqual(loaded.numeric_state, { hp: 1 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('prompt defaults resolve env path lazily after module import', async () => {
  const dir = await mkdtemp(join(os.tmpdir(), 'agent-prompts-'))
  const promptPath = join(dir, 'prompts.yaml')
  const previousPromptPath = process.env.AGENT_PROMPTS_PATH
  try {
    await writeFile(promptPath, [
      'defaults:',
      '  common_prompt: "env common"',
      '  system_prompt: "env system"',
      '  numeric_computation_prompt: "env numeric"',
      'templates: {}',
      '',
    ].join('\n'))
    process.env.AGENT_PROMPTS_PATH = promptPath
    resetPromptConfigCache()

    const defaults = getPromptDefaults()
    assert.equal(defaults.common_prompt, 'env common')
    assert.equal(defaults.system_prompt, 'env system')
    assert.equal(defaults.numeric_computation_prompt, 'env numeric')
  } finally {
    if (previousPromptPath === undefined) {
      delete process.env.AGENT_PROMPTS_PATH
    } else {
      process.env.AGENT_PROMPTS_PATH = previousPromptPath
    }
    resetPromptConfigCache()
    await rm(dir, { recursive: true, force: true })
  }
})

test('build initial state caches memory context and normalizes numeric items', () => {
  const request = {
    thread_id: 'thread-1',
    session_id: 'session-1',
    prompt: 'hi',
    user: { id: 'u1' },
    model_settings: {
      provider: 'openai',
      base_url: 'http://example.com',
      api_key: 'test-key',
      model: 'answer-model',
      temperature: 0.7,
    },
    robot: {
      numeric_computation_items: [{ name: 'hp', current_value: 8, description: '生命值' }],
    },
    memory_schema: { categories: [] },
    structured_memory: { updated_at: '', categories: [] },
    history: [{ role: 'user', content: 'old' }],
    auxiliary_model_configs: {},
    numeric_state: {},
  }
  const structuredMemory = normalizeStructuredMemory(request.memory_schema, request.structured_memory)
  const state = buildInitialState(request, request.history, request.memory_schema, structuredMemory)
  assert.equal(state.history_text, 'user: old')
  assert.equal(state.structured_memory_text, '暂无结构化记忆。')
  assert.match(state.structured_memory_payload_json, /"categories":\[\]/)
  assert.deepEqual(state.numeric_computation_items, [{ name: 'hp', current_value: 8, description: '生命值' }])
})

test('refreshStateMemoryContext updates cached values', () => {
  const request = {
    thread_id: 'thread-2',
    session_id: 'session-2',
    prompt: 'hi',
    user: { id: 'u1' },
    model_settings: {
      provider: 'openai',
      base_url: 'http://example.com',
      api_key: 'test-key',
      model: 'answer-model',
      temperature: 0.7,
    },
    robot: {},
    memory_schema: { categories: [] },
    structured_memory: { updated_at: '', categories: [] },
    history: [],
    auxiliary_model_configs: {},
    numeric_state: {},
  }
  const state = buildInitialState(
    request,
    [],
    request.memory_schema,
    normalizeStructuredMemory(request.memory_schema, request.structured_memory),
  )
  refreshStateMemoryContext(state, { updated_at: 'new', categories: [] })
  assert.equal(state.structured_memory.updated_at, 'new')
  assert.match(state.structured_memory_payload_json, /"updated_at":"new"/)
})

test('buildAnswererMessages and world graph related nodes keep story setting placement', async () => {
  const client = new CapturingModelClient()
  const state = {
    common_prompt: '通用前缀',
    system_prompt: '角色设定',
    story_outline: '剧情先推进误会，再让角色给出回应。',
    structured_memory_text: '暂无结构化记忆。',
    structured_memory_payload_json: '{"updated_at":"","categories":[]}',
    memory_schema: { categories: [] },
    structured_memory: { updated_at: '', categories: [] },
    numeric_computation_items: [],
    numeric_state: {},
    history_text: 'user: old',
    prompt: '继续推进剧情',
    world_graph_payload: { meta: { robotId: 'robot-1' }, nodes: [], edges: [], events: [] },
    final_response: '最终正文',
    model_config: { model: 'answer-model' },
    auxiliary_model_configs: { outline: { model: 'outline-capture-model' } },
  }

  const messages = buildAnswererMessages(state)
  assert.equal(messages[0].role, 'system')
  assert.match(messages[0].content, /通用前缀/)
  assert.match(messages[0].content, /角色设定/)
  assert.equal(messages[1].role, 'user')
  assert.match(messages[1].content, /完整世界图谱 JSON/)
  assert.match(messages[1].content, /"robotId":"robot-1"/)

  const outlinePayload = await storyOutlineNode(state, client)
  assert.equal(outlinePayload.story_outline, '先描述误会升级，再安排角色正面回应。')
  const outlineCall = client.calls.find((item) => item.kind === 'text' && item.config.model === 'outline-capture-model')
  assert.ok(outlineCall)
  assert.match(outlineCall.systemInstruction, /主要故事设定：\n角色设定/)

  await worldGraphWritebackNode({ ...state, auxiliary_model_configs: { world_graph: { model: 'graph-model' } } }, client)
  const graphCall = client.calls.find((item) => item.kind === 'text' && item.config.model === 'graph-model')
  assert.ok(graphCall)
  assert.match(graphCall.systemInstruction, /主要故事设定：\n角色设定/)
  assert.doesNotMatch(graphCall.userContent, /主要故事设定：/)
})

test('runs stream completes and persists thread state', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-run-test',
          session_id: 'session-run-test',
          prompt: '测试',
          user: { id: 'u1' },
          model_config: {
            provider: 'openai',
            base_url: 'http://example.com',
            api_key: 'test-key',
            model: 'answer-model',
            temperature: 0.7,
          },
          robot: {
            common_prompt: '通用前缀',
            system_prompt: '角色设定',
            numeric_computation_enabled: true,
            numeric_computation_prompt: '保持 hp=10',
            numeric_computation_items: [
              { name: 'hp', current_value: 8, description: '生命值' },
            ],
          },
          auxiliary_model_configs: {
            numeric_computation: {
              provider: 'openai',
              base_url: 'http://example.com',
              api_key: 'test-key',
              model: 'numeric-model',
              temperature: 0.7,
            },
          },
          memory_schema: { categories: [] },
          structured_memory: { updated_at: '', categories: [] },
          history: [{ role: 'user', content: 'old' }],
          numeric_state: {},
        }),
      })
      const text = await response.text()
      assert.equal(response.status, 200)
      assert.match(text, /run_started/)
      assert.match(text, /numeric_state_updated/)
      assert.match(text, /message_done/)
      assert.match(text, /response_completed/)
      assert.match(text, /run_completed/)
      assert.match(text, /"hp":10/)
      assert.match(text, /"prompt_tokens":49/)
      assert.match(text, /"completion_tokens":25/)
    })

    const stored = await store.load('thread-run-test')
    assert.ok(stored)
    assert.equal(stored.messages.at(-1)?.content, 'stub-final')
    assert.deepEqual(stored.numeric_state, { hp: 10 })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('model client does not pass strict when using jsonMode structured output fallback', async () => {
  const seenConfigs = []
  const modelClient = createModelClient({
    createModel() {
      return {
        withStructuredOutput(_schema, config) {
          seenConfigs.push(config)
          return {
            async ainvoke() {
              return {
                parsed: {
                  categories: [],
                },
                raw: {
                  usage_metadata: {
                    input_tokens: 1,
                    output_tokens: 2,
                  },
                },
              }
            },
          }
        },
      }
    },
  })

  const result = await modelClient.invokeStructured(
    {
      provider: 'ollama',
      base_url: 'http://example.com',
      api_key: '',
      model: 'test-model',
      temperature: 0.7,
    },
    'system',
    'user',
    'memory_schema',
    '结构化记忆 schema',
  )

  assert.equal(result.usage.prompt_tokens, 1)
  assert.equal(result.usage.completion_tokens, 2)
  assert.equal(seenConfigs.length, 1)
  assert.equal(seenConfigs[0].method, 'jsonMode')
  assert.equal('strict' in seenConfigs[0], false)
})

test('model client supports invoke and stream methods from JS langchain runnables', async () => {
  const streamed = []
  const modelClient = createModelClient({
    createModel() {
      return {
        async invoke() {
          return {
            content: 'invoke-text',
            usage_metadata: {
              input_tokens: 2,
              output_tokens: 3,
            },
          }
        },
        async *stream() {
          yield { content: 'hello ' }
          yield {
            content: 'world',
            usage_metadata: {
              input_tokens: 4,
              output_tokens: 5,
            },
          }
        },
      }
    },
  })

  const invoked = await modelClient.invokeText(
    { provider: 'openai', model: 'test-model', temperature: 0.7 },
    'system',
    'user',
  )
  const streamedResult = await modelClient.streamText(
    { provider: 'openai', model: 'test-model', temperature: 0.7 },
    [{ role: 'user', content: 'hello' }],
    async (chunk) => {
      streamed.push(chunk)
    },
  )

  assert.equal(invoked.text, 'invoke-text')
  assert.equal(invoked.usage.prompt_tokens, 2)
  assert.equal(invoked.usage.completion_tokens, 3)
  assert.deepEqual(streamed, ['hello ', 'world'])
  assert.equal(streamedResult.text, 'hello world')
  assert.equal(streamedResult.usage.prompt_tokens, 4)
  assert.equal(streamedResult.usage.completion_tokens, 5)
})

test('model client supports stream methods that resolve to async iterables', async () => {
  const streamed = []
  const modelClient = createModelClient({
    createModel() {
      return {
        async stream() {
          return (async function *streamGenerator() {
            yield { content: 'part-1 ' }
            yield {
              content: 'part-2',
              usage_metadata: {
                input_tokens: 6,
                output_tokens: 7,
              },
            }
          }())
        },
      }
    },
  })

  const streamedResult = await modelClient.streamText(
    { provider: 'openai', model: 'test-model', temperature: 0.7 },
    [{ role: 'user', content: 'hello' }],
    async (chunk) => {
      streamed.push(chunk)
    },
  )

  assert.deepEqual(streamed, ['part-1 ', 'part-2'])
  assert.equal(streamedResult.text, 'part-1 part-2')
  assert.equal(streamedResult.usage.prompt_tokens, 6)
  assert.equal(streamedResult.usage.completion_tokens, 7)
})

test('model client recovers structured fallback payloads with snake_case aliases intact', async () => {
  const modelClient = createModelClient({
    createModel() {
      return {
        withStructuredOutput() {
          return {
            async ainvoke() {
              return {
                parsed: null,
                parsingError: new Error('parse failed'),
                raw: {
                  content: JSON.stringify({
                    meta: { title: '盗墓世界图谱', description: '增量演化后摘要' },
                    upsert_relation_types: [
                      { id: 'companion', name: '同伴', description: '同行关系', directionality: 'undirected' },
                    ],
                    delete_relation_type_codes: ['obsolete-relation'],
                    upsert_nodes: [
                      { id: 'wu-xie', name: '吴邪', type: 'character', description: '主角' },
                    ],
                    delete_node_ids: ['old-node'],
                    upsert_edges: [
                      {
                        id: 'edge-1',
                        source: 'wu-xie',
                        target: 'zhang-qi-ling',
                        relation_type: 'companion',
                        description: '共同探墓',
                      },
                    ],
                    delete_edge_ids: ['old-edge'],
                  }),
                  usage_metadata: {
                    input_tokens: 4,
                    output_tokens: 2,
                  },
                },
              }
            },
          }
        },
      }
    },
  })

  const result = await modelClient.invokeStructured(
    {
      provider: 'ollama',
      base_url: 'http://example.com',
      api_key: '',
      model: 'test-model',
      temperature: 0.7,
    },
    'system',
    'user',
    'world_graph_patch',
    '世界图谱演化 patch',
  )

  assert.equal(result.data.meta.title, '盗墓世界图谱')
  assert.equal(result.data.upsertRelationTypes[0]?.id, 'companion')
  assert.equal(result.data.upsertEdges[0]?.relationType, 'companion')
  assert.deepEqual(result.data.deleteNodeIds, ['old-node'])
  assert.equal(result.usage.prompt_tokens, 4)
  assert.equal(result.usage.completion_tokens, 2)
})

test('runs memory updates thread store', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    await store.save({
      thread_id: 'thread-memory-job',
      messages: [
        { role: 'user', content: 'old' },
        { role: 'assistant', content: 'old-answer' },
      ],
      memory_schema: { categories: [] },
      structured_memory: { updated_at: '', categories: [] },
      numeric_state: { hp: 1 },
      story_outline: 'old-outline',
    })
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-memory-job',
          session_id: 'session-memory-job',
          prompt: '测试',
          final_response: '最终回复',
          user: { id: 'u1' },
          model_config: {
            provider: 'openai',
            base_url: 'http://example.com',
            api_key: 'test-key',
            model: 'answer-model',
            temperature: 0.7,
          },
          robot: {},
          auxiliary_model_configs: {
            memory: {
              provider: 'openai',
              base_url: 'http://example.com',
              api_key: 'test-key',
              model: 'memory-model',
              temperature: 0.7,
            },
          },
          memory_schema: {
            categories: [
              {
                id: 'character',
                label: '角色',
                description: '角色信息',
                extraction_instructions: '提取关键角色',
                fields: [
                  { id: 'name', name: 'name', label: '名称', type: 'text', required: true, options: [] },
                ],
              },
            ],
          },
          structured_memory: { updated_at: '', categories: [] },
          history: [{ role: 'user', content: 'old' }],
          numeric_state: {},
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.ok(body.memory)
    })
    const stored = await store.load('thread-memory-job')
    assert.ok(stored)
    assert.equal(stored.structured_memory.updated_at, '2026-03-27T00:00:00Z')
    assert.equal(stored.story_outline, 'old-outline')
    assert.equal(stored.memory_schema.categories[0]?.id, 'character')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('robot generation merges core and memory outputs', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/robot-generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_config: {
            provider: 'openai',
            base_url: 'http://example.com',
            api_key: 'test-key',
            model: 'answer-model',
            temperature: 0.7,
          },
          source_name: '测试文档.txt',
          guidance: '生成一个角色扮演智能体',
          document_summary: '这是一份关于架空世界观与角色设定的文档摘要。',
          segment_summaries: ['角色设定', '世界规则'],
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.equal(body.name, '盗墓搭档')
      assert.equal(body.document_summary, '盗墓题材文档摘要')
      assert.equal(body.memory_schema.categories.length, 2)
      assert.equal(body.usage.prompt_tokens, 12)
      assert.deepEqual(body.world_graph, {})
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('robot world graph evolution returns delete-capable patch', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/robot-world-graph-evolution`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_config: {
            provider: 'openai',
            base_url: 'http://example.com',
            api_key: 'test-key',
            model: 'answer-model',
            temperature: 0.7,
          },
          source_name: '测试文档.txt',
          guidance: '生成一个角色扮演智能体',
          core: {
            name: '盗墓搭档',
            description: '陪伴用户探索盗墓世界设定的智能体。',
          },
          segment_summary: '本段明确吴邪与张起灵是稳定搭档。',
          segment_index: 1,
          segment_total: 4,
          current_world_graph: {
            meta: { title: '旧图谱', summary: '' },
            relationTypes: [],
            nodes: [{ id: 'zhang-qi-ling', name: '张起灵', objectType: 'character', summary: '关键同伴' }],
            edges: [],
          },
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.equal(body.world_graph_patch.meta.title, '盗墓世界图谱')
      assert.deepEqual(body.world_graph_patch.delete_relation_type_codes, ['obsolete-relation'])
      assert.deepEqual(body.world_graph_patch.delete_node_ids, ['old-node'])
      assert.deepEqual(body.world_graph_patch.delete_edge_ids, ['old-edge'])
      assert.equal(body.world_graph_patch.upsert_nodes[0].id, 'wu-xie')
      assert.equal(body.usage.prompt_tokens, 6)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
