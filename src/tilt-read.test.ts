import { describe, expect, it } from 'vitest'
import { LONG_MIN_MS, SLIDE_LIMIT_MS, readSlide, readSustain, readTilts } from './tilt-read.ts'

function line(from: number, to: number, ms: number, step = 20) {
  const count = Math.max(1, Math.round(ms / step))
  return Array.from({ length: count + 1 }, (_, index) => ({
    time: (index / count) * ms,
    midi: from + ((to - from) * index) / count,
  }))
}

function burst(midi: number, start: number, ms: number) {
  return line(midi, midi, ms).map((sample) => ({ ...sample, time: sample.time + start }))
}

describe('环倾', () => {
  it('accepts a short slide from C5 down to C4', () => {
    const read = readSlide(line(72, 60, 600))
    expect(read.short).toBe(true)
    expect(read.covered).toBe(true)
    expect(read.durationMs).toBe(600)
  })

  it('marks a long slide and a note that never comes down', () => {
    expect(readSlide(line(72, 60, 1400)).short).toBe(false)
    expect(readSlide(line(72, 60, 1400)).covered).toBe(true)
    expect(readSlide(line(72, 60, 1400)).durationMs).toBeGreaterThan(SLIDE_LIMIT_MS)
    expect(readSlide(line(72, 72, 500)).covered).toBe(false)
  })

  it('counts three short tilts and ignores one long hold', () => {
    const three = [...burst(60, 0, 200), ...burst(60, 500, 200), ...burst(60, 1000, 200)]
    expect(readTilts(three, 60, 1200).count).toBe(3)
    expect(readTilts(three, 60, 1200).openTooLong).toBe(false)
    const held = burst(60, 0, 1500)
    expect(readTilts(held, 60, 1500)).toEqual({ count: 0, openTooLong: true })
    expect(readTilts(burst(67, 0, 200), 60, 200).count).toBe(0)
  })

  it('keeps the longest time spent on the chosen pitch', () => {
    const read = readSustain(line(60, 60, 3200), 60, 3200)
    expect(read.heldMs).toBeGreaterThanOrEqual(LONG_MIN_MS)
    expect(read.live).toBe(true)
    const left = [...line(60, 60, 800), ...line(65, 65, 400).map((sample) => ({ ...sample, time: sample.time + 1000 }))]
    expect(readSustain(left, 60, 1400).heldMs).toBe(800)
    expect(readSustain(line(65, 65, 3200), 60, 3200).away).toBe(true)
  })
})