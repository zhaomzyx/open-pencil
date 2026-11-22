import { tv } from 'tailwind-variants'

import shareButtonTheme from '@/theme/collaboration/share-button'

export const shareButton = tv({
  extend: tv(shareButtonTheme),
  base: 'data-icon-only:size-8 data-icon-only:justify-center data-icon-only:gap-0 data-icon-only:rounded-md data-icon-only:px-0 data-icon-only:[font-size:0] data-icon-only:[&>svg]:size-4'
})
