import { describe, expect, it } from 'vitest'
import { WAVE_SCALE_CENTS, displayCents, displayWaveY, formatSwing, readVibrato, speedForRate } from './vibrato-read.ts'

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

  it('draws a vibrato inside the middle of the chart', () => {
    const cents = Array.from({ length: 40 }, (_, index) => 80 * Math.sin(index / 3) + (index % 5 === 0 ? 70 : 0))
    const ys = displayCents(cents).map((value) => displayWaveY(value))
    const reach = Math.max(...ys.map((y) => Math.abs(y - 60)))
    expect(reach).toBeGreaterThan(18)
    expect(reach).toBeLessThan(47)
    expect(Math.max(...ys)).toBeLessThan(106)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(14)
  })

  it('counts a narrower vibrato', () => {
    const read = readVibrato(wave(4, 16, 2))
    expect(read.cycles).toBeGreaterThanOrEqual(6)
    expect(read.rate).toBeGreaterThan(3)
  })

  it('writes the visible swing in cents', () => {
    expect(formatSwing(null)).toBe('音分')
    expect(formatSwing([0.2, -0.4])).toBe('0 音分')
    expect(formatSwing([18.4, -12.2, 3])).toBe('+18 / -12 音分')
  })

  it('marks the chart in even cent steps', () => {
    const ys = WAVE_SCALE_CENTS.map((cents) => displayWaveY(cents))
    expect(displayWaveY(0)).toBe(60)
    expect(displayWaveY(50)).toBe(35)
    expect(displayWaveY(-50)).toBe(85)
    for (let index = 1; index < ys.length; index += 1) {
      expect(ys[index] - ys[index - 1]).toBeCloseTo(12.5)
    }
  })

  it('ignores a tone that is not waving', () => {
    const flat = Array.from({ length: 40 }, (_, index) => ({ time: index * 20, midi: 60 }))
    expect(readVibrato(flat).cycles).toBe(0)
    expect(readVibrato(flat).rate).toBeNull()
    expect(readVibrato(wave(5, 8, 1.5)).cycles).toBe(0)
  })
})