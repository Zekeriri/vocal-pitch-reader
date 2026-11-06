import { freqToMidi, nameToMidi } from './pitch.ts'

export type SongId = 'lullaby' | 'epona'

export type OcarinaSong = {
  id: SongId
  title: string
  notes: number[]
}

export type SongHear = 'match' | 'low' | 'high' | 'wrong'

const MATCH_CENTS = 25
const WRONG_CENTS = 50

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

export function hearSongNote(freq: number, targetMidi: number, tolerance = MATCH_CENTS): SongHear {
  const sung = freqToMidi(freq)
  let cents = (sung - targetMidi) * 100
  const lower = (sung - (targetMidi - 12)) * 100
  if (Math.abs(lower) < Math.abs(cents)) cents = lower
  if (Math.abs(cents) <= tolerance) return 'match'
  if (Math.abs(cents) <= WRONG_CENTS) return cents > 0 ? 'high' : 'low'
  return 'wrong'
}
