import { focusStyles } from '@open-pencil/theme'

/**
 * Tabs across the top of the right panel. Tabs with icons show their labels whenever the whole row
 * fits and drop them together when it does not; labels stay available to screen readers. The row
 * clips horizontally rather than scrolls, so focusing a control never shifts the panel.
 */
export default {
  slots: {
    list: '@container/tabs flex h-10 shrink-0 items-center gap-0.5 overflow-x-clip border-b border-border bg-panel-secondary ps-9 pe-10',
    trigger: [
      'relative -mb-px flex h-8 shrink-0 items-center gap-1 self-end rounded border border-transparent px-1.5 py-1 text-2xs text-muted transition-colors hover:bg-hover hover:text-surface data-[state=active]:z-10 data-[state=active]:rounded-b-none data-[state=active]:border-border data-[state=active]:border-b-panel data-[state=active]:bg-panel data-[state=active]:font-semibold data-[state=active]:text-surface',
      focusStyles.ring
    ],
    icon: 'size-3 shrink-0 data-[severity=error]:text-error data-[severity=warning]:text-warning',
    label: 'sr-only @[22rem]/tabs:not-sr-only',
    compactLabel: 'not-sr-only'
  },
  variants: {
    embedded: {
      true: {
        list: 'h-full min-w-0 flex-1 border-0 bg-transparent pe-0'
      },
      false: {}
    }
  },
  defaultVariants: {
    embedded: false
  }
} as const
