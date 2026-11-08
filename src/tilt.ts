import { PitchListener, micErrorMessage } from './audio.ts'
import { formatNote, freqToMidi, midiToName } from './pitch.ts'
import { PeakHold } from './scales.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import { speakNote } from './speak.ts'
import {
  LONG_MIN_MS,
  TILT_MIN,
  readSlide,
  readSustain,
  readTilts,
  scaleNotes,
  type PitchSample,
} from './tilt-read.ts'

const EXERCISE_KEY = 'pitch-reader-tilt-exercise'
const STEP_KEY = 'pitch-reader-tilt-step'
const SLIDE_RESET_MS = 450
const NOTES = scaleNotes()

const noteEl = document.querySelector<HTMLElement>('#tilt-note')!
const detailEl = document.querySelector<HTMLElement>('#tilt-detail')!
const extraEl = document.querySelector<HTMLElement>('#tilt-extra')!
const briefEl = document.querySelector<HTMLElement>('#tilt-brief')!
const placeEl = document.querySelector<HTMLElement>('#tilt-place')!
const levelEl = document.querySelector<HTMLElement>('#tilt-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#tilt-gate')!
const startButton = document.querySelector<HTMLButtonElement>('#tilt-start')!
const hearButton = document.querySelector<HTMLButtonElement>('#tilt-hear')!
const prevButton = document.querySelector<HTMLButtonElement>('#tilt-prev')!
const nextButton = document.querySelector<HTMLButtonElement>('#tilt-next')!
const statusEl = document.querySelector<HTMLElement>('#tilt-status')!
const notesEl = document.querySelector<HTMLElement>('#tilt-notes')!
const dotsEl = document.querySelector<HTMLOListElement>('#tilt-dots')!
const slideTab = document.querySelector<HTMLButtonElement>('#tilt-tab-slide')!
const repeatTab = document.querySelector<HTMLButtonElement>('#tilt-tab-repeat')!
const longTab = document.querySelector<HTMLButtonElement>('#tilt-tab-long')!

type Exercise = 'slide' | 'repeat' | 'long'
type Phase = 'idle' | 'listening'

let phase: Phase = 'idle'
let samples: PitchSample[] = []
let boutOrigin = 0
let quietSince: number | null = null
let expectStop = false
let abort: AbortController | null = null
let settled = false
let liveLabel: string | null = null
let liveStable = false
const peak = new PeakHold()
let exercise: Exercise = storedChoice(EXERCISE_KEY, ['slide', 'repeat', 'long'], 'slide')
let step = storedStep()
const done: Record<Exercise, boolean[]> = {
  slide: NOTES.map(() => false),
  repeat: NOTES.map(() => false),
  long: NOTES.map(() => false),
}

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'listening') return
  const now = performance.now()
  if (detection.result.freq == null) {
    if (samples.length > 0 && quietSince == null) quietSince = now
    render()
    return
  }
  if (exercise === 'slide' && quietSince != null && now - quietSince >= SLIDE_RESET_MS && samples.length > 0) {
    samples = []
  }
  quietSince = null
  if (samples.length === 0) boutOrigin = now
  liveLabel = detection.result.note
  liveStable = detection.result.stable
  peak.push(detection.result.midi, detection.result.stable)
  samples.push({ time: now - boutOrigin, midi: freqToMidi(detection.result.freq) })
  if (samples.length > 4000) samples.splice(0, samples.length - 4000)
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
fillDots()
render()

startButton.addEventListener('click', () => {
  void toggle()
})
hearButton.addEventListener('click', () => {
  void hear()
})
prevButton.addEventListener('click', () => move(-1))
nextButton.addEventListener('click', () => move(1))
slideTab.addEventListener('click', () => setExercise('slide'))
repeatTab.addEventListener('click', () => setExercise('repeat'))
longTab.addEventListener('click', () => setExercise('long'))

export function handleTiltSpace(): void {
  void toggle()
}

export function stopTilt(): void {
  finishTake(false)
}

async function toggle(): Promise<void> {
  if (phase === 'listening') {
    finishTake(true)
    return
  }
  abort?.abort()
  clearTake()
  statusEl.textContent = ''
  startButton.disabled = true
  hearButton.disabled = true
  startButton.textContent = '正在打开…'
  try {
    const started = await listener.startMic()
    if (!started) {
      phase = 'idle'
      render()
      return
    }
    phase = 'listening'
    render()
  } catch (error) {
    haltMic()
    phase = 'idle'
    statusEl.textContent = micErrorMessage(error)
    render()
  }
}

async function hear(): Promise<void> {
  if (phase === 'listening') return
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  hearButton.disabled = true
  statusEl.textContent = ''
  const lengths = exercise === 'slide' ? [0.45] : undefined
  try {
    await playMidiSequence([currentMidi()], () => {}, controller.signal, lengths)
  } catch (error) {
    if (!controller.signal.aborted) {
      statusEl.textContent = error instanceof Error ? error.message : '没播出来。'
    }
  } finally {
    if (abort === controller) hearButton.disabled = false
  }
}

function move(delta: number): void {
  const next = Math.min(NOTES.length - 1, Math.max(0, step + delta))
  if (next === step) return
  step = next
  localStorage.setItem(STEP_KEY, String(step))
  clearTake()
  render()
}

function selectNote(index: number): void {
  if (index === step) return
  step = index
  localStorage.setItem(STEP_KEY, String(step))
  clearTake()
  render()
}

function setExercise(next: Exercise): void {
  exercise = next
  localStorage.setItem(EXERCISE_KEY, exercise)
  clearTake()
  render()
}

function finishTake(speak: boolean): void {
  abort?.abort()
  const wasListening = phase === 'listening'
  haltMic()
  if (wasListening) {
    phase = 'idle'
    settled = true
  }
  render()
  if (speak && peak.highest != null) speakNote(midiToName(peak.highest))
}

function clearTake(): void {
  samples = []
  boutOrigin = 0
  quietSince = null
  settled = false
  liveLabel = null
  liveStable = false
  peak.reset()
}

function currentMidi(): number {
  return NOTES[step] ?? NOTES[0]
}

function nowMs(): number {
  if (phase === 'listening' && samples.length > 0) return performance.now() - boutOrigin
  return samples[samples.length - 1]?.time ?? 0
}

function render(): void {
  const midi = currentMidi()
  const now = nowMs()
  const name = formatNote(midiToName(midi))
  slideTab.setAttribute('aria-pressed', exercise === 'slide' ? 'true' : 'false')
  repeatTab.setAttribute('aria-pressed', exercise === 'repeat' ? 'true' : 'false')
  longTab.setAttribute('aria-pressed', exercise === 'long' ? 'true' : 'false')
  placeEl.textContent = `${name} · ${step + 1} / ${NOTES.length}`
  hearButton.textContent = `听 ${name}`
  hearButton.disabled = phase === 'listening'
  prevButton.disabled = step === 0
  nextButton.disabled = step === NOTES.length - 1
  startButton.disabled = false
  startButton.textContent = phase === 'listening' ? '结束' : '开始'
  dotsEl.hidden = exercise !== 'repeat'
  briefEl.textContent = briefFor()
  paintNotes()

  const status = exercise === 'slide' ? slideStatus(midi, now) : exercise === 'repeat' ? repeatStatus(midi, now) : longStatus(midi, now)
  paintPitch(status)
}

function paintPitch(status: string): void {
  if (phase === 'listening') {
    if (liveLabel) {
      noteEl.textContent = formatNote(liveLabel)
      noteEl.className = liveStable ? 'note is-stable' : 'note is-live'
    } else {
      noteEl.textContent = '·'
      noteEl.className = 'note is-empty'
    }
    detailEl.textContent = status
    extraEl.textContent = liveLabel && !liveStable ? '再稳一下才记最高音' : peakText()
    return
  }
  if (settled) {
    if (peak.highest == null) {
      noteEl.textContent = '·'
      noteEl.className = 'note is-empty'
      detailEl.textContent = '这次没有稳住一个音'
      extraEl.textContent = ''
      return
    }
    const name = formatNote(midiToName(peak.highest))
    noteEl.textContent = name
    noteEl.className = 'note is-stable'
    detailEl.textContent = `最高 ${name}`
    extraEl.textContent = status
    return
  }
  noteEl.textContent = '·'
  noteEl.className = 'note is-empty'
  detailEl.textContent = status
  extraEl.textContent = ''
}

function peakText(): string {
  if (peak.highest == null) return ''
  return `最高 ${formatNote(midiToName(peak.highest))}`
}

function slideStatus(midi: number, now: number): string {
  const read = samples.length > 0 ? readSlide(samples, midi, now) : null
  if (read?.passed) done.slide[step] = true
  if (!read?.touched) return phase === 'listening' ? '先碰到这个高音' : '点开始，碰一下再滑下去'
  if (read.passed) return '高音够短'
  if (!read.short) return '高音太长了'
  return '滑向低音'
}

function repeatStatus(midi: number, now: number): string {
  const read = samples.length > 0 ? readTilts(samples, midi, now) : { count: 0, openTooLong: false }
  if (read.count >= TILT_MIN) done.repeat[step] = true
  const dots = dotsEl.querySelectorAll('li')
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-done', index < read.count)
    dot.classList.toggle('is-now', phase === 'listening' && index === read.count && read.count < TILT_MIN)
  })
  if (read.openTooLong) return '这一下太长了，收掉再来'
  if (read.count >= TILT_MIN) return '三次了'
  if (phase === 'listening') return read.count > 0 ? '继续，至少三次' : '短短地环倾一下'
  return '点开始，至少三次环倾'
}

function longStatus(midi: number, now: number): string {
  const read = samples.length > 0 ? readSustain(samples, midi, now) : { heldMs: 0, live: false, away: false }
  if (read.heldMs > LONG_MIN_MS) done.long[step] = true
  if (read.heldMs > LONG_MIN_MS) return '超过 1 秒了'
  if (read.away) return '音离开了，再站住'
  if (phase === 'listening') return '站住，超过 1 秒'
  return '点开始，站住超过 1 秒'
}

function briefFor(): string {
  if (exercise === 'slide') return '用真声。碰一下这个高音，再滑向低音。高音不超过 1 秒。'
  if (exercise === 'repeat') return '在这个音上做短音。每次算一次环倾，至少三次。'
  return '在这个音上站住，超过 1 秒。'
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
    button.setAttribute('aria-pressed', index === step ? 'true' : 'false')
  })
}

function fillDots(): void {
  for (let index = 1; index <= TILT_MIN; index += 1) {
    const item = document.createElement('li')
    item.textContent = String(index)
    dotsEl.append(item)
  }
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

function storedStep(): number {
  const raw = localStorage.getItem(STEP_KEY)
  const value = raw == null || raw === '' ? 0 : Number(raw)
  if (!Number.isInteger(value) || value < 0 || value >= NOTES.length) return 0
  return value
}

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key)
  return allowed.find((item) => item === raw) ?? fallback
}
