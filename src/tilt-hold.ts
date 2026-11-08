export function tiltPeakHoldMs(holdMs: number): number {
  return Math.max(800, holdMs * 2)
}
