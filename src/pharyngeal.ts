import { PitchListener, micErrorMessage } from './audio.ts'
import { playMidiSequence } from './scale-player.ts'
import {
  PeakHold,
  exerciseById,
  formatPracticeNote,
  labelForMidi,
  practiceSteps,
  preferScaleOctave,
  type PracticeExercise,
  type PracticeStep,
} from './scales.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import { silenceSpeech, speakNote } from './speak.ts'

const EXERCISE_KEY = 'pitch-reader-ph-exercise'
const STEP_KEY = 'pitch-reader-ph-step'
const QUIET_MS = 900
const ARM_MS = 700

const titleEl = document.querySelector<HTMLElement>('#ph-title')!
const ledeEl = document.querySelector<HTMLElement>('#ph-lede')!
const partEl = document.querySelector<HTMLElement>('#ph-part')!
const groupEl = document.querySelector<HTMLElement>('#ph-group')!
const notesEl = document.querySelector<HTMLOListElement>('#ph-notes')!
const noteEl = document.querySelector<HTMLElement>('#ph-note')!
const detailEl = document.querySelector<HTMLElement>('#ph-detail')!
const highestEl = document.querySelector<HTMLElement>('#ph-highest')!
const levelEl = document.querySelector<HTMLElement>('#ph-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#ph-gate')!
const playButton = document.querySelector<HTMLButtonElement>('#ph-play')!
const prevButton = document.querySelector<HTMLButtonElement>('#ph-prev')!
const nextButton = document.querySelector<HTMLButtonElement>('#ph-next')!
const statusEl = document.querySelector<HTMLElement>('#ph-status')!
const humButton = document.querySelector<HTMLButtonElement>('#ph-hum')!
const flexButton = document.querySelector<HTMLButtonElement>('#ph-flex')!
const root = document.querySelector<HTMLElement>('#pharyngeal')!

type Phase = 'idle' | 'playing' | 'singing' | 'result'

let exercise = exerciseById(readExercise())
let steps = practiceSteps(exercise)
let stepIndex = clampStep(Number(localStorage.getItem(STEP_KEY)))
let phase: Phase = 'idle'
let playIndex = -1
let abort: AbortController | null = null
let expectStop = false
let singStarted = 0
let quietSince = 0
let finishing = false
const peak = new PeakHold()

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'singing' || finishing) return
  const voiced = detection.result.midi
  if (voiced == null) {
    if (peak.highest == null || performance.now() - singStarted < ARM_MS) return
    if (!quietSince) quietSince = performance.now()
    if (performance.now() - quietSince >= QUIET_MS) finish(true)
    return
  }
  quietSince = 0
  const step = current()
  const folded = preferScaleOctave(voiced, step.group.low.midi, step.group.high.midi)
  const stable = detection.result.stable
  peak.push(folded, stable)
  const live = labelForMidi(folded, step.group.notes)
  noteEl.textContent = formatPracticeNote(live)
  noteEl.className = stable ? 'note is-stable' : 'note is-live'
  detailEl.textContent = stable
    ? peak.highest == null
      ? '再唱高一点'
      : `最高 ${shown(peak.highest)}`
    : '再稳一下才记最高音'
  paintNotes()
}, () => {
  if (expectStop) return
  if (phase === 'singing') finish(false)
})

subscribeSettings((settings) => {
  listener.rmsMin = gateToRms(settings.gate)
  listener.setHoldMs(settings.holdMs)
  gateMarkEl.style.left = `${gateMarkRatio(listener.rmsMin) * 100}%`
})

humButton.addEventListener('click', () => choose('hum'))
flexButton.addEventListener('click', () => choose('flex'))
prevButton.addEventListener('click', () => {
  move(-1)
})
nextButton.addEventListener('click', () => {
  if (current().index === current().count - 1) {
    finishRound()
    return
  }
  void playNext()
})
playButton.addEventListener('click', () => {
  if (phase === 'singing') finish(true)
  else void run()
})

render()

export function stopPharyngeal(): void {
  abort?.abort()
  abort = null
  if (phase === 'singing' || listener.mode !== 'idle') {
    expectStop = true
    listener.stop()
    expectStop = false
  }
  silenceSpeech()
  phase = 'idle'
  playIndex = -1
  finishing = false
  render()
}

export function handlePharyngealSpace(): void {
  if (phase === 'playing') return
  if (phase === 'singing') finish(true)
  else void run()
}

function choose(id: PracticeExercise['id']): void {
  if (phase === 'playing' || phase === 'singing') return
  exercise = exerciseById(id)
  steps = practiceSteps(exercise)
  stepIndex = 0
  localStorage.setItem(EXERCISE_KEY, id)
  localStorage.setItem(STEP_KEY, '0')
  phase = 'idle'
  render()
}

function move(delta: number): boolean {
  if (phase === 'playing' || phase === 'singing') return false
  const next = Math.min(steps.length - 1, Math.max(0, stepIndex + delta))
  if (next === stepIndex) return false
  stepIndex = next
  localStorage.setItem(STEP_KEY, String(stepIndex))
  phase = 'idle'
  playIndex = -1
  peak.reset()
  render()
  return true
}

function finishRound(): void {
  if (phase === 'playing' || phase === 'singing') return
  stepIndex = 0
  localStorage.setItem(STEP_KEY, '0')
  phase = 'idle'
  playIndex = -1
  peak.reset()
  render()
}

async function playNext(): Promise<void> {
  if (!move(1)) return
  await run()
}

async function run(): Promise<void> {
  if (phase === 'playing' || phase === 'singing') return
  const played = await playScale()
  if (!played) return
  phase = 'singing'
  singStarted = performance.now()
  quietSince = 0
  finishing = false
  peak.reset()
  render()
  try {
    const started = await listener.startMic()
    if (!started || abort?.signal.aborted) {
      phase = 'idle'
      render()
      return
    }
  } catch (error) {
    phase = 'idle'
    statusEl.textContent = micErrorMessage(error)
    render()
  }
}

async function playScale(): Promise<boolean> {
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  phase = 'playing'
  playIndex = -1
  statusEl.textContent = ''
  peak.reset()
  render()
  try {
    await playMidiSequence(
      current().group.notes.map((note) => note.midi),
      (index) => {
        playIndex = index
        const label = current().group.notes[index].label
        noteEl.textContent = formatPracticeNote(label)
        noteEl.className = 'note is-live'
        detailEl.textContent = '听这个音，跟下去'
        paintNotes()
      },
      controller.signal,
    )
  } catch (error) {
    if (controller.signal.aborted) return false
    phase = 'idle'
    statusEl.textContent = error instanceof Error ? error.message : '音阶没有播出来。'
    render()
    return false
  }
  if (controller.signal.aborted || abort !== controller) return false
  playIndex = -1
  return true
}

function finish(speak: boolean): void {
  if (phase !== 'singing' || finishing) return
  finishing = true
  const highest = peak.highest
  expectStop = true
  listener.stop()
  expectStop = false
  phase = 'result'
  playIndex = -1
  finishing = false
  render()
  if (!speak || highest == null) return
  speakNote(labelForMidi(highest, current().group.notes))
}

function render(): void {
  const step = current()
  const busy = phase === 'playing' || phase === 'singing'
  titleEl.textContent = exercise.title
  ledeEl.textContent = exercise.lede
  humButton.setAttribute('aria-pressed', exercise.id === 'hum' ? 'true' : 'false')
  flexButton.setAttribute('aria-pressed', exercise.id === 'flex' ? 'true' : 'false')
  const showPart = exercise.parts.length > 1
  partEl.hidden = !showPart
  partEl.textContent = showPart ? step.part.title : ''
  groupEl.textContent = `第 ${step.group.number} 组 · 基准 ${formatPracticeNote(step.group.low.label)}、${formatPracticeNote(step.group.high.label)} · ${step.index + 1}/${step.count}`
  const last = step.index === step.count - 1
  prevButton.disabled = busy || step.index === 0
  nextButton.disabled = busy
  nextButton.textContent = last ? '完成' : '下一组'
  humButton.disabled = busy
  flexButton.disabled = busy
  playButton.disabled = phase === 'playing'
  playButton.textContent =
    phase === 'playing' ? '正在播放…' : phase === 'singing' ? '唱完了' : phase === 'result' ? '再来一次' : '播放并跟唱'
  paintNotes()
  if (phase === 'idle') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '播放音阶，然后唱到最高音'
    highestEl.textContent = ''
    renderMeter(0)
  } else if (phase === 'singing' && peak.highest == null) {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '现在唱，够到最高的音'
    highestEl.textContent = ''
  } else if (phase === 'result') {
    showResult()
  }
  root.dataset.state = phase
}

function showResult(): void {
  const step = current()
  const highest = peak.highest
  if (highest == null) {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '这次没有稳住一个音'
    highestEl.textContent = ''
    return
  }
  const label = labelForMidi(highest, step.group.notes)
  const reached = highest >= step.group.high.midi
  noteEl.textContent = formatPracticeNote(label)
  noteEl.className = reached ? 'note is-tuned' : 'note is-stable'
  detailEl.textContent = reached
    ? '到了这组的最高音'
    : `还没到 ${formatPracticeNote(step.group.high.label)}`
  highestEl.textContent = `最高 ${formatPracticeNote(label)}`
}

function paintNotes(): void {
  const step = current()
  const highest = peak.highest
  notesEl.replaceChildren(
    ...step.group.notes.map((note, index) => {
      const item = document.createElement('li')
      item.textContent = formatPracticeNote(note.label)
      if (note.midi === step.group.high.midi) item.classList.add('is-peak')
      if (index === playIndex) item.classList.add('is-now')
      if (highest != null && note.midi <= highest) item.classList.add('is-reached')
      return item
    }),
  )
}

function shown(midi: number): string {
  return formatPracticeNote(labelForMidi(midi, current().group.notes))
}

function current(): PracticeStep {
  return steps[stepIndex]
}

function renderMeter(rms: number): void {
  const level = Math.min(1, Math.sqrt(rms) / 0.45)
  levelEl.style.transform = `scaleX(${level})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}

function readExercise(): PracticeExercise['id'] {
  return localStorage.getItem(EXERCISE_KEY) === 'flex' ? 'flex' : 'hum'
}

function clampStep(value: number): number {
  if (!Number.isInteger(value)) return 0
  return Math.min(steps.length - 1, Math.max(0, value))
}
