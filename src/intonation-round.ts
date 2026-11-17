import { freqToMidi } from './pitch.ts'

export const ROUND_LENGTH = 10
export const MATCH_CENTS = 25
export const RANGE_FLOOR = 45
export const RANGE_CEILING = 72
export const NOTE_LOW = 48
export const NOTE_HIGH = 72

export type Verdict = 'low' | 'high' | 'match'

export function judgePitch(freq: number, targetMidi: number, tolerance = MATCH_CENTS): Verdict {
  const cents = (freqToMidi(freq) - targetMidi) * 100
  if (Math.abs(cents) <= tolerance) return 'match'
  return cents > 0 ? 'high' : 'low'
}

export function verdictText(verdict: Verdict): string {
  if (verdict === 'match') return '准'
  if (verdict === 'low') return '低了'
  return '高了'
}

export function makeRound(
  count = ROUND_LENGTH,
  random: () => number = Math.random,
  low = NOTE_LOW,
  high = NOTE_HIGH,
): number[] {
  const bottom = clampMidi(Math.min(low, high))
  const top = clampMidi(Math.max(low, high))
  const notes: number[] = []
  for (let index = 0; index < count; index++) {
    notes.push(pickNote(notes[index - 1] ?? null, random, bottom, top))
  }
  return notes
}

/** Another note in the range. Skips `current` when the range has more than one note. */
export function pickMobileNote(
  current: number,
  random: () => number = Math.random,
  low = RANGE_FLOOR,
  high = RANGE_CEILING,
): number {
  const bottom = Math.min(low, high)
  const top = Math.max(low, high)
  if (top <= bottom) return bottom
  const currentInside = current >= bottom && current <= top
  const span = currentInside ? top - bottom : top - bottom + 1
  let index = Math.floor(random() * span)
  if (!Number.isFinite(index) || index < 0) index = 0
  if (index >= span) index = span - 1
  if (currentInside && index >= current - bottom) index += 1
  return bottom + index
}

function pickNote(previous: number | null, random: () => number, low: number, high: number): number {
  const span = high - low + 1
  let midi = low + Math.floor(random() * span)
  if (midi > high) midi = high
  if (midi < low) midi = low
  if (previous != null && midi === previous && span > 1) midi = midi >= high ? midi - 1 : midi + 1
  return midi
}

function clampMidi(midi: number): number {
  if (!Number.isFinite(midi)) return NOTE_LOW
  return Math.min(RANGE_CEILING, Math.max(RANGE_FLOOR, Math.round(midi)))
}

export class MatchHold {
  private since: number | null = null

  reset(): void {
    this.since = null
  }

  push(time: number, matching: boolean, holdMs: number): boolean {
    if (!matching) {
      this.since = null
      return false
    }
    if (this.since == null) this.since = time
    return time - this.since >= holdMs
  }
}
