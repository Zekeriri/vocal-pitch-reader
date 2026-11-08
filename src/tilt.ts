import { PitchListener, micErrorMessage } from './audio.ts'
import { formatNote, midiToName } from './pitch.ts'
import { PeakHold } from './scales.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import { silenceSpeech, speakNote } from './speak.ts'
const TILT_LONG_MS = 1000

const EXERCISE_KEY = 'pitch-reader-tilt-exercise'
const STEP_KEY = 'pitch-reader-tilt-step'
const NOTE_LOW = 60
const NOTE_HIGH = 72
const NOTES = Array.from({ length: NOTE_HIGH - NOTE_LOW + 1 }, (_, index) => NOTE_LOW + index)
const PASS_QUIET_MS = 700
const HOLD_GAP_MS = 150

const noteEl = document.querySelector<HTMLElement>('#tilt-note')!
const detailEl = document.querySelector<HTMLElement>('#tilt-detail')!
const extraEl = document.querySelector<HTMLElement>('#tilt-extra')!
const placeEl = document.querySelector<HTMLElement>('#tilt-place')!
const levelEl = document.querySelector<HTMLElement>('#tilt-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#tilt-gate')!
const startButton = document.querySelector<HTMLButtonElement>('#tilt-start')!
const hearButton = document.querySelector<HTMLButtonElement>('#tilt-hear')!
const prevButton = document.querySelector<HTMLButtonElement>('#tilt-prev')!
const nextButton = document.querySelector<HTMLButtonElement>('#tilt-next')!
const statusEl = document.querySelector<HTMLElement>('#tilt-status')!
const notesEl = document.querySelector<HTMLElement>('#tilt-notes')!
const slideTab = document.querySelector<HTMLButtonElement>('#tilt-tab-slide')!
const repeatTab = document.querySelector<HTMLButtonElement>('#tilt-tab-repeat')!
const longTab = document.querySelector<HTMLButtonElement>('#tilt-tab-long')!

type Exercise = 'slide' | 'repeat' | 'long'
type Phase = 'idle' | 'playing' | 'listening'

let phase: Phase = 'idle'
let quietSince: number | null = null
let expectStop = false
let abort: AbortController | null = null
let token = 0
let advancing = false
let settled = false
let chainDone = false
let cleared = false
let liveLabel: string | null = null
let liveStable = false
const peak = new PeakHold()
let heldMs = 0
let heldTick: number | null = null
let heldNote: number | null = null
let awaySince: number | null = null
let exercise: Exercise = storedChoice(EXERCISE_KEY, ['slide', 'repeat', 'long'], 'slide')
let step = storedStep()
const done: Record<Exercise, boolean[]> = {
  slide: NOTES.map(() => false),
  repeat: NOTES.map(() => false),
  long: NOTES.map(() => false),
}

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'listening' || advancing) return
  const now = performance.now()
  if (detection.result.freq == null) {
    if (exercise === 'long' && !cleared) noteHeld(now, null, currentMidi())
    if (cleared && quietSince == null) quietSince = now
    if (cleared && quietSince != null && now - quietSince >= PASS_QUIET_MS) {
      void advance()
      return
    }
    render()
    return
  }
  quietSince = null
  const midi = detection.result.midi
  const target = currentMidi()
  liveLabel = detection.result.note ?? (midi == null ? null : midiToName(midi))
  liveStable = detection.result.stable
  peak.push(midi, detection.result.stable)
  if (exercise === 'long') noteHeld(now, midi, target)
  else if (detection.result.stable && midi != null && midi >= target) markCleared()
  render()
}, () => {
  if (expectStop || phase !== 'listening') return
  phase = 'idle'
  render()
})

subscribeSettings((settings) => {
  listener.rmsMin = gateToRms(settings.gate)
  listener.setHoldMs(settings.holdMs)
  gateMarkEl.style.left = `${gateMarkRatio(listener.rmsMin) * 100}%`
})

fillNotes()
render()

startButton.addEventListener('click', () => {
  handleTiltSpace()
})
hearButton.addEventListener('click', () => {
  void hear()
})
prevButton.addEventListener('click', () => move(-1))
nextButton.addEventListener('click', () => {
  if (step >= NOTES.length - 1) finishRound()
  else move(1)
})
slideTab.addEventListener('click', () => setExercise('slide'))
repeatTab.addEventListener('click', () => setExercise('repeat'))
longTab.addEventListener('click', () => setExercise('long'))

export function handleTiltSpace(): void {
  if (phase === 'playing') return
  if (phase === 'listening') {
    if (cleared) void advance()
    else finishTake(true)
    return
  }
  void begin()
}

export function stopTilt(): void {
  finishTake(false)
}

async function begin(): Promise<void> {
  if (phase === 'playing' || phase === 'listening') return
  if (chainDone) {
    done[exercise] = NOTES.map(() => false)
    step = 0
    localStorage.setItem(STEP_KEY, String(step))
    chainDone = false
  }
  await present()
}

async function present(): Promise<void> {
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  clearTake()
  haltMic()
  phase = 'playing'
  statusEl.textContent = ''
  render()
  try {
    await playMidiSequence([currentMidi()], () => {
      noteEl.textContent = formatNote(midiToName(currentMidi()))
      noteEl.className = 'note is-live'
      detailEl.textContent = '听这个音，然后唱'
    }, controller.signal)
  } catch (error) {
    if (controller.signal.aborted || run !== token) return
    phase = 'idle'
    statusEl.textContent = error instanceof Error ? error.message : '没播出来。'
    render()
    return
  }
  if (controller.signal.aborted || run !== token) return
  phase = 'listening'
  render()
  try {
    const started = await listener.startMic()
    if (run !== token) {
      haltMic()
      return
    }
    if (!started) {
      phase = 'idle'
      render()
    }
  } catch (error) {
    if (run !== token) return
    haltMic()
    phase = 'idle'
    statusEl.textContent = micErrorMessage(error)
    render()
  }
}

async function advance(): Promise<void> {
  if (advancing || phase !== 'listening') return
  advancing = true
  const run = token
  const highest = peak.highest
  const last = step >= NOTES.length - 1
  try {
    haltMic()
    if (run !== token) return
    if (last) {
      phase = 'idle'
      settled = true
      chainDone = true
      render()
      if (highest != null) speakNote(midiToName(highest))
      return
    }
    step += 1
    localStorage.setItem(STEP_KEY, String(step))
    await present()
  } finally {
    advancing = false
  }
}

async function hear(): Promise<void> {
  if (phase === 'playing' || phase === 'listening') return
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  hearButton.disabled = true
  statusEl.textContent = ''
  try {
    await playMidiSequence([currentMidi()], () => {}, controller.signal)
  } catch (error) {
    if (!controller.signal.aborted) {
      statusEl.textContent = error instanceof Error ? error.message : '没播出来。'
    }
  } finally {
    if (abort === controller) hearButton.disabled = false
  }
}

function finishRound(): void {
  if (phase === 'playing' || phase === 'listening') return
  step = 0
  localStorage.setItem(STEP_KEY, '0')
  clearTake()
  render()
}

function move(delta: number): void {
  if (phase === 'playing' || phase === 'listening') return
  const next = Math.min(NOTES.length - 1, Math.max(0, step + delta))
  if (next === step) return
  step = next
  localStorage.setItem(STEP_KEY, String(step))
  clearTake()
  render()
}

function setExercise(next: Exercise): void {
  if (phase === 'playing' || phase === 'listening') return
  exercise = next
  localStorage.setItem(EXERCISE_KEY, exercise)
  clearTake()
  render()
}

function selectNote(index: number): void {
  if (phase === 'playing' || phase === 'listening') return
  if (index === step) return
  step = index
  localStorage.setItem(STEP_KEY, String(step))
  clearTake()
  render()
}

function finishTake(speak: boolean): void {
  token += 1
  abort?.abort()
  const wasListening = phase === 'listening'
  haltMic()
  silenceSpeech()
  advancing = false
  if (phase === 'listening' || phase === 'playing') phase = 'idle'
  settled = wasListening
  render()
  if (speak && wasListening && peak.highest != null) speakNote(midiToName(peak.highest))
}

function clearTake(): void {
  quietSince = null
  settled = false
  chainDone = false
  cleared = false
  liveLabel = null
  liveStable = false
  heldMs = 0
  heldTick = null
  heldNote = null
  awaySince = null
  peak.reset()
}

function noteHeld(now: number, midi: number | null, target: number): void {
  const onNote = midi != null && midi >= target
  if (!onNote || midi !== heldNote) {
    if (onNote) {
      heldNote = midi
      heldMs = 0
      heldTick = now
      awaySince = null
      return
    }
    if (awaySince == null) awaySince = now
    heldTick = null
    if (now - awaySince >= HOLD_GAP_MS) {
      heldMs = 0
      heldNote = null
    }
    return
  }
  if (awaySince != null && now - awaySince >= HOLD_GAP_MS) heldMs = 0
  awaySince = null
  if (heldTick != null) heldMs += now - heldTick
  heldTick = now
  if (heldMs >= TILT_LONG_MS) markCleared()
}

function markCleared(): void {
  cleared = true
  done[exercise][step] = true
}

function currentMidi(): number {
  return NOTES[step] ?? NOTES[0]
}

function render(): void {
  const name = formatNote(midiToName(currentMidi()))
  const busy = phase === 'playing' || phase === 'listening'
  slideTab.setAttribute('aria-pressed', exercise === 'slide' ? 'true' : 'false')
  repeatTab.setAttribute('aria-pressed', exercise === 'repeat' ? 'true' : 'false')
  longTab.setAttribute('aria-pressed', exercise === 'long' ? 'true' : 'false')
  slideTab.disabled = busy
  repeatTab.disabled = busy
  longTab.disabled = busy
  placeEl.textContent = `${name} · ${step + 1} / ${NOTES.length}`
  hearButton.textContent = `听 ${name}`
  hearButton.disabled = busy
  const last = step === NOTES.length - 1
  prevButton.disabled = busy || step === 0
  nextButton.disabled = busy
  nextButton.textContent = last ? '完成' : '下一个音'
  startButton.disabled = phase === 'playing'
  startButton.textContent = phase === 'playing' ? '正在播放…' : phase === 'listening' ? '唱完了' : chainDone ? '再来一次' : '播放并跟唱'
  paintNotes()
  paintPitch()
}

function paintPitch(): void {
  if (phase === 'playing') {
    noteEl.textContent = formatNote(midiToName(currentMidi()))
    noteEl.className = 'note is-live'
    detailEl.textContent = '听这个音，然后唱'
    extraEl.textContent = ''
    return
  }
  if (phase === 'listening') {
    if (liveLabel) {
      noteEl.textContent = formatNote(liveLabel)
      noteEl.className = liveStable ? 'note is-stable' : 'note is-live'
    } else {
      noteEl.textContent = '·'
      noteEl.className = 'note is-empty'
    }
    detailEl.textContent = listeningDetail()
    extraEl.textContent = cleared
      ? step >= NOTES.length - 1 ? '松开，这一串就结束' : '松开，到下一个音'
      : peakText()
    return
  }
  if (settled) {
    if (peak.highest == null) {
      noteEl.textContent = '·'
      noteEl.className = 'note is-empty'
      detailEl.textContent = exercise === 'long' ? '这次没有稳住 1 秒' : '这次没有稳住一个音'
      extraEl.textContent = chainDone ? '这一串练完了' : ''
      return
    }
    const name = formatNote(midiToName(peak.highest))
    noteEl.textContent = name
    noteEl.className = 'note is-stable'
    detailEl.textContent = `最高 ${name}`
    extraEl.textContent = chainDone ? '这一串练完了' : cleared ? '' : missText()
    return
  }
  noteEl.textContent = '·'
  noteEl.className = 'note is-empty'
  detailEl.textContent = exercise === 'long' ? '点播放并跟唱，稳住这个音或更高的音 1 秒以上' : '点播放并跟唱，稳住这个音，更高也行'
  extraEl.textContent = ''
}

function listeningDetail(): string {
  if (cleared) return exercise === 'long' ? '稳住 1 秒了' : '稳住了'
  if (exercise !== 'long') return liveStable ? '再停在这个音上，更高也行' : '再稳一下才记最高音'
  if (heldMs <= 0 && heldTick == null) return '把这个音或更高的音稳住 1 秒以上'
  const seconds = Math.min(TILT_LONG_MS, heldMs) / 1000
  return `已稳住 ${seconds.toFixed(1)} 秒`
}

function missText(): string {
  return exercise === 'long' ? '还没稳住 1 秒' : '还没稳住'
}

function peakText(): string {
  if (peak.highest == null) return ''
  return `最高 ${formatNote(midiToName(peak.highest))}`
}

function fillNotes(): void {
  NOTES.forEach((midi, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = formatNote(midiToName(midi))
    button.addEventListener('click', () => selectNote(index))
    notesEl.append(button)
  })
}

function paintNotes(): void {
  const buttons = notesEl.querySelectorAll('button')
  buttons.forEach((button, index) => {
    button.classList.toggle('is-now', index === step)
    button.classList.toggle('is-reached', done[exercise][index] === true)
    button.disabled = phase === 'playing' || phase === 'listening'
    button.setAttribute('aria-pressed', index === step ? 'true' : 'false')
  })
}

function renderMeter(rms: number): void {
  const ratio = Math.min(1, rms / 0.08)
  levelEl.style.transform = `scaleX(${ratio})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}

function haltMic(): void {
  if (listener.mode === 'idle') return
  expectStop = true
  listener.stop()
  expectStop = false
}

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key)
  return allowed.find((item) => item === raw) ?? fallback
}

function storedStep(): number {
  const raw = localStorage.getItem(STEP_KEY)
  const value = raw == null || raw === '' ? 0 : Number(raw)
  if (!Number.isInteger(value) || value < 0 || value >= NOTES.length) return 0
  return value
}
