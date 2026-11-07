import { PitchListener, micErrorMessage } from './audio.ts'
import { formatNote, freqToMidi, midiToName } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import {
  LONG_MIN_MS,
  SLIDE_FROM,
  SLIDE_LIMIT_MS,
  SLIDE_TO,
  TILT_MIN,
  readSlide,
  readSustain,
  readTilts,
  type PitchSample,
} from './tilt-read.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const EXERCISE_KEY = 'pitch-reader-tilt-exercise'
const PITCH_KEY = 'pitch-reader-tilt-pitch'
const PITCH_LOW = 45
const PITCH_HIGH = 72
const SLIDE_RESET_MS = 450

const noteEl = document.querySelector<HTMLElement>('#tilt-note')!
const detailEl = document.querySelector<HTMLElement>('#tilt-detail')!
const extraEl = document.querySelector<HTMLElement>('#tilt-extra')!
const briefEl = document.querySelector<HTMLElement>('#tilt-brief')!
const levelEl = document.querySelector<HTMLElement>('#tilt-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#tilt-gate')!
const startButton = document.querySelector<HTMLButtonElement>('#tilt-start')!
const hearButton = document.querySelector<HTMLButtonElement>('#tilt-hear')!
const statusEl = document.querySelector<HTMLElement>('#tilt-status')!
const pitchLabel = document.querySelector<HTMLElement>('#tilt-pitch-label')!
const pitchSelect = document.querySelector<HTMLSelectElement>('#tilt-pitch')!
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

fillPitch()
fillDots()
render()

startButton.addEventListener('click', () => {
  void toggle()
})
hearButton.addEventListener('click', () => {
  void hear()
})
slideTab.addEventListener('click', () => setExercise('slide'))
repeatTab.addEventListener('click', () => setExercise('repeat'))
longTab.addEventListener('click', () => setExercise('long'))
pitchSelect.addEventListener('change', () => {
  localStorage.setItem(PITCH_KEY, pitchSelect.value)
  clearTake()
  render()
})

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
  const notes = exercise === 'slide' ? [SLIDE_FROM, SLIDE_TO] : [selectedPitch()]
  const lengths = exercise === 'slide' ? [0.4, 0.4] : undefined
  try {
    await playMidiSequence(notes, () => {}, controller.signal, lengths)
  } catch (error) {
    if (!controller.signal.aborted) {
      statusEl.textContent = error instanceof Error ? error.message : '没播出来。'
    }
  } finally {
    if (abort === controller) hearButton.disabled = false
  }
}

function haltMic(): void {
  if (listener.mode === 'idle') return
  expectStop = true
  listener.stop()
  expectStop = false
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

function selectedPitch(): number {
  return storedMidi(PITCH_KEY, 60)
}

function clock(): number {
  const last = samples[samples.length - 1]?.time ?? 0
  if (phase !== 'listening') return last + 1000
  if (samples.length === 0) return 0
  return performance.now() - boutOrigin
}

function render(): void {
  const pitch = selectedPitch()
  const now = clock()
  slideTab.setAttribute('aria-pressed', exercise === 'slide' ? 'true' : 'false')
  repeatTab.setAttribute('aria-pressed', exercise === 'repeat' ? 'true' : 'false')
  longTab.setAttribute('aria-pressed', exercise === 'long' ? 'true' : 'false')
  pitchLabel.hidden = exercise === 'slide'
  hearButton.textContent = exercise === 'slide' ? '听 C5 到 C4' : '听这个音'
  hearButton.disabled = phase === 'listening'
  startButton.disabled = false
  startButton.textContent = phase === 'listening' ? '结束' : '开始'
  dotsEl.hidden = exercise !== 'repeat'
  briefEl.textContent = briefFor()

  if (exercise === 'slide') renderSlide()
  else if (exercise === 'repeat') renderRepeat(pitch, now)
  else renderLong(pitch, now)
  paintWave(pitch)
}

function renderSlide(): void {
  const read = samples.length >= 3 ? readSlide(samples) : null
  const seconds = read ? read.durationMs / 1000 : 0
  noteEl.textContent = seconds > 0 ? seconds.toFixed(1) : '·'
  noteEl.classList.toggle('is-empty', seconds <= 0)
  if (!read) {
    detailEl.textContent = phase === 'listening' ? '从 C5 滑到 C4' : '点开始，用真声滑下来'
    extraEl.textContent = ''
    return
  }
  detailEl.textContent = read.covered && read.short ? '够短' : read.covered ? '再短一点' : '从 C5 滑到 C4'
  extraEl.textContent = read.short ? '' : read.durationMs > SLIDE_LIMIT_MS ? '这一下超过 1 秒了' : ''
}

function renderRepeat(pitch: number, now: number): void {
  const read = samples.length > 0 ? readTilts(samples, pitch, now) : { count: 0, openTooLong: false }
  noteEl.textContent = read.count > 0 ? String(read.count) : '·'
  noteEl.classList.toggle('is-empty', read.count === 0)
  if (read.openTooLong) detailEl.textContent = '这一下太长了，收掉再来'
  else if (read.count >= TILT_MIN) detailEl.textContent = '三次了'
  else if (phase === 'listening') detailEl.textContent = read.count > 0 ? '继续，至少三次' : '短短地环倾一下'
  else detailEl.textContent = '点开始，至少三次环倾'
  extraEl.textContent = ''
  const dots = dotsEl.querySelectorAll('li')
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-done', index < read.count)
    dot.classList.toggle('is-now', phase === 'listening' && index === read.count && read.count < TILT_MIN)
  })
}

function renderLong(pitch: number, now: number): void {
  const read = samples.length > 0 ? readSustain(samples, pitch, now) : { heldMs: 0, live: false, away: false }
  const seconds = read.heldMs / 1000
  noteEl.textContent = seconds > 0 ? seconds.toFixed(1) : '·'
  noteEl.classList.toggle('is-empty', seconds <= 0)
  if (read.heldMs >= LONG_MIN_MS) detailEl.textContent = '三秒了'
  else if (read.away) detailEl.textContent = '音离开了，再站住'
  else if (phase === 'listening') detailEl.textContent = '站住，超过 3 秒'
  else detailEl.textContent = '点开始，站住 3 秒以上'
  extraEl.textContent = ''
}

function briefFor(): string {
  if (exercise === 'slide') return '用真声，从 C5 滑到 C4。这一下不超过 1 秒。'
  if (exercise === 'repeat') return '在选定的音上做短音。每次算一次环倾，至少三次。'
  return '在选定的音上站住，超过 3 秒。'
}

function paintWave(target: number): void {
  waveEl.replaceChildren()
  if (exercise === 'slide') paintSlide()
  else paintAround(target)
}

function paintSlide(): void {
  guide(SLIDE_FROM, 'C5')
  guide(SLIDE_TO, 'C4')
  if (samples.length < 2) return
  const end = samples[samples.length - 1].time
  const start = samples[0].time
  const span = Math.max(300, end - start)
  stroke(samples.map((sample) => point(8 + ((sample.time - start) / span) * 344, slideY(sample.midi))))
}

function paintAround(target: number): void {
  const axis = line(8, 60, 352, 60, '#313228')
  waveEl.append(axis)
  if (samples.length < 2) return
  const end = samples[samples.length - 1].time
  const start = Math.max(samples[0].time, end - 4000)
  const windowed = samples.filter((sample) => sample.time >= start)
  const span = Math.max(300, end - start)
  stroke(windowed.map((sample) => {
    const cents = (sample.midi - target) * 100
    const y = Math.min(112, Math.max(8, 60 - (cents / 150) * 48))
    return point(8 + ((sample.time - start) / span) * 344, y)
  }))
}

function guide(midi: number, label: string): void {
  const y = slideY(midi)
  waveEl.append(line(36, y, 352, y, '#313228'))
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute('x', '8')
  text.setAttribute('y', String(y + 4))
  text.setAttribute('fill', '#9a9588')
  text.setAttribute('font-size', '12')
  text.textContent = label
  waveEl.append(text)
}

function slideY(midi: number): number {
  return Math.min(112, Math.max(8, 8 + ((74 - midi) / 16) * 104))
}

function stroke(points: string[]): void {
  const path = document.createElementNS(SVG_NS, 'polyline')
  path.setAttribute('points', points.join(' '))
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', '#f0b429')
  path.setAttribute('stroke-width', '2.5')
  path.setAttribute('stroke-linejoin', 'round')
  path.setAttribute('stroke-linecap', 'round')
  waveEl.append(path)
}

function line(x1: number, y1: number, x2: number, y2: number, color: string): SVGLineElement {
  const axis = document.createElementNS(SVG_NS, 'line')
  axis.setAttribute('x1', String(x1))
  axis.setAttribute('y1', String(y1))
  axis.setAttribute('x2', String(x2))
  axis.setAttribute('y2', String(y2))
  axis.setAttribute('stroke', color)
  axis.setAttribute('stroke-width', '1')
  return axis
}

function point(x: number, y: number): string {
  return `${x.toFixed(1)},${y.toFixed(1)}`
}

function renderMeter(rms: number): void {
  const ratio = Math.min(1, rms / 0.08)
  levelEl.style.transform = `scaleX(${ratio})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}

function fillPitch(): void {
  for (let midi = PITCH_LOW; midi <= PITCH_HIGH; midi += 1) {
    const option = document.createElement('option')
    option.value = String(midi)
    option.textContent = formatNote(midiToName(midi))
    pitchSelect.append(option)
  }
  pitchSelect.value = String(selectedPitch())
}

function fillDots(): void {
  for (let index = 1; index <= TILT_MIN; index += 1) {
    const item = document.createElement('li')
    item.textContent = String(index)
    dotsEl.append(item)
  }
}

function storedMidi(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw == null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < PITCH_LOW || value > PITCH_HIGH) return fallback
  return value
}

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key)
  return allowed.find((item) => item === raw) ?? fallback
}
