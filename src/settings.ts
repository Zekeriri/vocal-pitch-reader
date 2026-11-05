import { isTimbre, type TimbreId } from './timbre.ts'

export const HOLD_KEY = 'pitch-reader-hold'
export const GATE_KEY = 'pitch-reader-gate'
export const TIMBRE_KEY = 'pitch-reader-timbre'

export type PracticeSettings = {
  holdMs: number
  gate: number
  timbre: TimbreId
}

type SettingsInput = {
  hold: number | null
  gate: number | null
  timbre: string | null
}

const listeners = new Set<(settings: PracticeSettings) => void>()

let current = normalizeSettings(readStored())

export function normalizeSettings(input: SettingsInput): PracticeSettings {
  return {
    holdMs: clamp(input.hold, 200, 800, 320),
    gate: clamp(input.gate, 1, 40, 8),
    timbre: isTimbre(input.timbre) ? input.timbre : 'piano',
  }
}

export function readSettings(): PracticeSettings {
  return current
}

export function gateToRms(gate: number): number {
  return gate / 1000
}

export function gateMarkRatio(rmsMin: number): number {
  return Math.min(1, Math.sqrt(rmsMin) / 0.45)
}

export function subscribeSettings(listener: (settings: PracticeSettings) => void): void {
  listeners.add(listener)
  listener(current)
}

export function updateSettings(patch: Partial<PracticeSettings>): void {
  current = normalizeSettings({
    hold: patch.holdMs ?? current.holdMs,
    gate: patch.gate ?? current.gate,
    timbre: patch.timbre ?? current.timbre,
  })
  const store = storage()
  if (store) {
    store.setItem(HOLD_KEY, String(current.holdMs))
    store.setItem(GATE_KEY, String(current.gate))
    store.setItem(TIMBRE_KEY, current.timbre)
  }
  for (const listener of listeners) listener(current)
}

function readStored(): SettingsInput {
  const store = storage()
  if (!store) return { hold: null, gate: null, timbre: null }
  return {
    hold: numberOrNull(store.getItem(HOLD_KEY)),
    gate: numberOrNull(store.getItem(GATE_KEY)),
    timbre: store.getItem(TIMBRE_KEY),
  }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function numberOrNull(value: string | null): number | null {
  if (value == null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function clamp(value: number | null, min: number, max: number, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}
