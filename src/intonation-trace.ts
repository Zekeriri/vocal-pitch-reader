export type TracePoint = {
  time: number
  cents: number
}

export const TRACE_SPAN_CENTS = 100
export const TRACE_MATCH_CENTS = 50
export const TRACE_CENTER_Y = 60
export const TRACE_HALF_PX = 42
export const TRACE_GUIDE_CENTS = [100, 50, -50, -100] as const

export function traceY(cents: number): number {
  const clamped = Math.max(-TRACE_SPAN_CENTS, Math.min(TRACE_SPAN_CENTS, cents))
  return TRACE_CENTER_Y - (clamped / TRACE_SPAN_CENTS) * TRACE_HALF_PX
}

export function smoothTrace(cents: readonly number[]): number[] {
  if (cents.length < 3) return [...cents]
  return cents.map((_, index) => {
    const left = cents[Math.max(0, index - 1)]
    const mid = cents[index]
    const right = cents[Math.min(cents.length - 1, index + 1)]
    return (left + mid + right) / 3
  })
}

export function traceSegments(points: readonly TracePoint[], gapMs = 180): TracePoint[][] {
  const segments: TracePoint[][] = []
  let current: TracePoint[] = []
  for (const point of points) {
    const previous = current.at(-1)
    if (previous && point.time - previous.time > gapMs) {
      segments.push(current)
      current = []
    }
    current.push(point)
  }
  if (current.length > 0) segments.push(current)
  return segments
}
