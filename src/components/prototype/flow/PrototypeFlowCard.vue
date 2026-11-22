<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { focusStyles } from '@open-pencil/theme'

import { flowFrameSize, type FlowPoint } from '@/app/editor/prototype-flow'

import type { FlowFrame } from './geometry'

const { frame, point, thumbnail, startLabel } = defineProps<{
  frame: FlowFrame
  point: FlowPoint
  thumbnail: string | undefined
  startLabel: string
}>()

const imageFailed = ref(false)
const showImage = computed(() => Boolean(thumbnail) && !imageFailed.value)
const size = computed(() => flowFrameSize(frame))

watch(
  () => thumbnail,
  () => {
    imageFailed.value = false
  }
)
</script>

<template>
  <button
    type="button"
    :class="[
      'group absolute cursor-grab touch-none border-0 bg-transparent p-0 text-start select-none data-[dimmed=true]:opacity-45 data-[dimmed=true]:hover:opacity-80 data-[dragging=true]:cursor-grabbing data-[dragging=true]:opacity-90 data-[selected=true]:outline data-[selected=true]:outline-1 data-[selected=true]:outline-offset-2 data-[selected=true]:outline-accent',
      focusStyles.ring
    ]"
    :style="{
      left: `${point.x}px`,
      top: `${point.y}px`,
      width: `${size.width}px`,
      height: `${size.height}px`
    }"
  >
    <span
      class="absolute inset-x-0 bottom-full mb-1.5 flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-0.5"
    >
      <span
        class="min-w-0 flex-1 break-words text-xs font-medium leading-4 text-surface group-data-[selected=true]:text-accent"
      >
        {{ frame.name }}
      </span>
      <span
        v-if="frame.start"
        class="inline-flex shrink-0 items-center gap-1 text-3xs font-medium leading-4 text-accent"
      >
        <icon-lucide-flag class="size-3" aria-hidden="true" />
        {{ startLabel }}
      </span>
    </span>

    <span
      class="relative block size-full overflow-hidden border border-border bg-panel-secondary shadow-sm transition-shadow group-data-[dragging=true]:shadow-md"
    >
      <span class="absolute inset-0 flex items-center justify-center text-muted/60">
        <icon-lucide-image class="size-8" aria-hidden="true" />
      </span>
      <img
        v-if="showImage"
        :src="thumbnail"
        alt=""
        draggable="false"
        class="relative block size-full object-contain"
        @error="imageFailed = true"
      />
    </span>
  </button>
</template>
