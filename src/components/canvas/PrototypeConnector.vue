<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'

import { getNodeEditCapability } from '@open-pencil/core'
import { screenToWorld, worldToScreen, type ViewportTransform } from '@open-pencil/core/geometry'
import type { Vector } from '@open-pencil/scene-graph/primitives'
import { prototypeTarget, readPrototype } from '@open-pencil/scene-graph/prototype'
import { focusStyles } from '@open-pencil/theme'
import { useI18n } from '@open-pencil/vue/i18n'
import { useSceneComputed } from '@open-pencil/vue/internal/scene-computed'

import { useEditorStore } from '@/app/editor/active-store'
import Tip from '@/components/ui/overlay/Tip.vue'
import AppPicker from '@/components/ui/select/AppPicker.vue'

const { canvas, view } = defineProps<{
  canvas: HTMLCanvasElement | null
  view: ViewportTransform
}>()
const store = useEditorStore()
const { panels, common } = useI18n()
const open = ref(false)
const drag = shallowRef<{ pointer: number; start: Vector; point: Vector; moved: boolean } | null>(
  null
)
const frames = useSceneComputed(() =>
  store.graph
    .getChildren(store.state.currentPageId)
    .filter((layer) => prototypeTarget(store.graph, store.state.currentPageId, layer.id))
)
const hotspots = useSceneComputed(() => {
  const graph = store.graph
  return frames.value.flatMap((frame) =>
    [frame, ...graph.flattenTree(frame.id).map(({ node }) => node)].flatMap((node) => {
      if (
        !readPrototype(node).actions?.length ||
        graph.closest(node.id, (ancestor) => !ancestor.visible || ancestor.internalOnly)
      )
        return []
      const box = graph.getAbsoluteBounds(node.id)
      return [{ id: node.id, point: { x: box.x + box.width, y: box.y } }]
    })
  )
})
const markers = computed(() =>
  hotspots.value.map(({ id, point }) => ({ id, point: worldToScreen(view, point) }))
)
const source = useSceneComputed(() => {
  const [id] = store.state.selectedIds
  if (
    !id ||
    store.state.activeTool !== 'SELECT' ||
    store.state.selectedIds.size !== 1 ||
    !frames.value.length ||
    !store.graph.closest(
      id,
      (layer) => !!prototypeTarget(store.graph, store.state.currentPageId, layer.id)
    ) ||
    store.graph.closest(id, (layer) => layer.locked || !layer.visible || layer.internalOnly) ||
    !getNodeEditCapability(store.graph, id).editable
  )
    return null
  return store.graph.getNode(id)
})
watch(
  () => source.value?.id,
  () => {
    drag.value = null
    open.value = false
  }
)
const anchor = useSceneComputed(() => {
  if (!source.value) return null
  const box = store.graph.getAbsoluteBounds(source.value.id)
  return worldToScreen(view, { x: box.x + box.width, y: box.y + box.height / 2 })
})
const targets = computed(() =>
  frames.value.map((frame) => ({ label: frame.name, value: frame.id }))
)
function pointFor(event: PointerEvent) {
  const rect = canvas?.getBoundingClientRect()
  return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : null
}
function targetAt(point: Vector) {
  if (
    !canvas ||
    point.x < 0 ||
    point.y < 0 ||
    point.x >= canvas.clientWidth ||
    point.y >= canvas.clientHeight
  )
    return null
  const world = screenToWorld(view, point)
  return frames.value.findLast(
    (frame) => frame.visible && store.graph.isPointInNode(frame.id, world.x, world.y)
  )
}
const hovered = computed(() => (drag.value?.moved ? targetAt(drag.value.point) : null))
function connect(targetId: string) {
  if (!source.value) return
  const actions = readPrototype(source.value).actions ?? []
  store.setPrototypeActions(source.value.id, [...actions, { type: 'navigate', targetId }])
}
function begin(event: PointerEvent) {
  const point = pointFor(event)
  if (event.button !== 0 || !event.isPrimary || !point || !(event.currentTarget instanceof Element))
    return
  event.currentTarget.setPointerCapture(event.pointerId)
  drag.value = { pointer: event.pointerId, start: point, point, moved: false }
}
function move(event: PointerEvent) {
  const active = drag.value
  const point = pointFor(event)
  if (active?.pointer !== event.pointerId || !point) return
  drag.value = {
    ...active,
    point,
    moved: active.moved || Math.hypot(point.x - active.start.x, point.y - active.start.y) >= 4
  }
}
function finish(event: PointerEvent) {
  if (drag.value?.pointer !== event.pointerId) return
  move(event)
  if (drag.value.moved) {
    const target = hovered.value
    if (target) connect(target.id)
  } else open.value = true
  drag.value = null
}
</script>

<template>
  <span
    v-for="marker in markers"
    :key="marker.id"
    data-test-id="prototype-action-marker"
    :data-prototype-layer="marker.id"
    aria-hidden="true"
    class="pointer-events-none absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-panel bg-accent text-white"
    :style="{ left: `${marker.point.x}px`, top: `${marker.point.y}px` }"
  >
    <icon-lucide-mouse-pointer-click class="size-2.5" />
  </span>
  <template v-if="anchor">
    <span
      v-if="drag?.moved"
      aria-hidden="true"
      class="pointer-events-none absolute h-0.5 origin-left bg-accent"
      :style="{
        left: `${anchor.x}px`,
        top: `${anchor.y}px`,
        width: `${Math.hypot(drag.point.x - anchor.x, drag.point.y - anchor.y)}px`,
        transform: `rotate(${Math.atan2(drag.point.y - anchor.y, drag.point.x - anchor.x)}rad)`
      }"
    />
    <span
      v-if="drag?.moved && hovered"
      aria-hidden="true"
      class="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
      :style="{ left: `${drag.point.x}px`, top: `${drag.point.y}px` }"
    />
    <AppPicker
      v-model:open="open"
      :heading="panels.prototypeFrame"
      :items="targets"
      :search-placeholder="panels.prototypeFrame"
      :empty-label="common.noResults"
      :close-label="common.close"
      side="bottom"
      @select="connect"
    >
      <template #anchor>
        <Tip as-child :label="panels.prototypeDrag" :disabled="!!drag || open">
          <button
            type="button"
            data-test-id="prototype-connector"
            :aria-label="panels.prototypeDrag"
            aria-haspopup="listbox"
            :aria-expanded="open"
            :class="[
              'absolute flex size-5 -translate-y-1/2 touch-none items-center justify-center rounded-full border border-panel bg-accent text-white',
              focusStyles.ring
            ]"
            :style="{ left: `${anchor.x}px`, top: `${anchor.y}px` }"
            @pointerdown.stop="begin"
            @pointermove.stop="move"
            @pointerup.stop="finish"
            @pointercancel="drag = null"
            @lostpointercapture="drag = null"
            @keydown.esc.stop="drag = null"
            @click.stop="$event.detail === 0 && (open = true)"
          >
            <icon-lucide-plus class="size-3.5" aria-hidden="true" />
          </button>
        </Tip>
      </template>
    </AppPicker>
  </template>
</template>
