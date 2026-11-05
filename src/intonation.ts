import { PitchListener, micErrorMessage } from './audio.ts'
import {
  judgePitch,
  makeRound,
  MatchHold,
  ROUND_LENGTH,
  verdictText,
} from './intonation-round.ts'
import { formatNote, midiToName } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { silenceSpeech, speakChinese } from './speak.ts'

const HOLD_MS = 280
const PROMPT_GAP_MS = 1500

const root = document.querySelector<HTMLElement>('#intonation')!
const noteEl = document.querySelector<HTMLElement>('#tune-note')!
const detailEl = document.querySelector<HTMLElement>('#tune-detail')!
const extraEl = document.querySelector<HTMLElement>('#tune-extra')!
const dotsEl = document.querySelector<HTMLOListElement>('#tune-dots')!
const levelEl = document.querySelector<HTMLElement>('#tune-level')!
const startButton = document.querySelector<HTMLButtonElement>('#tune-start')!
const replayButton = document.querySelector<HTMLButtonElement>('#tune-replay')!
const statusEl = document.querySelector<HTMLElement>('#tune-status')!

type Phase = 'idle' | 'playing' | 'listening' | 'passed'

let phase: Phase = 'idle'
let targets: number[] = []
let index = 0
let token = 0
let abort: AbortController | null = null
let expectStop = false
let lastPrompt = ''
let lastPromptAt = 0
const hold = new MatchHold()

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'listening' || detection.speaking) return
  const freq = detection.result.freq
  if (freq == null) return
  const verdict = judgePitch(freq, targets[index])
  noteEl.textContent = verdictText(verdict)
  noteEl.className = verdict === 'match' ? 'note is-tuned' : 'note is-stable'
  const sung = detection.result.note ? formatNote(detection.result.note) : ''
  detailEl.textContent = sung ? `唱成了 ${sung}` : '再稳一下'
  extraEl.textContent = verdict === 'match' ? '稳住就过' : verdictText(verdict)
  if (verdict !== 'match') prompt(verdictText(verdict))
  if (hold.push(performance.now(), verdict === 'match', HOLD_MS)) advance()
}, () => {
  if (expectStop || phase !== 'listening') return
  phase = 'idle'
  render()
})

listener.rmsMin = 0.008

startButton.addEventListener('click', () => {
  if (phase === 'idle' || phase === 'passed') void begin()
  else if (phase === 'listening') finishRound()
})
replayButton.addEventListener('click', () => {
  if (phase === 'listening' || phase === 'playing') void present()
})

render()

export function stopIntonation(): void {
  token += 1
  abort?.abort()
  abort = null
  haltMic()
  silenceSpeech()
  phase = 'idle'
  render()
}

export function handleIntonationSpace(): void {
  if (phase === 'playing') return
  if (phase === 'listening') void present()
  else void begin()
}

async function begin(): Promise<void> {
  targets = makeRound()
  index = 0
  statusEl.textContent = ''
  await present()
}

async function present(): Promise<void> {
  if (targets.length !== ROUND_LENGTH) targets = makeRound()
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  phase = 'playing'
  hold.reset()
  lastPrompt = ''
  haltMic()
  render()
  try {
    await playMidiSequence([targets[index]], () => {}, controller.signal)
  } catch (error) {
    if (controller.signal.aborted || run !== token) return
    phase = 'idle'
    statusEl.textContent = error instanceof Error ? error.message : '这个音没有播出来。'
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
    phase = 'idle'
    statusEl.textContent = micErrorMessage(error)
    render()
  }
}

function advance(): void {
  if (phase !== 'listening') return
  index += 1
  if (index >= ROUND_LENGTH) {
    token += 1
    phase = 'passed'
    haltMic()
    render()
    speakChinese('过关')
    return
  }
  void present()
}

function finishRound(): void {
  token += 1
  abort?.abort()
  haltMic()
  silenceSpeech()
  phase = 'idle'
  render()
}

function prompt(text: string): void {
  const now = performance.now()
  if (text === lastPrompt && now - lastPromptAt < PROMPT_GAP_MS) return
  lastPrompt = text
  lastPromptAt = now
  speakChinese(text)
}

function haltMic(): void {
  if (listener.mode === 'idle') return
  expectStop = true
  listener.stop()
  expectStop = false
}

function render(): void {
  const busy = phase === 'playing' || phase === 'listening'
  startButton.disabled = phase === 'playing'
  replayButton.disabled = !busy
  startButton.textContent =
    phase === 'playing' ? '正在播放…' : phase === 'listening' ? '结束' : phase === 'passed' ? '再来一轮' : '开始'
  paintDots()
  if (phase === 'idle') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '点开始，听第一个音'
    extraEl.textContent = ''
    renderMeter(0)
  } else if (phase === 'playing') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = `第 ${index + 1} 个，先听`
    extraEl.textContent = ''
  } else if (phase === 'listening') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '唱这个音'
    extraEl.textContent = ''
  } else {
    noteEl.textContent = '过关'
    noteEl.className = 'note is-tuned'
    detailEl.textContent = `十个音都准了，最后一个是 ${formatNote(midiToName(targets[ROUND_LENGTH - 1] ?? 60))}`
    extraEl.textContent = '过关'
  }
  root.dataset.state = phase
}

function paintDots(): void {
  dotsEl.replaceChildren(
    ...Array.from({ length: ROUND_LENGTH }, (_, dot) => {
      const item = document.createElement('li')
      item.textContent = String(dot + 1)
      if (dot < index || phase === 'passed') item.classList.add('is-done')
      else if (dot === index && phase !== 'idle') item.classList.add('is-now')
      return item
    }),
  )
}

function renderMeter(rms: number): void {
  const level = Math.min(1, Math.sqrt(rms) / 0.45)
  levelEl.style.transform = `scaleX(${level})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}
