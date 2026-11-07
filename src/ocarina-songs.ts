import { nameToMidi } from './pitch.ts'

export type SongId = 'lullaby' | 'epona'

export type OcarinaSong = {
  id: SongId
  title: string
  notes: number[]
  bpm: number
  beats: number[]
}

export const RELATIVE_STEPS = 1.5

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
    bpm: 100,
    beats: [1, 1, 1, 1, 1, 1],
  },
  {
    id: 'epona',
    title: '伊波娜之歌',
    notes: ['D5', 'B4', 'A4', 'D5', 'B4', 'A4'].map(midi),
    bpm: 96,
    beats: [1, 1, 1, 1, 1, 1],
  },
]

export function songById(id: string): OcarinaSong {
  return SONGS.find((song) => song.id === id) ?? SONGS[0]
}

export function songNoteSeconds(song: OcarinaSong): number[] {
  return song.beats.map((beats) => (60 / song.bpm) * beats)
}

export function songIntervals(notes: readonly number[]): number[] {
  if (notes.length === 0) return []
  const root = notes[0]
  return notes.map((note) => note - root)
}

export function followMelody(
  progress: number,
  sungMidi: number,
  anchorMidi: number | null,
  notes: readonly number[],
): { progress: number; anchor: number } {
  if (notes.length === 0) return { progress: 0, anchor: anchorMidi ?? sungMidi }
  if (anchorMidi == null || progress <= 0) return { progress: 1, anchor: sungMidi }
  const expected = notes[Math.min(progress, notes.length - 1)] - notes[0]
  if (Math.abs(foldOctave(sungMidi - anchorMidi - expected)) <= RELATIVE_STEPS) {
    return { progress: progress + 1, anchor: anchorMidi }
  }
  return { progress: 1, anchor: sungMidi }
}

function foldOctave(error: number): number {
  let diff = error
  while (diff > 6) diff -= 12
  while (diff < -6) diff += 12
  return diff
}
