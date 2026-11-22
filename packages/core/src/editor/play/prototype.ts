import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import {
  prototypeTarget,
  readPrototype,
  type PrototypeAction
} from '@open-pencil/scene-graph/prototype'

/** Runtime values belong to one preview pane. All transitions replace its snapshot. */
export interface PrototypePlayer {
  startId: string
  screenId: string
  history: string[]
  overlays: string[]
  numbers: Record<string, number>
}

function screen(graph: SceneGraph, pageId: string, id: string): boolean {
  return prototypeTarget(graph, pageId, id)?.visible === true
}

function authored(graph: SceneGraph, node: SceneNode): boolean {
  const spec = readPrototype(node)
  return (
    !!(spec.actions?.length || spec.textVariableId) ||
    graph.getChildren(node.id).some((child) => authored(graph, child))
  )
}

export function startPrototype(
  graph: SceneGraph,
  pageId: string,
  selection: ReadonlySet<string>,
  restartId?: string
): PrototypePlayer | undefined {
  const screens = graph.getChildren(pageId).filter((node) => screen(graph, pageId, node.id))
  const starts = screens.filter((node) => readPrototype(node).start)
  const candidate = starts.length ? starts : screens.filter((node) => authored(graph, node))
  const start =
    screens.find((node) => node.id === restartId) ??
    candidate.find((node) =>
      [...selection].some((id) => id === node.id || graph.isDescendant(id, node.id))
    ) ??
    candidate.at(0)
  if (!start) return undefined
  const numbers: Record<string, number> = Object.create(null)
  for (const variable of graph.variables.values()) {
    if (variable.type !== 'FLOAT') continue
    const value = graph.resolveNumberVariable(variable.id)
    if (value !== undefined && Number.isFinite(value)) numbers[variable.id] = value
  }
  return { startId: start.id, screenId: start.id, history: [], overlays: [], numbers }
}

function goBack(graph: SceneGraph, pageId: string, run: PrototypePlayer) {
  let previous = run.history.pop()
  while (previous && !screen(graph, pageId, previous)) previous = run.history.pop()
  if (previous) {
    run.screenId = previous
    run.overlays = []
  }
}

function numberActions(
  run: PrototypePlayer,
  action: Extract<PrototypeAction, { variableId: string }>
): readonly PrototypeAction[] {
  if (!Object.hasOwn(run.numbers, action.variableId)) return []
  const current = run.numbers[action.variableId]
  if (action.type === 'ifNumber') {
    const matches = {
      eq: current === action.value,
      gt: current > action.value,
      lt: current < action.value
    }
    return matches[action.operator] ? action.actions : []
  }
  const next = action.type === 'addNumber' ? current + action.value : action.value
  if (Number.isFinite(next)) run.numbers[action.variableId] = next
  return []
}

function perform(
  graph: SceneGraph,
  pageId: string,
  run: PrototypePlayer,
  actions: readonly PrototypeAction[]
) {
  for (const action of actions) {
    switch (action.type) {
      case 'navigate':
        if (!screen(graph, pageId, action.targetId)) break
        if (run.screenId !== action.targetId) run.history.push(run.screenId)
        run.screenId = action.targetId
        run.overlays = []
        break
      case 'openOverlay':
      case 'swapOverlay':
        if (
          !screen(graph, pageId, action.targetId) ||
          action.targetId === run.screenId ||
          run.overlays.includes(action.targetId)
        )
          break
        if (action.type === 'swapOverlay') run.overlays.pop()
        run.overlays.push(action.targetId)
        break
      case 'back':
        goBack(graph, pageId, run)
        break
      case 'closeOverlay':
        run.overlays.pop()
        break
      case 'setNumber':
      case 'addNumber':
      case 'ifNumber':
        perform(graph, pageId, run, numberActions(run, action))
        break
    }
  }
}

export function runPrototypeActions(
  graph: SceneGraph,
  pageId: string,
  player: PrototypePlayer,
  actions: readonly PrototypeAction[]
): PrototypePlayer {
  const next = {
    ...player,
    history: [...player.history],
    overlays: [...player.overlays],
    numbers: { ...player.numbers }
  }
  perform(graph, pageId, next, actions)
  return next
}

export function actionsAtSource(graph: SceneGraph, player: PrototypePlayer, sourceId: string) {
  const root = player.overlays.at(-1) ?? player.screenId
  let node = graph.getNode(sourceId)
  if (!node || (sourceId !== root && !graph.isDescendant(sourceId, root))) return []
  while (node) {
    const actions = readPrototype(node).actions
    if (actions?.length) return actions
    if (node.id === root) break
    node = node.parentId ? graph.getNode(node.parentId) : undefined
  }
  return []
}
