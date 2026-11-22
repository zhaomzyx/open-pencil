import { actionsAtSource, runPrototypeActions, startPrototype } from '#core/editor/play/prototype'
import type { EditorContext } from '#core/editor/types'

import { EDIT_VIEW, resolveEditorProfile } from './profile'
import type { CanvasView } from './types'

export function createCanvasViewActions(ctx: EditorContext) {
  function setCanvasView(view: CanvasView): void {
    ctx.state.canvasView = view
    ctx.requestRepaint()
  }

  /** Leaves the canvas's view for the one it returns to; false when there is none to leave. */
  function leaveCanvasView(): boolean {
    const profile = resolveEditorProfile(ctx.state)
    if (profile.live?.player?.overlays.length) {
      backPlay()
      return true
    }
    const target = profile.leaveTo
    if (!target) return false
    setCanvasView(target)
    return true
  }

  /** Preview this canvas, optionally from a specific top-level frame. */
  function startPlay(startId?: string): void {
    const current = ctx.state.canvasView
    if (!startId && current.id === 'play') return
    ctx.state.hoveredNodeId = null
    restart(current.id === 'play' ? current.revision + 1 : 0, startId)
  }

  /** Go back to editing; the canvas draws every layer again. */
  function stopPlay(): void {
    if (ctx.state.canvasView.id === 'play') setCanvasView(EDIT_VIEW)
  }

  function togglePlay(): void {
    if (ctx.state.canvasView.id === 'play') stopPlay()
    else startPlay()
  }

  function restart(revision: number, startId?: string) {
    const player = startPrototype(
      ctx.graph,
      ctx.state.currentPageId,
      ctx.state.selectedIds,
      startId
    )
    setCanvasView(player ? { id: 'play', revision, player } : { id: 'play', revision })
  }

  function activatePlaySource(sourceId: string) {
    const view = ctx.state.canvasView
    if (view.id !== 'play' || !view.player) return
    const actions = actionsAtSource(ctx.graph, view.player, sourceId)
    if (!actions.length) return
    setCanvasView({
      ...view,
      player: runPrototypeActions(ctx.graph, ctx.state.currentPageId, view.player, actions)
    })
  }

  function backPlay() {
    const view = ctx.state.canvasView
    if (view.id !== 'play' || !view.player) return
    const type = view.player.overlays.length ? 'closeOverlay' : 'back'
    setCanvasView({
      ...view,
      player: runPrototypeActions(ctx.graph, ctx.state.currentPageId, view.player, [{ type }])
    })
  }

  /** Put every control back as designed by running the islands afresh. */
  function resetPlay(): void {
    const view = ctx.state.canvasView
    if (view.id === 'play') restart(view.revision + 1, view.player?.startId)
  }

  // Another document's layers start from their designed state, not from the old islands'.
  ctx.onEditorEvent('graph:replaced', resetPlay)

  return {
    leaveCanvasView,
    startPlay,
    stopPlay,
    togglePlay,
    resetPlay,
    activatePlaySource,
    backPlay
  }
}
