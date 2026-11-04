const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const MIN_FREQ = 65
const MAX_FREQ = 1100

export type PitchEstimate = {
  freq: number
  clarity: number
}

export type LockResult = {
  note: string | null
  midi: number | null
  freq: number | null
  cents: number | null
  stable: boolean
  announce: string | null
}

const EMPTY_LOCK: LockResult = {
  note: null,
  midi: null,
  freq: null,
  cents: null,
  stable: false,
  announce: null,
}

export function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440)
}

export function midiToName(midi: number): string {
  const rounded = Math.round(midi)
  const pitch = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${NAMES[pitch]}${octave}`
}

export function formatNote(note: string): string {
  return note.replace('#', '♯')
}

export function nameToSpeech(note: string): string {
  const match = /^([A-G])(#)?(-?\d+)$/.exec(note)
  if (!match) return note
  const [, letter, sharp, octave] = match
  return sharp ? `${letter} sharp ${octave}` : `${letter} ${octave}`
}

export const FIRST_NOTE_MIDI = 36
export const NOTE_SLOT_COUNT = 60

export function noteSlotIndex(note: string): number | null {
  const match = /^([A-G])(#)?(-?\d+)$/.exec(note)
  if (!match) return null
  const [, letter, sharp, octaveText] = match
  const pitch = NAMES.indexOf(`${letter}${sharp ?? ''}` as (typeof NAMES)[number])
  if (pitch < 0) return null
  const octave = Number(octaveText)
  if (!Number.isInteger(octave)) return null
  const index = (octave + 1) * 12 + pitch - FIRST_NOTE_MIDI
  if (index < 0 || index >= NOTE_SLOT_COUNT) return null
  return index
}

export function describeCents(cents: number): string {
  const rounded = Math.round(cents)
  if (Math.abs(rounded) < 8) return '准'
  if (rounded > 0) return `偏高 ${rounded} 音分`
  return `偏低 ${Math.abs(rounded)} 音分`
}

export class PitchDetector {
  private compact = new Float32Array(0)
  private diff = new Float32Array(0)
  private cmnd = new Float32Array(0)

  detect(buffer: Float32Array, sampleRate: number, threshold = 0.18): PitchEstimate | null {
    if (buffer.length < 256 || sampleRate < 8000) return null
    const { signal, rate } = this.prepare(buffer, sampleRate)
    const half = Math.floor(signal.length / 2)
    const minTau = Math.max(2, Math.floor(rate / MAX_FREQ))
    const maxTau = Math.min(half - 1, Math.floor(rate / MIN_FREQ))
    if (maxTau <= minTau + 1) return null

    if (this.diff.length < maxTau + 1) {
      this.diff = new Float32Array(maxTau + 1)
      this.cmnd = new Float32Array(maxTau + 1)
    }
    const diff = this.diff
    const cmnd = this.cmnd

    for (let tau = 1; tau <= maxTau; tau++) {
      let sum = 0
      for (let i = 0; i < half; i++) {
        const delta = signal[i] - signal[i + tau]
        sum += delta * delta
      }
      diff[tau] = sum
    }

    cmnd[0] = 1
    let running = 0
    for (let tau = 1; tau <= maxTau; tau++) {
      running += diff[tau]
      cmnd[tau] = running > 0 ? (diff[tau] * tau) / running : 1
    }

    let tau = -1
    for (let cursor = minTau; cursor <= maxTau; cursor++) {
      if (cmnd[cursor] < threshold) {
        while (cursor + 1 <= maxTau && cmnd[cursor + 1] < cmnd[cursor]) cursor++
        tau = cursor
        break
      }
    }
    if (tau < 0 || cmnd[tau] >= threshold) return null

    const s0 = cmnd[tau - 1]
    const s1 = cmnd[tau]
    const s2 = tau + 1 <= maxTau ? cmnd[tau + 1] : s1
    let better = tau
    const denom = 2 * s1 - s2 - s0
    if (denom !== 0) {
      const shift = (s2 - s0) / (2 * denom)
      if (shift > -1 && shift < 1) better = tau + shift
    }
    if (!Number.isFinite(better) || better <= 0) return null

    const freq = rate / better
    if (freq < MIN_FREQ || freq > MAX_FREQ) return null
    return { freq, clarity: 1 - s1 }
  }

  private prepare(buffer: Float32Array, sampleRate: number): { signal: Float32Array; rate: number } {
    const factor = Math.max(1, Math.round(sampleRate / 24000))
    if (factor === 1) return { signal: buffer, rate: sampleRate }
    const length = Math.floor(buffer.length / factor)
    if (this.compact.length !== length) this.compact = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      let sum = 0
      const base = i * factor
      for (let k = 0; k < factor; k++) sum += buffer[base + k]
      this.compact[i] = sum / factor
    }
    return { signal: this.compact, rate: sampleRate / factor }
  }
}

export class MedianPitch {
  private window: Array<number | null> = []
  private readonly size: number

  constructor(size = 3) {
    this.size = size
  }

  reset(): void {
    this.window = []
  }

  push(value: number | null): number | null {
    this.window.push(value)
    if (this.window.length > this.size) this.window.shift()
    if (value == null) return null
    const nums = this.window.filter((item): item is number => item != null)
    if (nums.length === 0) return null
    nums.sort((a, b) => a - b)
    return nums[Math.floor(nums.length / 2)]
  }
}

export class NoteLock {
  private pendingMidi: number | null = null
  private pendingSince = 0
  private lockedMidi: number | null = null
  private lastSpoken: number | null = null
  private unvoicedSince: number | null = null
  private holdMs: number
  private releaseMs: number
  private readonly hysteresisCents: number

  constructor(holdMs = 320, releaseMs = 520, hysteresisCents = 60) {
    this.holdMs = holdMs
    this.releaseMs = releaseMs
    this.hysteresisCents = hysteresisCents
  }

  setHoldMs(ms: number): void {
    this.holdMs = ms
  }

  reset(): void {
    this.pendingMidi = null
    this.pendingSince = 0
    this.lockedMidi = null
    this.lastSpoken = null
    this.unvoicedSince = null
  }

  update(timeMs: number, freq: number | null): LockResult {
    if (freq == null || !Number.isFinite(freq) || freq <= 0) {
      if (this.unvoicedSince == null) this.unvoicedSince = timeMs
      const gap = timeMs - this.unvoicedSince
      if (gap >= 80) {
        this.pendingMidi = null
        this.lockedMidi = null
      }
      if (gap >= this.releaseMs) this.lastSpoken = null
      return EMPTY_LOCK
    }

    this.unvoicedSince = null
    const midiFloat = freqToMidi(freq)
    let target = Math.round(midiFloat)
    const anchor = this.lockedMidi ?? this.pendingMidi
    if (anchor != null && Math.abs(midiFloat - anchor) * 100 <= this.hysteresisCents) {
      target = anchor
    }
    if (target !== this.pendingMidi) {
      this.pendingMidi = target
      this.pendingSince = timeMs
    }

    const stable = timeMs - this.pendingSince >= this.holdMs
    if (stable) this.lockedMidi = target

    let announce: string | null = null
    if (stable && this.lastSpoken !== target) {
      this.lastSpoken = target
      announce = midiToName(target)
    }

    return {
      note: midiToName(target),
      midi: target,
      freq,
      cents: (midiFloat - target) * 100,
      stable,
      announce,
    }
  }
}
