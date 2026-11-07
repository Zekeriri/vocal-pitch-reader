import { nameToMidi } from './pitch.ts'

export type SongId = 'lullaby' | 'epona'

export type OcarinaSong = {
  id: SongId
  title: string
  notes: number[]
}

const PHRASE_LOW = 45
const PHRASE_HIGH = 74

export type PhraseShiftBounds = {
  min: number
  max: number
}

function midi(note: string): number {
  const value = nameToMidi(note)
  if (value == null) throw new Error(`无法识别音名 ${note}`)
  return value
}

export const SONGS: readonly OcarinaSong[] = [
  {
    id: 'lullaby',
    title: '塞尔达摇篮曲',
    notes: ['B4', 'D5', 'A4', 'B4', 'D5', 'A4'].map(midi),
  },
  {
    id: 'epona',
    title: '伊波娜之歌',
    notes: ['D5', 'B4', 'A4', 'D5', 'B4', 'A4'].map(midi),
  },
]

export function songById(id: string): OcarinaSong {
  return SONGS.find((song) => song.id === id) ?? SONGS[0]
}

export function phraseShiftBounds(notes: readonly number[]): PhraseShiftBounds {
  const low = Math.min(...notes)
  const high = Math.max(...notes)
  return {
    min: PHRASE_LOW - low,
    max: PHRASE_HIGH - high,
  }
}

export function clampPhraseShift(notes: readonly number[], shift: number): number {
  const { min, max } = phraseShiftBounds(notes)
  if (!Number.isInteger(shift)) return Math.min(max, Math.max(min, -12))
  return Math.min(max, Math.max(min, shift))
}

export function transposePhrase(notes: readonly number[], shift: number): number[] {
  const clamped = clampPhraseShift(notes, shift)
  return notes.map((midi) => midi + clamped)
}

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12
}

export function advanceSong(progress: number, sungMidi: number, notes: readonly number[]): number {
  if (notes.length === 0) return 0
  const sung = pitchClass(sungMidi)
  const index = Math.min(Math.max(progress, 0), notes.length - 1)
  if (sung === pitchClass(notes[index])) return progress + 1
  if (sung === pitchClass(notes[0])) return 1
  return 0
}
