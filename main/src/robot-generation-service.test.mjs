import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyRobotGenerationWorldGraphPatch,
  evolveWorldGraphFromSummaries,
  extractAgentErrorMessage,
} from './robot-generation-service.mjs'

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
  }, { robotId: 'robot-1', robotName: '盗墓搭档' })

  assert.equal(nextGraph.meta.title, '盗墓世界图谱')
  assert.equal(nextGraph.meta.summary, '更新后的图谱摘要')
  assert.equal(nextGraph.meta.graphVersion, 3)
  assert.deepEqual(nextGraph.relationTypes.map((item) => item.code), ['companion'])
  assert.deepEqual(nextGraph.nodes.map((item) => item.id).sort(), ['wu-xie', 'zhang-qi-ling'])
  assert.equal(nextGraph.nodes.find((item) => item.id === 'wu-xie')?.summary, '更完整的主角描述')
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
        },
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      }
    },
  })

  assert.deepEqual(seenGraphs, [
    { graphVersion: 0, nodeIds: [] },
    { graphVersion: 1, nodeIds: ['wu-xie'] },
    { graphVersion: 1, nodeIds: ['wu-xie'] },
  ])
  assert.equal(result.warnings.length, 1)
  assert.match(result.warnings[0], /provider error/)
  assert.equal(result.usage.prompt_tokens, 5)
  assert.equal(result.usage.completion_tokens, 3)
  assert.equal(result.worldGraph.meta.graphVersion, 2)
  assert.deepEqual(result.worldGraph.nodes.map((item) => item.id).sort(), ['wu-xie', 'zhang-qi-ling'])
  assert.deepEqual(result.worldGraph.edges.map((item) => item.id), ['edge-1'])
})
