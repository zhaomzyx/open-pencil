import { defineComponent, h, useId, type PropType } from 'vue'

import type { FlowEdge, FlowEdgePath, FlowSourceCue } from './geometry'
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
    pinnedEdgeId: {
      type: String as PropType<string | null>,
      default: null
    },
    selectedFrameId: {
      type: String as PropType<string | null>,
      default: null
    },
    sourceCue: {
      type: Object as PropType<FlowSourceCue | null>,
      default: null
    }
  },
  emits: {
    hover: (_edgeId: string | null) => true,
    pin: (_edgeId: string) => true
  },
  setup(props, { emit }) {
    const markerIdBase = `prototype-flow-arrow-${useId()}`
    const markerIds: Record<FlowDirection, string> = {
      neutral: `${markerIdBase}-neutral`,
      incoming: `${markerIdBase}-incoming`,
      outgoing: `${markerIdBase}-outgoing`
    }

    const flowDirection = (edge: FlowEdge): FlowDirection => {
      const selected = props.selectedFrameId
      if (!selected) return 'neutral'
      if (edge.from === selected) return 'outgoing'
      if (edge.to === selected) return 'incoming'
      return 'neutral'
    }

    function renderSourceCue(cue: FlowSourceCue) {
      const color = FLOW_COLORS[flowDirection(cue.edge)]
      return h(
        'svg',
        {
          'data-test-id': 'prototype-flow-source-cue',
          'data-source-id': cue.edge.sourceId,
          width: 1,
          height: 1,
          class: 'pointer-events-none absolute inset-s-0 top-0 z-30 overflow-visible opacity-75',
          'aria-hidden': 'true'
        },
        [
          cue.leader &&
            h('path', {
              d: cue.leader,
              fill: 'none',
              stroke: color,
              'stroke-width': 1.5,
              'stroke-dasharray': '3 4',
              'stroke-linecap': 'round',
              'vector-effect': 'non-scaling-stroke'
            }),
          h('rect', {
            ...cue.outline,
            rx: 2,
            fill: 'none',
            stroke: color,
            'stroke-width': 1.5,
            'vector-effect': 'non-scaling-stroke'
          })
        ]
      )
    }

    return () => [
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
            const direction = flowDirection(path.edge)
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
              pinned: props.pinnedEdgeId === path.edge.id,
              dimmed: Boolean(props.selectedFrameId && direction === 'neutral'),
              onHover: (edgeId: string | null) => emit('hover', edgeId),
              onPin: (edgeId: string) => emit('pin', edgeId)
            })
          })
        ]
      ),
      props.sourceCue && renderSourceCue(props.sourceCue)
    ]
  }
})
