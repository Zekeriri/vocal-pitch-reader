import { describe, expect, it } from 'vitest'
import { judgePitch, makeRound, MatchHold, NOTE_HIGH, NOTE_LOW, verdictText } from './intonation-round.ts'

function freqAtCents(midi: number, cents: number): number {
  return 440 * 2 ** ((midi - 69 + cents / 100) / 12)
}

describe('intonation round', () => {
  it('calls a pitch matched, low, or high against the played note', () => {
    expect(judgePitch(freqAtCents(67, 0), 67)).toBe('match')
    expect(judgePitch(freqAtCents(67, 20), 67)).toBe('match')
    expect(judgePitch(freqAtCents(67, -24), 67)).toBe('match')
    expect(judgePitch(freqAtCents(67, 40), 67)).toBe('high')
    expect(judgePitch(freqAtCents(67, -80), 67)).toBe('low')
    expect(verdictText('low')).toBe('低了')
    expect(verdictText('high')).toBe('高了')
    expect(verdictText('match')).toBe('准')
  })

  it('deals ten different neighbouring notes inside a singable range', () => {
    const round = makeRound(10, () => 0.2)
    expect(round).toHaveLength(10)
    for (let index = 0; index < round.length; index++) {
      expect(round[index]).toBeGreaterThanOrEqual(NOTE_LOW)
      expect(round[index]).toBeLessThanOrEqual(NOTE_HIGH)
      if (index > 0) expect(round[index]).not.toBe(round[index - 1])
    }
  })

  it('stays inside a range the singer chose', () => {
    const round = makeRound(10, () => 0.9, 57, 64)
    expect(round.every((midi) => midi >= 57 && midi <= 64)).toBe(true)
    expect(makeRound(4, () => 0.2, 60, 60)).toEqual([60, 60, 60, 60])
    expect(makeRound(3, () => 0, 70, 50).every((midi) => midi >= 50 && midi <= 70)).toBe(true)
  })

  it('only passes after the match has stayed put', () => {
    const hold = new MatchHold()
    expect(hold.push(0, true, 280)).toBe(false)
    expect(hold.push(200, true, 280)).toBe(false)
    expect(hold.push(280, true, 280)).toBe(true)
    expect(hold.push(400, false, 280)).toBe(false)
    expect(hold.push(500, true, 280)).toBe(false)
  })
})