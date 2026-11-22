<script setup lang="ts">
import { matchesKeyboardEvent } from '@tanstack/hotkeys'
import { useEventListener } from '@vueuse/core'
import { nextTick, ref, useTemplateRef } from 'vue'

import { readPrototype } from '@open-pencil/scene-graph/prototype'
import { useCommentMessages, useCommonMessages } from '@open-pencil/vue/i18n'

import { useComments } from '@/app/comments/use'
import { useEditorStore } from '@/app/editor/active-store'
import type { PagePoint } from '@/app/editor/pages/point'
import AppButton from '@/components/ui/button/AppButton.vue'

import CommentComposer from './CommentComposer.vue'

const { area, rootId } = defineProps<{ area: HTMLElement | null; rootId: string }>()
const store = useEditorStore()
const comments = useComments()
const messages = useCommentMessages()
const common = useCommonMessages()
const picking = ref(false)
const anchor = ref<{ point: PagePoint; sourceId: string; name: string } | null>(null)
const composer = useTemplateRef<InstanceType<typeof CommentComposer>>('composer')
const text = ref('')

function cancel() {
  anchor.value = null
  text.value = ''
  picking.value = false
}

function intercept(event: MouseEvent | KeyboardEvent) {
  if (!picking.value || !comments.canComment.value) return
  if (event instanceof KeyboardEvent) {
    if (!matchesKeyboardEvent(event, 'Enter') && !matchesKeyboardEvent(event, 'Space')) return
  } else if (event.button !== 0) return
  const path = event.composedPath().filter((target): target is Element => target instanceof Element)
  const host = path.find((element) => element.getAttribute('data-prototype-screen') === rootId)
  if (!host) return
  event.stopPropagation()
  event.preventDefault()
  if ((event.type !== 'click' && event.type !== 'keydown') || anchor.value) return
  const screen = store.graph.getNode(rootId)
  if (!screen) return
  const layers = path.flatMap((element) => {
    const id = element.getAttribute('data-prototype-source')
    return id ? (store.graph.getNode(id) ?? []) : []
  })
  const source = layers.find((layer) => readPrototype(layer).actions?.length) ?? layers[0] ?? screen
  const bounds = host.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const origin = store.graph.getAbsolutePosition(screen.id)
  const position =
    event instanceof KeyboardEvent || event.detail === 0
      ? store.graph.getAbsolutePosition(source.id)
      : {
          x: origin.x + ((event.clientX - bounds.left) / bounds.width) * screen.width,
          y: origin.y + ((event.clientY - bounds.top) / bounds.height) * screen.height
        }
  anchor.value = {
    sourceId: source.id,
    name: source.name,
    point: { ...position, pageId: store.state.currentPageId }
  }
  void nextTick(() => composer.value?.focus())
}

useEventListener(() => area, ['pointerdown', 'pointerup', 'click', 'keydown'], intercept, {
  capture: true
})

function post(body: string) {
  if (!anchor.value) return
  const id = comments.postThread(body, anchor.value.point, anchor.value.sourceId)
  if (id) void comments.focusThread(id)
}
</script>

<template>
  <aside
    v-if="comments.canComment.value"
    class="absolute inset-e-3 top-3 z-10 max-w-full rounded-lg bg-panel p-1 shadow-md"
  >
    <AppButton v-if="!picking" data-test-id="prototype-comment" @click="picking = true">
      <template #leading><icon-lucide-message-circle /></template>
      {{ messages.addComment }}
    </AppButton>
    <template v-else>
      <header class="flex items-center justify-between gap-2 px-2 text-xs">
        <span>{{ anchor ? anchor.name : messages.pickPreviewLayer }}</span>
        <AppButton size="xs" @click="cancel">{{ common.cancel }}</AppButton>
      </header>
      <CommentComposer
        v-if="anchor"
        ref="composer"
        v-model="text"
        bare
        :label="messages.addComment"
        :mentionable="comments.mentionable"
        @submit="post"
        @cancel="cancel"
      />
    </template>
  </aside>
</template>
