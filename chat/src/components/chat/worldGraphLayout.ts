import type { WorldNode } from '@/types/ai'

type ViewportSize = {
  width?: number
  height?: number
}

type NodePosition = WorldNode['position']

const DEFAULT_VIEWPORT_WIDTH = 1080
const DEFAULT_VIEWPORT_HEIGHT = 720
const INVALID_POSITION_EPSILON = 2
const COLLISION_DISTANCE = 88
const CLUSTERED_WIDTH_THRESHOLD = 220
const CLUSTERED_HEIGHT_THRESHOLD = 180

function normalizeSequenceIndex(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

function getLayoutEligibleNodes(nodes: WorldNode[], currentSequenceIndex?: number) {
  const visibleSequenceIndex = normalizeSequenceIndex(currentSequenceIndex)
  return nodes.filter((node) => node.objectType !== 'event' && normalizeSequenceIndex(node.startSequenceIndex) <= visibleSequenceIndex)
}

function readFinitePosition(node: WorldNode): NodePosition | null {
  const source = (node as Partial<WorldNode>).position
  if (
    !source ||
    typeof source.x !== 'number' ||
    typeof source.y !== 'number' ||
    !Number.isFinite(source.x) ||
    !Number.isFinite(source.y)
  ) {
    return null
  }

  return {
    x: Math.round(source.x),
    y: Math.round(source.y),
  }
}

function countCollidingPairs(positions: NodePosition[]) {
  let collisions = 0

  for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
    const leftPosition = positions[leftIndex]
    if (!leftPosition) {
      continue
    }
    for (let rightIndex = leftIndex + 1; rightIndex < positions.length; rightIndex += 1) {
      const rightPosition = positions[rightIndex]
      if (!rightPosition) {
        continue
      }
      const deltaX = leftPosition.x - rightPosition.x
      const deltaY = leftPosition.y - rightPosition.y
      const distance = Math.hypot(deltaX, deltaY)
      if (distance < COLLISION_DISTANCE) {
        collisions += 1
      }
    }
  }

  return collisions
}

function hasCollapsedPositions(positions: NodePosition[]) {
  if (positions.length <= 1) {
    return false
  }

  for (let leftIndex = 0; leftIndex < positions.length; leftIndex += 1) {
    const leftPosition = positions[leftIndex]
    if (!leftPosition) {
      continue
    }
    for (let rightIndex = leftIndex + 1; rightIndex < positions.length; rightIndex += 1) {
      const rightPosition = positions[rightIndex]
      if (!rightPosition) {
        continue
      }
      if (
        Math.abs(leftPosition.x - rightPosition.x) <= INVALID_POSITION_EPSILON &&
        Math.abs(leftPosition.y - rightPosition.y) <= INVALID_POSITION_EPSILON
      ) {
        return true
      }
    }
  }

  return false
}

function isTooTightlyClustered(positions: NodePosition[]) {
  if (positions.length < 4) {
    return false
  }

  const xValues = positions.map((position) => position.x)
  const yValues = positions.map((position) => position.y)
  const width = Math.max(...xValues) - Math.min(...xValues)
  const height = Math.max(...yValues) - Math.min(...yValues)

  return width < CLUSTERED_WIDTH_THRESHOLD && height < CLUSTERED_HEIGHT_THRESHOLD
}

function compareNodesForLayout(left: WorldNode, right: WorldNode) {
  if (left.objectType !== right.objectType) {
    return left.objectType.localeCompare(right.objectType)
  }

  const leftSequenceIndex = normalizeSequenceIndex(left.startSequenceIndex)
  const rightSequenceIndex = normalizeSequenceIndex(right.startSequenceIndex)
  if (leftSequenceIndex !== rightSequenceIndex) {
    return leftSequenceIndex - rightSequenceIndex
  }

  const nameCompare = String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN')
  if (nameCompare !== 0) {
    return nameCompare
  }

  return String(left.id || '').localeCompare(String(right.id || ''))
}

function normalizeViewportSize(size?: ViewportSize) {
  const width =
    typeof size?.width === 'number' && Number.isFinite(size.width)
      ? Math.max(720, Math.round(size.width))
      : DEFAULT_VIEWPORT_WIDTH
  const height =
    typeof size?.height === 'number' && Number.isFinite(size.height)
      ? Math.max(480, Math.round(size.height))
      : DEFAULT_VIEWPORT_HEIGHT

  return { width, height }
}

function buildLayoutPositions(nodeCount: number, viewportSize?: ViewportSize) {
  const { width, height } = normalizeViewportSize(viewportSize)
  const centerX = Math.round(width * 0.42)
  const centerY = Math.round(height * 0.46)

  if (nodeCount <= 1) {
    return [{ x: centerX, y: centerY }]
  }

  const radiusXBase = Math.max(180, Math.min(280, Math.round(width * 0.2)))
  const radiusYBase = Math.max(120, Math.min(220, Math.round(height * 0.16)))
  const radiusXStep = 180
  const radiusYStep = 132
  const positions: NodePosition[] = []
  let ringIndex = 0
  let placedCount = 0

  while (placedCount < nodeCount) {
    const remainingCount = nodeCount - placedCount
    const ringNodeCount = ringIndex === 0 ? Math.min(6, remainingCount) : Math.min(remainingCount, 8 + ringIndex * 4)
    const radiusX = radiusXBase + ringIndex * radiusXStep
    const radiusY = radiusYBase + ringIndex * radiusYStep
    const angleOffset = ringIndex % 2 === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ringNodeCount

    if (ringNodeCount === 1) {
      positions.push({ x: centerX, y: centerY })
      break
    }

    for (let slotIndex = 0; slotIndex < ringNodeCount; slotIndex += 1) {
      const angle = angleOffset + (Math.PI * 2 * slotIndex) / ringNodeCount
      positions.push({
        x: Math.round(centerX + Math.cos(angle) * radiusX),
        y: Math.round(centerY + Math.sin(angle) * radiusY),
      })
    }

    placedCount += ringNodeCount
    ringIndex += 1
  }

  return positions
}

export function shouldAutoLayoutSessionGraph(nodes: WorldNode[], currentSequenceIndex = 0) {
  const visibleNodes = getLayoutEligibleNodes(nodes, currentSequenceIndex)
  if (!visibleNodes.length) {
    return false
  }

  const positions = visibleNodes.map(readFinitePosition)
  if (positions.some((position) => !position)) {
    return true
  }

  const finitePositions = positions.filter((position): position is NodePosition => Boolean(position))
  if (hasCollapsedPositions(finitePositions) || isTooTightlyClustered(finitePositions)) {
    return true
  }

  const collidingPairs = countCollidingPairs(finitePositions)
  if (visibleNodes.length <= 3) {
    return collidingPairs > 0
  }

  const totalPairs = (visibleNodes.length * (visibleNodes.length - 1)) / 2
  return collidingPairs >= Math.max(2, Math.ceil(totalPairs * 0.16))
}

export function buildSessionGraphLayout(nodes: WorldNode[], viewportSize?: ViewportSize) {
  const orderedNodes = [...nodes].sort(compareNodesForLayout)
  const positions = buildLayoutPositions(orderedNodes.length, viewportSize)

  return orderedNodes.map((node, index) => ({
    ...node,
    position: positions[index] || positions[positions.length - 1] || { x: 0, y: 0 },
  }))
}
