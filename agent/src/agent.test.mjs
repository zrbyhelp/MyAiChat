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
    if (systemInstruction.includes('GraphRAG 原始图谱')) {
      return {
        text: JSON.stringify({
          meta: { title: '百年孤独图谱', summary: '布恩迪亚家族与马孔多的长期演化。' },
          relationTypes: [
            { id: 'kinship', name: '亲族', description: '血缘与家族关系', directionality: 'undirected' },
          ],
          entities: [
            { id: 'buendia-family', name: '布恩迪亚家族', type: 'organization', summary: '家族共同体' },
          ],
          relations: [],
          events: [
            {
              id: 'found-macondo',
              name: '建立马孔多',
              summary: '布恩迪亚家族建立马孔多。',
              timeline: { phase: '开端', impactLevel: 80, eventType: 'founding' },
              participantEntityIds: ['buendia-family'],
            },
          ],
          appendEventEffects: [
            {
              ref: { nodeId: 'found-macondo', objectType: 'event' },
              effects: [
                { id: 'found-macondo-effect-1', summary: '布恩迪亚家族由迁徙转入定居。', targetNodeId: 'buendia-family', changeTargetType: 'node-content' },
              ],
            },
          ],
          communities: [
            { id: 'community-1', name: '家族宿命', summary: '围绕布恩迪亚家族命运的核心板块。', entityIds: ['buendia-family'], eventIds: ['found-macondo'], keywords: ['家族', '宿命'] },
          ],
          chunks: [
            { documentId: 'doc-1', sourceName: '百年孤独.epub', segmentIndex: 0, summary: '家族建立马孔多。', excerpt: '乌尔苏拉与何塞建立家园。', entityIds: ['buendia-family'], relationIds: [], eventIds: ['found-macondo'], communityIds: ['community-1'] },
          ],
        }),
        usage: { prompt_tokens: 15, completion_tokens: 10 },
      }
    }
    if (systemInstruction.includes('选出最相关的子图')) {
      return {
        text: JSON.stringify({
          summary: '当前问题与布恩迪亚家族命运和马孔多起源相关。',
          communities: [
            { id: 'community-1', name: '家族宿命', summary: '布恩迪亚家族的长期命运。', score: 0.92 },
          ],
          entities: [
            { id: 'buendia-family', name: '布恩迪亚家族', type: 'organization', summary: '家族共同体' },
          ],
          events: [
            {
              id: 'found-macondo',
              name: '建立马孔多',
              summary: '布恩迪亚家族建立马孔多。',
              timeline: { sequenceIndex: 0, phase: '开端', impactLevel: 80, eventType: 'founding' },
            },
          ],
          chunks: [
            { documentId: 'doc-1', sourceName: '百年孤独.epub', segmentIndex: 0, summary: '家族建立马孔多。', excerpt: '乌尔苏拉与何塞建立家园。', score: 0.88, entityIds: ['buendia-family'], communityIds: ['community-1'], eventIds: ['found-macondo'] },
          ],
        }),
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      }
    }
    if (systemInstruction.includes('事实抽取辅助')) {
      return {
        text: JSON.stringify({
          summary: '本轮确认吴邪与张起灵关系进一步稳固。',
          relationTypes: [
            { id: 'companion', name: '同伴', description: '稳定合作关系', directionality: 'undirected' },
          ],
          entities: [
            { id: 'wu-xie', name: '吴邪', type: 'character', summary: '主角' },
          ],
          relations: [
            { id: 'edge-1', sourceId: 'wu-xie', targetId: 'zhang-qi-ling', relationTypeId: 'companion', summary: '关系进一步稳固' },
          ],
          events: [
            {
              id: 'trust-deepen',
              name: '信任加深',
              summary: '吴邪与张起灵在墓道中的信任进一步加深。',
              timeline: { sequenceIndex: 1, phase: '推进', impactLevel: 65, eventType: 'relationship' },
            },
          ],
          appendEventEffects: [
            {
              ref: { nodeId: 'trust-deepen', objectType: 'event' },
              effects: [
                { id: 'trust-deepen-effect-1', summary: '吴邪对张起灵的信任增强。', targetNodeId: 'wu-xie', changeTargetType: 'node-content' },
              ],
            },
          ],
        }),
        usage: { prompt_tokens: 11, completion_tokens: 6 },
      }
    }
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
    this.calls.push({ kind: 'structured', config, systemInstruction: _systemInstruction, userContent: _userContent, schemaKind })
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
          upsertEvents: [
            {
              id: 'arrive-ruwanggong',
              name: '抵达鲁王宫',
              description: '吴邪一行正式进入鲁王宫地宫区域。',
              timeline: { sequenceIndex: 1, phase: '入墓', impactLevel: 70, eventType: 'arrival' },
            },
          ],
          appendEventEffects: [
            {
              ref: { nodeId: 'arrive-ruwanggong', objectType: 'event' },
              effects: [
                {
                  id: 'arrive-ruwanggong-effect-1',
                  summary: '吴邪从好奇转为警惕。',
                  targetNodeId: 'wu-xie',
                  changeTargetType: 'node-content',
                  nodeAttributeChanges: [
                    { fieldKey: 'currentStatus', beforeValue: '好奇', afterValue: '警惕' },
                  ],
                },
              ],
            },
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
    world_graph_payload: {
      meta: { robotId: 'robot-1' },
      nodes: [
        {
          id: 'event-1',
          objectType: 'event',
          name: '进入墓道',
          summary: '吴邪和张起灵进入第一段墓道。',
          timeline: { sequenceIndex: 1 },
          effects: [{ id: 'effect-1', summary: '吴邪开始高度警惕。' }],
        },
      ],
      edges: [],
      events: [],
    },
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
  assert.match(graphCall.userContent, /当前最大 sequenceIndex：1/)
  assert.match(graphCall.userContent, /当前事件时间线摘要：/)
  assert.match(graphCall.userContent, /\[1\] 进入墓道/)
  assert.match(graphCall.userContent, /吴邪开始高度警惕/)
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

test('runs numeric endpoint returns generated numeric state', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/numeric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-numeric-test',
          session_id: 'session-numeric-test',
          prompt: '更新数值',
          user: { id: 'u1' },
          model_config: {
            provider: 'openai',
            base_url: 'http://example.com',
            api_key: 'test-key',
            model: 'answer-model',
            temperature: 0.7,
          },
          robot: {
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
          history: [],
          numeric_state: {},
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.deepEqual(body.numeric_state, { hp: 10 })
      assert.equal(body.usage.prompt_tokens, 11)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runs stream reuses prefetched numeric state and story outline', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-prefetched-stream',
          session_id: 'session-prefetched-stream',
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
            outline: {
              provider: 'openai',
              base_url: 'http://example.com',
              api_key: 'test-key',
              model: 'outline-capture-model',
              temperature: 0.7,
            },
          },
          memory_schema: { categories: [] },
          structured_memory: { updated_at: '', categories: [] },
          history: [{ role: 'user', content: 'old' }],
          numeric_stage_completed: true,
          story_outline_stage_completed: true,
          numeric_state: { hp: 10 },
          story_outline: '已预取的故事梗概',
        }),
      })
      const text = await response.text()
      assert.equal(response.status, 200)
      assert.match(text, /numeric_state_updated/)
      assert.match(text, /story_outline_completed/)
      assert.equal(
        client.calls.filter((item) => item.kind === 'text' && item.config?.model === 'numeric-model').length,
        0,
      )
      assert.equal(
        client.calls.filter((item) => item.kind === 'text' && item.config?.model === 'outline-capture-model').length,
        0,
      )
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('story outline endpoint returns generated outline payload', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/story-outline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-outline-test',
          session_id: 'session-outline-test',
          prompt: '继续推进剧情',
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
          },
          auxiliary_model_configs: {
            outline: {
              provider: 'openai',
              base_url: 'http://example.com',
              api_key: 'test-key',
              model: 'outline-capture-model',
              temperature: 0.7,
            },
          },
          memory_schema: { categories: [] },
          structured_memory: { updated_at: '', categories: [] },
          history: [{ role: 'user', content: 'old' }],
          numeric_state: {},
          world_graph: { meta: { robotId: 'robot-1' }, nodes: [], edges: [], relationTypes: [] },
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.equal(body.story_outline, '先描述误会升级，再安排角色正面回应。')
      assert.deepEqual(body.usage, { prompt_tokens: 5, completion_tokens: 3 })
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('runs stream reuses request story outline instead of thread outline or outline model', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    await store.save({
      thread_id: 'thread-prebuilt-outline',
      messages: [{ role: 'user', content: 'old' }],
      memory_schema: { categories: [] },
      structured_memory: { updated_at: '', categories: [] },
      numeric_state: { hp: 8 },
      story_outline: '线程旧梗概',
    })
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: 'thread-prebuilt-outline',
          session_id: 'session-prebuilt-outline',
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
            outline: {
              provider: 'openai',
              base_url: 'http://example.com',
              api_key: 'test-key',
              model: 'outline-capture-model',
              temperature: 0.7,
            },
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
          history: [],
          numeric_state: {},
          story_outline: '预生成新梗概',
        }),
      })
      const text = await response.text()
      assert.equal(response.status, 200)
      assert.match(text, /story_outline_started/)
      assert.match(text, /story_outline_completed/)
      assert.match(text, /预生成新梗概/)
      assert.doesNotMatch(text, /线程旧梗概/)
      assert.match(text, /"prompt_tokens":30/)
      assert.match(text, /"completion_tokens":16/)
    })

    const stored = await store.load('thread-prebuilt-outline')
    assert.equal(stored.story_outline, '预生成新梗概')
    const outlineCall = client.calls.find((item) => item.kind === 'text' && item.config?.model === 'outline-capture-model')
    assert.equal(outlineCall, undefined)
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
                    upsert_events: [
                      {
                        id: 'arrive-ruwanggong',
                        name: '抵达鲁王宫',
                        description: '吴邪一行正式进入鲁王宫地宫区域。',
                        timeline: { sequence_index: 1, phase: '入墓', impact_level: 70, event_type: 'arrival' },
                      },
                    ],
                    append_event_effects: [
                      {
                        ref: { node_id: 'arrive-ruwanggong', object_type: 'event' },
                        effects: [
                          {
                            id: 'arrive-ruwanggong-effect-1',
                            summary: '吴邪从好奇转为警惕。',
                            target_node_id: 'wu-xie',
                            change_target_type: 'node-content',
                            node_attribute_changes: [
                              { field_key: 'currentStatus', before_value: '好奇', after_value: '警惕' },
                            ],
                          },
                        ],
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
  assert.equal(result.data.upsertEvents[0]?.timeline.sequenceIndex, 1)
  assert.equal(result.data.appendEventEffects[0]?.effects[0]?.targetNodeId, 'wu-xie')
  assert.deepEqual(result.data.deleteNodeIds, ['old-node'])
  assert.equal(result.usage.prompt_tokens, 4)
  assert.equal(result.usage.completion_tokens, 2)
})

test('model client falls back to raw world graph patch when parsed result is empty', async () => {
  const modelClient = createModelClient({
    createModel() {
      return {
        withStructuredOutput() {
          return {
            async ainvoke() {
              return {
                parsed: {
                  meta: { title: '', description: '' },
                  upsertRelationTypes: [],
                  deleteRelationTypeCodes: [],
                  upsertNodes: [],
                  deleteNodeIds: [],
                  upsertEdges: [],
                  upsertEvents: [],
                  appendEventEffects: [],
                  deleteEdgeIds: [],
                },
                raw: {
                  content: JSON.stringify({
                    meta: { description: '布恩迪亚家族后期关系与终局' },
                    upsertRelationTypes: [
                      { id: 'RT_MARRIED_TO', name: '婚姻', description: '婚姻/配偶关系', directionality: 'undirected' },
                    ],
                    upsertNodes: [
                      { id: 'buendia-family', name: '布恩迪亚家族', type: 'organization', description: '家族共同体' },
                    ],
                    upsertEdges: [
                      {
                        id: 'edge-1',
                        source: 'amaranta-ursula',
                        target: 'aureliano-babilonia',
                        relationType: 'RT_MARRIED_TO',
                        description: '隐秘结合关系',
                      },
                    ],
                  }),
                  usage_metadata: {
                    input_tokens: 9,
                    output_tokens: 3,
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
      provider: 'openai',
      base_url: 'http://example.com',
      api_key: 'test-key',
      model: 'test-model',
      temperature: 0.7,
    },
    'system',
    'user',
    'world_graph_patch',
    '世界图谱演化 patch',
  )

  assert.equal(result.debug?.recovered, true)
  assert.equal(result.data.meta.description, '布恩迪亚家族后期关系与终局')
  assert.equal(result.data.upsertRelationTypes[0]?.id, 'RT_MARRIED_TO')
  assert.equal(result.data.upsertRelationTypes[0]?.directionality, 'undirected')
  assert.equal(result.data.upsertNodes[0]?.id, 'buendia-family')
  assert.equal(result.data.upsertNodes[0]?.type, 'organization')
  assert.equal(result.data.upsertEdges[0]?.relationType, 'RT_MARRIED_TO')
  assert.equal(result.usage.prompt_tokens, 9)
  assert.equal(result.usage.completion_tokens, 3)
})

test('model client rejects recovered world graph patches with unsupported enums', async () => {
  const modelClient = createModelClient({
    createModel() {
      return {
        withStructuredOutput() {
          return {
            async ainvoke() {
              return {
                parsed: {
                  meta: { title: '', description: '' },
                  upsertRelationTypes: [],
                  deleteRelationTypeCodes: [],
                  upsertNodes: [],
                  deleteNodeIds: [],
                  upsertEdges: [],
                  upsertEvents: [],
                  appendEventEffects: [],
                  deleteEdgeIds: [],
                },
                raw: {
                  content: JSON.stringify({
                    upsertRelationTypes: [
                      { id: 'RT_MARRIED_TO', name: '婚姻', description: '婚姻/配偶关系', directionality: 'BIDIRECTIONAL' },
                    ],
                    upsertNodes: [
                      { id: 'buendia-family', name: '布恩迪亚家族', type: 'family', description: '家族共同体' },
                    ],
                  }),
                },
              }
            },
          }
        },
      }
    },
  })

  await assert.rejects(
    () => modelClient.invokeStructured(
      {
        provider: 'openai',
        base_url: 'http://example.com',
        api_key: 'test-key',
        model: 'test-model',
        temperature: 0.7,
      },
      'system',
      'user',
      'world_graph_patch',
      '世界图谱演化 patch',
    ),
    /世界图谱演化 patch生成失败：/,
  )
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
      assert.equal(body.world_graph_patch.upsert_events[0].timeline.sequenceIndex, 1)
      assert.equal(body.world_graph_patch.append_event_effects[0].effects[0].targetNodeId, 'wu-xie')
      assert.equal(body.usage.prompt_tokens, 6)
      const graphPatchCall = client.calls.find((item) => item.kind === 'structured' && item.schemaKind === 'world_graph_patch')
      assert.ok(graphPatchCall)
      assert.match(graphPatchCall.userContent, /当前最大 sequenceIndex：0/)
      assert.match(graphPatchCall.userContent, /当前事件时间线摘要：\n\n无/)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('graphrag extract returns normalized graph payload', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/graphrag-extract`, {
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
          source_name: '百年孤独.epub',
          guidance: '生成一个角色扮演智能体',
          document_summary: '布恩迪亚家族与马孔多的长期命运。',
          core: {
            name: '百年孤独智能体',
            description: '追踪家族与马孔多命运',
          },
          segment_summary: '家族建立马孔多。',
          segment_index: 0,
          segment_total: 8,
          current_world_graph: {
            meta: { robotId: 'robot-1', graphVersion: 0 },
            relationTypes: [],
            nodes: [],
            edges: [],
          },
          extraction_detail: {
            max_entities_per_segment: 9,
            max_relations_per_segment: 11,
            max_events_per_segment: 5,
            entity_importance_threshold: 0.45,
            relation_importance_threshold: 0.5,
            event_importance_threshold: 0.6,
          },
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.equal(body.graphrag_graph.meta.title, '百年孤独图谱')
      assert.equal(body.graphrag_graph.entities[0]?.id, 'buendia-family')
      assert.equal(body.graphrag_graph.events[0]?.timeline.sequenceIndex, null)
      assert.equal(body.graphrag_graph.append_event_effects[0]?.effects[0]?.targetNodeId, 'buendia-family')
      assert.equal(body.usage.prompt_tokens, 15)
      const textCall = client.calls.find((item) => item.kind === 'text' && item.systemInstruction.includes('GraphRAG 原始图谱'))
      assert.ok(textCall)
      assert.match(textCall.userContent, /当前分片：1\/8/)
      assert.match(textCall.userContent, /实体上限：9/)
      assert.match(textCall.userContent, /当前最大 sequenceIndex：0/)
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('graphrag retrieve returns normalized retrieval payload', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/graphrag-retrieve`, {
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
          robot_name: '百年孤独向导',
          robot_description: '布恩迪亚家族世界观向导',
          story_outline: '家族与马孔多命运纠缠。',
          prompt: '马孔多是怎么建立的？',
          history: [{ role: 'user', content: '先说说家族背景' }],
          graphrag_documents: [
            {
              document_id: 'doc-1',
              source_name: '百年孤独.epub',
              summary: '布恩迪亚家族与马孔多',
              graphrag_graph: {
                communities: [{ id: 'community-1', name: '家族宿命', summary: '宿命主题' }],
              },
            },
          ],
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.match(body.graphrag_retrieval.summary, /布恩迪亚家族/)
      assert.equal(body.graphrag_retrieval.chunks[0]?.document_id, 'doc-1')
      assert.equal(body.graphrag_retrieval.communities[0]?.id, 'community-1')
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('graphrag writeback returns normalized writeback facts', async () => {
  const client = new CapturingModelClient()
  const { dir, store } = await createTempStore()
  try {
    const app = await createApp({ modelClient: client, store })
    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/runs/graphrag-writeback`, {
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
          robot_name: '盗墓搭档',
          robot_description: '陪伴用户探索盗墓世界设定的智能体。',
          prompt: '继续推进剧情',
          final_response: '吴邪和张起灵在墓道中建立了更稳定的信任。',
          history: [{ role: 'user', content: '继续' }],
          current_world_graph: {
            meta: { robotId: 'robot-1', title: '图谱', summary: '' },
            relationTypes: [],
            nodes: [{ id: 'zhang-qi-ling', objectType: 'character', name: '张起灵', summary: '关键同伴' }],
            edges: [],
          },
        }),
      })
      const body = await response.json()
      assert.equal(response.status, 200)
      assert.equal(body.graphrag_writeback.relations[0]?.relation_type_id, 'companion')
      assert.equal(body.graphrag_writeback.events[0]?.id, 'trust-deepen')
      assert.equal(body.graphrag_writeback.append_event_effects[0]?.effects[0]?.targetNodeId, 'wu-xie')
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
