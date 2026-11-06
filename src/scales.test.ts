import { describe, expect, it } from 'vitest'
import { nameToMidi, nameToSpeech } from './pitch.ts'
import {
  PeakHold,
  exerciseById,
  labelForMidi,
  parsePracticeNote,
  practiceSteps,
  preferScaleOctave,
} from './scales.ts'

describe('practice notes', () => {
  it('reads flats as the same pitch the exercise spells', () => {
    expect(parsePracticeNote('bD3').midi).toBe(nameToMidi('C#3'))
    expect(parsePracticeNote('bG3').midi).toBe(nameToMidi('F#3'))
    expect(parsePracticeNote('bC4')).toEqual({ midi: nameToMidi('B3'), label: 'Cb4' })
    expect(nameToSpeech('Db3')).toBe('D flat 3')
    expect(nameToSpeech('G#3')).toBe('G sharp 3')
  })

  it('keeps every group tied to its low note and its top note', () => {
    for (const exercise of [exerciseById('hum'), exerciseById('flex')]) {
      for (const part of exercise.parts) {
        for (const item of part.groups) {
          expect(item.notes[0].midi).toBe(item.low.midi)
          expect(item.notes[item.notes.length - 1].midi).toBe(item.low.midi)
          expect(Math.max(...item.notes.map((note) => note.midi))).toBe(item.high.midi)
        }
      }
    }
  })

  it('orders humming up through group 11, then down from group 10', () => {
    const steps = practiceSteps(exerciseById('hum'))
    expect(steps).toHaveLength(21)
    expect(steps[0].group.number).toBe(1)
    expect(steps[0].group.notes.map((note) => note.label).join(' ')).toBe(
      'A2 B2 Db3 D3 E3 D3 Db3 B2 A2',
    )
    expect(steps[10].part.title).toContain('上行')
    expect(steps[10].group.number).toBe(11)
    expect(steps[11].part.title).toContain('下行')
    expect(steps[11].group.number).toBe(10)
    expect(steps[11].group.notes.map((note) => note.label)).toContain('Cb4')
    expect(steps[20].group.number).toBe(1)
  })

  it('orders flexibility up through group 13, then down from group 12', () => {
    const steps = practiceSteps(exerciseById('flex'))
    expect(steps).toHaveLength(25)
    expect(steps[2].group.notes[1].midi).toBe(nameToMidi('F#3'))
    expect(steps[12].group.number).toBe(13)
    expect(steps[12].group.high.label).toBe('C5')
    expect(steps[13].group.number).toBe(12)
    expect(steps[24].group.number).toBe(1)
  })

  it('remembers the highest note only after it has been held steady', () => {
    const peak = new PeakHold()
    expect(peak.push(64, false)).toBeNull()
    expect(peak.push(60, true)).toBe(60)
    expect(peak.push(67, false)).toBe(60)
    expect(peak.push(64, true)).toBe(64)
    expect(peak.push(62, true)).toBe(64)
    expect(peak.push(null, true)).toBe(64)
  })

  it('folds an octave error back toward the scale and keeps a real higher note', () => {
    const low = nameToMidi('A2')!
    const high = nameToMidi('E3')!
    expect(preferScaleOctave(nameToMidi('E4')!, low, high)).toBe(high)
    expect(preferScaleOctave(nameToMidi('G3')!, low, high)).toBe(nameToMidi('G3'))
    expect(labelForMidi(high, practiceSteps(exerciseById('hum'))[0].group.notes)).toBe('E3')
  })
})
