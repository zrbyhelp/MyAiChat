import { describe, expect, it } from 'vitest'

import type { WorldEdge, WorldNode, WorldTimeline } from '@/types/ai'

import {
  getRenderableWorldGraphCanvasEdges,
  getVisibleWorldGraphCanvasEdges,
  shouldShowWorldGraphCanvasNode,
} from './worldGraphCanvasVisibility'

function createNode(overrides: Partial<WorldNode> = {}): WorldNode {
  return {
    id: overrides.id || 'node-1',
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

describe('shouldShowWorldGraphCanvasNode', () => {
  it('shows normal nodes at or before the current timepoint', () => {
    expect(shouldShowWorldGraphCanvasNode(createNode({ startSequenceIndex: 2 }), 2, false)).toBe(true)
  })

  it('keeps event nodes hidden when the canvas is not in session mode', () => {
    expect(shouldShowWorldGraphCanvasNode(createEventNode({ startSequenceIndex: 1 }), 3, false)).toBe(false)
  })

  it('shows event nodes when the session canvas explicitly enables them', () => {
    expect(shouldShowWorldGraphCanvasNode(createEventNode({ startSequenceIndex: 1 }), 3, true)).toBe(true)
  })

  it('keeps future nodes hidden even when event nodes are enabled', () => {
    expect(shouldShowWorldGraphCanvasNode(createEventNode({ startSequenceIndex: 5 }), 3, true)).toBe(false)
  })

  it('only keeps edges whose endpoints are currently visible', () => {
    const nodes = [
      createNode({ id: 'hero', startSequenceIndex: 0 }),
      createEventNode({ id: 'event-1', startSequenceIndex: 2 }),
      createNode({ id: 'future-node', startSequenceIndex: 5 }),
    ]
    const edges = [
      createEdge({ id: 'hero|participates_in|event-1', sourceNodeId: 'hero', targetNodeId: 'event-1', startSequenceIndex: 2 }),
      createEdge({ id: 'hero|ally|future-node', sourceNodeId: 'hero', targetNodeId: 'future-node', startSequenceIndex: 5 }),
    ]

    const visibleEdges = getVisibleWorldGraphCanvasEdges(nodes, edges, 3, true)

    expect(visibleEdges.map((edge) => edge.id)).toEqual(['hero|participates_in|event-1'])
  })

  it('shows all visible edges when the canvas explicitly enables full relation rendering', () => {
    const nodes = [
      createNode({ id: 'hero', startSequenceIndex: 0 }),
      createNode({ id: 'guild', startSequenceIndex: 0, objectType: 'organization' }),
      createNode({ id: 'city', startSequenceIndex: 0, objectType: 'location' }),
    ]
    const edges = [
      createEdge({ id: 'hero|alliance|guild', sourceNodeId: 'hero', targetNodeId: 'guild' }),
      createEdge({ id: 'hero|located_in|city', sourceNodeId: 'hero', targetNodeId: 'city' }),
    ]

    const renderableEdges = getRenderableWorldGraphCanvasEdges({
      nodes,
      edges,
      currentSequenceIndex: 0,
      showAllEdges: true,
    })

    expect(renderableEdges.map((edge) => edge.id)).toEqual(['hero|alliance|guild', 'hero|located_in|city'])
  })

  it('keeps the focused-edge behavior when full relation rendering is off', () => {
    const nodes = [
      createNode({ id: 'hero', startSequenceIndex: 0 }),
      createNode({ id: 'guild', startSequenceIndex: 0, objectType: 'organization' }),
      createNode({ id: 'city', startSequenceIndex: 0, objectType: 'location' }),
    ]
    const edges = [
      createEdge({ id: 'hero|alliance|guild', sourceNodeId: 'hero', targetNodeId: 'guild' }),
      createEdge({ id: 'hero|located_in|city', sourceNodeId: 'hero', targetNodeId: 'city' }),
    ]

    const renderableEdges = getRenderableWorldGraphCanvasEdges({
      nodes,
      edges,
      currentSequenceIndex: 0,
      selectedNodeId: 'guild',
      showAllEdges: false,
    })

    expect(renderableEdges.map((edge) => edge.id)).toEqual(['hero|alliance|guild'])
  })
})
