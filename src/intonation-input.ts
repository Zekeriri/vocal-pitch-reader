/** A steady keyboard note is kept after this. Shorter than a played exercise note. */
export const INPUT_KEY_HOLD_MS = 400

/** Brief holes in a held note. Shorter than this, the note is still going. */
export const INPUT_DROPOUT_MS = 80

/** Quiet long enough to mean the key was released. */
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
  /** The keyboard note has been released and singing can start. */
  armed: boolean
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
  }
}

export function stepSelfInput(state: SelfInputState, frame: InputFrame, noteMs: number): SelfInputStep {
  const noteHold = Math.max(1, noteMs)
  const next: SelfInputState = { ...state }
  let locked: number | null = null
  let armed = false

  if (frame.freq == null || frame.midi == null) {
    if (next.quietSince == null) next.quietSince = frame.time
    const quiet = frame.time - next.quietSince
    if (quiet >= INPUT_DROPOUT_MS) {
      next.pendingMidi = null
      next.pendingSince = null
    }
    if (quiet >= INPUT_GAP_MS && next.waitGap) {
      next.waitGap = false
      next.ignoreMidi = null
      armed = true
    }
    return { state: next, locked, armed }
  }

  if (next.quietSince != null) {
    const quiet = frame.time - next.quietSince
    if (quiet >= INPUT_DROPOUT_MS) {
      next.pendingMidi = null
      next.pendingSince = null
    }
    if (quiet >= INPUT_GAP_MS && next.waitGap) {
      next.waitGap = false
      next.ignoreMidi = null
      armed = true
    }
  }
  next.quietSince = null
  if (next.waitGap) {
    const newKey = next.phase === 'capture' && frame.stable && frame.midi !== next.ignoreMidi
    if (!newKey) return { state: next, locked, armed }
    next.waitGap = false
    next.ignoreMidi = null
  }

  if (next.phase !== 'capture') return { state: next, locked, armed }

  if (!frame.stable) {
    next.pendingMidi = null
    next.pendingSince = null
    return { state: next, locked, armed }
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
    locked = frame.midi
  }
  return { state: next, locked, armed }
}
