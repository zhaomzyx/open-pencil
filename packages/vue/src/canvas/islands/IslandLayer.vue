<script setup lang="ts">
import { computedAsync, useTimeoutFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'

import {
  playIslandRoots,
  resolveEditorProfile,
  type EditorProfileInputs,
  type EditorState
} from '@open-pencil/core'
import type { ViewportTransform } from '@open-pencil/core/geometry'
import { tokenStylesheet } from '@open-pencil/dom-css/export'

import { useEditor } from '#vue/editor/context'

import Island from './Island.vue'
import PrototypeStage from './PrototypeStage.vue'

/**
 * The live islands of a previewing canvas pane, laid over the canvas at its pan and zoom. The
 * canvas leaves these layers to the islands; wheel gestures over them still pan and zoom it.
 */
const { view, canvas, drawn, hotspotHint } = defineProps<{
  view: Pick<EditorState, 'panX' | 'panY' | 'zoom' | 'currentPageId'> & EditorProfileInputs
  /** The canvas that wheel gestures over the islands are passed on to. */
  canvas: HTMLElement | null
  /**
   * The pan and zoom of the canvas's last drawn frame. The islands follow it rather than the
   * live view, which runs ahead of the drawing while panning and zooming fast.
   */
  drawn?: ViewportTransform | null
  /** Changes when the preview toolbar asks to show the interactive regions. */
  hotspotHint?: number
}>()

const placement = computed(() => drawn ?? view)
/** The run the islands belong to, or null while the canvas edits and draws every layer. */
const live = computed(() => resolveEditorProfile(view).live)
const editor = useEditor()
const showHotspots = ref(false)
const hotspotTimeout = useTimeoutFn(() => (showHotspots.value = false), 1100, { immediate: false })

watch(
  [
    () => hotspotHint,
    () => view.currentPageId,
    () => live.value?.revision,
    () => live.value?.player?.screenId,
    () => live.value?.player?.overlays.at(-1)
  ],
  ([hint], [previousHint]) => {
    showHotspots.value = live.value !== null && hint !== undefined && hint !== previousHint
    if (showHotspots.value) hotspotTimeout.start()
    else hotspotTimeout.stop()
  }
)

/**
 * The document's variables as custom properties, which the islands' `var()` references read in
 * the modes their layers set. Built once for every island while previewing; an island is a
 * shadow root, so the stylesheet's `:root` is its host.
 */
const tokens = new CSSStyleSheet()
const tokensCSS = computedAsync(async () => {
  void editor.state.sceneVersion
  if (!live.value) return ''
  const { css } = await tokenStylesheet(editor.graph, { format: 'css' })
  return css.replaceAll(':root', ':host')
}, '')
watch(tokensCSS, (css) => tokens.replaceSync(css), { immediate: true })

const islands = computed(() => {
  void editor.state.sceneVersion
  if (!live.value || live.value.player) return []
  return playIslandRoots(editor.graph, view.currentPageId).map((id) => ({
    id,
    position: editor.graph.getAbsolutePosition(id)
  }))
})

function forwardWheel(event: WheelEvent) {
  if (!canvas) return
  event.preventDefault()
  canvas.dispatchEvent(new WheelEvent(event.type, event))
}
</script>

<template>
  <PrototypeStage
    v-if="live?.player"
    :player="live.player"
    :revision="live.revision"
    :tokens="tokens"
    :show-hotspots="showHotspots"
  />
  <div
    v-else-if="live"
    class="pointer-events-none absolute inset-0 overflow-hidden"
    data-test-id="play-islands"
    @wheel="forwardWheel"
  >
    <div
      class="absolute top-0 inset-s-0 origin-top-left"
      :style="{
        transform: `translate(${placement.panX}px, ${placement.panY}px) scale(${placement.zoom})`
      }"
    >
      <Island
        v-for="island in islands"
        :key="island.id"
        :root-id="island.id"
        :revision="live.revision"
        :tokens="tokens"
        :data-show-hotspots="showHotspots ? '' : undefined"
        class="pointer-events-auto absolute"
        :style="{ left: `${island.position.x}px`, top: `${island.position.y}px` }"
      />
    </div>
  </div>
</template>
