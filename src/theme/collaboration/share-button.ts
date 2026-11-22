import iconButtonTheme from '@/theme/button/icon-button'

export default {
  base: [
    ...iconButtonTheme.base,
    iconButtonTheme.variants.size.md,
    'transition-colors disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted'
  ],
  variants: {
    connection: {
      idle: '',
      joining:
        'animate-pulse motion-reduce:animate-none border border-warning-border bg-warning-bg text-warning',
      connected: ''
    }
  },
  defaultVariants: { connection: 'idle' }
} as const
