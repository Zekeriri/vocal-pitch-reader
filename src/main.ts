import { PitchListener, micErrorMessage } from './audio.ts'
import { handleIntonationSpace, stopIntonation } from './intonation.ts'
import { handlePharyngealSpace, stopPharyngeal } from './pharyngeal.ts'
import { describeCents, formatNote } from './pitch.ts'
import { canSpeak, prepareSpeech, silenceSpeech, speakNote } from './speak.ts'
import './style.css'

const HOLD_KEY = 'pitch-reader-hold'
const GATE_KEY = 'pitch-reader-gate'

const noteEl = document.querySelector<HTMLElement>('#note')!
const detailEl = document.querySelector<HTMLElement>('#detail')!
const spokenEl = document.querySelector<HTMLElement>('#spoken')!
const statusEl = document.querySelector<HTMLElement>('#status')!
const markEl = document.querySelector<HTMLElement>('#mark')!
const levelEl = document.querySelector<HTMLElement>('#level')!
const gateMarkEl = document.querySelector<HTMLElement>('#gate-mark')!
const listenButton = document.querySelector<HTMLButtonElement>('#listen')!
const testButton = document.querySelector<HTMLButtonElement>('#self-test')!
const holdInput = document.querySelector<HTMLInputElement>('#hold')!
const holdValue = document.querySelector<HTMLElement>('#hold-value')!
const gateInput = document.querySelector<HTMLInputElement>('#gate')!
const gateValue = document.querySelector<HTMLElement>('#gate-value')!
const stage = document.querySelector<HTMLElement>('#stage')!
const pharyngeal = document.querySelector<HTMLElement>('#pharyngeal')!
const intonation = document.querySelector<HTMLElement>('#intonation')!
const modeButtons = document.querySelectorAll<HTMLButtonElement>('[data-mode]')

const listener = new PitchListener(renderDetection, onListenerStop)
let speechWarned = false
let clearTimer = 0

prepareSpeech()
restoreSettings()
syncGateMark()
renderIdle()

listenButton.addEventListener('click', () => {
  void toggleMic()
})

testButton.addEventListener('click', () => {
  void runTest()
})

holdInput.addEventListener('input', () => {
  const ms = Number(holdInput.value)
  listener.setHoldMs(ms)
  holdValue.textContent = `${(ms / 1000).toFixed(2)} 秒`
  localStorage.setItem(HOLD_KEY, String(ms))
})

gateInput.addEventListener('input', () => {
  applyGate(Number(gateInput.value))
  localStorage.setItem(GATE_KEY, gateInput.value)
})

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || event.repeat) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
  event.preventDefault()
  if (!pharyngeal.hidden) {
    handlePharyngealSpace()
    return
  }
  if (!intonation.hidden) {
    handleIntonationSpace()
    return
  }
  void toggleMic()
})

for (const button of modeButtons) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode ?? 'tuner'
    stage.hidden = mode !== 'tuner'
    pharyngeal.hidden = mode !== 'pharyngeal'
    intonation.hidden = mode !== 'intonation'
    for (const item of modeButtons) {
      item.setAttribute('aria-pressed', item === button ? 'true' : 'false')
    }
    silenceSpeech()
    if (mode !== 'tuner') listener.stop()
    if (mode !== 'pharyngeal') stopPharyngeal()
    if (mode !== 'intonation') stopIntonation()
  })
}

async function toggleMic(): Promise<void> {
  if (listener.mode !== 'idle') {
    listener.stop()
    return
  }
  statusEl.textContent = ''
  listenButton.disabled = true
  testButton.disabled = true
  listenButton.textContent = '正在打开…'
  try {
    const started = await listener.startMic()
    if (!started) {
      renderIdle()
      return
    }
    setListeningButtons()
    detailEl.textContent = '在听'
  } catch (error) {
    listener.stop()
    renderIdle()
    statusEl.textContent = micErrorMessage(error)
  }
}

async function runTest(): Promise<void> {
  if (listener.mode === 'test') return
  statusEl.textContent = ''
  listenButton.disabled = true
  testButton.disabled = true
  testButton.textContent = '正在试听…'
  try {
    const started = await listener.startTest(196)
    if (!started) {
      renderIdle()
      return
    }
    detailEl.textContent = '正在播放 G3'
  } catch (error) {
    listener.stop()
    renderIdle()
    statusEl.textContent = error instanceof Error ? error.message : '试听失败。'
  }
}

function renderDetection(detection: {
  mode: 'mic' | 'test'
  rms: number
  result: {
    note: string | null
    cents: number | null
    freq: number | null
    stable: boolean
    announce: string | null
  }
  speaking: boolean
}): void {
  renderMeter(detection.rms)
  if (detection.speaking) return
  const { result } = detection
  if (result.announce) {
    spokenEl.textContent = `念了 ${formatNote(result.announce)}`
    const spoke = speakNote(result.announce)
    if (!spoke && !speechWarned) {
      speechWarned = true
      statusEl.textContent = '这台浏览器不会朗读，音名只显示在这里。'
    }
  }
  if (!result.note || result.freq == null || result.cents == null) {
    scheduleClear(detection.mode)
    return
  }
  window.clearTimeout(clearTimer)
  clearTimer = 0
  noteEl.textContent = formatNote(result.note)
  const tuned = Math.abs(result.cents) < 8
  noteEl.className = result.stable ? (tuned ? 'note is-tuned' : 'note is-stable') : 'note is-live'
  const hz = Math.round(result.freq)
  detailEl.textContent = result.stable
    ? `${hz} Hz · ${describeCents(result.cents)}`
    : `${hz} Hz · 再稳一下`
  const clamped = Math.max(-50, Math.min(50, result.cents))
  markEl.hidden = false
  markEl.style.left = `${((clamped + 50) / 100) * 100}%`
  stage.dataset.state = result.stable ? 'stable' : 'live'
}

function renderMeter(rms: number): void {
  const level = Math.min(1, Math.sqrt(rms) / 0.45)
  levelEl.style.transform = `scaleX(${level})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}

function onListenerStop(kind: 'mic' | 'test'): void {
  if (kind === 'mic') {
    silenceSpeech()
    renderIdle()
    return
  }
  resetControls()
}

function renderIdle(): void {
  window.clearTimeout(clearTimer)
  clearTimer = 0
  resetControls()
  noteEl.textContent = '·'
  noteEl.className = 'note is-empty'
  detailEl.textContent = '打开麦克风，唱一个音'
  hideMark()
  renderMeter(0)
  if (!canSpeak()) statusEl.textContent = '这台浏览器不会朗读，音名只显示在这里。'
}

function resetControls(): void {
  listener.setHoldMs(Number(holdInput.value))
  listenButton.disabled = false
  testButton.disabled = false
  listenButton.textContent = '开始听'
  listenButton.setAttribute('aria-pressed', 'false')
  testButton.textContent = '试听 G3'
  stage.dataset.state = 'idle'
  renderMeter(0)
}

function scheduleClear(mode: 'mic' | 'test'): void {
  if (clearTimer) return
  clearTimer = window.setTimeout(() => {
    clearTimer = 0
    if (listener.mode === 'idle') return
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = mode === 'test' ? '正在播放 G3' : '在听'
    hideMark()
  }, 180)
}

function setListeningButtons(): void {
  listenButton.disabled = false
  testButton.disabled = false
  listenButton.textContent = '停止'
  listenButton.setAttribute('aria-pressed', 'true')
  testButton.textContent = '试听 G3'
  stage.dataset.state = 'live'
}

function hideMark(): void {
  markEl.hidden = true
}

function restoreSettings(): void {
  const hold = clamp(Number(localStorage.getItem(HOLD_KEY)), 200, 800, 320)
  const gate = clamp(Number(localStorage.getItem(GATE_KEY)), 1, 40, 8)
  holdInput.value = String(hold)
  holdValue.textContent = `${(hold / 1000).toFixed(2)} 秒`
  listener.setHoldMs(hold)
  gateInput.value = String(gate)
  applyGate(gate)
}

function applyGate(value: number): void {
  listener.rmsMin = value / 1000
  gateValue.textContent = value <= 5 ? '灵敏' : value <= 14 ? '适中' : '只收较响的声音'
  syncGateMark()
}

function syncGateMark(): void {
  const position = Math.min(1, Math.sqrt(listener.rmsMin) / 0.45)
  gateMarkEl.style.left = `${position * 100}%`
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}
