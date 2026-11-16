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

  it('starts scoring only after the key is released', () => {
    const { state, at } = readyToSing()
    expect(at).toBe(NOTE_MS + 20 + INPUT_GAP_MS)
    expect(state.target).toBe(60)
    const sung = stepSelfInput(state, heard(at + 30, 60, -40), NOTE_MS)
    expect(sung.live).toBe('low')
    expect(sung.state.waitGap).toBe(false)
  })

  it('does not call a note wrong while it is still being sung', () => {
    const { state, at } = readyToSing()
    const midway = stepSelfInput(state, heard(at + 400, 60, -40), NOTE_MS)
    expect(midway.live).toBe('low')
    expect(midway.speak).toBeNull()
    expect(midway.passed).toBe(false)
    expect(midway.state.phase).toBe('sing')
    expect(midway.state.target).toBe(60)
  })

  it('says the note was low only after the singer lets it go', () => {
    const { state, at } = readyToSing()
    const sung = stepSelfInput(state, heard(at + 100, 60, -40), NOTE_MS)
    const opening = stepSelfInput(sung.state, quiet(at + 150), NOTE_MS)
    expect(opening.speak).toBeNull()
    const ended = stepSelfInput(opening.state, quiet(at + 150 + INPUT_GAP_MS), NOTE_MS)
    expect(ended.speak).toBe('low')
    expect(ended.state.phase).toBe('sing')
    expect(ended.state.target).toBe(60)
    const again = stepSelfInput(ended.state, quiet(at + 150 + INPUT_GAP_MS + 200), NOTE_MS)
    expect(again.speak).toBeNull()
  })

  it('lets a note that starts flat still pass once the rest of it is in tune', () => {
    const { state, at } = readyToSing()
    const flat = stepSelfInput(state, heard(at + 50, 60, -40), NOTE_MS)
    const matched = stepSelfInput(flat.state, heard(at + 200, 60, 0), NOTE_MS)
    expect(matched.passed).toBe(false)
    expect(matched.speak).toBeNull()
    const done = stepSelfInput(matched.state, heard(at + 200 + NOTE_MS, 60, 10), NOTE_MS)
    expect(done.passed).toBe(true)
    expect(done.speak).toBeNull()
    expect(done.state.phase).toBe('capture')
    expect(done.state.target).toBeNull()
    expect(done.state.waitGap).toBe(true)
  })

  it('does not pass a matched note that stops halfway', () => {
    const { state, at } = readyToSing()
    const matched = stepSelfInput(state, heard(at + 20, 60, 0), NOTE_MS)
    const opening = stepSelfInput(matched.state, quiet(at + 80), NOTE_MS)
    const ended = stepSelfInput(opening.state, quiet(at + 80 + INPUT_GAP_MS), NOTE_MS)
    expect(ended.passed).toBe(false)
    expect(ended.speak).toBeNull()
    expect(ended.state.phase).toBe('sing')
    expect(ended.state.target).toBe(60)
  })

  it('keeps a match across a short dropout and drops it after a real gap', () => {
    const { state, at } = readyToSing()
    const began = at + 10
    const singing = stepSelfInput(state, heard(began, 60, 0), NOTE_MS)
    const open = stepSelfInput(singing.state, quiet(began + 500), NOTE_MS)
    const back = stepSelfInput(open.state, heard(began + 500 + 40, 60, 0), NOTE_MS)
    const passed = stepSelfInput(back.state, heard(began + NOTE_MS, 60, 0), NOTE_MS)
    expect(passed.passed).toBe(true)

    const again = stepSelfInput(readyToSing().state, heard(began, 60, 0), NOTE_MS)
    const hole = stepSelfInput(again.state, quiet(began + 500), NOTE_MS)
    const broke = stepSelfInput(hole.state, quiet(began + 500 + 200), NOTE_MS)
    expect(broke.state.matchSince).toBeNull()
    const restarted = stepSelfInput(broke.state, heard(began + 500 + 220, 60, 0), NOTE_MS)
    const tooSoon = stepSelfInput(restarted.state, heard(began + 500 + 200 + NOTE_MS, 60, 0), NOTE_MS)
    expect(tooSoon.passed).toBe(false)
  })

  it('returns to a new reference note and ignores the sung tail', () => {
    const { state, at } = readyToSing(60)
    const began = at + 10
    const holding = stepSelfInput(state, heard(began, 60, 0), NOTE_MS)
    const done = stepSelfInput(holding.state, heard(began + NOTE_MS, 60, 0), NOTE_MS)
    expect(done.passed).toBe(true)

    const tail = stepSelfInput(done.state, heard(began + NOTE_MS + 300, 60, 0), NOTE_MS)
    expect(tail.locked).toBeNull()
    expect(tail.state.phase).toBe('capture')
    expect(tail.state.waitGap).toBe(true)

    const nextKey = stepSelfInput(tail.state, heard(began + NOTE_MS + 400, 64), NOTE_MS)
    expect(nextKey.state.waitGap).toBe(false)
    expect(nextKey.state.pendingMidi).toBe(64)
    const locked = stepSelfInput(nextKey.state, heard(began + NOTE_MS + 400 + NOTE_MS, 64), NOTE_MS)
    expect(locked.locked).toBe(64)
    expect(locked.state.phase).toBe('sing')
    expect(locked.state.waitGap).toBe(true)
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
