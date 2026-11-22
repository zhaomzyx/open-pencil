import { afterEach, expect, test } from 'bun:test'

import { createEditor, type Editor } from '@open-pencil/core'
import { readPrototype, type PrototypeAction } from '@open-pencil/scene-graph/prototype'

let editor: Editor
afterEach(() => editor.dispose())
function setup() {
  editor = createEditor()
  const { graph } = editor
  const page = editor.state.currentPageId
  const home = graph.createNode('FRAME', page)
  const target = graph.createNode('FRAME', page)
  const text = graph.createNode('TEXT', home.id)
  const collection = graph.createCollection('Inventory')
  const number = graph.createVariable('Count', 'FLOAT', collection.id, 3)
  return { graph, page, home, target, text, number }
}

test('replacing a starting frame undoes and redoes both frame changes together', () => {
  const { home, target } = setup()
  editor.setPrototypeStart(home.id, true)
  editor.setPrototypeStart(target.id, true)
  expect(readPrototype(home).start).toBeUndefined()
  expect(readPrototype(target).start).toBe(true)
  editor.undo.undo()
  expect(readPrototype(home).start).toBe(true)
  expect(readPrototype(target).start).toBeUndefined()
  editor.undo.redo()
  expect(readPrototype(target).start).toBe(true)
})

test('ordered nested actions and text bindings are independent undoable edits', () => {
  const { text, target, number } = setup()
  const actions: PrototypeAction[] = [
    { type: 'addNumber', variableId: number.id, value: -1 },
    {
      type: 'ifNumber',
      variableId: number.id,
      operator: 'eq',
      value: 0,
      actions: [{ type: 'openOverlay', targetId: target.id }]
    }
  ]
  editor.setPrototypeActions(text.id, actions)
  editor.bindPrototypeText(text.id, number.id)
  expect(readPrototype(text)).toEqual({ actions, textVariableId: number.id })
  editor.undo.undo()
  expect(readPrototype(text)).toEqual({ actions })
  editor.undo.undo()
  expect(readPrototype(text)).toEqual({})
  editor.undo.redo()
  expect(readPrototype(text).actions).toEqual(actions)
})

test('rejects nested and off-page destinations and non-numeric variables without recording a partial change', () => {
  const { home, text, graph, number } = setup()
  const nested = graph.createNode('FRAME', home.id)
  const other = graph.createNode('FRAME', graph.createNode('CANVAS', graph.rootId).id)
  for (const targetId of [nested.id, other.id]) {
    editor.setPrototypeActions(text.id, [
      { type: 'back' },
      {
        type: 'ifNumber',
        variableId: number.id,
        operator: 'lt',
        value: 2,
        actions: [{ type: 'navigate', targetId }]
      }
    ])
  }
  const string = graph.createVariable('label', 'STRING', number.collectionId, 'text')
  editor.bindPrototypeText(text.id, string.id)
  editor.bindPrototypeText(home.id, number.id)
  editor.setPrototypeActions(text.id, [{ type: 'setNumber', variableId: string.id, value: 1 }])
  editor.setPrototypeStart(nested.id, true)
  expect(readPrototype(text)).toEqual({})
  expect(readPrototype(home)).toEqual({})
  expect(readPrototype(nested)).toEqual({})
  expect(editor.undo.canUndo).toBe(false)
})
