import { describe, expect, it } from 'vitest'
import { tiltPeakHoldMs } from './tilt-hold.ts'

describe('tilt peak hold', () => {
  it('stays steadier than the shared hold, and at least 0.8 seconds', () => {
    expect(tiltPeakHoldMs(200)).toBe(800)
    expect(tiltPeakHoldMs(320)).toBe(800)
    expect(tiltPeakHoldMs(500)).toBe(1000)
    expect(tiltPeakHoldMs(800)).toBe(1600)
  })
})
