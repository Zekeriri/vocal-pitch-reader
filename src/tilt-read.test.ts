import { describe, expect, it } from 'vitest'
import { LONG_MIN_MS, readSlide, readSustain, readTilts, scaleNotes } from './tilt-read.ts'

function line(from: number, to: number, ms: number, step = 20) {
  const count = Math.max(1, Math.round(ms / step))
  return Array.from({ length: count + 1 }, (_, index) => ({
    time: (index / count) * ms,
    midi: from + ((to - from) * index) / count,
  }))
}

function hold(midi: number, start: number, ms: number) {
  return line(midi, midi, ms).map((sample) => ({ ...sample, time: sample.time + start }))
}

describe('环倾', () => {
  it('walks every note from C4 to C5', () => {
    const notes = scaleNotes()
    expect(notes[0]).toBe(60)
    expect(notes.at(-1)).toBe(72)
    expect(notes).toHaveLength(13)
  })

  it('accepts a brief touch of the high note followed by a downward slide', () => {
    const read = readSlide([...hold(64, 0, 280), ...line(64, 61, 240).map((sample) => ({ ...sample, time: sample.time + 300 }))], 64)
    expect(read.touched).toBe(true)
    expect(read.short).toBe(true)
    expect(read.slid).toBe(true)
    expect(read.passed).toBe(true)
    expect(read.peakMs).toBeLessThanOrEqual(1000)
  })

  it('rejects a high note that stays up and a slide that misses the note', () => {
    const long = readSlide([...hold(64, 0, 1300), ...line(64, 60, 200).map((sample) => ({ ...sample, time: sample.time + 1320 }))], 64)
    expect(long.short).toBe(false)
    expect(long.passed).toBe(false)
    expect(readSlide(hold(64, 0, 400), 64).slid).toBe(false)
    expect(readSlide(hold(60, 0, 400), 64).touched).toBe(false)
  })

  it('counts three short tilts on one note and ignores the neighbor', () => {
    const three = [...hold(61, 0, 200), ...hold(61, 500, 200), ...hold(61, 1000, 200)]
    expect(readTilts(three, 61, 1200).count).toBe(3)
    expect(readTilts(hold(61, 0, 1500), 61, 1500)).toEqual({ count: 0, openTooLong: true })
    expect(readTilts(hold(62, 0, 200), 61, 200).count).toBe(0)
  })

  it('keeps the longest time spent on the chosen pitch', () => {
    const read = readSustain(hold(67, 0, 1200), 67, 1200)
    expect(read.heldMs).toBeGreaterThan(LONG_MIN_MS)
    expect(readSustain(hold(67, 0, 800), 67, 800).heldMs).toBeLessThanOrEqual(LONG_MIN_MS)
    expect(read.live).toBe(true)
    const left = [...hold(67, 0, 800), ...hold(70, 1000, 400)]
    expect(readSustain(left, 67, 1400).heldMs).toBe(800)
    expect(readSustain(hold(70, 0, 3200), 67, 3200).away).toBe(true)
  })
})