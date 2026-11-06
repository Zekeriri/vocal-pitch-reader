import { describe, expect, it } from 'vitest'
import { clampPhraseShift, hearSongNote, phraseShiftBounds, songById, transposePhrase } from './ocarina-songs.ts'

function freq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

describe('ocarina phrases', () => {
  it('keeps the six-note phrases from the game', () => {
    expect(songById('lullaby').notes).toEqual([71, 74, 69, 71, 74, 69])
    expect(songById('epona').notes).toEqual([74, 71, 69, 74, 71, 69])
    expect(songById('missing').title).toBe('塞尔达摇篮曲')
  })

  it('shifts the whole phrase down inside the piano range', () => {
    const notes = songById('lullaby').notes
    expect(phraseShiftBounds(notes)).toEqual({ min: -24, max: 0 })
    expect(transposePhrase(notes, -12)).toEqual([59, 62, 57, 59, 62, 57])
    expect(transposePhrase(notes, -30)).toEqual([47, 50, 45, 47, 50, 45])
    expect(clampPhraseShift(notes, 5)).toBe(0)
    expect(transposePhrase(songById('epona').notes, -24)[0]).toBe(50)
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