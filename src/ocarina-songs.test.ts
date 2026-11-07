import { describe, expect, it } from 'vitest'
import { advanceSong, clampPhraseShift, phraseShiftBounds, songById, transposePhrase } from './ocarina-songs.ts'

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

  it('accepts a song the way the game reads button presses', () => {
    const lullaby = songById('lullaby').notes
    let progress = 0
    for (const midi of [71, 74, 69, 59, 62, 57]) progress = advanceSong(progress, midi, lullaby)
    expect(progress).toBe(lullaby.length)
    expect(advanceSong(2, 60, lullaby)).toBe(0)
    expect(advanceSong(2, 71, lullaby)).toBe(1)
    expect(advanceSong(0, 74, songById('epona').notes)).toBe(1)
  })
})