import { inject, provide, shallowRef, type InjectionKey } from 'vue'

interface PlayHotspotHints {
  hint(paneId?: string): number
  request(paneId?: string): void
}

const PLAY_HOTSPOT_HINTS_KEY: InjectionKey<PlayHotspotHints> = Symbol('play-hotspot-hints')
const NO_PLAY_HOTSPOT_HINTS: PlayHotspotHints = {
  hint: () => 0,
  request: () => undefined
}

/** Keeps preview hint requests in the workspace, with one counter for each canvas pane. */
export function providePlayHotspotHints(): PlayHotspotHints {
  const hints = shallowRef<Record<string, number>>({})
  const context: PlayHotspotHints = {
    hint: (paneId) => hints.value[paneId ?? ''] ?? 0,
    request: (paneId) => {
      const key = paneId ?? ''
      hints.value = { ...hints.value, [key]: (hints.value[key] ?? 0) + 1 }
    }
  }
  provide(PLAY_HOTSPOT_HINTS_KEY, context)
  return context
}

export function usePlayHotspotHints(): PlayHotspotHints {
  return inject(PLAY_HOTSPOT_HINTS_KEY, NO_PLAY_HOTSPOT_HINTS)
}
