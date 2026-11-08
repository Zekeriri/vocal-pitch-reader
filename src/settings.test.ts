import { describe, expect, it } from 'vitest'
import { gateMarkRatio, gateToRms, normalizeSettings } from './settings.ts'

describe('practice settings', () => {
  it('defaults the hold, the gate, and how long each note plays', () => {
    expect(normalizeSettings({ hold: null, gate: null, noteSeconds: null, pianoVolume: null, voicePrompts: null })).toEqual({
      holdMs: 320,
      gate: 8,
      noteSeconds: 1.2,
      pianoVolume: 80,
      voicePrompts: true,
    })
    expect(normalizeSettings({ hold: 10, gate: 90, noteSeconds: 9, pianoVolume: 140, voicePrompts: false })).toEqual({
      holdMs: 200,
      gate: 40,
      noteSeconds: 4,
      pianoVolume: 100,
      voicePrompts: false,
    })
    expect(normalizeSettings({ hold: 500, gate: 3, noteSeconds: 0.1, pianoVolume: -5, voicePrompts: null }).noteSeconds).toBe(0.4)
    expect(normalizeSettings({ hold: 500, gate: 3, noteSeconds: 2.26, pianoVolume: 35, voicePrompts: true }).pianoVolume).toBe(35)
  })

  it('keeps the loudness gate on the same scale as the meter', () => {
    expect(gateToRms(8)).toBeCloseTo(0.008)
    expect(gateMarkRatio(0)).toBe(0)
    expect(gateMarkRatio(1)).toBe(1)
  })
})
