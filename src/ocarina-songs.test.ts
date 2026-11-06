import { describe, expect, it } from 'vitest'
import { hearSongNote, songById } from './ocarina-songs.ts'

function freq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

describe('ocarina phrases', () => {
  it('keeps the six-note phrases from the game', () => {
    expect(songById('lullaby').notes).toEqual([71, 74, 69, 71, 74, 69])
    expect(songById('epona').notes).toEqual([74, 71, 69, 74, 71, 69])
    expect(songById('missing').title).toBe('塞尔达摇篮曲')
  })

  it('accepts the written note or the same note an octave lower', () => {
    expect(hearSongNote(freq(71), 71)).toBe('match')
    expect(hearSongNote(freq(71 + 0.2), 71)).toBe('match')
    expect(hearSongNote(freq(59), 71)).toBe('match')
    expect(hearSongNote(freq(71.4), 71)).toBe('high')
    expect(hearSongNote(freq(70.6), 71)).toBe('low')
    expect(hearSongNote(freq(69), 71)).toBe('wrong')
  })
})