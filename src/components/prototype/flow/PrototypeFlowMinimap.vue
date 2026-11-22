<script lang="ts">
import { computed, defineComponent, h, type PropType } from 'vue'

import { flowFrameSize, type FlowPoint, type PrototypeFlow } from '@/app/editor/prototype-flow'

import type { FlowBounds, FlowEdgePath } from './geometry'

const MAP_PADDING_MIN = 12
const MAP_PADDING_RATIO = 0.045

function normalizedBounds(bounds: FlowBounds): FlowBounds {
  const minX = Number.isFinite(bounds.minX) ? bounds.minX : 0
  const minY = Number.isFinite(bounds.minY) ? bounds.minY : 0
  return {
    minX,
    minY,
    maxX: Math.max(minX, Number.isFinite(bounds.maxX) ? bounds.maxX : minX),
    maxY: Math.max(minY, Number.isFinite(bounds.maxY) ? bounds.maxY : minY)
  }
}

function unionBounds(left: FlowBounds, right: FlowBounds): FlowBounds {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY)
  }
}

export default defineComponent({
  name: 'PrototypeFlowMinimap',
  props: {
    flow: {
      type: Object as PropType<PrototypeFlow>,
      required: true
    },
    positions: {
      type: Object as PropType<ReadonlyMap<string, FlowPoint>>,
      required: true
    },
    paths: {
      type: Array as PropType<readonly FlowEdgePath[]>,
      required: true
    },
    contentBounds: {
      type: Object as PropType<FlowBounds>,
      required: true
    },
    viewportBounds: {
      type: Object as PropType<FlowBounds>,
      required: true
    },
    selectedFrameId: {
      type: String as PropType<string | null>,
      required: true
    },
    label: {
      type: String,
      required: true
    }
  },
  setup(props) {
    const frameRects = computed(() =>
      props.flow.frames.flatMap((frame) => {
        const point = props.positions.get(frame.id)
        if (!point) return []
        const size = flowFrameSize(frame)
        return [
          {
            id: frame.id,
            x: point.x,
            y: point.y,
            width: size.width,
            height: size.height
          }
        ]
      })
    )

    const content = computed(() => normalizedBounds(props.contentBounds))
    const viewport = computed(() => normalizedBounds(props.viewportBounds))
    const viewBox = computed(() => {
      const bounds = unionBounds(content.value, viewport.value)
      const span = Math.max(1, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
      const padding = Math.max(MAP_PADDING_MIN, span * MAP_PADDING_RATIO)
      return [
        bounds.minX - padding,
        bounds.minY - padding,
        Math.max(1, bounds.maxX - bounds.minX) + padding * 2,
        Math.max(1, bounds.maxY - bounds.minY) + padding * 2
      ].join(' ')
    })

    return () =>
      h(
        'div',
        {
          'data-test-id': 'prototype-flow-minimap',
          dir: 'ltr',
          class:
            'pointer-events-none h-28 w-44 overflow-hidden rounded-lg border border-border bg-panel/95 shadow-lg backdrop-blur-sm'
        },
        [
          h(
            'svg',
            {
              class: 'block size-full',
              viewBox: viewBox.value,
              preserveAspectRatio: 'xMidYMid meet',
              role: 'img',
              'aria-label': props.label
            },
            [
              h(
                'g',
                { 'aria-hidden': 'true' },
                props.paths.map((path) =>
                  h('path', {
                    key: path.edge.id,
                    d: path.path,
                    fill: 'none',
                    stroke: 'var(--color-muted)',
                    'stroke-opacity': 0.5,
                    'stroke-width': 1,
                    'stroke-linecap': 'round',
                    'stroke-linejoin': 'round',
                    'vector-effect': 'non-scaling-stroke'
                  })
                )
              ),
              h(
                'g',
                { 'aria-hidden': 'true' },
                frameRects.value.map((frame) => {
                  const selected = frame.id === props.selectedFrameId
                  return h('rect', {
                    key: frame.id,
                    x: frame.x,
                    y: frame.y,
                    width: frame.width,
                    height: frame.height,
                    fill: selected ? 'var(--color-accent)' : 'var(--color-panel-secondary)',
                    'fill-opacity': selected ? 0.2 : 0.9,
                    stroke: selected ? 'var(--color-accent)' : 'var(--color-border)',
                    'stroke-width': selected ? 1.75 : 1,
                    'vector-effect': 'non-scaling-stroke'
                  })
                })
              ),
              h('rect', {
                'data-test-id': 'prototype-flow-minimap-viewport',
                x: viewport.value.minX,
                y: viewport.value.minY,
                width: Math.max(1, viewport.value.maxX - viewport.value.minX),
                height: Math.max(1, viewport.value.maxY - viewport.value.minY),
                fill: 'var(--color-accent)',
                'fill-opacity': 0.04,
                stroke: 'var(--color-accent)',
                'stroke-opacity': 0.95,
                'stroke-width': 1.5,
                'vector-effect': 'non-scaling-stroke',
                'aria-hidden': 'true'
              })
            ]
          )
        ]
      )
  }
})
</script>
