import { isEqual } from 'es-toolkit'

import type { SceneNode } from '@open-pencil/scene-graph'
import {
  isPrototypeNumber,
  prototypePatch,
  prototypeTarget,
  readPrototype,
  type PrototypeAction,
  type PrototypeSpec
} from '@open-pencil/scene-graph/prototype'

import { getNodeEditCapability } from './capabilities'
import type { EditorContext } from './types'

export function createPrototypeActions(ctx: EditorContext) {
  const screen = (node: SceneNode) =>
    !!prototypeTarget(ctx.graph, ctx.state.currentPageId, node.id) && !node.internalOnly
  const editable = (node: SceneNode) =>
    !ctx.graph.closest(node.id, (layer) => layer.locked) &&
    getNodeEditCapability(ctx.graph, node.id).editable
  const numberVariable = (id: string) => isPrototypeNumber(ctx.graph, id)
  function source(id: string) {
    const node = ctx.graph.getNode(id)
    return node && !node.internalOnly && ctx.graph.closest(id, screen) && editable(node)
      ? node
      : null
  }
  function valid(action: PrototypeAction): boolean {
    if ('targetId' in action) {
      const target = ctx.graph.getNode(action.targetId)
      return !!target && screen(target)
    }
    if (
      'variableId' in action &&
      (!numberVariable(action.variableId) || !Number.isFinite(action.value))
    )
      return false
    return action.type !== 'ifNumber' || action.actions.every(valid)
  }
  function change(node: SceneNode, next: PrototypeSpec, label: string) {
    const previous = readPrototype(node)
    if (isEqual(previous, next)) return
    // Recompute the patch against the current layer on replay so other plug-in data survives undo.
    const write = (spec: PrototypeSpec) => {
      const current = ctx.graph.getNode(node.id)
      if (current) ctx.graph.updateNode(current.id, prototypePatch(current, spec))
      ctx.requestRender()
    }
    write(next)
    ctx.undo.push({ label, forward: () => write(next), inverse: () => write(previous) })
  }
  function setPrototypeStart(id: string, enabled: boolean) {
    const node = source(id)
    if (!node || !screen(node)) return
    const previous = enabled
      ? ctx.graph
          .getChildren(ctx.state.currentPageId)
          .filter((other) => other.id !== id && screen(other) && readPrototype(other).start)
      : []
    if (previous.some((other) => !editable(other))) return
    const label = 'Set prototype start'
    ctx.undo.runBatch(label, () => {
      for (const other of previous)
        change(other, { ...readPrototype(other), start: undefined }, label)
      change(node, { ...readPrototype(node), start: enabled || undefined }, label)
    })
  }
  function setPrototypeActions(id: string, actions: PrototypeAction[]) {
    const node = source(id)
    if (!node || !actions.every(valid)) return
    change(
      node,
      { ...readPrototype(node), actions: actions.length ? structuredClone(actions) : undefined },
      'Edit prototype actions'
    )
  }
  function bindPrototypeText(id: string, variableId: string | null) {
    const node = source(id)
    if (node?.type !== 'TEXT' || (variableId !== null && !numberVariable(variableId))) return
    change(
      node,
      { ...readPrototype(node), textVariableId: variableId ?? undefined },
      'Bind prototype text'
    )
  }
  return { setPrototypeStart, setPrototypeActions, bindPrototypeText }
}
