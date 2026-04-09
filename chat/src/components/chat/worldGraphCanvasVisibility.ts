import type { WorldEdge, WorldNode } from '@/types/ai'

function normalizeSequenceIndex(value: number | string | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const normalized = Number(value || 0)
  return Number.isFinite(normalized) ? normalized : 0
}

export function shouldShowWorldGraphCanvasNode(
  node: WorldNode,
  currentSequenceIndex: number,
  showEventNodes = false,
) {
  const startSequenceIndex = normalizeSequenceIndex(node.startSequenceIndex)
  if (startSequenceIndex > currentSequenceIndex) {
    return false
  }

  if (node.objectType === 'event' && !showEventNodes) {
    return false
  }

  return true
}

export function getVisibleWorldGraphCanvasEdges(
  nodes: WorldNode[],
  edges: WorldEdge[],
  currentSequenceIndex: number,
  showEventNodes = false,
) {
  const visibleNodeIds = new Set(
    (Array.isArray(nodes) ? nodes : [])
      .filter((node) => shouldShowWorldGraphCanvasNode(node, currentSequenceIndex, showEventNodes))
      .map((node) => node.id),
  )

  return (Array.isArray(edges) ? edges : []).filter(
    (edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId),
  )
}

export function getRenderableWorldGraphCanvasEdges(options: {
  nodes: WorldNode[]
  edges: WorldEdge[]
  currentSequenceIndex: number
  showEventNodes?: boolean
  selectedNodeId?: string
  selectedEdgeId?: string
  linkingSourceNodeId?: string
  showAllEdges?: boolean
}) {
  const edges = getVisibleWorldGraphCanvasEdges(
    options.nodes,
    options.edges,
    options.currentSequenceIndex,
    Boolean(options.showEventNodes),
  )

  if (options.showAllEdges) {
    return edges
  }

  if (options.selectedEdgeId) {
    return edges.filter((edge) => edge.id === options.selectedEdgeId)
  }

  const focusNodeId = options.selectedNodeId || options.linkingSourceNodeId || ''
  if (focusNodeId) {
    return edges.filter((edge) => edge.sourceNodeId === focusNodeId || edge.targetNodeId === focusNodeId)
  }

  return []
}
