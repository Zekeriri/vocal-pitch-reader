import { describe, expect, it } from 'vitest'
import {
  describeCents,
  freqToMidi,
  midiToName,
  nameToSpeech,
  NoteLock,
  PitchDetector,
} from './pitch.ts'

function sine(freq: number, sampleRate: number, length: number, harmonics = [1]): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    let sample = 0
    for (const harmonic of harmonics) {
      sample += Math.sin((2 * Math.PI * freq * harmonic * i) / sampleRate) / harmonic
    }
    out[i] = sample
  }
  return out
}

function saw(freq: number, sampleRate: number, length: number): Float32Array {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const phase = (freq * i) / sampleRate
    out[i] = 2 * (phase - Math.floor(phase)) - 1
  }
  return out
}

function noise(length: number): Float32Array {
  const out = new Float32Array(length)
  let state = 0x123456
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    out[i] = (state / 0xffffffff) * 2 - 1
  }
  return out
}

describe('note names', () => {
  it('calls 193 Hz G3', () => {
    expect(midiToName(Math.round(freqToMidi(193)))).toBe('G3')
  })

  it('calls 440 Hz A4 and spells sharps for speech', () => {
    expect(midiToName(Math.round(freqToMidi(440)))).toBe('A4')
    expect(nameToSpeech('G3')).toBe('G 3')
    expect(nameToSpeech('G#3')).toBe('G sharp 3')
    expect(describeCents(4)).toBe('准')
    expect(describeCents(16)).toBe('偏高 16 音分')
    expect(describeCents(-12)).toBe('偏低 12 音分')
  })
})

describe('PitchDetector', () => {
  const detector = new PitchDetector()
  const rate = 48000
  const length = 2048

  it.each([98, 130.81, 193, 196, 220, 261.63, 329.63, 440, 523.25, 880])(
    'tracks a %s Hz sine',
    (freq) => {
      const hit = detector.detect(sine(freq, rate, length), rate)
      expect(hit).not.toBeNull()
      expect(hit!.freq).toBeGreaterThan(freq * 0.985)
      expect(hit!.freq).toBeLessThan(freq * 1.015)
      expect(hit!.clarity).toBeGreaterThan(0.9)
    },
  )

  it('keeps the fundamental of a harmonic tone', () => {
    const hit = detector.detect(sine(196, rate, length, [1, 2, 3, 4]), rate)
    expect(hit).not.toBeNull()
    expect(midiToName(Math.round(freqToMidi(hit!.freq)))).toBe('G3')
  })

  it('tracks a sawtooth at G3', () => {
    const hit = detector.detect(saw(196, rate, length), rate)
    expect(hit).not.toBeNull()
    expect(midiToName(Math.round(freqToMidi(hit!.freq)))).toBe('G3')
  })

  it('ignores silence and noise', () => {
    expect(detector.detect(new Float32Array(length), rate)).toBeNull()
    expect(detector.detect(noise(length), rate)).toBeNull()
  })

  it('is cheap enough to run live', () => {
    const buffer = sine(196, rate, length)
    const start = performance.now()
    for (let i = 0; i < 40; i++) detector.detect(buffer, rate)
    expect(performance.now() - start).toBeLessThan(800)
  })
})

describe('NoteLock', () => {
  it('speaks a held note once', () => {
    const lock = new NoteLock(300, 500)
    const spoken: string[] = []
    for (let time = 0; time <= 500; time += 50) {
      const result = lock.update(time, 196)
      if (result.announce) spoken.push(result.announce)
    }
    expect(spoken).toEqual(['G3'])
  })

  it('stays on one name through vibrato near the semitone edge', () => {
    const lock = new NoteLock(300, 500)
    const sharp = 196 * 2 ** (55 / 1200)
    const flat = 196 * 2 ** (-55 / 1200)
    const seen = new Set<string>()
    let spoken: string | null = null
    for (let time = 0; time <= 800; time += 50) {
      const freq = time === 0 ? 196 : time % 100 === 0 ? sharp : flat
      const result = lock.update(time, freq)
      if (result.note) seen.add(result.note)
      if (result.announce) spoken = result.announce
    }
    expect(seen).toEqual(new Set(['G3']))
    expect(spoken).toBe('G3')
  })

  it('speaks the next note after a glide lands', () => {
    const lock = new NoteLock(300, 500)
    const spoken: string[] = []
    for (let time = 0; time <= 400; time += 50) {
      const result = lock.update(time, 196)
      if (result.announce) spoken.push(result.announce)
    }
    for (let time = 450; time <= 900; time += 50) {
      const result = lock.update(time, 220)
      if (result.announce) spoken.push(result.announce)
    }
    expect(spoken).toEqual(['G3', 'A3'])
  })

  it('speaks the same note again after a rest', () => {
    const lock = new NoteLock(300, 500)
    let first: string | null = null
    for (let time = 0; time <= 400; time += 50) {
      first = lock.update(time, 196).announce ?? first
    }
    expect(first).toBe('G3')
    lock.update(450, null)
    lock.update(1000, null)
    let second: string | null = null
    for (let time = 1100; time <= 1500; time += 50) {
      second = lock.update(time, 196).announce ?? second
    }
    expect(second).toBe('G3')
  })

  it('does not speak a short blip', () => {
    const lock = new NoteLock(300, 500)
    expect(lock.update(0, 196).announce).toBeNull()
    expect(lock.update(200, 196).announce).toBeNull()
    expect(lock.update(260, null).note).toBeNull()
  })
})
