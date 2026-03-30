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
        <TButton size="small" variant="outline" @click="emit('request-auto-layout')">布局</TButton>
      </div>
      <div class="mini-map-card">
        <div ref="miniMapRef" class="mini-map"></div>
      </div>
    </div>

    <div v-if="linkingSourceNodeId" class="linking-hint">
      选择要关联的节点
      <TButton size="small" variant="text" @click="emit('cancel-linking')">取消</TButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Graph, MiniMap, Scroller, Selection, Shape, Snapline } from '@antv/x6'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
const miniMapRef = ref<HTMLElement | null>(null)
const graphRef = ref<Graph | null>(null)
const resizeObserverRef = ref<ResizeObserver | null>(null)
const scrollerRef = ref<Scroller | null>(null)
const suppressLayoutEmitRef = ref(false)
const scrollListenerRef = ref<(() => void) | null>(null)
const MINIMAP_WIDTH = 176
const MINIMAP_HEIGHT = 120

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

function getNodeCenter(node: WorldNode) {
  return {
    x: node.position.x + 34,
    y: node.position.y + 34,
  }
}

function buildCurveVertex(sourceNode: WorldNode | undefined, targetNode: WorldNode | undefined) {
  if (!sourceNode || !targetNode) {
    return []
  }

  const source = getNodeCenter(sourceNode)
  const target = getNodeCenter(targetNode)
  const middleX = (source.x + target.x) / 2
  const middleY = (source.y + target.y) / 2
  const deltaX = target.x - source.x
  const deltaY = target.y - source.y
  const length = Math.max(1, Math.hypot(deltaX, deltaY))
  const offset = Math.min(110, Math.max(42, length * 0.2))

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
  const sourceNode = visibleNodes().find((item) => item.id === edge.sourceNodeId)
  const targetNode = visibleNodes().find((item) => item.id === edge.targetNodeId)

  return new Shape.Edge({
    id: edge.id,
    source: { cell: edge.sourceNodeId },
    target: { cell: edge.targetNodeId },
    vertices: buildCurveVertex(sourceNode, targetNode),
    connector: { name: 'smooth' },
    attrs: {
      line: {
        stroke: props.selectedEdgeId === edge.id ? '#2563eb' : '#1f2937',
        strokeWidth: props.selectedEdgeId === edge.id ? 2.5 : 1.8,
        targetMarker: null,
      },
    },
    labels: [
      {
        position: 0.52,
        attrs: {
          text: {
            text: resolveEdgeLabel(edge),
            fill: '#3f4349',
            fontSize: 13,
          },
        },
      },
    ],
  })
}

function emitLayoutChange() {
  const graph = graphRef.value
  const scroller = scrollerRef.value
  if (!graph || !scroller || suppressLayoutEmitRef.value) {
    return
  }

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
    ...visibleEdges().map(createEdgeCell),
  ])
  syncSelection()
  graph.updateScroller()
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
  })

  resizeObserverRef.value.observe(mountRef.value)
}

async function initializeGraph() {
  if (!mountRef.value || !graphContainerRef.value || !miniMapRef.value || graphRef.value) {
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
  graph.use(
    new MiniMap({
      container: miniMapRef.value,
      width: MINIMAP_WIDTH,
      height: MINIMAP_HEIGHT,
      padding: 10,
      scalable: true,
    }),
  )

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
}

watch(
  () => [props.nodes, props.edges, props.relationTypes],
  () => {
    renderGraph()
  },
)

watch(
  () => [props.selectedNodeId, props.selectedEdgeId, props.linkingSourceNodeId],
  () => {
    syncSelection()
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
.mini-map{width:100%;height:100%;background:#fff}
.mini-map :deep(.x6-widget-minimap){width:100%!important;height:100%!important;padding:0;background:#fff}
.mini-map :deep(.x6-widget-minimap-viewport){border-radius:18px}
.linking-hint{position:absolute;top:28px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:999px;background:rgba(17,17,17,.92);color:#fff;font-size:13px;z-index:5}
@media (max-width:960px){.canvas-overlay{top:18px;right:18px}}
</style>
