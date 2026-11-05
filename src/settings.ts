export const HOLD_KEY = 'pitch-reader-hold'
export const GATE_KEY = 'pitch-reader-gate'
export const NOTE_KEY = 'pitch-reader-note-seconds'

export type PracticeSettings = {
  holdMs: number
  gate: number
  noteSeconds: number
}

type SettingsInput = {
  hold: number | null
  gate: number | null
  noteSeconds: number | null
}

const listeners = new Set<(settings: PracticeSettings) => void>()

let current = normalizeSettings(readStored())

export function normalizeSettings(input: SettingsInput): PracticeSettings {
  return {
    holdMs: clamp(input.hold, 200, 800, 320),
    gate: clamp(input.gate, 1, 40, 8),
    noteSeconds: roundTenth(clamp(input.noteSeconds, 0.4, 4, 1.2)),
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
    noteSeconds: patch.noteSeconds ?? current.noteSeconds,
  })
  const store = storage()
  if (store) {
    store.setItem(HOLD_KEY, String(current.holdMs))
    store.setItem(GATE_KEY, String(current.gate))
    store.setItem(NOTE_KEY, String(current.noteSeconds))
  }
  for (const listener of listeners) listener(current)
}

function readStored(): SettingsInput {
  const store = storage()
  if (!store) return { hold: null, gate: null, noteSeconds: null }
  return {
    hold: numberOrNull(store.getItem(HOLD_KEY)),
    gate: numberOrNull(store.getItem(GATE_KEY)),
    noteSeconds: numberOrNull(store.getItem(NOTE_KEY)),
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

function roundTenth(value: number): number {
  return Math.round(value * 10) / 10
}
