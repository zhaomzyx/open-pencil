<script setup lang="ts">
import { matchesKeyboardEvent } from '@tanstack/hotkeys'
import { useElementSize } from '@vueuse/core'
import { computed, nextTick, useTemplateRef, watch } from 'vue'

import type { PrototypePlayer } from '@open-pencil/core'

import { useEditor } from '#vue/editor/context'

import Island from './Island.vue'

const { player, tokens, revision, showHotspots } = defineProps<{
  player: PrototypePlayer
  tokens: CSSStyleSheet
  revision: number
  showHotspots: boolean
}>()
const editor = useEditor()
const stage = useTemplateRef('stage')
const { width, height } = useElementSize(stage)
const layers = computed(() => {
  void editor.state.sceneVersion
  return [player.screenId, ...player.overlays].flatMap((id) => {
    const node = editor.graph.getNode(id)
    return node ? [node] : []
  })
})
const scale = computed(() =>
  layers.value.reduce(
    (fit, node) =>
      Math.min(fit, width.value / Math.max(1, node.width), height.value / Math.max(1, node.height)),
    1
  )
)
const active = computed(() => player.overlays.at(-1) ?? player.screenId)
const lastFocus = new Map<string, HTMLElement>()
function dismissOverlay(event: KeyboardEvent) {
  if (event.defaultPrevented || !player.overlays.length || !matchesKeyboardEvent(event, 'Escape'))
    return
  event.preventDefault()
  event.stopPropagation()
  editor.backPlay()
}
function rememberFocus(event: FocusEvent) {
  const target = event.composedPath()[0]
  if (target instanceof HTMLElement) lastFocus.set(active.value, target)
}
watch(
  () => [active.value, revision],
  async () => {
    await nextTick()
    const host = stage.value?.querySelector<HTMLElement>(
      `[data-prototype-screen="${CSS.escape(active.value)}"]`
    )
    if (!host) return
    const prior = lastFocus.get(active.value)
    const first = host.shadowRoot?.querySelector<HTMLElement>(
      'button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]'
    )
    const target = prior?.isConnected ? prior : (first ?? host)
    target.focus({ preventScroll: true })
  },
  { flush: 'post' }
)
</script>

<template>
  <div
    ref="stage"
    data-test-id="prototype-stage"
    class="absolute inset-0 overflow-hidden"
    @focusin="rememberFocus"
    @keydown="dismissOverlay"
  >
    <div
      v-for="(node, index) in layers"
      :key="`${revision}:${node.id}`"
      :inert="node.id !== active"
      class="absolute inset-0 grid grid-cols-1 grid-rows-1 place-items-center"
      :class="{ 'bg-black/35': index > 0 }"
    >
      <Island
        :root-id="node.id"
        :revision="revision"
        :tokens="tokens"
        :numbers="player.numbers"
        :data-prototype-screen="node.id"
        :data-show-hotspots="showHotspots && node.id === active ? '' : undefined"
        :role="index ? 'dialog' : 'region'"
        :aria-label="node.name"
        tabindex="-1"
        :style="{
          width: `${node.width}px`,
          height: `${node.height}px`,
          overflow: 'hidden',
          transform: `scale(${scale})`
        }"
        class="col-start-1 row-start-1"
      />
    </div>
  </div>
</template>
