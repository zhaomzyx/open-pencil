import { expect, test } from 'bun:test'

import { FigmaAPI } from '@open-pencil/core/figma-api'
import { SceneGraph } from '@open-pencil/scene-graph'
import { prototypePatch, type PrototypeAction } from '@open-pencil/scene-graph/prototype'

import { inspectPrototype } from '#core/openpencil-api/prototype'
import { getPrototype } from '#core/tools/read/prototype'

test('the prototype tool and inspector keep conditional action order and identify broken references', async () => {
  const graph = new SceneGraph()
  const figma = new FigmaAPI(graph)
  const screen = graph.createNode('FRAME', figma.currentPage.id, { name: 'Inventory' })
  const button = graph.createNode('FRAME', screen.id, { name: 'Discard' })
  const stock = graph.createVariable('Stock', 'FLOAT', graph.createCollection('Items').id, 3)
  const actions: PrototypeAction[] = [
    {
      type: 'ifNumber',
      operator: 'gt',
      variableId: stock.id,
      value: 0,
      actions: [
        { type: 'addNumber', variableId: stock.id, value: -1 },
        { type: 'navigate', targetId: screen.id }
      ]
    },
    { type: 'openOverlay', targetId: 'deleted-overlay' },
    { type: 'closeOverlay' }
  ]
  graph.updateNode(
    button.id,
    prototypePatch(button, { actions, textVariableId: 'deleted-variable' })
  )
  const summary = inspectPrototype(graph, button)
  expect(summary).toMatchObject({
    source: { id: button.id, name: 'Discard', pageId: figma.currentPage.id },
    trigger: 'click',
    actions,
    targets: [
      { id: screen.id, name: 'Inventory', valid: true },
      { id: 'deleted-overlay', name: null, valid: false }
    ],
    variables: [
      { id: 'deleted-variable', name: null, valid: false },
      { id: stock.id, name: 'Stock', valid: true }
    ]
  })
  expect(await getPrototype.execute(figma, { id: button.id })).toEqual(summary)
  expect(await getPrototype.execute(figma, { id: 'gone' })).toEqual({
    error: 'Node "gone" not found'
  })
})
