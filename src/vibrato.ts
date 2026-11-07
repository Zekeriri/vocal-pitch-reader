import { PitchListener, micErrorMessage } from './audio.ts'
import { freqToMidi } from './pitch.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import {
  CYCLE_MARKS,
  CYCLE_MIN,
  SPEEDS,
  readVibrato,
  speedForRate,
  type VibratoRead,
  type VibratoSample,
  type VibratoSpeed,
} from './vibrato-read.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const VOWEL_KEY = 'pitch-reader-vib-vowel'
const REGISTER_KEY = 'pitch-reader-vib-register'
const EXERCISE_KEY = 'pitch-reader-vib-exercise'
const GOAL_KEY = 'pitch-reader-vib-goal'
const QUIET_MS = 650
const WAVE_MS = 2000
const VOWELS = ['a', 'i', 'u', 'e', 'o'] as const
const noteEl = document.querySelector<HTMLElement>('#vib-note')!
const detailEl = document.querySelector<HTMLElement>('#vib-detail')!
const extraEl = document.querySelector<HTMLElement>('#vib-extra')!
const levelEl = document.querySelector<HTMLElement>('#vib-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#vib-gate')!
const startButton = document.querySelector<HTMLButtonElement>('#vib-start')!
const statusEl = document.querySelector<HTMLElement>('#vib-status')!
const vowelPanel = document.querySelector<HTMLElement>('#vib-vowel')!
const speedPanel = document.querySelector<HTMLElement>('#vib-speed')!
const vowelTab = document.querySelector<HTMLButtonElement>('#vib-tab-vowel')!
const speedTab = document.querySelector<HTMLButtonElement>('#vib-tab-speed')!
const dotsEl = document.querySelector<HTMLOListElement>('#vib-dots')!
const waveEl = document.querySelector<SVGSVGElement>('#vib-wave')!
const vowelButtons = document.querySelectorAll<HTMLButtonElement>('[data-vowel]')
const registerButtons = document.querySelectorAll<HTMLButtonElement>('[data-register]')
const speedButtons = document.querySelectorAll<HTMLButtonElement>('[data-speed]')

type Exercise = 'vowel' | 'speed'
type Phase = 'idle' | 'listening'

let phase: Phase = 'idle'
let samples: VibratoSample[] = []
let boutOrigin = 0
let frozen: VibratoRead | null = null
let silentSince: number | null = null
let expectStop = false
let exercise: Exercise = storedChoice(EXERCISE_KEY, ['vowel', 'speed'], 'vowel')
let goal: VibratoSpeed = storedChoice(GOAL_KEY, ['slow', 'medium', 'fast', 'faster'], 'slow')

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'listening') return
  const now = performance.now()
  if (detection.result.freq == null) {
    if (samples.length > 0 && silentSince == null) silentSince = now
    if (silentSince != null && now - silentSince >= QUIET_MS && frozen == null) {
      frozen = readVibrato(samples, samples.at(-1)?.time ?? 0)
    }
    render()
    return
  }
  if (frozen) {
    samples = []
    frozen = null
  }
  silentSince = null
  if (samples.length === 0) boutOrigin = now
  samples.push({ time: now - boutOrigin, midi: freqToMidi(detection.result.freq) })
  if (samples.length > 4000) samples.splice(0, samples.length - 4000)
  render()
}, () => {
  if (expectStop || phase !== 'listening') return
  phase = 'idle'
  freeze()
  render()
})

subscribeSettings((settings) => {
  listener.rmsMin = gateToRms(settings.gate)
  listener.setHoldMs(settings.holdMs)
  gateMarkEl.style.left = `${gateMarkRatio(listener.rmsMin) * 100}%`
})

fillDots()
applyExercise()
applyChoices()
render()

startButton.addEventListener('click', () => {
  void toggle()
})
vowelTab.addEventListener('click', () => setExercise('vowel'))
speedTab.addEventListener('click', () => setExercise('speed'))
for (const button of vowelButtons) {
  button.addEventListener('click', () => {
    localStorage.setItem(VOWEL_KEY, button.dataset.vowel ?? 'a')
    applyChoices()
  })
}
for (const button of registerButtons) {
  button.addEventListener('click', () => {
    localStorage.setItem(REGISTER_KEY, button.dataset.register ?? 'head')
    applyChoices()
  })
}
for (const button of speedButtons) {
  button.addEventListener('click', () => {
    const next = button.dataset.speed
    if (next !== 'slow' && next !== 'medium' && next !== 'fast' && next !== 'faster') return
    goal = next
    localStorage.setItem(GOAL_KEY, goal)
    applyChoices()
    render()
  })
}

export function handleVibratoSpace(): void {
  void toggle()
}

export function stopVibrato(): void {
  haltMic()
  if (phase === 'listening') {
    phase = 'idle'
    freeze()
  }
  render()
}

async function toggle(): Promise<void> {
  if (phase === 'listening') {
    stopVibrato()
    return
  }
  samples = []
  frozen = null
  silentSince = null
  boutOrigin = 0
  statusEl.textContent = ''
  startButton.disabled = true
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

function freeze(): void {
  if (samples.length === 0 || frozen) return
  frozen = readVibrato(samples, samples.at(-1)?.time ?? 0)
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
  applyExercise()
  render()
}

function applyExercise(): void {
  vowelPanel.hidden = exercise !== 'vowel'
  speedPanel.hidden = exercise !== 'speed'
  vowelTab.setAttribute('aria-pressed', exercise === 'vowel' ? 'true' : 'false')
  speedTab.setAttribute('aria-pressed', exercise === 'speed' ? 'true' : 'false')
}

function applyChoices(): void {
  const vowel = storedChoice(VOWEL_KEY, VOWELS, 'a')
  const register = storedChoice(REGISTER_KEY, ['head', 'chest'], 'head')
  for (const button of vowelButtons) {
    button.setAttribute('aria-pressed', button.dataset.vowel === vowel ? 'true' : 'false')
  }
  for (const button of registerButtons) {
    button.setAttribute('aria-pressed', button.dataset.register === register ? 'true' : 'false')
  }
  for (const button of speedButtons) {
    button.setAttribute('aria-pressed', button.dataset.speed === goal ? 'true' : 'false')
  }
}

function fillDots(): void {
  for (let index = 1; index <= CYCLE_MARKS; index += 1) {
    const item = document.createElement('li')
    item.textContent = String(index)
    dotsEl.append(item)
  }
}

function render(): void {
  const read = currentRead()
  const speed = read?.rate != null ? speedForRate(read.rate) : null
  const cycles = read?.cycles ?? 0
  noteEl.textContent = cycles > 0 ? String(cycles) : '·'
  noteEl.classList.toggle('is-empty', cycles === 0)
  detailEl.textContent = detailFor(read, speed)
  extraEl.textContent = extraFor(read, speed)
  startButton.disabled = false
  startButton.textContent = phase === 'listening' ? '结束' : '开始数'
  const dots = dotsEl.querySelectorAll('li')
  dots.forEach((dot, index) => {
    dot.classList.toggle('is-done', index < cycles)
    dot.classList.toggle('is-now', phase === 'listening' && index === cycles && cycles < CYCLE_MARKS)
  })
  for (const button of speedButtons) {
    button.classList.toggle('is-now', button.dataset.speed === speed)
  }
  paintWave(samples)
}

function currentRead(): VibratoRead | null {
  if (frozen) return frozen
  if (samples.length < 4) return null
  return readVibrato(samples, samples.at(-1)?.time ?? 0)
}

function detailFor(read: VibratoRead | null, speed: VibratoSpeed | null): string {
  if (read?.rate != null && speed) {
    const title = SPEEDS.find((item) => item.id === speed)?.title ?? ''
    return `${read.rate.toFixed(1)} 次/秒 · ${title}`
  }
  if (phase === 'listening') return samples.length > 0 ? '再颤开一点' : '唱着，让音高轻轻晃起来'
  if (frozen) return '这次还没形成颤音'
  return '点开始数，在舒服的音上颤起来'
}

function extraFor(read: VibratoRead | null, speed: VibratoSpeed | null): string {
  const cycles = read?.cycles ?? 0
  if (exercise === 'speed' && speed) {
    const order = SPEEDS.map((item) => item.id)
    const live = order.indexOf(speed)
    const target = order.indexOf(goal)
    if (live === target) return '到这个速度了，稳住'
    if (live < target) return '稳住了再加快，不推气'
    return '已经过了这个速度'
  }
  if (cycles >= CYCLE_MARKS) return '这组九次了'
  if (cycles >= CYCLE_MIN) return '七次了，可以收'
  if (phase === 'listening' && cycles > 0) return '继续，数到七次'
  return ''
}

function paintWave(bout: readonly VibratoSample[]): void {
  waveEl.replaceChildren()
  const axis = document.createElementNS(SVG_NS, 'line')
  axis.setAttribute('x1', '8')
  axis.setAttribute('x2', '352')
  axis.setAttribute('y1', '60')
  axis.setAttribute('y2', '60')
  axis.setAttribute('stroke', '#313228')
  axis.setAttribute('stroke-width', '1')
  waveEl.append(axis)
  if (bout.length < 2) return
  const end = bout[bout.length - 1].time
  const windowed = bout.filter((sample) => sample.time >= end - WAVE_MS)
  const center = windowed.reduce((sum, sample) => sum + sample.midi, 0) / windowed.length
  const start = end - WAVE_MS
  const points = windowed.map((sample) => {
    const x = 8 + ((sample.time - start) / WAVE_MS) * 344
    const cents = (sample.midi - center) * 100
    const y = Math.min(112, Math.max(8, 60 - (cents / 80) * 48))
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const line = document.createElementNS(SVG_NS, 'polyline')
  line.setAttribute('points', points.join(' '))
  line.setAttribute('fill', 'none')
  line.setAttribute('stroke', '#f0b429')
  line.setAttribute('stroke-width', '2.5')
  line.setAttribute('stroke-linejoin', 'round')
  line.setAttribute('stroke-linecap', 'round')
  waveEl.append(line)
}

function renderMeter(rms: number): void {
  const ratio = Math.min(1, rms / 0.08)
  levelEl.style.transform = `scaleX(${ratio})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}

function storedChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = localStorage.getItem(key)
  return allowed.find((item) => item === raw) ?? fallback
}
