import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AIRobotCard, RobotWorldGraph, WorldEdge, WorldNode, WorldTimeline } from '@/types/ai'

const apiMocks = vi.hoisted(() => ({
  createRobotWorldEdge: vi.fn(),
  createRobotWorldNode: vi.fn(),
  createRobotWorldRelationType: vi.fn(),
  deleteRobotWorldEdge: vi.fn(),
  deleteRobotWorldNode: vi.fn(),
  deleteRobotWorldRelationType: vi.fn(),
  getRobotWorldGraph: vi.fn(),
  updateRobotWorldEdge: vi.fn(),
  updateRobotWorldGraphLayout: vi.fn(),
  updateRobotWorldNode: vi.fn(),
  updateRobotWorldRelationType: vi.fn(),
}))

vi.mock('@/lib/api', () => apiMocks)
vi.mock('@/components/chat/WorldGraphCanvasX6.vue', () => ({
  default: {
    name: 'WorldGraphCanvasX6',
    props: {
      nodes: { type: Array, default: () => [] },
      edges: { type: Array, default: () => [] },
      layout: { type: Object, default: () => ({}) },
      showEventNodes: { type: Boolean, default: false },
      showAllEdges: { type: Boolean, default: false },
      fitRequestKey: { type: Number, default: 0 },
    },
    template: '<div class="world-graph-canvas-stub" />',
  },
}))

import RobotWorldGraphDialog from './RobotWorldGraphDialog.vue'

function createNode(overrides: Partial<WorldNode> = {}): WorldNode {
  return {
    id: overrides.id || 'node',
    objectType: overrides.objectType || 'character',
    name: overrides.name || '节点',
    summary: overrides.summary || '',
    knownFacts: overrides.knownFacts || '',
    preferencesAndConstraints: overrides.preferencesAndConstraints || '',
    taskProgress: overrides.taskProgress || '',
    longTermMemory: overrides.longTermMemory || '',
    status: overrides.status || '',
    tags: overrides.tags || [],
    attributes: overrides.attributes || {},
    position: overrides.position || { x: 0, y: 0 },
    startSequenceIndex: overrides.startSequenceIndex ?? 0,
    timelineSnapshots: overrides.timelineSnapshots || [],
    timeline: overrides.timeline ?? null,
    effects: overrides.effects || [],
    createdAt: overrides.createdAt || '',
    updatedAt: overrides.updatedAt || '',
  }
}

function createEventNode(overrides: Partial<WorldNode> = {}): WorldNode {
  const timeline = (overrides.timeline || {
    sequenceIndex: overrides.startSequenceIndex ?? 0,
    calendarId: 'calendar-1',
    yearLabel: '',
    monthLabel: '',
    dayLabel: '',
    timeOfDayLabel: '',
    phase: '',
    impactLevel: 0,
    eventType: '',
  }) as WorldTimeline

  return createNode({
    ...overrides,
    objectType: 'event',
    timeline,
  })
}

function createEdge(overrides: Partial<WorldEdge> = {}): WorldEdge {
  return {
    id: overrides.id || 'edge-1',
    sourceNodeId: overrides.sourceNodeId || 'source',
    targetNodeId: overrides.targetNodeId || 'target',
    relationTypeCode: overrides.relationTypeCode || 'ally',
    relationLabel: overrides.relationLabel || '同伴',
    summary: overrides.summary || '',
    directionality: overrides.directionality || 'directed',
    intensity: overrides.intensity ?? null,
    status: overrides.status || '',
    startSequenceIndex: overrides.startSequenceIndex ?? 0,
    endSequenceIndex: overrides.endSequenceIndex ?? null,
    timelineSnapshots: overrides.timelineSnapshots || [],
    createdAt: overrides.createdAt || '',
    updatedAt: overrides.updatedAt || '',
  }
}

function createGraphData(nodes: WorldNode[], edges: WorldEdge[] = []): RobotWorldGraph {
  return {
    meta: {
      robotId: 'session-graph',
      title: '会话图谱',
      summary: '',
      graphVersion: 1,
      calendar: {
        calendarId: 'calendar-1',
        calendarName: '世界历',
        eras: ['纪元'],
        monthNames: [],
        dayNames: [],
        timeOfDayLabels: [],
        formatTemplate: '',
      },
      layout: {
        viewportX: 18,
        viewportY: 26,
        zoom: 1.15,
      },
    },
    relationTypes: [],
    nodes,
    edges,
  }
}

function createRobot(overrides: Partial<AIRobotCard> = {}): AIRobotCard {
  return {
    id: overrides.id || 'robot-1',
    name: overrides.name || '测试智能体',
    description: overrides.description || '测试描述',
    avatar: overrides.avatar || '',
    persistToServer: overrides.persistToServer ?? true,
    commonPrompt: overrides.commonPrompt || '',
    systemPrompt: overrides.systemPrompt || '',
    memoryModelConfigId: overrides.memoryModelConfigId || '',
    outlineModelConfigId: overrides.outlineModelConfigId || '',
    knowledgeRetrievalModelConfigId: overrides.knowledgeRetrievalModelConfigId || '',
    worldGraphModelConfigId: overrides.worldGraphModelConfigId || '',
    memorySchema: overrides.memorySchema || { categories: [] },
    worldGraph: overrides.worldGraph || null,
  }
}

function mountDialog(
  graphData: RobotWorldGraph,
  options: { mode?: 'editor' | 'session'; readOnly?: boolean; currentRobot?: AIRobotCard | null } = {},
) {
  return mount(RobotWorldGraphDialog, {
    props: {
      currentRobot: options.currentRobot ?? null,
      graphData,
      mode: options.mode ?? (options.readOnly === false ? 'editor' : 'session'),
      readOnly: options.readOnly,
      active: true,
    },
    global: {
      stubs: {
        TButton: {
          emits: ['click'],
          template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
        },
        TForm: true,
        TFormItem: true,
        TInput: true,
        TInputNumber: true,
        TSelect: true,
        TTextarea: true,
      },
    },
  })
}

describe('RobotWorldGraphDialog', () => {
  afterEach(() => {
    Object.values(apiMocks).forEach((mockFn) => mockFn.mockReset())
  })

  it('auto layouts chaotic read-only session graph nodes without persisting them', async () => {
    const inputNodes = [
      createNode({ id: 'a', name: '阿尔法', position: { x: 120, y: 120 } }),
      createNode({ id: 'b', name: '贝塔', position: { x: 122, y: 122 } }),
      createNode({ id: 'c', name: '伽马', position: { x: 124, y: 124 }, objectType: 'location' }),
      createNode({ id: 'd', name: '德尔塔', position: { x: 126, y: 126 }, objectType: 'organization' }),
    ]
    const wrapper = mountDialog(createGraphData(inputNodes))

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    const renderedNodes = canvas.props('nodes') as WorldNode[]
    const uniquePositions = new Set(renderedNodes.map((node) => `${node.position.x},${node.position.y}`))
    const positionsChanged = renderedNodes.some((node, index) => {
      const inputNode = inputNodes[index]
      return !inputNode || node.position.x !== inputNode.position.x || node.position.y !== inputNode.position.y
    })

    expect(renderedNodes).toHaveLength(4)
    expect(uniquePositions.size).toBeGreaterThan(1)
    expect(positionsChanged).toBe(true)
    expect(canvas.props('layout')).toEqual({ viewportX: 0, viewportY: 0, zoom: 1 })
    expect(canvas.props('fitRequestKey')).toBe(1)
    expect(apiMocks.updateRobotWorldNode).not.toHaveBeenCalled()
    expect(apiMocks.getRobotWorldGraph).not.toHaveBeenCalled()
  })

  it('always reflows session graph nodes into a stable readable layout', async () => {
    const inputNodes = [
      createNode({ id: 'a', position: { x: 120, y: 120 } }),
      createNode({ id: 'b', position: { x: 320, y: 160 } }),
      createNode({ id: 'c', position: { x: 560, y: 300 }, objectType: 'location' }),
      createNode({ id: 'd', position: { x: 760, y: 220 }, objectType: 'organization' }),
    ]
    const wrapper = mountDialog(createGraphData(inputNodes))

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    const renderedNodes = canvas.props('nodes') as WorldNode[]

    expect(renderedNodes.map((node) => node.position)).not.toEqual(inputNodes.map((node) => node.position))
    expect(canvas.props('layout')).toEqual({ viewportX: 0, viewportY: 0, zoom: 1 })
    expect(canvas.props('fitRequestKey')).toBe(1)
    expect(apiMocks.updateRobotWorldNode).not.toHaveBeenCalled()
  })

  it('allows dragging read-only session graph nodes without persisting', async () => {
    const inputNodes = [
      createNode({ id: 'a', position: { x: 120, y: 120 } }),
      createNode({ id: 'b', position: { x: 320, y: 160 } }),
    ]
    const wrapper = mountDialog(createGraphData(inputNodes))

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    canvas.vm.$emit('move-node', { nodeId: 'a', x: 460, y: 300 })
    await flushPromises()

    const renderedNodes = canvas.props('nodes') as WorldNode[]
    expect(renderedNodes.find((node) => node.id === 'a')?.position).toEqual({ x: 460, y: 300 })
    expect(apiMocks.updateRobotWorldNode).not.toHaveBeenCalled()
  })

  it('starts collapsed for read-only session graphs and expands on demand', async () => {
    const wrapper = mountDialog(createGraphData([createNode({ id: 'a' })]))

    await flushPromises()

    expect(wrapper.find('.timeline-dock').classes()).toContain('collapsed')
    expect(wrapper.find('.graph-stage-shell').classes()).toContain('collapsed')
    expect(wrapper.find('.timeline-range').exists()).toBe(false)

    await wrapper.find('.timeline-toggle-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.timeline-dock').classes()).not.toContain('collapsed')
    expect(wrapper.find('.graph-stage-shell').classes()).not.toContain('collapsed')
    expect(wrapper.find('.timeline-range').exists()).toBe(true)
  })

  it('keeps editable world graphs expanded by default', async () => {
    const wrapper = mountDialog(createGraphData([createNode({ id: 'a' })]), { mode: 'editor' })

    await flushPromises()

    expect(wrapper.find('.timeline-dock').classes()).not.toContain('collapsed')
    expect(wrapper.find('.graph-stage-shell').classes()).not.toContain('collapsed')
    expect(wrapper.find('.timeline-range').exists()).toBe(true)
  })

  it('opens read-only session graphs at the latest timepoint so content is visible', async () => {
    const wrapper = mountDialog(
      createGraphData([
        createNode({ id: 'a', startSequenceIndex: 3, position: { x: 120, y: 120 } }),
        createNode({ id: 'b', startSequenceIndex: 5, position: { x: 320, y: 180 } }),
      ]),
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    const renderedNodes = canvas.props('nodes') as WorldNode[]

    expect(renderedNodes).toHaveLength(2)
    expect(wrapper.text()).toContain('时间点 5')
    expect(canvas.props('fitRequestKey')).toBe(1)
  })

  it('updates the current timepoint when the range slider changes', async () => {
    const wrapper = mountDialog(
      createGraphData([
        createNode({ id: 'a', startSequenceIndex: 0, position: { x: 120, y: 120 } }),
        createNode({ id: 'b', startSequenceIndex: 4, position: { x: 320, y: 180 } }),
      ]),
      { mode: 'editor' },
    )

    await flushPromises()

    const range = wrapper.find('.timeline-range')
    await range.setValue('2')
    await flushPromises()

    expect((range.element as HTMLInputElement).value).toBe('2')
    expect(wrapper.text()).toContain('时间点 2')
  })

  it('renders relation edges when the timeline reaches their effective timepoint', async () => {
    const wrapper = mountDialog(
      createGraphData(
        [
          createNode({ id: 'a', startSequenceIndex: 0, position: { x: 120, y: 120 } }),
          createNode({ id: 'b', startSequenceIndex: 2, position: { x: 320, y: 180 } }),
        ],
        [
          createEdge({
            id: 'rel-1',
            sourceNodeId: 'a',
            targetNodeId: 'b',
            relationTypeCode: 'ally',
            relationLabel: '同伴',
            startSequenceIndex: 2,
          }),
        ],
      ),
      { mode: 'editor' },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    expect((canvas.props('edges') as WorldEdge[])).toHaveLength(0)

    const range = wrapper.find('.timeline-range')
    await range.setValue('2')
    await flushPromises()

    const renderedEdges = canvas.props('edges') as WorldEdge[]
    expect(renderedEdges).toHaveLength(1)
    expect(renderedEdges[0]?.id).toBe('rel-1')
  })

  it('shows event nodes and event-linked edges in read-only session graphs', async () => {
    const wrapper = mountDialog(
      createGraphData(
        [
          createNode({ id: 'hero', startSequenceIndex: 0, position: { x: 120, y: 120 }, name: '玩家' }),
          createEventNode({
            id: 'event-1',
            name: '启动神经链接适配',
            startSequenceIndex: 1,
            timeline: { sequenceIndex: 1, calendarId: 'calendar-1', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
          }),
        ],
        [
          createEdge({
            id: 'hero|participates_in|event-1',
            sourceNodeId: 'hero',
            targetNodeId: 'event-1',
            relationTypeCode: 'participates_in',
            relationLabel: '参与',
            startSequenceIndex: 1,
          }),
        ],
      ),
      { mode: 'session' },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    const renderedNodes = canvas.props('nodes') as WorldNode[]
    const renderedEdges = canvas.props('edges') as WorldEdge[]

    expect(canvas.props('showEventNodes')).toBe(true)
    expect(renderedNodes.map((node) => node.id)).toContain('event-1')
    expect(renderedEdges.map((edge) => edge.id)).toContain('hero|participates_in|event-1')
  })

  it('shows node status in the detail panel after selecting a session graph node', async () => {
    const wrapper = mountDialog(
      createGraphData([
        createNode({
          id: 'hero',
          name: '玩家',
          status: 'ID已绑定，等待种族选择',
          startSequenceIndex: 0,
          position: { x: 120, y: 120 },
        }),
      ]),
      { mode: 'session' },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    canvas.vm.$emit('select-node', 'hero')
    await flushPromises()

    expect(wrapper.find('.node-detail-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('状态')
    expect(wrapper.text()).toContain('ID已绑定，等待种族选择')
  })

  it('shows relation details in the session graph after selecting an edge', async () => {
    const wrapper = mountDialog(
      createGraphData(
        [
          createNode({ id: 'hero', name: '玩家', startSequenceIndex: 0, position: { x: 120, y: 120 } }),
          createEventNode({
            id: 'event-1',
            name: '绑定完成',
            startSequenceIndex: 1,
            timeline: { sequenceIndex: 1, calendarId: 'calendar-1', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
          }),
        ],
        [
          createEdge({
            id: 'hero|participates_in|event-1',
            sourceNodeId: 'hero',
            targetNodeId: 'event-1',
            relationTypeCode: 'participates_in',
            relationLabel: '参与',
            summary: '玩家完成了绑定流程。',
            status: '已确认',
            intensity: 70,
            startSequenceIndex: 1,
          }),
        ],
      ),
      { mode: 'session' },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    canvas.vm.$emit('select-edge', 'hero|participates_in|event-1')
    await flushPromises()

    expect(wrapper.find('.node-detail-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('关系')
    expect(wrapper.text()).toContain('参与')
    expect(wrapper.text()).toContain('源节点')
    expect(wrapper.text()).toContain('人物: 玩家')
    expect(wrapper.text()).toContain('目标节点')
    expect(wrapper.text()).toContain('事件: 绑定完成')
    expect(wrapper.text()).toContain('玩家完成了绑定流程。')
    expect(wrapper.text()).toContain('已确认')
    expect(wrapper.text()).toContain('70')
  })

  it('toggles full relation rendering in the session graph', async () => {
    const wrapper = mountDialog(
      createGraphData(
        [
          createNode({ id: 'hero', name: '玩家', startSequenceIndex: 0, position: { x: 120, y: 120 } }),
          createNode({ id: 'guild', name: '公会', startSequenceIndex: 0, position: { x: 320, y: 180 }, objectType: 'organization' }),
          createNode({ id: 'city', name: '主城', startSequenceIndex: 0, position: { x: 520, y: 240 }, objectType: 'location' }),
        ],
        [
          createEdge({ id: 'hero|alliance|guild', sourceNodeId: 'hero', targetNodeId: 'guild', relationTypeCode: 'alliance', relationLabel: '联盟', startSequenceIndex: 0 }),
          createEdge({ id: 'hero|located_in|city', sourceNodeId: 'hero', targetNodeId: 'city', relationTypeCode: 'located_in', relationLabel: '位于', startSequenceIndex: 0 }),
        ],
      ),
      { mode: 'session' },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    expect(canvas.props('showAllEdges')).toBe(false)
    expect(wrapper.text()).toContain('关系 0（全部 2）')

    const relationToggleButton = wrapper.findAll('.timeline-actions button').find((item) => item.text() === '全部显示关系')
    expect(relationToggleButton?.exists()).toBe(true)
    await relationToggleButton!.trigger('click')
    await flushPromises()

    expect(canvas.props('showAllEdges')).toBe(true)
    expect(wrapper.text()).toContain('关系 2')
  })

  it('keeps event nodes hidden in editable world graphs', async () => {
    const wrapper = mountDialog(
      createGraphData(
        [
          createNode({ id: 'hero', startSequenceIndex: 0, position: { x: 120, y: 120 }, name: '玩家' }),
          createEventNode({
            id: 'event-1',
            name: '启动神经链接适配',
            startSequenceIndex: 1,
            timeline: { sequenceIndex: 1, calendarId: 'calendar-1', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
          }),
        ],
        [
          createEdge({
            id: 'hero|participates_in|event-1',
            sourceNodeId: 'hero',
            targetNodeId: 'event-1',
            relationTypeCode: 'participates_in',
            relationLabel: '参与',
            startSequenceIndex: 1,
          }),
        ],
      ),
      { mode: 'editor' },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    const renderedNodes = canvas.props('nodes') as WorldNode[]
    const renderedEdges = canvas.props('edges') as WorldEdge[]

    expect(canvas.props('showEventNodes')).toBe(false)
    expect(renderedNodes.map((node) => node.id)).not.toContain('event-1')
    expect(renderedEdges.map((edge) => edge.id)).not.toContain('hero|participates_in|event-1')
  })

  it('opens world settings in a popup instead of keeping the editor form in the sidebar', async () => {
    const wrapper = mountDialog(createGraphData([createNode({ id: 'hero', name: '玩家' })]), {
      mode: 'editor',
      currentRobot: createRobot(),
    })

    await flushPromises()

    expect(wrapper.find('.meta-panel').exists()).toBe(false)
    expect(wrapper.find('.meta-editor-popup').exists()).toBe(false)
    expect(wrapper.find('.sidebar-list').exists()).toBe(true)

    await wrapper.find('.world-settings-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.meta-editor-popup').exists()).toBe(true)
    expect(wrapper.find('.meta-form-popup').exists()).toBe(true)
  })

  it('includes event nodes when running editor auto layout', async () => {
    apiMocks.updateRobotWorldNode.mockImplementation(async (_robotId: string, _nodeId: string, payload: WorldNode) => payload)

    const wrapper = mountDialog(
      createGraphData([
        createNode({ id: 'hero', name: '玩家', position: { x: 120, y: 120 } }),
        createEventNode({
          id: 'event-1',
          name: '绑定完成',
          startSequenceIndex: 1,
          position: { x: 122, y: 122 },
          timeline: { sequenceIndex: 1, calendarId: 'calendar-1', yearLabel: '', monthLabel: '', dayLabel: '', timeOfDayLabel: '', phase: '', impactLevel: 0, eventType: '' },
        }),
      ]),
      { mode: 'editor', currentRobot: createRobot() },
    )

    await flushPromises()

    const canvas = wrapper.findComponent({ name: 'WorldGraphCanvasX6' })
    canvas.vm.$emit('request-auto-layout')
    await flushPromises()

    expect(apiMocks.updateRobotWorldNode).toHaveBeenCalled()
    const updatedNodeIds = apiMocks.updateRobotWorldNode.mock.calls.map((call) => call[1])
    expect(updatedNodeIds).toContain('event-1')
  })

  it('sorts timeline events by timeline order instead of name', async () => {
    const wrapper = mountDialog(
      createGraphData([
        createEventNode({
          id: 'event-c',
          name: '最晚显示',
          startSequenceIndex: 2,
          timeline: { sequenceIndex: 2, calendarId: 'calendar-1', yearLabel: '第一年', monthLabel: '三月', dayLabel: '3日', timeOfDayLabel: '夜晚', phase: '', impactLevel: 0, eventType: '' },
        }),
        createEventNode({
          id: 'event-a',
          name: '最先显示',
          startSequenceIndex: 2,
          timeline: { sequenceIndex: 2, calendarId: 'calendar-1', yearLabel: '第一年', monthLabel: '一月', dayLabel: '1日', timeOfDayLabel: '清晨', phase: '', impactLevel: 0, eventType: '' },
        }),
        createEventNode({
          id: 'event-b',
          name: '中间显示',
          startSequenceIndex: 2,
          timeline: { sequenceIndex: 2, calendarId: 'calendar-1', yearLabel: '第一年', monthLabel: '二月', dayLabel: '2日', timeOfDayLabel: '中午', phase: '', impactLevel: 0, eventType: '' },
        }),
      ]),
    )

    await flushPromises()
    await wrapper.find('.timeline-toggle-button').trigger('click')
    await flushPromises()

    const names = wrapper.findAll('.timeline-event-chip strong').map((item) => item.text())
    expect(names).toEqual(['最先显示', '中间显示', '最晚显示'])
  })

  it('shows full event details when a session event chip is clicked', async () => {
    const longSummary = '这是一段非常长的事件详情，用来验证列表中显示预览，点击后仍然可以查看完整内容。这里继续补充更多描述，确保不会直接整段铺开。'
    const wrapper = mountDialog(
      createGraphData([
        createEventNode({
          id: 'event-detail',
          name: '关键事件',
          startSequenceIndex: 4,
          summary: longSummary,
          timeline: { sequenceIndex: 4, calendarId: 'calendar-1', yearLabel: '第二年', monthLabel: '五月', dayLabel: '12日', timeOfDayLabel: '夜晚', phase: '高潮', impactLevel: 5, eventType: 'battle' },
        }),
      ]),
    )

    await flushPromises()
    await wrapper.find('.timeline-toggle-button').trigger('click')
    await flushPromises()
    await wrapper.find('.timeline-event-chip').trigger('click')
    await flushPromises()

    expect(wrapper.find('.timeline-event-detail-popup').exists()).toBe(true)
    expect(wrapper.text()).toContain('关键事件')
    expect(wrapper.text()).toContain(longSummary)
  })

  it('shows the same event on multiple timeline points when event snapshots continue it', async () => {
    const wrapper = mountDialog(
      createGraphData([
        createEventNode({
          id: 'event-continue',
          name: '调查启动',
          summary: '调查刚刚开始。',
          startSequenceIndex: 2,
          timelineSnapshots: [
            { sequenceIndex: 4, name: '调查推进到取证阶段', summary: '已经进入取证阶段。' },
          ],
          timeline: { sequenceIndex: 2, calendarId: 'calendar-1', yearLabel: '第一年', monthLabel: '一月', dayLabel: '1日', timeOfDayLabel: '清晨', phase: '', impactLevel: 0, eventType: '' },
        }),
      ]),
    )

    await flushPromises()
    await wrapper.find('.timeline-toggle-button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.timeline-event-chip strong').text()).toBe('调查推进到取证阶段')
    expect(wrapper.text()).toContain('时间点 4')

    const range = wrapper.find('.timeline-range')
    await range.setValue('2')
    await flushPromises()

    expect(wrapper.find('.timeline-event-chip strong').text()).toBe('调查启动')
    expect(wrapper.text()).toContain('第一年 / 一月 / 1日 / 清晨')

    await range.setValue('4')
    await flushPromises()
    await wrapper.find('.timeline-event-chip').trigger('click')
    await flushPromises()

    expect(wrapper.find('.timeline-event-detail-popup').exists()).toBe(true)
    expect(wrapper.text()).toContain('调查推进到取证阶段')
    expect(wrapper.text()).toContain('已经进入取证阶段。')
  })
})
