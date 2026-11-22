import type { SceneGraph, SceneNode } from '@open-pencil/scene-graph'
import {
  isPrototypeNumber,
  prototypeTarget,
  readPrototype,
  type PrototypeAction
} from '@open-pencil/scene-graph/prototype'

/** The authored click sequence and the current document references it reads or changes. */
export function inspectPrototype(graph: SceneGraph, node: SceneNode) {
  const spec = readPrototype(node)
  const actions = spec.actions ?? []
  const pageId = graph.pageOf(node.id)
  const targets = new Set<string>()
  const variables = new Set<string>()
  if (spec.textVariableId) variables.add(spec.textVariableId)

  function visit(sequence: readonly PrototypeAction[]) {
    for (const action of sequence) {
      if ('targetId' in action) targets.add(action.targetId)
      if ('variableId' in action) variables.add(action.variableId)
      if (action.type === 'ifNumber') visit(action.actions)
    }
  }
  visit(actions)
  return {
    source: { id: node.id, name: node.name, pageId },
    start: spec.start ?? false,
    trigger: actions.length ? 'click' : null,
    actions,
    textVariableId: spec.textVariableId ?? null,
    targets: [...targets].map((id) => ({
      id,
      name: graph.getNode(id)?.name ?? null,
      valid: !!pageId && !!prototypeTarget(graph, pageId, id)
    })),
    variables: [...variables].map((id) => ({
      id,
      name: graph.variables.get(id)?.name ?? null,
      valid: isPrototypeNumber(graph, id)
    }))
  }
}
