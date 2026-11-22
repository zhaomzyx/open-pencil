import { onMounted, shallowRef, type Ref } from 'vue'

/** Styles of an island's own document; the app's styles do not reach into it. */
const ISLAND_CSS = `
  :host {
    all: initial;
    display: block;
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  @media (hover: hover) {
    [data-prototype-hotspot]:hover:not(:disabled, [aria-disabled="true"], :has([data-prototype-hotspot]:hover)) {
      cursor: pointer;
    }
  }

  :host([data-show-hotspots])
    :is([data-prototype-hotspot], button, a[href], input, select, textarea):not(:disabled, [aria-disabled="true"]) {
    /* Show the hint over the inline outline reset on fields. */
    outline: 2px solid var(--color-accent, #2563eb) !important;
    outline-offset: -2px;
  }
`

/**
 * A container inside a shadow root of `host`, created once `host` mounts, styled only by the
 * island's base styles and `shared`, sheets every island adopts: the app's styles do not reach
 * into it, nor its styles out.
 */
export function useShadowContainer(
  host: Readonly<Ref<HTMLElement | null>>,
  shared: readonly CSSStyleSheet[] = []
) {
  const container = shallowRef<HTMLElement | null>(null)
  onMounted(() => {
    if (!host.value) return
    const shadow = host.value.attachShadow({ mode: 'open' })
    const base = new CSSStyleSheet()
    base.replaceSync(ISLAND_CSS)
    shadow.adoptedStyleSheets = [base, ...shared]
    const mount = document.createElement('div')
    shadow.append(mount)
    container.value = mount
  })
  return container
}
