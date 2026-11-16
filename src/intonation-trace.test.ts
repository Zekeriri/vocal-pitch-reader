import { describe, expect, it } from 'vitest'
import { smoothTrace, traceSegments, traceY } from './intonation-trace.ts'

describe('intonation trace', () => {
  it('puts the target note on the center line and clamps a wider miss', () => {
    expect(traceY(0)).toBe(60)
    expect(traceY(100)).toBe(18)
    expect(traceY(-100)).toBe(102)
    expect(traceY(25)).toBeCloseTo(49.5)
    expect(traceY(-25)).toBeCloseTo(70.5)
    expect(traceY(240)).toBe(traceY(100))
    expect(traceY(-180)).toBe(traceY(-100))
  })

  it('smooths jitter without moving a steady pitch', () => {
    expect(smoothTrace([12, 12, 12, 12])).toEqual([12, 12, 12, 12])
    const smoothed = smoothTrace([0, 30, 0])
    expect(smoothed[1]).toBeLessThan(30)
    expect(smoothed[1]).toBeGreaterThan(0)
  })

  it('breaks the line when the singer pauses', () => {
    const segments = traceSegments([
      { time: 0, cents: 10 },
      { time: 40, cents: 12 },
      { time: 400, cents: -8 },
      { time: 440, cents: -6 },
    ])
    expect(segments).toHaveLength(2)
    expect(segments[0]).toHaveLength(2)
    expect(segments[1][0].cents).toBe(-8)
  })
})