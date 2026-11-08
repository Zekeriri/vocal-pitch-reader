export const TILT_TOUCH = 0.5
export const TILT_LONG_MS = 1000

export function tiltTouched(midi: number, target: number): boolean {
  return midi >= target - TILT_TOUCH
}

export function tiltAbove(midi: number, target: number): boolean {
  return midi > target
}
