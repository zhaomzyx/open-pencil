<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'

import { useI18n } from '@open-pencil/vue/i18n'
import { nextFixedZoom } from '@open-pencil/vue/shared/input'

import { FLOW_GRID_STEP, type FlowPoint, type PrototypeFlow } from '@/app/editor/prototype-flow'
import AppButton from '@/components/ui/button/AppButton.vue'
import IconButton from '@/components/ui/button/IconButton.vue'

import {
  createFlowEdgePaths,
  flowCardBounds,
  resolveFlowPositions,
  type FlowBounds
} from './geometry'
import PrototypeFlowCard from './PrototypeFlowCard.vue'
import PrototypeFlowConnections from './PrototypeFlowConnections'
import PrototypeFlowMinimap from './PrototypeFlowMinimap.vue'

interface PanDrag {
  pointerId: number
  startClient: FlowPoint
  startView: FlowPoint
  clearSelectionOnClick: boolean
  moved: boolean
}

interface CardDrag {
  id: string
  pointerId: number
  startClient: FlowPoint
  startPoint: FlowPoint
  currentPoint: FlowPoint
  moved: boolean
}

const { flow, positions, thumbnails } = defineProps<{
  flow: PrototypeFlow
  positions: ReadonlyMap<string, FlowPoint>
  thumbnails: ReadonlyMap<string, string>
}>()
const emit = defineEmits<{
  move: [id: string, point: FlowPoint]
  'open-source': [sourceId: string]
  play: [frameId: string | null]
  arrange: []
}>()

const { commands, menu, panels } = useI18n()
const viewport = shallowRef<HTMLElement>()
const viewportSize = shallowRef({ width: 0, height: 0 })
const view = ref({ x: 0, y: 0, scale: 1 })
const panDrag = shallowRef<PanDrag | null>(null)
const cardDrag = shallowRef<CardDrag | null>(null)
const selectedFrameId = ref<string | null>(null)
let cardPointerDragged = false
const hoveredEdgeId = ref<string | null>(null)
const hasFitted = ref(false)

const MIN_ZOOM = 0.08
const MAX_ZOOM = 3.75
const MAX_FIT_ZOOM = 1.6
const FIT_PADDING_X = 20
const FIT_PADDING_TOP = 20
const FIT_TOOLBAR_SPACE = 64
const FIT_CONTENT_MARGIN = 24
const DRAG_THRESHOLD = 4
const ZOOM_BUTTON_FACTOR = 1.2
const ROUTE_MARGIN = 124
const LABEL_MAX_INVERSE_SCALE = 2.4

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const resolvedPositions = computed(() => resolveFlowPositions(flow, positions))

const dragAdjustedPositions = computed(() => {
  const positions = new Map(resolvedPositions.value)
  const drag = cardDrag.value
  if (drag) positions.set(drag.id, drag.currentPoint)
  return positions
})

const cardBounds = computed(() => flowCardBounds(flow, dragAdjustedPositions.value))
const routeBounds = computed<FlowBounds>(() => ({
  minX: cardBounds.value.minX - ROUTE_MARGIN,
  minY: cardBounds.value.minY - ROUTE_MARGIN,
  maxX: cardBounds.value.maxX + ROUTE_MARGIN,
  maxY: cardBounds.value.maxY + ROUTE_MARGIN
}))
const worldSize = computed(() => ({
  width: Math.max(800, routeBounds.value.maxX + ROUTE_MARGIN),
  height: Math.max(600, routeBounds.value.maxY + ROUTE_MARGIN)
}))
const edgePaths = computed(() => createFlowEdgePaths(flow, dragAdjustedPositions.value))
const contentBounds = computed<FlowBounds>(() => {
  const bounds = { ...cardBounds.value }
  for (const edge of edgePaths.value) {
    bounds.minX = Math.min(bounds.minX, edge.bounds.minX)
    bounds.minY = Math.min(bounds.minY, edge.bounds.minY)
    bounds.maxX = Math.max(bounds.maxX, edge.bounds.maxX)
    bounds.maxY = Math.max(bounds.maxY, edge.bounds.maxY)
  }
  return bounds
})
const viewportBounds = computed<FlowBounds>(() => {
  const { x, y, scale } = view.value
  const { width, height } = viewportSize.value
  return {
    minX: -x / scale,
    minY: -y / scale,
    maxX: (width - x) / scale,
    maxY: (height - y) / scale
  }
})
const frameNames = computed(() => new Map(flow.frames.map((frame) => [frame.id, frame.name])))
const worldStyle = computed(() => ({
  width: `${worldSize.value.width}px`,
  height: `${worldSize.value.height}px`,
  transform: `translate(${view.value.x}px, ${view.value.y}px) scale(${view.value.scale})`
}))
const gridStyle = computed(() => {
  const step = FLOW_GRID_STEP * view.value.scale
  const gridSize = step * Math.max(1, Math.ceil(12 / step))
  return {
    backgroundImage: 'radial-gradient(circle, var(--color-border) 1px, transparent 1.15px)',
    backgroundSize: `${gridSize}px ${gridSize}px`,
    backgroundPosition: `${(view.value.x % gridSize) - gridSize / 2}px ${(view.value.y % gridSize) - gridSize / 2}px`
  }
})
const labelInverseScale = computed(() => Math.min(LABEL_MAX_INVERSE_SCALE, 1 / view.value.scale))
const zoomPercent = computed(() => Number((view.value.scale * 100).toFixed(1)).toString())
const highlightedFrameIds = computed(() => {
  const selected = selectedFrameId.value
  if (!selected) return null

  const ids = new Set([selected])
  for (const edge of flow.edges) {
    if (edge.from === selected) ids.add(edge.to)
    if (edge.to === selected) ids.add(edge.from)
  }
  return ids
})

function fitToView() {
  const element = viewport.value
  if (!element || element.clientWidth === 0 || element.clientHeight === 0) return
  const bounds = contentBounds.value
  const width = Math.max(1, bounds.maxX - bounds.minX + FIT_CONTENT_MARGIN * 2)
  const height = Math.max(1, bounds.maxY - bounds.minY + FIT_CONTENT_MARGIN * 2)
  const availableWidth = Math.max(1, element.clientWidth - FIT_PADDING_X * 2)
  const availableHeight = Math.max(1, element.clientHeight - FIT_PADDING_TOP - FIT_TOOLBAR_SPACE)
  const scale = clamp(
    Math.min(availableWidth / width, availableHeight / height),
    MIN_ZOOM,
    MAX_FIT_ZOOM
  )
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2

  view.value = {
    x: FIT_PADDING_X + availableWidth / 2 - centerX * scale,
    y: FIT_PADDING_TOP + availableHeight / 2 - centerY * scale,
    scale
  }
  hasFitted.value = true
}

useResizeObserver(viewport, () => {
  const element = viewport.value
  if (!element) return
  const { clientWidth: width, clientHeight: height } = element
  viewportSize.value = { width, height }
  if (!hasFitted.value && width > 0 && height > 0) fitToView()
})

watch(
  () => flow,
  (chart) => {
    if (selectedFrameId.value && !chart.frames.some(({ id }) => id === selectedFrameId.value))
      selectedFrameId.value = null
  },
  { flush: 'post' }
)

function beginPan(event: PointerEvent, button: 0 | 1) {
  if (event.button !== button || !event.isPrimary || !(event.currentTarget instanceof HTMLElement))
    return
  if (
    button === 0 &&
    event.target instanceof Element &&
    event.target.closest('[data-flow-interactive]')
  )
    return

  if (button === 1) event.stopPropagation()
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  panDrag.value = {
    pointerId: event.pointerId,
    startClient: { x: event.clientX, y: event.clientY },
    startView: { x: view.value.x, y: view.value.y },
    clearSelectionOnClick: button === 0,
    moved: false
  }
}

function movePan(event: PointerEvent) {
  const drag = panDrag.value
  if (drag?.pointerId !== event.pointerId) return
  const deltaX = event.clientX - drag.startClient.x
  const deltaY = event.clientY - drag.startClient.y
  const moved = drag.moved || Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD
  if (!moved) return

  panDrag.value = { ...drag, moved: true }
  view.value = {
    ...view.value,
    x: drag.startView.x + deltaX,
    y: drag.startView.y + deltaY
  }
}

function finishPan(event: PointerEvent) {
  const drag = panDrag.value
  if (drag?.pointerId !== event.pointerId) return
  if (!drag.moved && drag.clearSelectionOnClick) selectedFrameId.value = null
  panDrag.value = null
}

function cancelPan(event: PointerEvent) {
  if (panDrag.value?.pointerId === event.pointerId) panDrag.value = null
}

function preventMiddleClick(event: MouseEvent) {
  if (event.button === 1) event.preventDefault()
}

function beginCardDrag(event: PointerEvent, id: string) {
  if (event.button !== 0 || !event.isPrimary || !(event.currentTarget instanceof Element)) return
  const point = dragAdjustedPositions.value.get(id)
  if (!point) return

  cardPointerDragged = false
  event.currentTarget.setPointerCapture(event.pointerId)
  cardDrag.value = {
    id,
    pointerId: event.pointerId,
    startClient: { x: event.clientX, y: event.clientY },
    startPoint: point,
    currentPoint: point,
    moved: false
  }
}

function moveCardDrag(event: PointerEvent) {
  const drag = cardDrag.value
  if (drag?.pointerId !== event.pointerId) return
  const deltaX = event.clientX - drag.startClient.x
  const deltaY = event.clientY - drag.startClient.y
  if (!drag.moved && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD) return

  const point = {
    x: drag.startPoint.x + deltaX / view.value.scale,
    y: drag.startPoint.y + deltaY / view.value.scale
  }
  cardDrag.value = { ...drag, currentPoint: point, moved: true }
}

function finishCardDrag(event: PointerEvent) {
  moveCardDrag(event)
  const drag = cardDrag.value
  if (!drag || drag.pointerId !== event.pointerId) return

  cardPointerDragged = drag.moved
  if (
    drag.moved &&
    (drag.currentPoint.x !== drag.startPoint.x || drag.currentPoint.y !== drag.startPoint.y)
  )
    emit('move', drag.id, drag.currentPoint)

  cardDrag.value = null
}

function cancelCardDrag(event: PointerEvent) {
  if (cardDrag.value?.pointerId === event.pointerId) cardDrag.value = null
}

function selectCard(id: string, event: MouseEvent) {
  if (event.detail > 0 && cardPointerDragged) return
  selectedFrameId.value = id
}

function frameIsDimmed(id: string) {
  return highlightedFrameIds.value !== null && !highlightedFrameIds.value.has(id)
}

function zoomToScaleAt(nextScale: number, pointerX: number, pointerY: number) {
  const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM)
  if (scale === view.value.scale) return

  const worldX = (pointerX - view.value.x) / view.value.scale
  const worldY = (pointerY - view.value.y) / view.value.scale

  view.value = {
    x: pointerX - worldX * scale,
    y: pointerY - worldY * scale,
    scale
  }
}

function zoomAt(event: WheelEvent) {
  const element = viewport.value
  if (!element) return

  const rect = element.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const shiftDelta = Math.abs(event.deltaX) >= Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const delta = event.shiftKey ? shiftDelta : event.deltaY
  if (delta === 0) return

  const nextScale = event.shiftKey
    ? nextFixedZoom(view.value.scale, delta < 0 ? 1 : -1, MIN_ZOOM, MAX_ZOOM)
    : view.value.scale * Math.exp(-delta * 0.0015)
  zoomToScaleAt(nextScale, pointerX, pointerY)
}

function zoomBy(factor: number) {
  const element = viewport.value
  if (!element) return
  const pointerX = element.clientWidth / 2
  const pointerY = element.clientHeight / 2
  const nextScale = clamp(view.value.scale * factor, MIN_ZOOM, MAX_ZOOM)
  zoomToScaleAt(nextScale, pointerX, pointerY)
}

async function arrangeFlow() {
  emit('arrange')
  await nextTick()
  fitToView()
}

function openSource(sourceId: string) {
  emit('open-source', sourceId)
}
</script>

<template>
  <div
    ref="viewport"
    dir="ltr"
    data-test-id="prototype-flow-board"
    class="@container relative min-h-0 w-full flex-1 touch-none cursor-grab overflow-clip bg-canvas data-[panning=true]:cursor-grabbing"
    :data-panning="panDrag?.moved === true"
    :style="gridStyle"
    @wheel.prevent="zoomAt"
    @pointerdown.capture="beginPan($event, 1)"
    @pointerdown="beginPan($event, 0)"
    @pointermove="movePan"
    @pointerup="finishPan"
    @pointercancel="cancelPan"
    @lostpointercapture="cancelPan"
    @auxclick.capture="preventMiddleClick"
    @dragstart.prevent
  >
    <div
      data-test-id="prototype-flow-world"
      class="absolute inset-s-0 top-0 origin-top-left"
      :style="worldStyle"
    >
      <PrototypeFlowCard
        v-for="frame in flow.frames"
        :key="frame.id"
        :frame="frame"
        :point="dragAdjustedPositions.get(frame.id) ?? { x: 0, y: 0 }"
        :thumbnail="thumbnails.get(frame.id)"
        :start-label="panels.prototypeStart"
        v-test-id="`prototype-flow-frame-${frame.id}`"
        :data-frame-id="frame.id"
        :data-selected="selectedFrameId === frame.id ? 'true' : 'false'"
        :data-dimmed="frameIsDimmed(frame.id) ? 'true' : 'false'"
        :data-dragging="cardDrag?.id === frame.id ? 'true' : 'false'"
        :aria-pressed="selectedFrameId === frame.id ? 'true' : 'false'"
        data-flow-interactive
        :class="[
          'z-20 transition-opacity duration-150',
          frameIsDimmed(frame.id) ? 'opacity-35' : 'opacity-100'
        ]"
        @pointerdown.stop="beginCardDrag($event, frame.id)"
        @pointermove.stop="moveCardDrag"
        @pointerup.stop="finishCardDrag"
        @pointercancel.stop="cancelCardDrag"
        @lostpointercapture="cancelCardDrag"
        @click.stop="selectCard(frame.id, $event)"
      />

      <PrototypeFlowConnections
        :paths="edgePaths"
        :frame-names="frameNames"
        :label-scale="labelInverseScale"
        :active-edge-id="hoveredEdgeId"
        :selected-frame-id="selectedFrameId"
        @hover="hoveredEdgeId = $event"
        @open-source="openSource"
      />
    </div>

    <PrototypeFlowMinimap
      v-if="flow.frames.length && viewportSize.width > 0 && viewportSize.height > 0"
      :flow="flow"
      :positions="dragAdjustedPositions"
      :paths="edgePaths"
      :content-bounds="contentBounds"
      :viewport-bounds="viewportBounds"
      :selected-frame-id="selectedFrameId"
      :label="panels.prototypeFlowMap"
      class="absolute inset-e-4 bottom-16 z-30 @2xl:bottom-4"
    />

    <div class="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center">
      <div
        role="toolbar"
        data-test-id="prototype-flow-toolbar"
        data-flow-interactive
        class="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border bg-panel/95 p-1 shadow-lg backdrop-blur-sm"
        @pointerdown.stop
      >
        <IconButton
          :label="menu.zoomOut"
          :disabled="view.scale <= MIN_ZOOM"
          @click="zoomBy(1 / ZOOM_BUTTON_FACTOR)"
        >
          <icon-lucide-minus class="size-3.5" aria-hidden="true" />
        </IconButton>
        <AppButton
          size="xs"
          variant="ghost"
          tabindex="-1"
          aria-disabled="true"
          class="pointer-events-none min-w-14 px-1 tabular-nums text-surface"
        >
          {{ zoomPercent }}%
        </AppButton>
        <IconButton
          :label="menu.zoomIn"
          :disabled="view.scale >= MAX_ZOOM"
          @click="zoomBy(ZOOM_BUTTON_FACTOR)"
        >
          <icon-lucide-plus class="size-3.5" aria-hidden="true" />
        </IconButton>
        <IconButton :label="commands.zoomToFit" @click="fitToView">
          <icon-lucide-maximize-2 class="size-3.5" aria-hidden="true" />
        </IconButton>
        <IconButton
          data-test-id="prototype-flow-play"
          :label="panels.prototypeFlowPlay"
          @click="emit('play', selectedFrameId)"
        >
          <icon-lucide-play class="size-3.5" aria-hidden="true" />
        </IconButton>
        <IconButton
          data-test-id="prototype-flow-arrange"
          :label="panels.prototypeFlowArrange"
          @click="arrangeFlow"
        >
          <icon-lucide-layout-grid class="size-3.5" aria-hidden="true" />
        </IconButton>
      </div>
    </div>
  </div>
</template>
