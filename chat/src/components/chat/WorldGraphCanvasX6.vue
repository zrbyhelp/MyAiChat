<template>
  <div class="graph-shell">
    <div ref="mountRef" class="graph-stage">
      <div ref="graphContainerRef" class="graph-container"></div>
    </div>

    <div class="canvas-overlay">
      <div class="canvas-controls">
        <TButton size="small" variant="outline" @click="zoomOut">缩小</TButton>
        <TButton size="small" variant="outline" @click="fitContent">适应</TButton>
        <TButton size="small" variant="outline" @click="zoomIn">放大</TButton>
        <TButton v-if="!props.readOnly" size="small" variant="outline" @click="emit('request-auto-layout')">布局</TButton>
      </div>
      <div class="mini-map-card">
        <svg class="mini-map-svg" :viewBox="`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`" aria-hidden="true">
          <path
            v-for="edge in miniMapScene.edges"
            :key="edge.id"
            :d="edge.path"
            fill="none"
            :stroke="edge.stroke"
            :stroke-width="edge.strokeWidth"
            stroke-linecap="round"
            stroke-linejoin="round"
            :opacity="edge.opacity"
          />
          <circle
            v-for="node in miniMapScene.nodes"
            :key="node.id"
            :cx="node.x"
            :cy="node.y"
            :r="node.radius"
            :fill="node.fill"
            :stroke="node.stroke"
            :stroke-width="node.strokeWidth"
          />
          <rect
            v-if="miniMapScene.viewport"
            class="mini-map-viewport"
            :x="miniMapScene.viewport.x"
            :y="miniMapScene.viewport.y"
            :width="miniMapScene.viewport.width"
            :height="miniMapScene.viewport.height"
            :rx="10"
            :ry="10"
          />
          <text v-if="!miniMapScene.nodes.length" x="50%" y="50%" text-anchor="middle" dominant-baseline="middle">暂无内容</text>
        </svg>
      </div>
    </div>

    <div v-if="linkingSourceNodeId" class="linking-hint">
      选择要关联的节点
      <TButton size="small" variant="text" @click="emit('cancel-linking')">取消</TButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Graph, Scroller, Selection, Shape, Snapline } from '@antv/x6'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button as TButton } from 'tdesign-vue-next'

import type {
  RobotWorldRelationType,
  WorldEdge,
  WorldGraphLayout,
  WorldNode,
  WorldObjectType,
} from '@/types/ai'

const props = defineProps<{
  nodes: WorldNode[]
  edges: WorldEdge[]
  relationTypes: RobotWorldRelationType[]
  selectedNodeId: string
  selectedEdgeId: string
  linkingSourceNodeId: string
  currentSequenceIndex: number
  layout: WorldGraphLayout
  readOnly?: boolean
  fitRequestKey?: number
}>()

const emit = defineEmits<{
  (e: 'select-node', nodeId: string): void
  (e: 'select-edge', edgeId: string): void
  (e: 'clear-selection'): void
  (e: 'move-node', payload: { nodeId: string; x: number; y: number }): void
  (e: 'pick-link-target-node', nodeId: string): void
  (e: 'start-link-from-node', nodeId: string): void
  (e: 'cancel-linking'): void
  (e: 'request-auto-layout'): void
  (e: 'update-layout', layout: WorldGraphLayout): void
}>()

const mountRef = ref<HTMLElement | null>(null)
const graphContainerRef = ref<HTMLElement | null>(null)
const graphRef = ref<Graph | null>(null)
const resizeObserverRef = ref<ResizeObserver | null>(null)
const scrollerRef = ref<Scroller | null>(null)
const suppressLayoutEmitRef = ref(false)
const scrollListenerRef = ref<(() => void) | null>(null)
const lastAppliedFitRef = ref<{ requestKey: number; width: number; height: number } | null>(null)
const viewportAreaRef = ref<{ x: number; y: number; width: number; height: number } | null>(null)
const MINIMAP_WIDTH = 176
const MINIMAP_HEIGHT = 120
const MINIMAP_PADDING = 12
const NODE_SIZE = 68

const objectTypeFill: Record<WorldObjectType, string> = {
  character: '#86efe2',
  organization: '#8fc7ff',
  location: '#ff9e43',
  event: '#f02bd1',
  item: '#b2ff94',
}

function resolveEdgeLabel(edge: WorldEdge) {
  return edge.relationLabel || props.relationTypes.find((item) => item.code === edge.relationTypeCode)?.label || edge.relationTypeCode
}

function isNodeVisibleOnCanvas(node: WorldNode) {
  const startSequenceIndex = typeof node.startSequenceIndex === 'number' ? node.startSequenceIndex : Number(node.startSequenceIndex || 0)
  return node.objectType !== 'event' && startSequenceIndex <= props.currentSequenceIndex
}

const visibleNodes = () => props.nodes.filter(isNodeVisibleOnCanvas)

function visibleEdges() {
  const visibleNodeIds = new Set(visibleNodes().map((node) => node.id))
  return props.edges.filter((edge) => visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
}

function getActiveFocusNodeId() {
  return props.selectedNodeId || props.linkingSourceNodeId || ''
}

function isEdgeFocused(edge: WorldEdge) {
  if (props.selectedEdgeId) {
    return edge.id === props.selectedEdgeId
  }

  const focusNodeId = getActiveFocusNodeId()
  if (focusNodeId) {
    return edge.sourceNodeId === focusNodeId || edge.targetNodeId === focusNodeId
  }

  return false
}

function resolveEdgeOpacity(edge: WorldEdge) {
  return isEdgeFocused(edge) ? 1 : 0
}

function renderableEdges() {
  const edges = visibleEdges()
  if (props.selectedEdgeId) {
    return edges.filter((edge) => edge.id === props.selectedEdgeId)
  }

  const focusNodeId = getActiveFocusNodeId()
  if (focusNodeId) {
    return edges.filter((edge) => edge.sourceNodeId === focusNodeId || edge.targetNodeId === focusNodeId)
  }

  return []
}

function getNodeCenter(node: WorldNode) {
  return {
    x: node.position.x + NODE_SIZE / 2,
    y: node.position.y + NODE_SIZE / 2,
  }
}

function buildEdgeGroupKey(edge: WorldEdge) {
  return [edge.sourceNodeId, edge.targetNodeId].sort((left, right) => left.localeCompare(right, 'zh-CN')).join('::')
}

function resolveEdgeSiblingOffset(edge: WorldEdge, edges: WorldEdge[]) {
  const siblings = (Array.isArray(edges) ? edges : [])
    .filter((item) => buildEdgeGroupKey(item) === buildEdgeGroupKey(edge))
    .sort((left, right) =>
      left.sourceNodeId.localeCompare(right.sourceNodeId, 'zh-CN')
      || left.targetNodeId.localeCompare(right.targetNodeId, 'zh-CN')
      || left.id.localeCompare(right.id, 'zh-CN'),
    )

  if (siblings.length <= 1) {
    return 0
  }

  const index = siblings.findIndex((item) => item.id === edge.id)
  if (index < 0) {
    return 0
  }

  return index - (siblings.length - 1) / 2
}

function buildCurveVertex(sourceNode: WorldNode | undefined, targetNode: WorldNode | undefined, siblingOffset = 0) {
  if (!sourceNode || !targetNode) {
    return []
  }

  const source = getNodeCenter(sourceNode)
  const target = getNodeCenter(targetNode)
  if (!siblingOffset) {
    return []
  }

  const middleX = (source.x + target.x) / 2
  const middleY = (source.y + target.y) / 2
  const deltaX = target.x - source.x
  const deltaY = target.y - source.y
  const length = Math.max(1, Math.hypot(deltaX, deltaY))
  const baseOffset = Math.min(110, Math.max(42, length * 0.16))
  const offset = baseOffset * siblingOffset

  return [
    {
      x: Math.round(middleX - (deltaY / length) * offset),
      y: Math.round(middleY + (deltaX / length) * offset),
    },
  ]
}

function createNodeCell(node: WorldNode) {
  return new Shape.Rect({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: 68,
    height: 68,
    attrs: {
      body: {
        fill: objectTypeFill[node.objectType],
        stroke: props.selectedNodeId === node.id || props.linkingSourceNodeId === node.id ? '#111111' : 'transparent',
        strokeWidth: props.selectedNodeId === node.id || props.linkingSourceNodeId === node.id ? 2 : 0,
        rx: 34,
        ry: 34,
      },
      label: {
        text: node.name,
        fill: '#3f4349',
        fontSize: 14,
        fontWeight: 500,
        textAnchor: 'start',
        textVerticalAnchor: 'middle',
        refX: 82,
        refY: 34,
      },
    },
  })
}

function createEdgeCell(edge: WorldEdge) {
  const nodes = visibleNodes()
  const edges = renderableEdges()
  const sourceNode = nodes.find((item) => item.id === edge.sourceNodeId)
  const targetNode = nodes.find((item) => item.id === edge.targetNodeId)
  const isSelectedEdge = props.selectedEdgeId === edge.id
  const siblingOffset = resolveEdgeSiblingOffset(edge, edges)

  return new Shape.Edge({
    id: edge.id,
    source: { cell: edge.sourceNodeId },
    target: { cell: edge.targetNodeId },
    vertices: buildCurveVertex(sourceNode, targetNode, siblingOffset),
    connector: { name: 'smooth' },
    attrs: {
      line: {
        stroke: isSelectedEdge ? '#2563eb' : '#1f2937',
        strokeWidth: isSelectedEdge ? 2.5 : 1.8,
        strokeOpacity: resolveEdgeOpacity(edge),
        targetMarker: null,
      },
    },
    labels: [
      {
        markup: [
          {
            tagName: 'text',
            selector: 'label',
          },
        ],
        position: 0.52,
        attrs: {
          label: {
            text: resolveEdgeLabel(edge),
            fill: '#3f4349',
            fontSize: 13,
            fontWeight: 500,
            opacity: resolveEdgeOpacity(edge),
            textAnchor: 'middle',
            textVerticalAnchor: 'middle',
            pointerEvents: 'none',
          },
        },
      },
    ],
  })
}

const miniMapScene = computed(() => {
  const nodes = visibleNodes()
  const viewportArea = viewportAreaRef.value
  if (!nodes.length && !viewportArea) {
    return {
      nodes: [] as Array<{ id: string; x: number; y: number; radius: number; fill: string; stroke: string; strokeWidth: number }>,
      edges: [] as Array<{ id: string; path: string; stroke: string; strokeWidth: number; opacity: number }>,
      viewport: null as null | { x: number; y: number; width: number; height: number },
    }
  }

  const xStarts = nodes.map((node) => node.position.x)
  const yStarts = nodes.map((node) => node.position.y)
  const xEnds = nodes.map((node) => node.position.x + NODE_SIZE)
  const yEnds = nodes.map((node) => node.position.y + NODE_SIZE)
  if (viewportArea) {
    xStarts.push(viewportArea.x)
    yStarts.push(viewportArea.y)
    xEnds.push(viewportArea.x + viewportArea.width)
    yEnds.push(viewportArea.y + viewportArea.height)
  }

  const minX = Math.min(...xStarts)
  const minY = Math.min(...yStarts)
  const maxX = Math.max(...xEnds)
  const maxY = Math.max(...yEnds)
  const innerWidth = MINIMAP_WIDTH - MINIMAP_PADDING * 2
  const innerHeight = MINIMAP_HEIGHT - MINIMAP_PADDING * 2
  const contentWidth = Math.max(NODE_SIZE, maxX - minX)
  const contentHeight = Math.max(NODE_SIZE, maxY - minY)
  const scale = Math.min(innerWidth / contentWidth, innerHeight / contentHeight)
  const offsetX = (MINIMAP_WIDTH - contentWidth * scale) / 2 - minX * scale
  const offsetY = (MINIMAP_HEIGHT - contentHeight * scale) / 2 - minY * scale
  const visibleNodeMap = new Map(nodes.map((node) => [node.id, node] as const))
  const projectPoint = (x: number, y: number) => ({
    x: Number((x * scale + offsetX).toFixed(2)),
    y: Number((y * scale + offsetY).toFixed(2)),
  })

  const edges = renderableEdges()
  const edgeItems = edges.map((edge) => {
    const sourceNode = visibleNodeMap.get(edge.sourceNodeId)
    const targetNode = visibleNodeMap.get(edge.targetNodeId)
    if (!sourceNode || !targetNode) {
      return null
    }

    const source = projectPoint(getNodeCenter(sourceNode).x, getNodeCenter(sourceNode).y)
    const target = projectPoint(getNodeCenter(targetNode).x, getNodeCenter(targetNode).y)
    const vertices = buildCurveVertex(sourceNode, targetNode, resolveEdgeSiblingOffset(edge, edges)).map((vertex) => projectPoint(vertex.x, vertex.y))
    const path = vertices[0]
      ? `M ${source.x} ${source.y} Q ${vertices[0].x} ${vertices[0].y} ${target.x} ${target.y}`
      : `M ${source.x} ${source.y} L ${target.x} ${target.y}`

    return {
      id: edge.id,
      path,
      stroke: props.selectedEdgeId === edge.id ? '#2563eb' : '#4b5563',
      strokeWidth: props.selectedEdgeId === edge.id ? 2 : 1.4,
      opacity: resolveEdgeOpacity(edge),
    }
  }).filter((edge): edge is { id: string; path: string; stroke: string; strokeWidth: number; opacity: number } => Boolean(edge))

  const nodeRadius = Number(Math.min(9, Math.max(4.5, (NODE_SIZE / 2) * scale)).toFixed(2))
  const nodeItems = nodes.map((node) => {
    const center = getNodeCenter(node)
    const projected = projectPoint(center.x, center.y)
    return {
      id: node.id,
      x: projected.x,
      y: projected.y,
      radius: nodeRadius,
      fill: objectTypeFill[node.objectType],
      stroke: props.selectedNodeId === node.id || props.linkingSourceNodeId === node.id ? '#111111' : 'rgba(255,255,255,0.92)',
      strokeWidth: props.selectedNodeId === node.id || props.linkingSourceNodeId === node.id ? 2 : 1.2,
    }
  })

  return {
    nodes: nodeItems,
    edges: edgeItems,
    viewport: viewportArea
      ? (() => {
          const topLeft = projectPoint(viewportArea.x, viewportArea.y)
          const bottomRight = projectPoint(viewportArea.x + viewportArea.width, viewportArea.y + viewportArea.height)
          return {
            x: Number(topLeft.x.toFixed(2)),
            y: Number(topLeft.y.toFixed(2)),
            width: Number(Math.max(18, bottomRight.x - topLeft.x).toFixed(2)),
            height: Number(Math.max(14, bottomRight.y - topLeft.y).toFixed(2)),
          }
        })()
      : null,
  }
})

function syncMiniMapViewport() {
  const graph = graphRef.value
  if (!graph) {
    viewportAreaRef.value = null
    return
  }

  const visibleArea = graph.getGraphArea()
  viewportAreaRef.value = {
    x: Number(visibleArea.x.toFixed(2)),
    y: Number(visibleArea.y.toFixed(2)),
    width: Number(visibleArea.width.toFixed(2)),
    height: Number(visibleArea.height.toFixed(2)),
  }
}

function emitLayoutChange() {
  const graph = graphRef.value
  const scroller = scrollerRef.value
  if (!graph || !scroller || suppressLayoutEmitRef.value) {
    return
  }

  syncMiniMapViewport()
  const scrollbar = scroller.getScrollbarPosition()
  emit('update-layout', {
    viewportX: Math.round(scrollbar.left),
    viewportY: Math.round(scrollbar.top),
    zoom: Number(graph.zoom().toFixed(2)),
  })
}

function applyLayoutFromProps() {
  const graph = graphRef.value
  if (!graph) {
    return
  }

  suppressLayoutEmitRef.value = true
  graph.zoom(props.layout.zoom || 1, { absolute: true })
  graph.setScrollbarPosition(props.layout.viewportX || 0, props.layout.viewportY || 0)
  window.setTimeout(() => {
    suppressLayoutEmitRef.value = false
  }, 0)
  syncMiniMapViewport()
}

function syncSelection() {
  const graph = graphRef.value
  if (!graph || !graph.isSelectionEnabled()) {
    return
  }

  if (props.selectedNodeId) {
    graph.resetSelection(props.selectedNodeId)
    return
  }

  if (props.selectedEdgeId) {
    graph.resetSelection(props.selectedEdgeId)
    return
  }

  graph.cleanSelection()
}

function renderGraph() {
  const graph = graphRef.value
  if (!graph) {
    return
  }

  graph.resetCells([
    ...visibleNodes().map(createNodeCell),
    ...renderableEdges().map(createEdgeCell),
  ])
  syncSelection()
  graph.updateScroller()
  syncMiniMapViewport()
}

function zoomIn() {
  const graph = graphRef.value
  if (!graph) {
    return
  }

  graph.zoom(Math.min(2, graph.zoom() + 0.1), { absolute: true })
  emitLayoutChange()
}

function zoomOut() {
  const graph = graphRef.value
  if (!graph) {
    return
  }

  graph.zoom(Math.max(0.35, graph.zoom() - 0.1), { absolute: true })
  emitLayoutChange()
}

function fitContent() {
  const graph = graphRef.value
  if (!graph) {
    return
  }

  graph.zoomToFit({ padding: 48, maxScale: 1.2 })
  emitLayoutChange()
}

function getViewportSize() {
  return {
    width: Math.round(mountRef.value?.clientWidth || 0),
    height: Math.round(mountRef.value?.clientHeight || 0),
  }
}

function applyRequestedFitContent() {
  if (!graphRef.value || !props.fitRequestKey) {
    return
  }

  if (!visibleNodes().length) {
    return
  }

  const viewport = getViewportSize()
  if (viewport.width < 160 || viewport.height < 160) {
    return
  }

  const lastAppliedFit = lastAppliedFitRef.value
  if (
    lastAppliedFit &&
    lastAppliedFit.requestKey === props.fitRequestKey &&
    lastAppliedFit.width === viewport.width &&
    lastAppliedFit.height === viewport.height
  ) {
    return
  }

  fitContent()
  lastAppliedFitRef.value = {
    requestKey: props.fitRequestKey,
    width: viewport.width,
    height: viewport.height,
  }
}

function bindGraphEvents(graph: Graph) {
  graph.on('node:click', ({ node }) => {
    if (props.linkingSourceNodeId) {
      if (node.id === props.linkingSourceNodeId) {
        emit('cancel-linking')
        return
      }
      emit('pick-link-target-node', node.id)
      return
    }

    emit('select-node', node.id)
  })

  graph.on('edge:click', ({ edge }) => {
    if (props.linkingSourceNodeId) {
      return
    }
    emit('select-edge', edge.id)
  })

  graph.on('blank:click', () => {
    if (props.linkingSourceNodeId) {
      emit('cancel-linking')
      return
    }
    emit('clear-selection')
  })

  graph.on('node:moved', ({ node }) => {
    const position = node.position()
    emit('move-node', {
      nodeId: node.id,
      x: Math.round(position.x),
      y: Math.round(position.y),
    })
  })

  graph.on('scale', () => {
    emitLayoutChange()
  })

  graph.on('translate', () => {
    emitLayoutChange()
  })
}

function setupResizeObserver() {
  if (!mountRef.value || !graphRef.value) {
    return
  }

  resizeObserverRef.value = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (!entry || !graphRef.value) {
      return
    }

    graphRef.value.resize(Math.max(480, Math.round(entry.contentRect.width)), Math.max(360, Math.round(entry.contentRect.height)))
    graphRef.value.updateScroller()
    applyRequestedFitContent()
  })

  resizeObserverRef.value.observe(mountRef.value)
}

async function initializeGraph() {
  if (!mountRef.value || !graphContainerRef.value || graphRef.value) {
    return
  }

  const graph = new Graph({
    container: graphContainerRef.value,
    width: Math.max(480, mountRef.value.clientWidth || 480),
    height: Math.max(360, mountRef.value.clientHeight || 360),
    grid: { visible: false },
    background: { color: '#f3f3f3' },
    translating: { restrict: false },
    mousewheel: {
      enabled: true,
      modifiers: ['ctrl', 'meta'],
      minScale: 0.35,
      maxScale: 2,
      factor: 1.1,
      zoomAtMousePosition: true,
    },
    connecting: {
      allowBlank: false,
      allowLoop: false,
      allowNode: false,
      allowEdge: false,
      allowPort: false,
      validateMagnet() {
        return false
      },
      validateConnection() {
        return false
      },
    },
    interacting: {
      nodeMovable: true,
      edgeLabelMovable: false,
      vertexAddable: false,
      vertexDeletable: false,
      arrowheadMovable: false,
    },
  })

  const scroller = new Scroller({
    pannable: true,
    autoResize: true,
    pageVisible: false,
    padding: 180,
  })

  graph.use(scroller)
  graph.use(new Snapline({ enabled: true }))
  graph.use(new Selection({ enabled: true, multiple: false, rubberband: false, showNodeSelectionBox: false, showEdgeSelectionBox: false }))

  mountRef.value.replaceChildren(scroller.container)
  scrollListenerRef.value = () => {
    emitLayoutChange()
  }
  scroller.container.addEventListener('scroll', scrollListenerRef.value)

  graphRef.value = graph
  scrollerRef.value = scroller

  bindGraphEvents(graph)
  renderGraph()
  await nextTick()
  applyLayoutFromProps()
  applyRequestedFitContent()
  setupResizeObserver()
}

function destroyGraph() {
  resizeObserverRef.value?.disconnect()
  resizeObserverRef.value = null

  if (scrollerRef.value && scrollListenerRef.value) {
    scrollerRef.value.container.removeEventListener('scroll', scrollListenerRef.value)
  }

  graphRef.value?.dispose()
  graphRef.value = null
  scrollerRef.value = null
  scrollListenerRef.value = null
  viewportAreaRef.value = null
}

watch(
  () => [props.nodes, props.edges, props.relationTypes],
  async () => {
    renderGraph()
    await nextTick()
    applyRequestedFitContent()
  },
)

watch(
  () => [props.selectedNodeId, props.selectedEdgeId, props.linkingSourceNodeId],
  () => {
    renderGraph()
  },
)

watch(
  () => [props.layout.viewportX, props.layout.viewportY, props.layout.zoom],
  () => {
    if (!graphRef.value || suppressLayoutEmitRef.value) {
      return
    }
    applyLayoutFromProps()
  },
)

watch(
  () => props.fitRequestKey,
  async () => {
    await nextTick()
    applyRequestedFitContent()
  },
)

onMounted(() => {
  void initializeGraph()
})

onBeforeUnmount(() => {
  destroyGraph()
})
</script>

<style scoped>
.graph-shell{position:relative;height:100%;min-height:0;background:#f3f3f3;overflow:hidden}
.graph-stage,.graph-container{width:100%;height:100%}
.canvas-overlay{position:absolute;top:32px;right:32px;display:flex;flex-direction:column;align-items:flex-end;gap:14px;pointer-events:none}
.canvas-controls,.mini-map-card,.linking-hint{pointer-events:auto}
.canvas-controls{display:flex;gap:8px}
.mini-map-card{width:176px;height:120px;border-radius:22px;background:rgba(255,255,255,.96);box-shadow:0 12px 28px rgba(15,23,42,.08);overflow:hidden}
.mini-map-svg{display:block;width:100%;height:100%;background:#fff}
.mini-map-viewport{fill:rgba(37,99,235,.08);stroke:#2563eb;stroke-width:2}
.mini-map-svg text{fill:#6b7280;font-size:11px}
.linking-hint{position:absolute;top:28px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:rgba(17,17,17,.92);color:#fff;font-size:13px;z-index:5}
@media (max-width:960px){.canvas-overlay{top:18px;right:18px}}
</style>
