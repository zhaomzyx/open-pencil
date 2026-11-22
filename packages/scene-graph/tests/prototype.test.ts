import { expect, test } from 'bun:test'

import { SceneGraph } from '@open-pencil/scene-graph'
import {
  prototypePatch,
  readPrototype,
  type PrototypeSpec
} from '@open-pencil/scene-graph/prototype'
import {
  applyGraphTransfer,
  layerDependencies,
  prepareGraphTransfer
} from '@open-pencil/scene-graph/transfer'
import { getNodeOrThrow } from '@open-pencil/test-support/assert'

function setup() {
  const graph = new SceneGraph()
  const page = graph.getPages()[0]
  const root = graph.createNode('FRAME', page.id)
  const button = graph.createNode('RECTANGLE', root.id)
  const stock = graph.createVariable('Stock', 'FLOAT', graph.createCollection('Game').id, 3)
  const spec = (targetId: string, variableId: string): PrototypeSpec => ({
    textVariableId: variableId,
    actions: [
      {
        type: 'ifNumber',
        variableId,
        operator: 'gt',
        value: 0,
        actions: [
          { type: 'addNumber', variableId, value: -1 },
          { type: 'navigate', targetId },
          { type: 'openOverlay', targetId: 'missing' }
        ]
      }
    ]
  })
  graph.updateNode(button.id, prototypePatch(button, spec(root.id, stock.id)))
  return { graph, page, root, button, stock, spec }
}

test('a duplicate names the copied frame, while the source and missing links retain their IDs', () => {
  const { graph, page, root, button, stock, spec } = setup()
  const clone = graph.cloneTree(root.id, page.id)
  if (!clone) throw new Error('Expected copied subtree')
  expect(readPrototype(graph.getChildren(clone.id)[0])).toEqual(spec(clone.id, stock.id))
  expect(readPrototype(button)).toEqual(spec(root.id, stock.id))
  graph.updateNode(button.id, {
    pluginData: [...button.pluginData, { pluginId: 'third-party', key: 'x', value: 'keep' }]
  })
  graph.updateNode(button.id, prototypePatch(button, {}))
  expect(button.pluginData).toEqual([{ pluginId: 'third-party', key: 'x', value: 'keep' }])
  expect(readPrototype(button)).toEqual({})
})

test('transfer carries prototype-only variables and renames nested actions and text bindings', () => {
  const { graph, root, stock, button, spec } = setup()
  expect([...layerDependencies(graph, [button]).variables]).toEqual([stock.id])
  const target = new SceneGraph()
  const plan = prepareGraphTransfer({
    source: graph,
    target,
    parentId: target.getPages()[0].id,
    rootIds: [root.id],
    dependencyPageIds: []
  })
  applyGraphTransfer(target, plan)
  const copy = getNodeOrThrow(target, plan.rootIds[0])
  expect(readPrototype(target.getChildren(copy.id)[0])).toEqual(spec(copy.id, plan.variables[0].id))
})
