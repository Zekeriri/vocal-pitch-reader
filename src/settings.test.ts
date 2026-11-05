import { describe, expect, it } from 'vitest'
import { gateMarkRatio, gateToRms, normalizeSettings } from './settings.ts'
import { timbreSpec } from './timbre.ts'

describe('practice settings', () => {
  it('defaults to piano and the previous hold and gate', () => {
    expect(normalizeSettings({ hold: null, gate: null, timbre: null })).toEqual({
      holdMs: 320,
      gate: 8,
      timbre: 'piano',
    })
    expect(normalizeSettings({ hold: 10, gate: 90, timbre: 'banjo' })).toEqual({
      holdMs: 200,
      gate: 40,
      timbre: 'piano',
    })
    expect(normalizeSettings({ hold: 500, gate: 3, timbre: 'flute' }).timbre).toBe('flute')
  })

  it('keeps the loudness gate on the same scale as the meter', () => {
    expect(gateToRms(8)).toBeCloseTo(0.008)
    expect(gateMarkRatio(0)).toBe(0)
    expect(gateMarkRatio(1)).toBe(1)
  })
})

describe('timbres', () => {
  it('gives the piano a hammer and several decaying partials', () => {
    const piano = timbreSpec('piano')
    const sine = timbreSpec('sine')
    expect(piano.partials.length).toBeGreaterThan(3)
    expect(piano.noise).toBeGreaterThan(0)
    expect(piano.partials[1].decay).toBeLessThan(piano.partials[0].decay)
    expect(sine.partials).toHaveLength(1)
    expect(sine.noise).toBe(0)
  })
})