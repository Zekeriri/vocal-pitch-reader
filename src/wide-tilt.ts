export type WideSide = 'left' | 'right'

export type WideFrame = {
  width: number
  height: number
  transform: string
  top: number
  left: number
}

/** Stay on a landscape side. A small tilt does not drop back to portrait. */
export function nextWideSide(gamma: number | null, previous: WideSide): WideSide {
  if (gamma == null || Number.isNaN(gamma)) return previous
  if (gamma > 32) return 'left'
  if (gamma < -32) return 'right'
  return previous
}

/** Turn a portrait viewport into the landscape layout. A landscape viewport needs nothing. */
export function wideFrame(side: WideSide, viewport: { width: number; height: number }): WideFrame | null {
  if (viewport.width >= viewport.height) return null
  const width = viewport.height
  const height = viewport.width
  if (side === 'left') {
    return { width, height, transform: 'rotate(-90deg)', top: viewport.height, left: 0 }
  }
  return { width, height, transform: 'rotate(90deg)', top: 0, left: viewport.width }
}
