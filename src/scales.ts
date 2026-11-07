import { midiToName, nameToMidi } from './pitch.ts'

export type PracticeNote = {
  midi: number
  label: string
}

export type PracticeGroup = {
  number: number
  low: PracticeNote
  high: PracticeNote
  notes: PracticeNote[]
}

export type PracticePart = {
  title: string
  groups: PracticeGroup[]
}

export type PracticeExercise = {
  id: 'hum' | 'flex'
  title: string
  lede: string
  parts: PracticePart[]
}

const FLAT_SOUNDING: Record<string, string> = {
  D: 'C#',
  E: 'D#',
  G: 'F#',
  A: 'G#',
  B: 'A#',
}

export function parsePracticeNote(raw: string): PracticeNote {
  const match = /^(b)?([A-G])(-?\d+)$/.exec(raw)
  if (!match) throw new Error(`无法识别音名 ${raw}`)
  const flat = Boolean(match[1])
  const letter = match[2]
  let octave = Number(match[3])
  if (!flat) {
    const midi = nameToMidi(`${letter}${octave}`)
    if (midi == null) throw new Error(`无法识别音名 ${raw}`)
    return { midi, label: `${letter}${octave}` }
  }
  let sounding: string
  if (letter === 'C') {
    octave -= 1
    sounding = `B${octave}`
  } else if (letter === 'F') {
    sounding = `E${octave}`
  } else {
    sounding = `${FLAT_SOUNDING[letter]}${octave}`
  }
  const midi = nameToMidi(sounding)
  if (midi == null) throw new Error(`无法识别音名 ${raw}`)
  return { midi, label: `${letter}b${match[3]}` }
}

export function formatPracticeNote(note: string): string {
  return note.replace('#', '♯').replace('b', '♭')
}

export function labelForMidi(midi: number, notes: PracticeNote[]): string {
  return notes.find((note) => note.midi === midi)?.label ?? midiToName(midi)
}

export function preferScaleOctave(midi: number, low: number, high: number): number {
  const floor = low - 3
  const ceiling = high + 8
  if (midi > ceiling && midi - 12 >= floor && midi - 12 <= ceiling) return midi - 12
  if (midi < floor && midi + 12 >= floor && midi + 12 <= ceiling) return midi + 12
  return midi
}

export class PeakHold {
  highest: number | null = null

  reset(): void {
    this.highest = null
  }

  push(midi: number | null, stable: boolean): number | null {
    if (!stable || midi == null) return this.highest
    const rounded = Math.round(midi)
    if (this.highest == null || rounded > this.highest) this.highest = rounded
    return this.highest
  }
}

function group(number: number, low: string, high: string, line: string): PracticeGroup {
  return {
    number,
    low: parsePracticeNote(low),
    high: parsePracticeNote(high),
    notes: line.split(/\s+/).map(parsePracticeNote),
  }
}

const HUM_ASCENDING: PracticeGroup[] = [
  group(1, 'A2', 'E3', 'A2 B2 bD3 D3 E3 D3 bD3 B2 A2'),
  group(2, 'bB2', 'F3', 'bB2 C3 D3 bE3 F3 bE3 D3 C3 bB2'),
  group(3, 'B2', 'bG3', 'B2 bD3 bE3 E3 bG3 E3 bE3 bD3 B2'),
  group(4, 'C3', 'G3', 'C3 D3 E3 F3 G3 F3 E3 D3 C3'),
  group(5, 'bD3', 'bA3', 'bD3 bE3 F3 bG3 bA3 bG3 F3 bE3 bD3'),
  group(6, 'D3', 'A3', 'D3 E3 bG3 G3 A3 G3 bG3 E3 D3'),
  group(7, 'bE3', 'bB3', 'bE3 F3 G3 bA3 bB3 bA3 G3 F3 bE3'),
  group(8, 'E3', 'B3', 'E3 bG3 bA3 A3 B3 A3 bA3 bG3 E3'),
  group(9, 'F3', 'C4', 'F3 G3 A3 bB3 C4 bB3 A3 G3 F3'),
  group(10, 'bG3', 'bD4', 'bG3 bA3 bB3 bC4 bD4 bC4 bB3 bA3 bG3'),
  group(11, 'G3', 'D4', 'G3 A3 B3 C4 D4 C4 B3 A3 G3'),
]

const FLEX_ASCENDING: PracticeGroup[] = [
  group(1, 'C3', 'C4', 'C3 E3 G3 C4 G3 E3 C3'),
  group(2, 'bD3', 'bD4', 'bD3 F3 bA3 bD4 bA3 F3 bD3'),
  group(3, 'D3', 'D4', 'D3 bG3 A3 D4 A3 bG3 D3'),
  group(4, 'bE3', 'bE4', 'bE3 G3 bB3 bE4 bB3 G3 bE3'),
  group(5, 'E3', 'E4', 'E3 bA3 B3 E4 B3 bA3 E3'),
  group(6, 'F3', 'F4', 'F3 A3 C4 F4 C4 A3 F3'),
  group(7, 'bG3', 'bG4', 'bG3 bB3 bD4 bG4 bD4 bB3 bG3'),
  group(8, 'G3', 'G4', 'G3 B3 D4 G4 D4 B3 G3'),
  group(9, 'bA3', 'bA4', 'bA3 C4 bE4 bA4 bE4 C4 bA3'),
  group(10, 'A3', 'A4', 'A3 bD4 E4 A4 E4 bD4 A3'),
  group(11, 'bB3', 'bB4', 'bB3 D4 F4 bB4 F4 D4 bB3'),
  group(12, 'B3', 'B4', 'B3 bE4 bG4 B4 bG4 bE4 B3'),
  group(13, 'C4', 'C5', 'C4 E4 G4 C5 G4 E4 C4'),
]

export const PRACTICE_EXERCISES: PracticeExercise[] = [
  {
    id: 'hum',
    title: '咽音哼鸣练习',
    lede: '正常发声时，口腔在振动。软腭有振动。',
    parts: [{ title: '上行', groups: HUM_ASCENDING }],
  },
  {
    id: 'flex',
    title: '灵活性音阶训练',
    lede: '顺着音阶往上走，看最高音够不够得到。',
    parts: [{ title: '上行', groups: FLEX_ASCENDING }],
  },
]

export type PracticeStep = {
  exercise: PracticeExercise
  part: PracticePart
  group: PracticeGroup
  index: number
  count: number
}

export function practiceSteps(exercise: PracticeExercise): PracticeStep[] {
  const steps: PracticeStep[] = []
  for (const part of exercise.parts) {
    for (const item of part.groups) {
      steps.push({ exercise, part, group: item, index: steps.length, count: 0 })
    }
  }
  for (const step of steps) step.count = steps.length
  return steps
}

export function exerciseById(id: PracticeExercise['id']): PracticeExercise {
  const found = PRACTICE_EXERCISES.find((exercise) => exercise.id === id)
  if (!found) throw new Error(`没有这个练习 ${id}`)
  return found
}
