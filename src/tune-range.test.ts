import { describe, expect, it } from 'vitest'
import { NOTE_HIGH, NOTE_LOW, RANGE_CEILING, RANGE_FLOOR } from './intonation-round.ts'
import { normalizeTuneRange, updateTuneRange } from './tune-range.ts'

describe('shared intonation range', () => {
  it('defaults to the same span the ten-note round uses', () => {
    expect(normalizeTuneRange(null, null)).toEqual({ low: NOTE_LOW, high: NOTE_HIGH })
  })

  it('stays inside the playable notes and keeps the edited end on top', () => {
    expect(normalizeTuneRange(20, 90)).toEqual({ low: RANGE_FLOOR, high: RANGE_CEILING })
    expect(normalizeTuneRange(64, 57)).toEqual({ low: 57, high: 64 })
    expect(updateTuneRange(70, 60, 'low')).toEqual({ low: 70, high: 70 })
    expect(updateTuneRange(70, 62, 'high')).toEqual({ low: 62, high: 62 })
  })
})