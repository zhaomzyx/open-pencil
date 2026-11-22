import { expect, test } from 'bun:test'

import { copyEditorViewState, createEditor, resolveEditorProfile } from '@open-pencil/core'
import { prototypePatch, type PrototypeSpec } from '@open-pencil/scene-graph/prototype'

function fixture() {
  const editor = createEditor()
  const { graph, state } = editor
  const frame = (name: string) => graph.createNode('FRAME', state.currentPageId, { name })
  const home = frame('Inventory')
  const details = frame('Item')
  const confirm = frame('Confirm')
  const done = frame('Done')
  const stock = graph.createVariable('Stock', 'FLOAT', graph.createCollection('Game').id, 3)
  function set(id: string, spec: PrototypeSpec) {
    const node = graph.getNode(id)
    if (!node) throw new Error('missing fixture node')
    graph.updateNode(id, prototypePatch(node, spec))
  }
  set(home.id, { start: true, actions: [{ type: 'navigate', targetId: details.id }] })
  set(details.id, { actions: [{ type: 'openOverlay', targetId: confirm.id }] })
  const buy = graph.createNode('FRAME', confirm.id)
  const label = graph.createNode('TEXT', buy.id, { text: 'Buy' })
  set(buy.id, {
    actions: [
      { type: 'addNumber', variableId: stock.id, value: -1 },
      {
        type: 'ifNumber',
        variableId: stock.id,
        operator: 'eq',
        value: 2,
        actions: [{ type: 'swapOverlay', targetId: done.id }]
      }
    ]
  })
  set(done.id, {
    actions: [{ type: 'setNumber', variableId: stock.id, value: 0 }, { type: 'closeOverlay' }]
  })
  return {
    editor,
    home,
    details,
    confirm,
    done,
    label,
    stock,
    set,
    player: () => resolveEditorProfile(state).live?.player
  }
}

test('a nested hit runs its nearest action, with the active overlay blocking the base screen', () => {
  const { editor, home, details, confirm, done, label, stock, player } = fixture()
  editor.setReadOnly(true)
  editor.startPlay()
  editor.activatePlaySource(home.id)
  editor.activatePlaySource(details.id)
  editor.activatePlaySource(details.id)
  expect(player()).toMatchObject({
    screenId: details.id,
    history: [home.id],
    overlays: [confirm.id]
  })
  const otherPane = copyEditorViewState(editor.state)
  editor.activatePlaySource(label.id)
  expect(player()).toMatchObject({ overlays: [done.id], numbers: { [stock.id]: 2 } })
  editor.activatePlaySource(done.id)
  expect(player()).toMatchObject({ overlays: [], numbers: { [stock.id]: 0 } })
  editor.backPlay()
  expect(player()).toMatchObject({ screenId: home.id, history: [] })
  expect(otherPane.canvasView).toMatchObject({
    player: { overlays: [confirm.id], numbers: { [stock.id]: 3 } }
  })
  expect(editor.graph.resolveNumberVariable(stock.id)).toBe(3)
  editor.resetPlay()
  expect(player()).toMatchObject({
    screenId: home.id,
    history: [],
    overlays: [],
    numbers: { [stock.id]: 3 }
  })
})

test('Escape dismisses the top overlay before leaving, and broken destinations stay put', () => {
  const { editor, home, confirm, done, set, player } = fixture()
  set(home.id, { start: true, actions: [{ type: 'openOverlay', targetId: confirm.id }] })
  set(confirm.id, { actions: [{ type: 'openOverlay', targetId: done.id }] })
  editor.startPlay()
  editor.activatePlaySource(home.id)
  editor.activatePlaySource(confirm.id)
  expect(player()?.overlays).toEqual([confirm.id, done.id])
  expect(editor.leaveCanvasView()).toBe(true)
  expect(player()?.overlays).toEqual([confirm.id])
  editor.leaveCanvasView()
  set(home.id, { start: true, actions: [{ type: 'navigate', targetId: 'missing' }] })
  editor.activatePlaySource(home.id)
  expect(player()).toMatchObject({ screenId: home.id, history: [] })
  editor.leaveCanvasView()
  expect(player()).toBeUndefined()
})
