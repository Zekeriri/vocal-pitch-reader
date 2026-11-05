import { freqToMidi } from './pitch.ts'

export const ROUND_LENGTH = 10
export const MATCH_CENTS = 25
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

export function makeRound(count = ROUND_LENGTH, random: () => number = Math.random): number[] {
  const notes: number[] = []
  for (let index = 0; index < count; index++) {
    notes.push(pickNote(notes[index - 1] ?? null, random))
  }
  return notes
}

function pickNote(previous: number | null, random: () => number): number {
  const span = NOTE_HIGH - NOTE_LOW + 1
  let midi = NOTE_LOW + Math.floor(random() * span)
  if (midi > NOTE_HIGH) midi = NOTE_HIGH
  if (previous != null && midi === previous) midi = midi >= NOTE_HIGH ? midi - 1 : midi + 1
  return midi
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
