<script setup lang="ts">
import { h, withModifiers } from 'vue'

import { focusStyles } from '@open-pencil/theme'

import type { FlowEdgePath } from './geometry'
import type { FlowDirection } from './PrototypeFlowConnections'

const {
  path,
  markerId,
  direction,
  color,
  labelScale,
  description,
  active = false,
  dimmed = false
} = defineProps<{
  path: FlowEdgePath
  markerId: string
  direction: FlowDirection
  color: string
  labelScale: number
  description: string
  active?: boolean
  dimmed?: boolean
}>()

const emit = defineEmits<{
  'open-source': [sourceId: string]
  hover: [edgeId: string | null]
}>()

const PrototypeFlowEdgeLine = () =>
  h(
    'svg',
    {
      width: 1,
      height: 1,
      class: 'pointer-events-none absolute inset-s-0 top-0 overflow-visible',
      'aria-hidden': 'true'
    },
    [
      h('path', {
        d: path.path,
        fill: 'none',
        stroke: color,
        'stroke-width': active ? 3 : 2,
        'stroke-dasharray': path.edge.kind === 'navigate' ? undefined : '7 5',
        'marker-end': `url(#${markerId})`,
        class:
          'pointer-events-none transition-[stroke-width] duration-100 motion-reduce:transition-none'
      }),
      h('path', {
        d: path.path,
        fill: 'none',
        stroke: 'transparent',
        'stroke-width': 22,
        'pointer-events': 'stroke',
        class: 'cursor-pointer',
        onPointerdown: (event: PointerEvent) => event.stopPropagation(),
        onClick: withModifiers(() => emit('open-source', path.edge.sourceId), ['stop'])
      })
    ]
  )
</script>

<template>
  <div
    v-test-id="`prototype-flow-edge-${path.edge.id}`"
    :data-edge-id="path.edge.id"
    :data-source-id="path.edge.sourceId"
    :data-flow-direction="direction"
    :data-dimmed="dimmed ? 'true' : 'false'"
    class="pointer-events-none absolute inset-0 transition-opacity duration-100 data-[dimmed=true]:opacity-35 motion-reduce:transition-none"
    :style="{ '--flow-edge-color': color }"
    @pointerenter="emit('hover', path.edge.id)"
    @pointerleave="emit('hover', null)"
  >
    <PrototypeFlowEdgeLine />
    <button
      v-test-id="`prototype-flow-edge-label-${path.edge.id}`"
      type="button"
      data-flow-interactive
      :data-source-id="path.edge.sourceId"
      :aria-label="description"
      :class="[
        'pointer-events-auto absolute flex w-max max-w-32 cursor-pointer flex-col rounded-sm bg-(--flow-edge-color) px-2 py-1 text-start text-on-flow-edge',
        focusStyles.ring
      ]"
      :style="{
        left: `${path.label.x}px`,
        top: `${path.label.y}px`,
        transform: `translate(-50%, -50%) scale(${labelScale})`
      }"
      @pointerdown.stop
      @click.stop="emit('open-source', path.edge.sourceId)"
      @focus="emit('hover', path.edge.id)"
      @blur="emit('hover', null)"
    >
      <span class="truncate text-xs font-medium">{{ path.sourceName }}</span>
      <span v-if="path.conditions.length" class="line-clamp-2 break-words text-3xs leading-4">
        {{ path.conditions.join(' · ') }}
      </span>
    </button>
  </div>
</template>
