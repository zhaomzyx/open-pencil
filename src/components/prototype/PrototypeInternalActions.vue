<script setup lang="ts">
import { focusStyles } from '@open-pencil/theme'
import { useI18n } from '@open-pencil/vue/i18n'

const { interactions } = defineProps<{
  interactions: Array<{
    nodeId: string
    nodeName: string
    actions: Array<{ key: string; text: string; depth: number }>
  }>
}>()
const emit = defineEmits<{
  select: [nodeId: string]
  hover: [nodeId: string, active: boolean]
}>()
const { panels } = useI18n()
</script>

<template>
  <section
    class="border-t border-border px-3 py-3 text-xs"
    :aria-label="panels.prototypeInternalTitle"
    data-test-id="prototype-internal-actions"
  >
    <h3 class="font-medium">{{ panels.prototypeInternalTitle }}</h3>
    <p v-if="!interactions.length" class="mt-2 text-muted">
      {{ panels.prototypeInternalEmpty }}
    </p>
    <div v-else class="mt-2 grid gap-2">
      <button
        v-for="source in interactions"
        :key="source.nodeId"
        type="button"
        class="flex w-full min-w-0 cursor-pointer flex-col rounded border border-border px-2 py-1.5 text-start hover:bg-hover"
        :class="focusStyles.ring"
        :aria-label="panels.prototypeInternalSelectSource({ name: source.nodeName })"
        @click="emit('select', source.nodeId)"
        @pointerenter="emit('hover', source.nodeId, true)"
        @pointerleave="emit('hover', source.nodeId, false)"
        @pointercancel="emit('hover', source.nodeId, false)"
      >
        <span class="truncate font-medium">
          {{ panels.prototypeInternalClickSource({ name: source.nodeName }) }}
        </span>
        <span
          v-for="action in source.actions"
          :key="action.key"
          class="mt-0.5 block min-w-0 break-words text-muted"
          :style="{ paddingInlineStart: `${Math.min(action.depth, 3) * 10}px` }"
        >
          {{ action.text }}
        </span>
      </button>
    </div>
  </section>
</template>
