<script setup lang="ts">
import { computed, ref } from 'vue'

import { inspectPrototype } from '@open-pencil/core/openpencil-api'
import { useCodeMessages } from '@open-pencil/vue/i18n'

import { useEditorStore } from '@/app/editor/active-store'
import AppCollapsible from '@/components/ui/collapsible/AppCollapsible.vue'

const store = useEditorStore()
const messages = useCodeMessages()
const open = ref(true)
const summary = computed(() => {
  void store.state.sceneVersion
  if (store.state.selectedIds.size !== 1) return null
  const [id] = store.state.selectedIds
  const node = store.graph.getNode(id)
  if (!node) return null
  const interaction = inspectPrototype(store.graph, node)
  return interaction.start || interaction.trigger || interaction.textVariableId ? interaction : null
})
</script>

<template>
  <AppCollapsible
    v-if="summary"
    v-model:open="open"
    :label="messages.prototypeInteraction"
    class="shrink-0 border-b border-border"
  >
    <pre
      dir="ltr"
      data-test-id="prototype-summary"
      class="max-h-48 overflow-auto px-3 pb-2 text-start font-mono text-2xs"
      >{{ JSON.stringify(summary, null, 2) }}</pre>
  </AppCollapsible>
</template>
