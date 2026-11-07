import { PitchListener, micErrorMessage } from './audio.ts'
import { formatNote, freqToMidi, midiToName } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import {
  LONG_MIN_MS,
  TILT_MIN,
  readSlide,
  readSustain,
  readTilts,
  scaleNotes,
  type PitchSample,
} from './tilt-read.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
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
const waveEl = document.querySelector<SVGSVGElement>('#tilt-wave')!
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
  abort?.abort()
  haltMic()
  if (phase === 'listening') phase = 'idle'
  render()
}

async function toggle(): Promise<void> {
  if (phase === 'listening') {
    stopTilt()
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

function clearTake(): void {
  samples = []
  boutOrigin = 0
  quietSince = null
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

  if (exercise === 'slide') renderSlide(midi, now)
  else if (exercise === 'repeat') renderRepeat(midi, now)
  else renderLong(midi, now)
  paintWave(midi)
}

function renderSlide(midi: number, now: number): void {
  const read = samples.length > 0 ? readSlide(samples, midi, now) : null
  if (read?.passed) done.slide[step] = true
  const seconds = read?.touched ? read.peakMs / 1000 : 0
  noteEl.textContent = seconds > 0 ? seconds.toFixed(1) : '·'
  noteEl.classList.toggle('is-empty', seconds <= 0)
  if (!read?.touched) {
    detailEl.textContent = phase === 'listening' ? '先碰到这个高音' : '点开始，碰一下再滑下去'
    extraEl.textContent = ''
    return
  }
  if (read.passed) detailEl.textContent = '高音够短'
  else if (!read.short) detailEl.textContent = '高音太长了'
  else detailEl.textContent = '滑向低音'
  extraEl.textContent = read.passed ? '这个音可以了' : ''
}

function renderRepeat(midi: number, now: number): void {
  const read = samples.length > 0 ? readTilts(samples, midi, now) : { count: 0, openTooLong: false }
  if (read.count >= TILT_MIN) done.repeat[step] = true
  noteEl.textContent = read.count > 0 ? String(read.count) : '·'
  noteEl.classList.toggle('is-empty', read.count === 0)
  if (read.openTooLong) detailEl.textContent = '这一下太长了，收掉再来'
  else if (read.count >= TILT_MIN) detailEl.textContent = '三次了'
  else if (phase === 'listening') detailEl.textContent = read.count > 0 ? '继续，至少三次' : '短短地环倾一下'
  else detailEl.textContent = '点开始，至少三次环倾'
  extraEl.textContent = read.count >= TILT_MIN ? '这个音可以了' : ''
  const dots = dotsEl.querySelectorAll('li')
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-done', index < read.count)
    dot.classList.toggle('is-now', phase === 'listening' && index === read.count && read.count < TILT_MIN)
  })
}

function renderLong(midi: number, now: number): void {
  const read = samples.length > 0 ? readSustain(samples, midi, now) : { heldMs: 0, live: false, away: false }
  if (read.heldMs >= LONG_MIN_MS) done.long[step] = true
  const seconds = read.heldMs / 1000
  noteEl.textContent = seconds > 0 ? seconds.toFixed(1) : '·'
  noteEl.classList.toggle('is-empty', seconds <= 0)
  if (read.heldMs >= LONG_MIN_MS) detailEl.textContent = '三秒了'
  else if (read.away) detailEl.textContent = '音离开了，再站住'
  else if (phase === 'listening') detailEl.textContent = '站住，超过 3 秒'
  else detailEl.textContent = seconds > 0 ? '再站住一会儿' : '点开始，站住 3 秒以上'
  extraEl.textContent = read.heldMs >= LONG_MIN_MS ? '这个音可以了' : ''
}

function briefFor(): string {
  if (exercise === 'slide') return '用真声。碰一下这个高音，再滑向低音。高音不超过 1 秒。'
  if (exercise === 'repeat') return '在这个音上做短音。每次算一次环倾，至少三次。'
  return '在这个音上站住，超过 3 秒。'
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

function paintWave(target: number): void {
  waveEl.replaceChildren()
  const axisY = exercise === 'slide' ? 28 : 60
  waveEl.append(guide(axisY, exercise === 'slide' ? formatNote(midiToName(target)) : ''))
  if (samples.length < 2) return
  const end = samples[samples.length - 1].time
  const start = exercise === 'slide' ? samples[0].time : Math.max(samples[0].time, end - 4000)
  const span = Math.max(300, end - start)
  const windowed = samples.filter((sample) => sample.time >= start)
  const path = document.createElementNS(SVG_NS, 'polyline')
  path.setAttribute('points', windowed.map((sample) => {
    const y = exercise === 'slide'
      ? Math.min(112, Math.max(8, axisY + (target - sample.midi) * 18))
      : Math.min(112, Math.max(8, 60 - ((sample.midi - target) * 100 / 150) * 48))
    const x = 36 + ((sample.time - start) / span) * 316
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' '))
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#f0b429')
  path.setAttribute('stroke-width', '2.5')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('stroke-linecap', 'round')
  waveEl.append(path)
}

function guide(y: number, label: string): SVGGElement {
  const group = document.createElementNS(SVG_NS, 'g')
  const axis = document.createElementNS(SVG_NS, 'line')
  axis.setAttribute('x1', '36')
  axis.setAttribute('x2', '352')
  axis.setAttribute('y1', String(y))
  axis.setAttribute('y2', String(y))
  axis.setAttribute('stroke', '#313228')
  axis.setAttribute('stroke-width', '1')
  group.append(axis)
  if (label) {
    const text = document.createElementNS(SVG_NS, 'text')
    text.setAttribute('x', '8')
    text.setAttribute('y', String(y + 4))
    text.setAttribute('fill', '#9a9588')
    text.setAttribute('font-size', '12')
    text.textContent = label
    group.append(text)
  }
  return group
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
