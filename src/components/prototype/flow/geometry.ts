import { groupBy } from 'es-toolkit'

import {
  FLOW_GRID_STEP,
  flowFrameSize,
  type FlowPoint,
  type FlowFrameSize,
  type PrototypeFlow
} from '@/app/editor/prototype-flow'

export { FLOW_GRID_STEP, flowFrameSize }

export type FlowFrame = PrototypeFlow['frames'][number]
export type FlowEdge = PrototypeFlow['edges'][number]
export type FlowSide = 'top' | 'right' | 'bottom' | 'left'

export interface FlowBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface FlowEdgePath {
  edge: FlowEdge
  path: string
  label: FlowPoint
  bounds: FlowBounds
  sourceName: string
  conditions: string[]
}

interface AnchorRequest {
  edgeId: string
  frameId: string
  role: 'source' | 'target'
  side: FlowSide
  sort: number
}

interface AnchorPair {
  source: FlowSide
  target: FlowSide
}

const FALLBACK_COLUMNS = 3
const FALLBACK_COLUMN_STEP = FLOW_GRID_STEP * 14
const FALLBACK_ROW_STEP = FLOW_GRID_STEP * 16
const ANCHOR_STEP = 28
const ANCHOR_MIN_SPAN = 76
const ANCHOR_MAX_RATIO = 0.6
const SELF_LOOP_GAP = 26
const SIDE_DIRECTION = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 }
} satisfies Record<FlowSide, FlowPoint>

function roundCoordinate(value: number) {
  return Number(value.toFixed(2))
}

function pointAtSide(point: FlowPoint, size: FlowFrameSize, side: FlowSide, offset = 0): FlowPoint {
  if (side === 'top') return { x: point.x + size.width / 2 + offset, y: point.y }
  if (side === 'right') return { x: point.x + size.width, y: point.y + size.height / 2 + offset }
  if (side === 'bottom') return { x: point.x + size.width / 2 + offset, y: point.y + size.height }
  return { x: point.x, y: point.y + size.height / 2 + offset }
}

function centerOf(point: FlowPoint, size: FlowFrameSize): FlowPoint {
  return {
    x: point.x + size.width / 2,
    y: point.y + size.height / 2
  }
}

function fallbackPoint(index: number): FlowPoint {
  return {
    x: Math.floor(index / FALLBACK_COLUMNS) * FALLBACK_COLUMN_STEP,
    y: (index % FALLBACK_COLUMNS) * FALLBACK_ROW_STEP
  }
}

function sidePairBetween(
  source: FlowPoint,
  sourceSize: FlowFrameSize,
  target: FlowPoint,
  targetSize: FlowFrameSize
): AnchorPair {
  const sourceCenter = centerOf(source, sourceSize)
  const targetCenter = centerOf(target, targetSize)
  const deltaX = targetCenter.x - sourceCenter.x
  const deltaY = targetCenter.y - sourceCenter.y
  const averageWidth = Math.max(1, (sourceSize.width + targetSize.width) / 2)
  const averageHeight = Math.max(1, (sourceSize.height + targetSize.height) / 2)

  if (Math.abs(deltaX) / averageWidth >= Math.abs(deltaY) / averageHeight) {
    return deltaX >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' }
  }

  return deltaY >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' }
}

function sortValueForSide(point: FlowPoint, size: FlowFrameSize, side: FlowSide) {
  const center = centerOf(point, size)
  return side === 'left' || side === 'right' ? center.y : center.x
}

function groupKey(frameId: string, side: FlowSide) {
  return `${frameId}\u0000${side}`
}

function edgeKey(edgeId: string, role: AnchorRequest['role']) {
  return `${edgeId}\u0000${role}`
}

function outwardPoint(point: FlowPoint, side: FlowSide, reach: number): FlowPoint {
  const direction = SIDE_DIRECTION[side]
  return { x: point.x + direction.x * reach, y: point.y + direction.y * reach }
}

function cubicPoint(
  start: FlowPoint,
  controlA: FlowPoint,
  controlB: FlowPoint,
  end: FlowPoint,
  t: number
) {
  const inverse = 1 - t
  return {
    x: roundCoordinate(
      inverse ** 3 * start.x +
        3 * inverse ** 2 * t * controlA.x +
        3 * inverse * t ** 2 * controlB.x +
        t ** 3 * end.x
    ),
    y: roundCoordinate(
      inverse ** 3 * start.y +
        3 * inverse ** 2 * t * controlA.y +
        3 * inverse * t ** 2 * controlB.y +
        t ** 3 * end.y
    )
  }
}

function cubicRoute(
  start: FlowPoint,
  controlA: FlowPoint,
  controlB: FlowPoint,
  end: FlowPoint,
  labelPosition: number
): Pick<FlowEdgePath, 'path' | 'label' | 'bounds'> {
  const path = [
    `M ${roundCoordinate(start.x)} ${roundCoordinate(start.y)}`,
    `C ${roundCoordinate(controlA.x)} ${roundCoordinate(controlA.y)}`,
    `${roundCoordinate(controlB.x)} ${roundCoordinate(controlB.y)}`,
    `${roundCoordinate(end.x)} ${roundCoordinate(end.y)}`
  ].join(' ')
  return {
    path,
    label: cubicPoint(start, controlA, controlB, end, labelPosition),
    bounds: {
      minX: Math.min(start.x, controlA.x, controlB.x, end.x),
      minY: Math.min(start.y, controlA.y, controlB.y, end.y),
      maxX: Math.max(start.x, controlA.x, controlB.x, end.x),
      maxY: Math.max(start.y, controlA.y, controlB.y, end.y)
    }
  }
}

function selfLoopPath(point: FlowPoint, size: FlowFrameSize, index: number) {
  const extension = index * SELF_LOOP_GAP
  const start = {
    x: point.x + size.width,
    y: point.y + size.height * 0.2
  }
  const end = {
    x: point.x + size.width * 0.74,
    y: point.y
  }
  const controlA = outwardPoint(start, 'right', 90 + extension)
  const controlB = outwardPoint(end, 'top', 104 + extension)

  return cubicRoute(start, controlA, controlB, end, 0.48)
}

export function resolveFlowPositions(
  flow: PrototypeFlow,
  positions: ReadonlyMap<string, FlowPoint>
) {
  const resolved = new Map<string, FlowPoint>()
  flow.frames.forEach((frame, index) => {
    const provided = positions.get(frame.id)
    resolved.set(frame.id, provided ? { ...provided } : fallbackPoint(index))
  })
  return resolved
}

export function flowCardBounds(
  flow: PrototypeFlow,
  points: ReadonlyMap<string, FlowPoint>
): FlowBounds {
  if (flow.frames.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const frame of flow.frames) {
    const point = points.get(frame.id)
    if (!point) continue
    const size = flowFrameSize(frame)
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x + size.width)
    maxY = Math.max(maxY, point.y + size.height)
  }

  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  return { minX, minY, maxX, maxY }
}

export function createFlowEdgePaths(
  flow: PrototypeFlow,
  points: ReadonlyMap<string, FlowPoint>
): FlowEdgePath[] {
  const frameSizes = new Map(flow.frames.map((frame) => [frame.id, flowFrameSize(frame)] as const))
  const sizeFor = (frameId: string) =>
    frameSizes.get(frameId) ?? flowFrameSize({ width: 0, height: 0 })
  const validEdges = flow.edges.filter((edge) => points.has(edge.from) && points.has(edge.to))
  const selfLoops = groupBy(
    validEdges.filter((edge) => edge.from === edge.to),
    (edge) => edge.from
  )

  const requests: AnchorRequest[] = []
  for (const edge of validEdges) {
    if (edge.from === edge.to) continue
    const source = points.get(edge.from)
    const target = points.get(edge.to)
    if (!source || !target) continue
    const sourceSize = sizeFor(edge.from)
    const targetSize = sizeFor(edge.to)
    const sides = sidePairBetween(source, sourceSize, target, targetSize)
    requests.push(
      {
        edgeId: edge.id,
        frameId: edge.from,
        role: 'source',
        side: sides.source,
        sort: sortValueForSide(target, targetSize, sides.source)
      },
      {
        edgeId: edge.id,
        frameId: edge.to,
        role: 'target',
        side: sides.target,
        sort: sortValueForSide(source, sourceSize, sides.target)
      }
    )
  }

  const anchors = new Map<string, FlowPoint>()
  for (const group of Object.values(
    groupBy(requests, (request) => groupKey(request.frameId, request.side))
  )) {
    const ordered = [...group].sort(
      (left, right) => left.sort - right.sort || left.edgeId.localeCompare(right.edgeId)
    )
    const size = sizeFor(ordered[0]?.frameId ?? '')
    const sideLength =
      ordered[0]?.side === 'left' || ordered[0]?.side === 'right' ? size.height : size.width
    const span = Math.min(
      sideLength * ANCHOR_MAX_RATIO,
      Math.max(ANCHOR_MIN_SPAN, (ordered.length - 1) * ANCHOR_STEP)
    )

    ordered.forEach((request, index) => {
      const point = points.get(request.frameId)
      if (!point) return
      const offset = ordered.length <= 1 ? 0 : (index / (ordered.length - 1) - 0.5) * span
      anchors.set(
        edgeKey(request.edgeId, request.role),
        pointAtSide(point, size, request.side, offset)
      )
    })
  }

  return validEdges.flatMap((edge) => {
    const sourcePoint = points.get(edge.from)
    const targetPoint = points.get(edge.to)
    if (!sourcePoint || !targetPoint) return []

    const conditions = edge.conditions.filter((condition) => condition.trim().length > 0)
    if (edge.from === edge.to) {
      const loopIndex = selfLoops[edge.from].findIndex((item) => item.id === edge.id)
      return [
        {
          edge,
          ...selfLoopPath(sourcePoint, sizeFor(edge.from), Math.max(0, loopIndex)),
          sourceName: edge.sourceName,
          conditions
        }
      ]
    }

    const start = anchors.get(edgeKey(edge.id, 'source'))
    const end = anchors.get(edgeKey(edge.id, 'target'))
    if (!start || !end) return []

    const sourceSize = sizeFor(edge.from)
    const targetSize = sizeFor(edge.to)
    const sides = sidePairBetween(sourcePoint, sourceSize, targetPoint, targetSize)
    const horizontal = sides.source === 'left' || sides.source === 'right'
    const gap = horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y)
    const reach = Math.max(16, Math.min(144, gap * 0.48))
    const controlA = outwardPoint(start, sides.source, reach)
    const controlB = outwardPoint(end, sides.target, reach)

    return [
      {
        edge,
        ...cubicRoute(start, controlA, controlB, end, 0.5),
        sourceName: edge.sourceName,
        conditions
      }
    ]
  })
}
