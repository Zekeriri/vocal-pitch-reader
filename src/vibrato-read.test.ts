import { describe, expect, it } from 'vitest'
import { readVibrato, speedForRate } from './vibrato-read.ts'

function wave(hz: number, cents: number, seconds: number, step = 0.02) {
  const samples = []
  for (let time = 0; time <= seconds; time += step) {
    samples.push({
      time: time * 1000,
      midi: 60 + (cents / 100) * Math.sin(2 * Math.PI * hz * time),
    })
  }
  return samples
}

describe('vibrato reading', () => {
  it('counts a steady vibrato and names its speed', () => {
    const read = readVibrato(wave(4, 50, 2))
    expect(read.cycles).toBeGreaterThanOrEqual(7)
    expect(read.cycles).toBeLessThanOrEqual(9)
    expect(read.rate).toBeGreaterThan(3.4)
    expect(read.rate).toBeLessThan(4.6)
    expect(speedForRate(read.rate ?? 0)).toBe('medium')
    expect(speedForRate(3)).toBe('slow')
    expect(speedForRate(5.2)).toBe('fast')
    expect(speedForRate(6)).toBe('faster')
    expect(speedForRate(2.4)).toBeNull()
  })

  it('ignores a tone that is not waving', () => {
    const flat = Array.from({ length: 40 }, (_, index) => ({ time: index * 20, midi: 60 }))
    expect(readVibrato(flat).cycles).toBe(0)
    expect(readVibrato(flat).rate).toBeNull()
    expect(readVibrato(wave(5, 8, 1.5)).cycles).toBe(0)
  })
})