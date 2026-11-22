import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import {
  prototypeTarget,
  readPrototype,
  type PrototypeAction
} from '@open-pencil/scene-graph/prototype'

export interface FlowPoint {
  x: number
  y: number
}

export interface PrototypeFlowFrame {
  id: string
  name: string
  width: number
  height: number
  start: boolean
}

export interface PrototypeFlowEdge {
  id: string
  from: string
  to: string
  sourceId: string
  sourceName: string
  kind: 'navigate' | 'openOverlay' | 'swapOverlay'
  conditions: string[]
}

export interface PrototypeFlow {
  frames: PrototypeFlowFrame[]
  edges: PrototypeFlowEdge[]
}

export interface FlowFrameSize {
  width: number
  height: number
}

export const FLOW_GRID_STEP = 24
export const FLOW_FRAME_MAX_WIDTH = 240
export const FLOW_FRAME_MAX_HEIGHT = 312

const FALLBACK_FRAME_WIDTH = 180
const FALLBACK_FRAME_HEIGHT = 240
const COLUMN_STEP = 336
const ROW_STEP = 384
const CONDITION_OPERATORS = { gt: '>', eq: '=', lt: '<' } as const

export function flowFrameSize(frame: Pick<PrototypeFlowFrame, 'width' | 'height'>): FlowFrameSize {
  const sourceWidth =
    Number.isFinite(frame.width) && frame.width > 0 ? frame.width : FALLBACK_FRAME_WIDTH
  const sourceHeight =
    Number.isFinite(frame.height) && frame.height > 0 ? frame.height : FALLBACK_FRAME_HEIGHT
  const scale = Math.min(FLOW_FRAME_MAX_WIDTH / sourceWidth, FLOW_FRAME_MAX_HEIGHT / sourceHeight)

  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale))
  }
}

function collectEdges(
  graph: SceneGraph,
  screens: ReadonlySet<string>,
  edges: PrototypeFlowEdge[],
  frameId: string,
  node: SceneNode,
  actions: readonly PrototypeAction[],
  path = '',
  conditions: string[] = []
) {
  for (const [index, action] of actions.entries()) {
    const actionPath = `${path}.${index}`
    if (action.type === 'ifNumber') {
      const name = graph.variables.get(action.variableId)?.name ?? action.variableId
      const condition = `${name} ${CONDITION_OPERATORS[action.operator]} ${action.value}`
      collectEdges(graph, screens, edges, frameId, node, action.actions, actionPath, [
        ...conditions,
        condition
      ])
    }
    if (!('targetId' in action) || !screens.has(action.targetId)) continue
    if (action.type !== 'navigate' && action.targetId === frameId) continue
    edges.push({
      id: `${node.id}${actionPath}:${action.targetId}`,
      from: frameId,
      to: action.targetId,
      sourceId: node.id,
      sourceName: node.name,
      kind: action.type,
      conditions
    })
  }
}

export function readPrototypeFlow(graph: SceneGraph, pageId: string): PrototypeFlow {
  const screens = graph
    .getChildren(pageId)
    .filter((node) => node.visible && !node.internalOnly && prototypeTarget(graph, pageId, node.id))
    .map((node) => ({ node, start: readPrototype(node).start === true }))
    .sort((a, b) => Number(b.start) - Number(a.start) || a.node.y - b.node.y || a.node.x - b.node.x)

  const screenIds = new Set(screens.map(({ node }) => node.id))
  const frames = screens.map(({ node, start }) => ({
    id: node.id,
    name: node.name,
    width: node.width,
    height: node.height,
    start
  }))
  const edges: PrototypeFlowEdge[] = []

  for (const { node: frame } of screens) {
    const nodes = [frame, ...graph.flattenTree(frame.id).map(({ node }) => node)]
    for (const node of nodes) {
      const actions = readPrototype(node).actions
      if (
        !actions?.length ||
        graph.closest(node.id, (layer) => !layer.visible || layer.internalOnly)
      )
        continue
      collectEdges(graph, screenIds, edges, frame.id, node, actions)
    }
  }
  return { frames, edges }
}

function overlaps(
  a: { frame: PrototypeFlowFrame; point: FlowPoint },
  b: { frame: PrototypeFlowFrame; point: FlowPoint }
) {
  const aSize = flowFrameSize(a.frame)
  const bSize = flowFrameSize(b.frame)
  return (
    a.point.x < b.point.x + bSize.width &&
    a.point.x + aSize.width > b.point.x &&
    a.point.y < b.point.y + bSize.height &&
    a.point.y + aSize.height > b.point.y
  )
}

export function arrangePrototypeFlow(
  flow: PrototypeFlow,
  pinned?: ReadonlyMap<string, FlowPoint>
): Map<string, FlowPoint> {
  const outgoing = new Map<string, string[]>()
  for (const edge of flow.edges) {
    const targets = outgoing.get(edge.from)
    if (targets) targets.push(edge.to)
    else outgoing.set(edge.from, [edge.to])
  }

  const positions = new Map<string, FlowPoint>()
  for (const { id } of flow.frames) {
    const point = pinned?.get(id)
    if (point) positions.set(id, point)
  }
  const placed = flow.frames.flatMap((frame) => {
    const point = positions.get(frame.id)
    return point ? [{ frame, point }] : []
  })
  const visited = new Set<string>()
  let firstRow = 0

  for (const frame of flow.frames) {
    if (visited.has(frame.id)) continue
    const queue = [{ id: frame.id, column: 0 }]
    const nextRow = new Map<number, number>()
    let lastRow = firstRow
    visited.add(frame.id)

    for (const { id, column } of queue) {
      if (!positions.has(id)) {
        let row = nextRow.get(column) ?? firstRow
        let point = { x: column * COLUMN_STEP, y: row * ROW_STEP }
        while (placed.some((other) => overlaps({ frame, point }, other))) {
          row++
          point = { x: column * COLUMN_STEP, y: row * ROW_STEP }
        }
        positions.set(id, point)
        placed.push({ frame, point })
        nextRow.set(column, row + 1)
        lastRow = Math.max(lastRow, row)
      }
      for (const target of outgoing.get(id) ?? []) {
        if (visited.has(target)) continue
        visited.add(target)
        queue.push({ id: target, column: column + 1 })
      }
    }
    firstRow = lastRow + 1
  }

  return positions
}
