import { describe, expect, it } from 'vitest'
import {
  INPUT_DROPOUT_MS,
  INPUT_GAP_MS,
  createSelfInput,
  stepSelfInput,
  type InputFrame,
  type SelfInputState,
  type SelfInputStep,
} from './intonation-input.ts'

const NOTE_MS = 1000

function hz(midi: number, cents = 0): number {
  return 440 * 2 ** ((midi - 69 + cents / 100) / 12)
}

function heard(time: number, midi: number, cents = 0, stable = true): InputFrame {
  return { time, freq: hz(midi, cents), midi, stable }
}

function quiet(time: number): InputFrame {
  return { time, freq: null, midi: null, stable: false }
}

function play(frames: InputFrame[], noteMs = NOTE_MS): { state: SelfInputState; events: SelfInputStep[] } {
  let state = createSelfInput()
  const events = frames.map((frame) => {
    const step = stepSelfInput(state, frame, noteMs)
    state = step.state
    return step
  })
  return { state, events }
}

function readyToSing(midi = 60): { state: SelfInputState; at: number } {
  const locked = play([heard(0, midi), heard(NOTE_MS, midi)])
  expect(locked.events.at(-1)?.locked).toBe(midi)
  const releaseAt = NOTE_MS + 20
  const opened = stepSelfInput(locked.state, quiet(releaseAt), NOTE_MS)
  const armed = stepSelfInput(opened.state, quiet(releaseAt + INPUT_GAP_MS), NOTE_MS)
  expect(armed.armed).toBe(true)
  expect(armed.state.phase).toBe('sing')
  expect(armed.state.waitGap).toBe(false)
  return { state: armed.state, at: releaseAt + INPUT_GAP_MS }
}

describe('self-input loop', () => {
  it('locks a keyboard note only after it has stayed for the whole note', () => {
    const early = play([heard(0, 67), heard(NOTE_MS - 1, 67)])
    expect(early.events.at(-1)?.locked).toBeNull()
    expect(early.state.phase).toBe('capture')

    const locked = play([heard(0, 67), heard(NOTE_MS, 67)])
    const step = locked.events.at(-1)
    expect(step?.locked).toBe(67)
    expect(step?.state.phase).toBe('sing')
    expect(step?.state.waitGap).toBe(true)
    expect(step?.state.target).toBe(67)
  })

  it('does not treat the key that is still held as the sung note', () => {
    const { state } = play([heard(0, 67), heard(NOTE_MS, 67), heard(NOTE_MS + 400, 67), heard(NOTE_MS + 800, 64)])
    expect(state.phase).toBe('sing')
    expect(state.waitGap).toBe(true)
    expect(state.target).toBe(67)
  })

  it('keeps the captured note after the key is released', () => {
    const { state, at } = readyToSing()
    expect(at).toBe(NOTE_MS + 20 + INPUT_GAP_MS)
    expect(state.target).toBe(60)
    const sung = stepSelfInput(state, heard(at + 30, 60, -40), NOTE_MS)
    expect(sung.locked).toBeNull()
    expect(sung.state.waitGap).toBe(false)
    expect(sung.state.target).toBe(60)
    expect(sung.state.phase).toBe('sing')
  })

  it('does not judge a sung note while it is going or after it ends', () => {
    const { state, at } = readyToSing()
    const flat = stepSelfInput(state, heard(at + 100, 60, -40), NOTE_MS)
    const matched = stepSelfInput(flat.state, heard(at + 100 + NOTE_MS, 60, 0), NOTE_MS)
    const opening = stepSelfInput(matched.state, quiet(at + 100 + NOTE_MS + 40), NOTE_MS)
    const ended = stepSelfInput(opening.state, quiet(at + 100 + NOTE_MS + 40 + INPUT_GAP_MS), NOTE_MS)
    expect(ended.locked).toBeNull()
    expect(ended.armed).toBe(false)
    expect(ended.state.phase).toBe('sing')
    expect(ended.state.target).toBe(60)
  })

  it('does not replace the target when the sung pitch moves', () => {
    const { state, at } = readyToSing(60)
    const moved = stepSelfInput(state, heard(at + 200, 64, 0), NOTE_MS)
    expect(moved.locked).toBeNull()
    expect(moved.state.phase).toBe('sing')
    expect(moved.state.target).toBe(60)
  })

  it('restarts the keyboard hold when the note changes or drops out', () => {
    const changed = play([heard(0, 60), heard(800, 62), heard(800 + NOTE_MS - 1, 62)])
    expect(changed.events.at(-1)?.locked).toBeNull()
    const locked = stepSelfInput(changed.state, heard(800 + NOTE_MS, 62), NOTE_MS)
    expect(locked.locked).toBe(62)

    const first = play([heard(0, 60)])
    const gapStart = stepSelfInput(first.state, quiet(100), NOTE_MS)
    const gapEnd = stepSelfInput(gapStart.state, quiet(100 + INPUT_DROPOUT_MS), NOTE_MS)
    expect(gapEnd.state.pendingSince).toBeNull()
    const resumed = stepSelfInput(gapEnd.state, heard(100 + INPUT_DROPOUT_MS + 10, 60), NOTE_MS)
    const almost = stepSelfInput(resumed.state, heard(100 + INPUT_DROPOUT_MS + NOTE_MS, 60), NOTE_MS)
    expect(almost.locked).toBeNull()
  })
})
