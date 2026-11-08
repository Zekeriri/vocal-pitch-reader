import { describe, expect, it } from 'vitest'
import { tiltAbove, tiltTouched } from './tilt-pass.ts'

describe('tilt pass', () => {
  it('counts a touch on the note or above it', () => {
    expect(tiltTouched(64, 64)).toBe(true)
    expect(tiltTouched(63.5, 64)).toBe(true)
    expect(tiltTouched(70, 64)).toBe(true)
    expect(tiltTouched(63.4, 64)).toBe(false)
  })

  it('counts above only when the pitch is higher than the note', () => {
    expect(tiltAbove(64, 64)).toBe(false)
    expect(tiltAbove(64.01, 64)).toBe(true)
    expect(tiltAbove(63.9, 64)).toBe(false)
  })
})