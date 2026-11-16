import { judgePitch, type Verdict } from './intonation-round.ts'

/** Brief holes in a held note. Shorter than this, the note is still going. */
export const INPUT_DROPOUT_MS = 80

/** Quiet long enough to mean the key was released, or the sung note has ended. */
export const INPUT_GAP_MS = 520

export type SelfInputState = {
  phase: 'capture' | 'sing'
  target: number | null
  /** Ignore the note that just finished, until it stops or a new key replaces it. */
  waitGap: boolean
  ignoreMidi: number | null
  quietSince: number | null
  pendingMidi: number | null
  pendingSince: number | null
  matchSince: number | null
  phraseVerdict: Verdict | null
  voiced: boolean
}

export type InputFrame = {
  time: number
  freq: number | null
  midi: number | null
  stable: boolean
}

export type SelfInputStep = {
  state: SelfInputState
  locked: number | null
  passed: boolean
  armed: boolean
  /** Spoken after a miss ends, or once a matched note has been held long enough. */
  speak: Verdict | null
  /** On-screen verdict while the sung note is still going. Never spoken. */
  live: Verdict | null
}

export function createSelfInput(): SelfInputState {
  return {
    phase: 'capture',
    target: null,
    waitGap: false,
    ignoreMidi: null,
    quietSince: null,
    pendingMidi: null,
    pendingSince: null,
    matchSince: null,
    phraseVerdict: null,
    voiced: false,
  }
}

export function stepSelfInput(state: SelfInputState, frame: InputFrame, noteMs: number): SelfInputStep {
  const noteHold = Math.max(1, noteMs)
  const next: SelfInputState = { ...state }
  let locked: number | null = null
  let passed = false
  let armed = false
  let speak: Verdict | null = null
  let live: Verdict | null = null

  if (frame.freq == null || frame.midi == null) {
    if (next.quietSince == null) next.quietSince = frame.time
    const quiet = frame.time - next.quietSince
    if (quiet >= INPUT_DROPOUT_MS) {
      next.pendingMidi = null
      next.pendingSince = null
      next.matchSince = null
    }
    if (quiet >= INPUT_GAP_MS) {
      const waiting = next.waitGap
      if (waiting) {
        next.waitGap = false
        next.ignoreMidi = null
        armed = true
      } else if (next.phase === 'sing' && next.voiced) {
        if (next.phraseVerdict === 'low' || next.phraseVerdict === 'high') speak = next.phraseVerdict
        next.phraseVerdict = null
        next.voiced = false
      }
    }
    return { state: next, locked, passed, armed, speak, live }
  }

  if (next.quietSince != null) {
    const quiet = frame.time - next.quietSince
    if (quiet >= INPUT_DROPOUT_MS) {
      next.pendingMidi = null
      next.pendingSince = null
      next.matchSince = null
    }
    if (quiet >= INPUT_GAP_MS) {
      if (next.waitGap) {
        next.waitGap = false
        next.ignoreMidi = null
        armed = true
      } else if (next.phase === 'sing' && next.voiced) {
        if (next.phraseVerdict === 'low' || next.phraseVerdict === 'high') speak = next.phraseVerdict
        next.phraseVerdict = null
        next.voiced = false
      }
    }
  }
  next.quietSince = null
  if (next.waitGap) {
    const newKey = next.phase === 'capture' && frame.stable && frame.midi !== next.ignoreMidi
    if (!newKey) return { state: next, locked, passed, armed, speak, live }
    next.waitGap = false
    next.ignoreMidi = null
  }

  if (next.phase === 'capture') {
    if (!frame.stable) {
      next.pendingMidi = null
      next.pendingSince = null
      return { state: next, locked, passed, armed, speak, live }
    }
    if (frame.midi !== next.pendingMidi) {
      next.pendingMidi = frame.midi
      next.pendingSince = frame.time
    }
    if (next.pendingSince != null && frame.time - next.pendingSince >= noteHold) {
      next.target = frame.midi
      next.phase = 'sing'
      next.waitGap = true
      next.ignoreMidi = frame.midi
      next.pendingMidi = null
      next.pendingSince = null
      next.matchSince = null
      next.phraseVerdict = null
      next.voiced = false
      locked = frame.midi
    }
    return { state: next, locked, passed, armed, speak, live }
  }

  next.voiced = true
  if (!frame.stable || next.target == null) {
    next.matchSince = null
    return { state: next, locked, passed, armed, speak, live }
  }
  const verdict = judgePitch(frame.freq, next.target)
  next.phraseVerdict = verdict
  live = verdict
  if (verdict === 'match') {
    if (next.matchSince == null) next.matchSince = frame.time
    if (frame.time - next.matchSince >= noteHold) {
      next.phase = 'capture'
      next.ignoreMidi = frame.midi
      next.waitGap = true
      next.target = null
      next.matchSince = null
      next.phraseVerdict = null
      next.voiced = false
      next.pendingMidi = null
      next.pendingSince = null
      passed = true
      speak = 'match'
    }
  } else {
    next.matchSince = null
  }
  return { state: next, locked, passed, armed, speak, live }
}
