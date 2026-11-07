import { describe, expect, it } from 'vitest'
import { followMelody, songById, songIntervals, songNoteSeconds } from './ocarina-songs.ts'

describe('ocarina phrases', () => {
  it('keeps the six-note phrases from the game', () => {
    expect(songById('lullaby').notes).toEqual([71, 74, 69, 71, 74, 69])
    expect(songById('epona').notes).toEqual([74, 71, 69, 74, 71, 69])
    expect(songById('missing').title).toBe('塞尔达摇篮曲')
  })

  it('plays the phrases in even beats at the game tempo', () => {
    expect(songNoteSeconds(songById('lullaby'))).toEqual([0.6, 0.6, 0.6, 0.6, 0.6, 0.6])
    expect(songNoteSeconds(songById('epona')).every((seconds) => seconds === 0.625)).toBe(true)
    expect(songIntervals(songById('lullaby').notes)).toEqual([0, 3, -2, 0, 3, -2])
  })

  it('accepts a melody that keeps the shape from any starting note', () => {
    const notes = songById('lullaby').notes
    let state = followMelody(0, 48, null, notes)
    expect(state).toEqual({ progress: 1, anchor: 48 })
    for (const midi of [51, 46.2, 48, 62.4, 46]) state = followMelody(state.progress, midi, state.anchor, notes)
    expect(state.progress).toBe(notes.length)
    expect(state.anchor).toBe(48)
    const restarted = followMelody(1, 48, 48, notes)
    expect(restarted).toEqual({ progress: 1, anchor: 48 })
  })
})