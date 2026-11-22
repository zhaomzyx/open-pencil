import type { SceneGraph } from '@open-pencil/scene-graph'
import { prototypePatch, type PrototypeAction } from '@open-pencil/scene-graph/prototype'

import { solid } from '../paints'

/** The same editable layers serve as the inventory, item details and discard confirmation. */
export function createInventory(graph: SceneGraph, pageId: string, wireStart = true) {
  const collection = graph.createCollection('Inventory')
  const stock = graph.createVariable('Potion stock', 'FLOAT', collection.id, 3)
  function frame(name: string, x: number, width = 300, height = 240) {
    return graph.createNode('FRAME', pageId, {
      name,
      x,
      y: 40,
      width,
      height,
      fills: [solid(0.12, 0.16, 0.2)]
    })
  }
  function label(parentId: string, text: string, x: number, y: number, width = 140) {
    return graph.createNode('TEXT', parentId, {
      name: text,
      text,
      x,
      y,
      width,
      height: 24,
      fontSize: 16,
      fills: [solid(1, 1, 1)]
    })
  }
  function button(parentId: string, name: string, y: number, actions: PrototypeAction[]) {
    const node = graph.createNode('FRAME', parentId, {
      name,
      x: 20,
      y,
      width: 170,
      height: 36,
      cornerRadius: 6,
      fills: [solid(0.14, 0.38, 0.55)]
    })
    label(node.id, name, 8, 6)
    if (actions.length) graph.updateNode(node.id, prototypePatch(node, { actions }))
    return node.id
  }
  const inventory = frame('Backpack', 40)
  const detail = frame('Potion details', 380)
  const dialog = frame('Discard confirmation', 720, 220, 160)
  label(inventory.id, 'Inventory', 20, 16)
  label(detail.id, 'Healing potion', 20, 16)
  label(detail.id, 'In stock', 20, 52)
  const count = label(detail.id, '3', 110, 52, 40)
  graph.updateNode(count.id, prototypePatch(count, { textVariableId: stock.id }))
  label(dialog.id, 'Discard one potion?', 20, 12, 185)
  const potion = button(
    inventory.id,
    'Select potion',
    72,
    wireStart ? [{ type: 'navigate', targetId: detail.id }] : []
  )
  if (wireStart) graph.updateNode(inventory.id, prototypePatch(inventory, { start: true }))
  const discard = button(detail.id, 'Discard', 90, [{ type: 'openOverlay', targetId: dialog.id }])
  button(detail.id, 'Return to backpack', 150, [{ type: 'back' }])
  button(dialog.id, 'Cancel', 48, [{ type: 'closeOverlay' }])
  const confirm = button(dialog.id, 'Confirm discard', 100, [
    {
      type: 'ifNumber',
      variableId: stock.id,
      operator: 'gt',
      value: 0,
      actions: [{ type: 'addNumber', variableId: stock.id, value: -1 }]
    },
    { type: 'closeOverlay' }
  ])
  return {
    inventory: inventory.id,
    detail: detail.id,
    dialog: dialog.id,
    potion,
    discard,
    confirm,
    count: count.id,
    stock: stock.id
  }
}
