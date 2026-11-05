import { describe, expect, it } from 'vitest'
import { gateMarkRatio, gateToRms, normalizeSettings } from './settings.ts'

describe('practice settings', () => {
  it('defaults the hold, the gate, and how long each note plays', () => {
    expect(normalizeSettings({ hold: null, gate: null, noteSeconds: null })).toEqual({
      holdMs: 320,
      gate: 8,
      noteSeconds: 1.2,
    })
    expect(normalizeSettings({ hold: 10, gate: 90, noteSeconds: 9 })).toEqual({
      holdMs: 200,
      gate: 40,
      noteSeconds: 4,
    })
    expect(normalizeSettings({ hold: 500, gate: 3, noteSeconds: 0.1 }).noteSeconds).toBe(0.4)
    expect(normalizeSettings({ hold: 500, gate: 3, noteSeconds: 2.26 }).noteSeconds).toBe(2.3)
  })

  it('keeps the loudness gate on the same scale as the meter', () => {
    expect(gateToRms(8)).toBeCloseTo(0.008)
    expect(gateMarkRatio(0)).toBe(0)
    expect(gateMarkRatio(1)).toBe(1)
  })
})
