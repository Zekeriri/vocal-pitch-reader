import { describe, expect, it } from 'vitest'
import { nearestPianoSample } from './piano-samples.ts'

describe('salamander piano samples', () => {
  it('plays an exact sample when that note was recorded', () => {
    expect(nearestPianoSample(60)).toMatchObject({ midi: 60, file: 'C4.mp3', rate: 1 })
    expect(nearestPianoSample(45).file).toBe('A2.mp3')
    expect(nearestPianoSample(72).file).toBe('C5.mp3')
  })

  it('borrows the nearest sampled note and retunes it', () => {
    const d4 = nearestPianoSample(62)
    expect(d4.midi).toBe(63)
    expect(d4.rate).toBeCloseTo(2 ** (-1 / 12))
    expect(nearestPianoSample(61).midi).toBe(60)
  })
})
