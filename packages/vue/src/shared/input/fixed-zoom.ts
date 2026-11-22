const FIXED_ZOOM_LEVELS = [
  0.02, 0.04, 0.06, 0.08, 0.125, 0.25, 0.5, 0.666, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.75, 5,
  6.25, 8, 10, 12.5, 16, 20, 25, 32, 40, 50, 64, 80, 100, 128, 160, 200, 256
]
const ZOOM_LEVEL_EPSILON = 0.0001

/** The next wheel preset within the current canvas's zoom limits. */
export function nextFixedZoom(scale: number, direction: 1 | -1, min: number, max: number): number {
  const next =
    direction === 1
      ? (FIXED_ZOOM_LEVELS.find((level) => level > scale + ZOOM_LEVEL_EPSILON) ?? max)
      : (FIXED_ZOOM_LEVELS.findLast((level) => level < scale - ZOOM_LEVEL_EPSILON) ?? min)

  return Math.max(min, Math.min(max, next))
}
