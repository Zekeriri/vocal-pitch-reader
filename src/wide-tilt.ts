export type WideTilt = 'portrait' | 'left' | 'right'

export type WideFrame = {
  width: number
  height: number
  transform: string
  top: number
  left: number
}

/** Which way the phone is held. Ignores the system rotation lock. */
export function nextWideTilt(gamma: number | null, previous: WideTilt): WideTilt {
  if (gamma == null || Number.isNaN(gamma)) return previous
  if (previous === 'portrait') {
    if (gamma > 32) return 'left'
    if (gamma < -32) return 'right'
    return 'portrait'
  }
  if (previous === 'left') {
    if (gamma < -32) return 'right'
    if (gamma < 18) return 'portrait'
    return 'left'
  }
  if (gamma > 32) return 'left'
  if (gamma > -18) return 'portrait'
  return 'right'
}

/**
 * Size and rotation for a portrait viewport while the phone is held sideways.
 * A landscape viewport needs no extra rotation.
 */
export function wideFrame(
  tilt: WideTilt,
  viewport: { width: number; height: number },
): WideFrame | null {
  if (tilt === 'portrait' || viewport.width >= viewport.height) return null
  const width = viewport.height
  const height = viewport.width
  if (tilt === 'left') {
    return { width, height, transform: 'rotate(-90deg)', top: viewport.height, left: 0 }
  }
  return { width, height, transform: 'rotate(90deg)', top: 0, left: viewport.width }
}
