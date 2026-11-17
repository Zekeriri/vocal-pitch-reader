import { NOTE_HIGH, NOTE_LOW, RANGE_CEILING, RANGE_FLOOR } from './intonation-round.ts'

export const TUNE_LOW_KEY = 'pitch-reader-tune-low'
export const TUNE_HIGH_KEY = 'pitch-reader-tune-high'

export type TuneRange = {
  low: number
  high: number
}

const listeners = new Set<(range: TuneRange) => void>()

let current = readStored()

/** The note span shared by the ten-note round and mobile random. */
export function readTuneRange(): TuneRange {
  return current
}

export function normalizeTuneRange(low: number | null, high: number | null): TuneRange {
  const bottom = clampMidi(low, NOTE_LOW)
  const top = clampMidi(high, NOTE_HIGH)
  return bottom <= top ? { low: bottom, high: top } : { low: top, high: bottom }
}

/** Keep the edited end, and pull the other end with it when they cross. */
export function updateTuneRange(low: number, high: number, edited: 'low' | 'high' = 'low'): TuneRange {
  let bottom = clampMidi(low, NOTE_LOW)
  let top = clampMidi(high, NOTE_HIGH)
  if (bottom > top) {
    if (edited === 'low') top = bottom
    else bottom = top
  }
  const next = { low: bottom, high: top }
  if (next.low === current.low && next.high === current.high) return current
  current = next
  const store = storage()
  if (store) {
    store.setItem(TUNE_LOW_KEY, String(next.low))
    store.setItem(TUNE_HIGH_KEY, String(next.high))
  }
  for (const listener of listeners) listener(current)
  return current
}

export function subscribeTuneRange(listener: (range: TuneRange) => void): void {
  listeners.add(listener)
  listener(current)
}

function readStored(): TuneRange {
  const store = storage()
  if (!store) return normalizeTuneRange(null, null)
  return normalizeTuneRange(numberOrNull(store.getItem(TUNE_LOW_KEY)), numberOrNull(store.getItem(TUNE_HIGH_KEY)))
}

function clampMidi(value: number | null, fallback: number): number {
  if (value == null || !Number.isInteger(value)) return fallback
  return Math.min(RANGE_CEILING, Math.max(RANGE_FLOOR, value))
}

function numberOrNull(value: string | null): number | null {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}
