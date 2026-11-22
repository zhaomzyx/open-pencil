import { defineComponent, h, useId, type PropType } from 'vue'

import type { FlowEdgePath } from './geometry'
import PrototypeFlowEdge from './PrototypeFlowEdge.vue'

const FLOW_DIRECTIONS = ['neutral', 'incoming', 'outgoing'] as const
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number]

const FLOW_COLORS: Record<FlowDirection, string> = {
  neutral: 'var(--color-flow-edge)',
  incoming: 'var(--color-flow-incoming)',
  outgoing: 'var(--color-flow-outgoing)'
}

export default defineComponent({
  name: 'PrototypeFlowConnections',
  props: {
    paths: {
      type: Array as PropType<readonly FlowEdgePath[]>,
      required: true
    },
    frameNames: {
      type: Object as PropType<ReadonlyMap<string, string>>,
      required: true
    },
    labelScale: {
      type: Number,
      required: true
    },
    activeEdgeId: {
      type: String as PropType<string | null>,
      default: null
    },
    selectedFrameId: {
      type: String as PropType<string | null>,
      default: null
    }
  },
  emits: {
    hover: (_edgeId: string | null) => true,
    'open-source': (_sourceId: string) => true
  },
  setup(props, { emit }) {
    const markerIdBase = `prototype-flow-arrow-${useId()}`
    const markerIds: Record<FlowDirection, string> = {
      neutral: `${markerIdBase}-neutral`,
      incoming: `${markerIdBase}-incoming`,
      outgoing: `${markerIdBase}-outgoing`
    }

    const flowDirection = (path: FlowEdgePath): FlowDirection => {
      const selected = props.selectedFrameId
      if (!selected) return 'neutral'
      if (path.edge.from === selected) return 'outgoing'
      if (path.edge.to === selected) return 'incoming'
      return 'neutral'
    }

    return () =>
      h(
        'div',
        {
          'data-test-id': 'prototype-flow-connections',
          class: 'pointer-events-none absolute inset-0 z-10'
        },
        [
          h('svg', { width: 0, height: 0, class: 'absolute', 'aria-hidden': 'true' }, [
            h(
              'defs',
              FLOW_DIRECTIONS.map((direction) =>
                h(
                  'marker',
                  {
                    id: markerIds[direction],
                    viewBox: '0 0 10 10',
                    refX: 8.5,
                    refY: 5,
                    markerWidth: 7,
                    markerHeight: 7,
                    orient: 'auto-start-reverse'
                  },
                  [
                    h('path', {
                      d: 'M 0 0 L 10 5 L 0 10 z',
                      fill: FLOW_COLORS[direction]
                    })
                  ]
                )
              )
            )
          ]),
          ...props.paths.map((path) => {
            const direction = flowDirection(path)
            const from = props.frameNames.get(path.edge.from) ?? path.edge.from
            const to = props.frameNames.get(path.edge.to) ?? path.edge.to
            return h(PrototypeFlowEdge, {
              key: path.edge.id,
              path,
              direction,
              color: FLOW_COLORS[direction],
              markerId: markerIds[direction],
              labelScale: props.labelScale,
              description: [`${from} → ${to}`, path.sourceName, ...path.conditions].join(' · '),
              active: props.activeEdgeId === path.edge.id,
              dimmed: Boolean(props.selectedFrameId && direction === 'neutral'),
              onHover: (edgeId: string | null) => emit('hover', edgeId),
              onOpenSource: (sourceId: string) => emit('open-source', sourceId)
            })
          })
        ]
      )
  }
})
