import assert from 'node:assert/strict'
import { access, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  __pushPendingRobotGenerationJobForTests,
  __resetRobotGenerationRuntimeForTests,
  applyRobotGenerationWorldGraphPatch,
  buildKnowledgePointId,
  mergeGraphRagRelationTypesIntoWorldGraph,
  cancelRobotGenerationImportTask,
  evolveWorldGraphFromSummaries,
  extractAgentErrorMessage,
  initializeRobotGenerationService,
  mapGraphRagGraphToWorldGraphSnapshot,
  mapGraphRagWritebackToWorldGraphUpdate,
  normalizeExtractionDetail,
} from './robot-generation-service.mjs'
import {
  createRobotGenerationTask,
  getRobotGenerationTask,
} from './robot-generation-store.mjs'

test('extracts structured upstream error details without falling back to raw body', () => {
  assert.equal(
    extractAgentErrorMessage('{"detail":"世界图谱 patch 非法：edge edge-1 引用了不存在的节点"}'),
    '世界图谱 patch 非法：edge edge-1 引用了不存在的节点',
  )
  assert.equal(
    extractAgentErrorMessage('{"message":"文档摘要失败"}'),
    '文档摘要失败',
  )
  assert.equal(extractAgentErrorMessage('not-json'), '')
})

test('builds stable UUID knowledge point ids for qdrant upserts', () => {
  const first = buildKnowledgePointId('doc-1775023490195-633c0450', 0)
  const second = buildKnowledgePointId('doc-1775023490195-633c0450', 0)
  const third = buildKnowledgePointId('doc-1775023490195-633c0450', 1)

  assert.equal(first, second)
  assert.notEqual(first, third)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

test('normalizes target segment chars with a 10000 lower bound', () => {
  assert.equal(normalizeExtractionDetail({ targetSegmentChars: 9999 }).targetSegmentChars, 10000)
  assert.equal(normalizeExtractionDetail({ targetSegmentChars: 12000 }).targetSegmentChars, 12000)
})

test('applies delete-capable world graph patches over the current full graph', () => {
  const nextGraph = applyRobotGenerationWorldGraphPatch({
    meta: {
      robotId: 'robot-1',
      title: '旧图谱',
      summary: '',
      graphVersion: 2,
    },
    relationTypes: [
      { id: 'companion', code: 'companion', label: '同伴', description: '同行关系', directionality: 'undirected' },
      { id: 'obsolete', code: 'obsolete', label: '废弃关系', description: '', directionality: 'directed' },
    ],
    nodes: [
      { id: 'wu-xie', name: '吴邪', objectType: 'character', summary: '主角' },
      { id: 'zhang-qi-ling', name: '张起灵', objectType: 'character', summary: '关键同伴' },
      { id: 'old-node', name: '旧线索', objectType: 'item', summary: '待删除' },
    ],
    edges: [
      {
        id: 'old-edge',
        sourceNodeId: 'wu-xie',
        targetNodeId: 'old-node',
        relationTypeCode: 'obsolete',
        relationLabel: '废弃关系',
        summary: '旧关系',
      },
    ],
  }, {
    meta: { title: '盗墓世界图谱', description: '更新后的图谱摘要' },
    deleteRelationTypeCodes: ['obsolete'],
    deleteNodeIds: ['old-node'],
    deleteEdgeIds: ['old-edge'],
    upsertNodes: [
      { id: 'wu-xie', name: '吴邪', type: 'character', description: '更完整的主角描述' },
    ],
    upsertEdges: [
      { id: 'edge-1', source: 'wu-xie', target: 'zhang-qi-ling', relationType: 'companion', description: '稳定搭档' },
    ],
    upsertEvents: [
      {
        id: 'enter-tomb',
        name: '进入古墓',
        description: '吴邪正式进入墓道。',
        timeline: { sequenceIndex: 1, phase: '入墓', impactLevel: 65, eventType: 'arrival' },
      },
    ],
    appendEventEffects: [
      {
        ref: { nodeId: 'enter-tomb' },
        effects: [
          {
            id: 'enter-tomb-effect-1',
            summary: '吴邪由好奇转为警惕。',
            targetNodeId: 'wu-xie',
            changeTargetType: 'node-content',
            nodeAttributeChanges: [
              { fieldKey: 'currentStatus', beforeValue: '好奇', afterValue: '警惕' },
            ],
          },
        ],
      },
    ],
  }, { robotId: 'robot-1', robotName: '盗墓搭档' })

  assert.equal(nextGraph.meta.title, '盗墓世界图谱')
  assert.equal(nextGraph.meta.summary, '更新后的图谱摘要')
  assert.equal(nextGraph.meta.graphVersion, 3)
  assert.deepEqual(nextGraph.relationTypes.map((item) => item.code), ['companion'])
  assert.deepEqual(nextGraph.nodes.map((item) => item.id).sort(), ['enter-tomb', 'wu-xie', 'zhang-qi-ling'])
  assert.equal(nextGraph.nodes.find((item) => item.id === 'wu-xie')?.summary, '更完整的主角描述')
  assert.equal(nextGraph.nodes.find((item) => item.id === 'enter-tomb')?.timeline?.sequenceIndex, 1)
  assert.equal(nextGraph.nodes.find((item) => item.id === 'enter-tomb')?.effects[0]?.targetNodeId, 'wu-xie')
  assert.deepEqual(nextGraph.edges.map((item) => item.id), ['edge-1'])
  assert.equal(nextGraph.edges[0].relationTypeCode, 'companion')
})

test('rejects graph patches whose new edges reference unknown nodes or relation types', () => {
  assert.throws(
    () => applyRobotGenerationWorldGraphPatch({
      meta: { robotId: 'robot-1', title: '图谱', summary: '', graphVersion: 0 },
      relationTypes: [],
      nodes: [],
      edges: [],
    }, {
      upsertEdges: [
        { id: 'edge-1', source: 'missing-a', target: 'missing-b', relationType: 'companion', description: '非法边' },
      ],
    }, { robotId: 'robot-1', robotName: '测试智能体' }),
    /不存在的节点/,
  )
})

test('continues graph evolution from the last successful full graph after a failed segment', async () => {
  const seenGraphs = []
  const result = await evolveWorldGraphFromSummaries({
    modelConfig: {
      provider: 'openai',
      baseUrl: 'http://example.com',
      apiKey: 'test-key',
      model: 'graph-model',
      temperature: 0.7,
    },
    sourceName: '测试文档.txt',
    guidance: '生成一个角色扮演智能体',
    summaries: [
      { index: 0, summary: '第一段明确吴邪存在。' },
      { index: 1, summary: '第二段输出失败。' },
      { index: 2, summary: '第三段明确张起灵与吴邪是同伴。' },
    ],
    core: {
      name: '盗墓搭档',
      description: '陪伴用户探索盗墓世界设定的智能体。',
    },
    robotId: 'robot-1',
    robotName: '盗墓搭档',
    requestAgent: async (path, body) => {
      assert.equal(path, '/runs/robot-world-graph-evolution')
      seenGraphs.push({
        graphVersion: body.current_world_graph.meta.graphVersion,
        nodeIds: body.current_world_graph.nodes.map((item) => item.id),
      })

      if (body.segment_index === 0) {
        return {
          world_graph_patch: {
            upsertRelationTypes: [
              { id: 'companion', name: '同伴', description: '同行关系', directionality: 'undirected' },
            ],
            upsertNodes: [
              { id: 'wu-xie', name: '吴邪', type: 'character', description: '主角' },
            ],
            upsertEvents: [
              {
                id: 'first-step',
                name: '踏入墓道',
                description: '吴邪第一次真正踏入墓道。',
                timeline: { sequenceIndex: 0, phase: '开场', impactLevel: 45, eventType: 'arrival' },
              },
            ],
          },
          usage: { prompt_tokens: 2, completion_tokens: 1 },
        }
      }

      if (body.segment_index === 1) {
        throw new Error('provider error')
      }

      return {
        world_graph_patch: {
          upsertNodes: [
            { id: 'zhang-qi-ling', name: '张起灵', type: 'character', description: '关键同伴' },
          ],
          upsertEdges: [
            { id: 'edge-1', source: 'wu-xie', target: 'zhang-qi-ling', relationType: 'companion', description: '稳定搭档' },
          ],
          appendEventEffects: [
            {
              ref: { nodeId: 'first-step' },
              effects: [
                {
                  id: 'first-step-effect-1',
                  summary: '吴邪从犹豫转入戒备。',
                  targetNodeId: 'wu-xie',
                  changeTargetType: 'node-content',
                  nodeAttributeChanges: [
                    { fieldKey: 'currentStatus', beforeValue: '犹豫', afterValue: '戒备' },
                  ],
                },
              ],
            },
          ],
        },
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }
    },
  })

  assert.deepEqual(seenGraphs, [
    { graphVersion: 0, nodeIds: [] },
    { graphVersion: 1, nodeIds: ['wu-xie', 'first-step'] },
    { graphVersion: 1, nodeIds: ['wu-xie', 'first-step'] },
    { graphVersion: 1, nodeIds: ['wu-xie', 'first-step'] },
  ])
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /provider error/)
  assert.equal(result.usage.prompt_tokens, 5)
  assert.equal(result.usage.completion_tokens, 3)
  assert.equal(result.worldGraph.meta.graphVersion, 2)
  assert.deepEqual(result.worldGraph.nodes.map((item) => item.id).sort(), ['first-step', 'wu-xie', 'zhang-qi-ling'])
  assert.deepEqual(result.worldGraph.edges.map((item) => item.id), ['edge-1'])
  assert.equal(result.worldGraph.nodes.find((item) => item.id === 'first-step')?.timeline?.sequenceIndex, 0)
  assert.equal(result.worldGraph.nodes.find((item) => item.id === 'first-step')?.effects[0]?.targetNodeId, 'wu-xie')
})

test('retries an invalid graph patch for the current segment and continues after a valid retry', async () => {
  let attemptCount = 0
  const result = await evolveWorldGraphFromSummaries({
    modelConfig: {
      provider: 'openai',
      baseUrl: 'http://example.com',
      apiKey: 'test-key',
      model: 'graph-model',
      temperature: 0.7,
    },
    sourceName: '测试文档.txt',
    guidance: '生成一个角色扮演智能体',
    summaries: [
      { index: 0, summary: '本段明确吴邪与张起灵形成稳定同伴关系。' },
    ],
    core: {
      name: '盗墓搭档',
      description: '陪伴用户探索盗墓世界设定的智能体。',
    },
    robotId: 'robot-1',
    robotName: '盗墓搭档',
    requestAgent: async () => {
      attemptCount += 1
      if (attemptCount === 1) {
        throw new Error('世界图谱 patch 非法：upsertRelationTypes[0].directionality 必须为 directed 或 undirected')
      }
      return {
        world_graph_patch: {
          upsertRelationTypes: [
            { id: 'companion', name: '同伴', description: '同行关系', directionality: 'undirected' },
          ],
          upsertNodes: [
            { id: 'wu-xie', name: '吴邪', type: 'character', description: '主角' },
            { id: 'zhang-qi-ling', name: '张起灵', type: 'character', description: '关键同伴' },
          ],
          upsertEdges: [
            { id: 'edge-1', source: 'wu-xie', target: 'zhang-qi-ling', relationType: 'companion', description: '稳定搭档' },
          ],
        },
        usage: { prompt_tokens: 4, completion_tokens: 2 },
      }
    },
  })

  assert.equal(attemptCount, 2)
  assert.equal(result.warnings.length, 0)
  assert.equal(result.stats.nonEmptyPatchSegmentCount, 1)
  assert.equal(result.worldGraph.edges[0]?.id, 'edge-1')
})

test('fails graph evolution when all processed segments produce no valid patch', async () => {
  await assert.rejects(
    () => evolveWorldGraphFromSummaries({
      modelConfig: {
        provider: 'openai',
        baseUrl: 'http://example.com',
        apiKey: 'test-key',
        model: 'graph-model',
        temperature: 0.7,
      },
      sourceName: '测试文档.txt',
      guidance: '生成一个角色扮演智能体',
      summaries: [
        { index: 0, summary: '第一段只有模糊氛围，没有明确稳定实体。' },
        { index: 1, summary: '第二段也没有形成稳定对象。' },
      ],
      core: {
        name: '盗墓搭档',
        description: '陪伴用户探索盗墓世界设定的智能体。',
      },
      robotId: 'robot-1',
      robotName: '盗墓搭档',
      requestAgent: async () => ({
        world_graph_patch: {
          meta: { description: '没有稳定对象可写入图谱。' },
        },
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    }),
    /世界图谱生成失败：所有文档片段都未产出有效 patch/,
  )
})

test('maps graphrag extract payloads into the existing world graph snapshot shape', () => {
  const snapshot = mapGraphRagGraphToWorldGraphSnapshot({
    meta: {
      title: '百年孤独图谱',
      summary: '围绕布恩迪亚家族与马孔多的长期设定。',
    },
    relation_types: [
      { id: 'kinship', name: '亲族', description: '血缘关系', directionality: 'undirected' },
    ],
    entities: [
      { id: 'buendia-family', name: '布恩迪亚家族', type: 'organization', summary: '家族共同体', aliases: ['布恩迪亚'], community_ids: ['community-1'] },
      { id: 'macondo', name: '马孔多', type: 'location', summary: '家族建立的聚落' },
    ],
    relations: [
      { id: 'edge-founded-macondo', source_id: 'buendia-family', target_id: 'macondo', relation_type_id: 'kinship', summary: '家族扎根于马孔多' },
    ],
    events: [
      {
        id: 'found-macondo',
        name: '建立马孔多',
        summary: '家族建立马孔多。',
        timeline: { phase: '开端', impactLevel: 80, eventType: 'founding' },
        participant_entity_ids: ['buendia-family'],
      },
      {
        id: 'wind-destruction',
        name: '飓风抹去马孔多',
        summary: '马孔多最终被飓风抹去。',
        timeline: { impactLevel: 100, eventType: 'ending' },
      },
    ],
    communities: [
      { id: 'community-1', name: '家族宿命', summary: '核心命运板块。' },
    ],
    chunks: [
      { document_id: 'doc-1', source_name: '百年孤独.txt', segment_index: 0, summary: '建立马孔多', excerpt: '建立家园', entity_ids: ['buendia-family'], event_ids: ['found-macondo'] },
      { document_id: 'doc-1', source_name: '百年孤独.txt', segment_index: 3, summary: '家族扎根', excerpt: '家族在马孔多站稳', entity_ids: ['macondo'], relation_ids: ['edge-founded-macondo'] },
      { document_id: 'doc-1', source_name: '百年孤独.txt', segment_index: 7, summary: '飓风终局', excerpt: '马孔多被抹去', event_ids: ['wind-destruction'] },
    ],
  }, {
    robotId: 'robot-1',
    robotName: '百年孤独智能体',
  })

  assert.equal(snapshot.meta.robotId, 'robot-1')
  assert.equal(snapshot.meta.graphVersion, 1)
  assert.equal(snapshot.relationTypes[0]?.code, 'kinship')
  assert.equal(snapshot.relationTypes[0]?.directionality, 'undirected')
  assert.equal(snapshot.nodes.find((item) => item.id === 'buendia-family')?.objectType, 'organization')
  assert.equal(snapshot.nodes.find((item) => item.id === 'buendia-family')?.startSequenceIndex, 0)
  assert.equal(snapshot.nodes.find((item) => item.id === 'macondo')?.startSequenceIndex, 3)
  assert.equal(snapshot.nodes.find((item) => item.id === 'found-macondo')?.objectType, 'event')
  assert.equal(snapshot.nodes.find((item) => item.id === 'found-macondo')?.timeline?.sequenceIndex, 0)
  assert.equal(snapshot.nodes.find((item) => item.id === 'found-macondo')?.startSequenceIndex, 0)
  assert.equal(snapshot.nodes.find((item) => item.id === 'wind-destruction')?.timeline?.sequenceIndex, 1)
  assert.equal(snapshot.nodes.find((item) => item.id === 'wind-destruction')?.startSequenceIndex, 1)
  assert.equal(snapshot.nodes.find((item) => item.id === 'buendia-family')?.attributes?.aliases, '布恩迪亚')
  assert.equal(snapshot.edges.find((item) => item.id === 'edge-founded-macondo')?.startSequenceIndex, 3)
  assert.equal(snapshot.nodes.find((item) => item.id === 'found-macondo')?.effects?.length || 0, 0)
})

test('maps graphrag writeback payloads and merges new relation types before applying writeback', () => {
  const mapped = mapGraphRagWritebackToWorldGraphUpdate({
    summary: '吴邪与张起灵关系进一步稳固。',
    relation_types: [
      { id: 'companion', name: '同伴', description: '稳定合作关系', directionality: 'undirected' },
    ],
    entities: [
      { id: 'wu-xie', name: '吴邪', type: 'character', summary: '主角' },
    ],
    relations: [
      { id: 'edge-1', source_id: 'wu-xie', target_id: 'zhang-qi-ling', relation_type_id: 'companion', summary: '共同探墓的稳定搭档' },
    ],
    events: [
      {
        id: 'trust-deepen',
        name: '信任加深',
        summary: '吴邪与张起灵关系更稳固。',
        timeline: { sequenceIndex: 2, phase: '推进', impactLevel: 60, eventType: 'relationship' },
      },
    ],
    append_event_effects: [
      {
        ref: { nodeId: 'trust-deepen', objectType: 'event' },
        effects: [
          { id: 'trust-deepen-effect-1', summary: '吴邪更加信任张起灵。', targetNodeId: 'wu-xie', changeTargetType: 'node-content' },
        ],
      },
    ],
  }, {
    currentGraph: {
      meta: { robotId: 'robot-1', graphVersion: 3, title: '图谱' },
      relationTypes: [],
      nodes: [
        { id: 'zhang-qi-ling', objectType: 'character', name: '张起灵', summary: '关键同伴', startSequenceIndex: 0 },
      ],
      edges: [],
    },
  })

  assert.equal(mapped.summary, '吴邪与张起灵关系进一步稳固。')
  assert.equal(mapped.relationTypes[0]?.code, 'companion')
  assert.equal(mapped.writebackOps.upsert_nodes[0]?.id, 'wu-xie')
  assert.equal(mapped.writebackOps.upsert_nodes[0]?.startSequenceIndex, 2)
  assert.equal(mapped.writebackOps.upsert_edges[0]?.relationTypeCode, 'companion')
  assert.equal(mapped.writebackOps.upsert_edges[0]?.startSequenceIndex, 2)
  assert.equal(mapped.writebackOps.upsert_events[0]?.id, 'trust-deepen')
  assert.equal(mapped.writebackOps.upsert_events[0]?.startSequenceIndex, 2)
  assert.equal(mapped.writebackOps.append_event_effects[0]?.ref?.nodeId, 'trust-deepen')

  const merged = mergeGraphRagRelationTypesIntoWorldGraph({
    meta: { robotId: 'robot-1', graphVersion: 3, title: '图谱' },
    relationTypes: [],
    nodes: [
      { id: 'wu-xie', objectType: 'character', name: '吴邪', summary: '主角' },
      { id: 'zhang-qi-ling', objectType: 'character', name: '张起灵', summary: '关键同伴' },
    ],
    edges: [],
  }, mapped.relationTypes)

  assert.equal(merged.appliedRelationTypeCount, 1)
  assert.equal(merged.graph.relationTypes[0]?.code, 'companion')
  assert.equal(merged.graph.meta.graphVersion, 4)
})

test('cancels queued generation tasks immediately and removes their temp files', async () => {
  await initializeRobotGenerationService()
  __resetRobotGenerationRuntimeForTests()

  const user = { id: `queued-user-${Date.now()}` }
  const tempDir = await mkdtemp(join(tmpdir(), 'robot-generation-queued-'))
  const tempFilePath = join(tempDir, 'queued.txt')
  await writeFile(tempFilePath, 'queued document', 'utf8')

  await createRobotGenerationTask(user, {
    id: 'task-queued',
    status: 'pending',
    stage: 'queued',
    progress: 0,
    message: '任务已进入队列',
    sourceName: 'queued.txt',
    sourceType: 'txt',
    sourceSize: 14,
    guidance: '',
    modelConfigId: 'model-1',
    embeddingModelConfigId: 'embedding-1',
    stats: {},
    result: {},
  })
  __pushPendingRobotGenerationJobForTests({
    user,
    taskId: 'task-queued',
    tempFilePath,
    sourceName: 'queued.txt',
    sourceSize: 14,
    guidance: '',
    modelConfigId: 'model-1',
    embeddingModelConfigId: 'embedding-1',
  })

  const task = await cancelRobotGenerationImportTask(user, 'task-queued')

  assert.equal(task?.status, 'canceled')
  assert.equal(task?.stage, 'canceled')
  assert.equal((await getRobotGenerationTask(user, 'task-queued'))?.status, 'canceled')
  await assert.rejects(() => access(tempFilePath))
})

test('marks running generation tasks as canceling until the worker reaches a cancellation checkpoint', async () => {
  await initializeRobotGenerationService()
  __resetRobotGenerationRuntimeForTests()

  const user = { id: `running-user-${Date.now()}` }
  await createRobotGenerationTask(user, {
    id: 'task-running',
    status: 'processing',
    stage: 'summarizing',
    progress: 42,
    message: '正在总结文档片段 2/4',
    sourceName: 'running.txt',
    sourceType: 'txt',
    sourceSize: 21,
    guidance: '',
    modelConfigId: 'model-1',
    embeddingModelConfigId: 'embedding-1',
    stats: {},
    result: {},
  })

  const task = await cancelRobotGenerationImportTask(user, 'task-running')

  assert.equal(task?.status, 'canceling')
  assert.equal(task?.stage, 'canceling')
  assert.equal(task?.message, '正在取消生成任务')
  assert.equal((await getRobotGenerationTask(user, 'task-running'))?.status, 'canceling')
})
