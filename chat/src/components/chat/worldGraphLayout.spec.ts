import { describe, expect, it } from 'vitest'

import { buildSessionGraphLayout, shouldAutoLayoutSessionGraph } from './worldGraphLayout'
import type { WorldNode } from '@/types/ai'

function createNode(overrides: Partial<WorldNode> = {}): WorldNode {
  return {
    id: overrides.id || `node-${Math.random().toString(36).slice(2, 8)}`,
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

describe('worldGraphLayout', () => {
  it('requests auto layout when visible nodes are missing finite positions', () => {
    const nodes = [
      createNode({ id: 'a', position: { x: 160, y: 120 } }),
      createNode({ id: 'b', position: { x: Number.NaN, y: 120 } }),
    ]

    expect(shouldAutoLayoutSessionGraph(nodes)).toBe(true)
  })

  it('requests auto layout when visible nodes are heavily overlapped', () => {
    const nodes = [
      createNode({ id: 'a', position: { x: 120, y: 120 } }),
      createNode({ id: 'b', position: { x: 122, y: 122 } }),
      createNode({ id: 'c', position: { x: 124, y: 124 } }),
      createNode({ id: 'd', position: { x: 126, y: 126 } }),
    ]

    expect(shouldAutoLayoutSessionGraph(nodes)).toBe(true)
  })

  it('skips auto layout when positions are already readable', () => {
    const nodes = [
      createNode({ id: 'a', position: { x: 120, y: 120 } }),
      createNode({ id: 'b', position: { x: 320, y: 160 } }),
      createNode({ id: 'c', position: { x: 520, y: 320 } }),
      createNode({ id: 'd', position: { x: 760, y: 220 } }),
    ]

    expect(shouldAutoLayoutSessionGraph(nodes)).toBe(false)
  })

  it('builds stable finite positions without collisions', () => {
    const nodes = [
      createNode({ id: 'c', name: '第三', position: { x: 0, y: 0 } }),
      createNode({ id: 'a', name: '第一', position: { x: 0, y: 0 } }),
      createNode({ id: 'b', name: '第二', position: { x: 0, y: 0 }, objectType: 'location' }),
      createNode({ id: 'd', name: '第四', position: { x: 0, y: 0 }, objectType: 'organization' }),
    ]

    const firstLayout = buildSessionGraphLayout(nodes, { width: 960, height: 640 })
    const secondLayout = buildSessionGraphLayout(nodes, { width: 960, height: 640 })

    expect(firstLayout).toEqual(secondLayout)

    for (const node of firstLayout) {
      expect(Number.isFinite(node.position.x)).toBe(true)
      expect(Number.isFinite(node.position.y)).toBe(true)
    }

    for (let leftIndex = 0; leftIndex < firstLayout.length; leftIndex += 1) {
      const leftNode = firstLayout[leftIndex]
      if (!leftNode) {
        continue
      }
      for (let rightIndex = leftIndex + 1; rightIndex < firstLayout.length; rightIndex += 1) {
        const rightNode = firstLayout[rightIndex]
        if (!rightNode) {
          continue
        }
        const deltaX = leftNode.position.x - rightNode.position.x
        const deltaY = leftNode.position.y - rightNode.position.y
        expect(Math.hypot(deltaX, deltaY)).toBeGreaterThanOrEqual(88)
      }
    }
  })

  it('includes visible event nodes in auto layout decisions and generated positions', () => {
    const nodes = [
      createNode({ id: 'hero', position: { x: 120, y: 120 } }),
      createNode({ id: 'event-1', objectType: 'event', position: { x: 121, y: 121 }, startSequenceIndex: 1 }),
      createNode({ id: 'location-1', objectType: 'location', position: { x: 122, y: 122 }, startSequenceIndex: 1 }),
      createNode({ id: 'org-1', objectType: 'organization', position: { x: 123, y: 123 }, startSequenceIndex: 1 }),
    ]

    expect(shouldAutoLayoutSessionGraph(nodes, 1)).toBe(true)

    const layout = buildSessionGraphLayout(nodes, { width: 960, height: 640 })
    const eventNode = layout.find((node) => node.id === 'event-1')

    expect(eventNode).toBeTruthy()
    expect(Number.isFinite(eventNode?.position.x)).toBe(true)
    expect(Number.isFinite(eventNode?.position.y)).toBe(true)
  })
})
