import { PitchListener, micErrorMessage } from './audio.ts'
import { createSelfInput, stepSelfInput, type SelfInputState } from './intonation-input.ts'
import {
  judgePitch,
  makeRound,
  pickMobileNote,
  RANGE_CEILING,
  RANGE_FLOOR,
  ROUND_LENGTH,
  verdictText,
} from './intonation-round.ts'
import {
  TRACE_GUIDE_CENTS,
  TRACE_MATCH_CENTS,
  smoothTrace,
  traceSegments,
  traceY,
  type TracePoint,
} from './intonation-trace.ts'
import { formatNote, freqToMidi, midiToName, type LockResult } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, readSettings, subscribeSettings } from './settings.ts'
import { readTuneRange, subscribeTuneRange } from './tune-range.ts'
import { nextWideSide, wideFrame, type WideSide } from './wide-tilt.ts'
import { silenceSpeech, speakChinese } from './speak.ts'

const SVG_NS = 'http://www.w3.org/2000/svg'
const PROMPT_GAP_MS = 1500
const TRACE_MS = 4000
const PLOT_LEFT = 68
const PLOT_RIGHT = 348

const root = document.querySelector<HTMLElement>('#intonation')!
const noteEl = document.querySelector<HTMLElement>('#tune-note')!
const detailEl = document.querySelector<HTMLElement>('#tune-detail')!
const extraEl = document.querySelector<HTMLElement>('#tune-extra')!
const dotsEl = document.querySelector<HTMLOListElement>('#tune-dots')!
const levelEl = document.querySelector<HTMLElement>('#tune-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#tune-gate')!
const startButton = document.querySelector<HTMLButtonElement>('#tune-start')!
const replayButton = document.querySelector<HTMLButtonElement>('#tune-replay')!
const statusEl = document.querySelector<HTMLElement>('#tune-status')!
const waveEl = document.querySelector<SVGSVGElement>('#tune-wave')!
const titleEl = document.querySelector<HTMLElement>('#tune-title')!
const ledeEl = document.querySelector<HTMLElement>('#tune-lede')!
const roundEl = document.querySelector<HTMLElement>('#tune-round')!
const mobileEl = document.querySelector<HTMLElement>('#tune-mobile')!
const roundTab = document.querySelector<HTMLButtonElement>('#tune-tab-round')!
const inputTab = document.querySelector<HTMLButtonElement>('#tune-tab-input')!
const mobileTab = document.querySelector<HTMLButtonElement>('#tune-tab-mobile')!
const mobileNoteSelect = document.querySelector<HTMLSelectElement>('#tune-mobile-note')!
const wideButton = document.querySelector<HTMLButtonElement>('#tune-wide')!
const wideExit = document.querySelector<HTMLButtonElement>('#tune-wide-exit')!
const hintEl = document.querySelector<HTMLElement>('#tune-hint')!

const KIND_KEY = 'pitch-reader-tune-kind'
const MOBILE_KEY = 'pitch-reader-tune-mobile'

type Phase = 'idle' | 'playing' | 'listening' | 'passed'
type Kind = 'round' | 'input' | 'mobile'
type InputPhase = 'idle' | 'live'
type MobilePhase = 'idle' | 'playing' | 'listening'

let kind: Kind = storedKind()
let inputPhase: InputPhase = 'idle'
let mobileNote = storedMidi(MOBILE_KEY, 60)
let mobilePhase: MobilePhase = 'idle'
let wideOpen = false
let wideFullscreen = false
let wideSide: WideSide = 'left'
let selfInput: SelfInputState = createSelfInput()
let liveMidi: number | null = null
let phase: Phase = 'idle'
let targets: number[] = []
let index = 0
let token = 0
let abort: AbortController | null = null
let expectStop = false
let lastPrompt = ''
let lastPromptAt = 0
let trace: TracePoint[] = []

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (kind === 'input') {
    onInputFrame(detection.speaking, detection.result)
    return
  }
  if (kind === 'mobile') {
    onMobileFrame(detection.speaking, detection.result)
    return
  }
  if (phase !== 'listening' || detection.speaking) return
  if (detection.result.freq != null) rememberPitch(detection.result.freq)
  paintTrace()
  if (detection.result.freq == null) return
  showVerdict(detection.result, true)
}, () => {
  if (expectStop) return
  if (kind === 'input') {
    if (inputPhase === 'live') {
      inputPhase = 'idle'
      selfInput = createSelfInput()
      liveMidi = null
      render()
    }
    return
  }
  if (kind === 'mobile') {
    if (mobilePhase === 'listening') {
      mobilePhase = 'idle'
      liveMidi = null
      render()
    }
    return
  }
  if (phase !== 'listening') return
  clearTrace()
  phase = 'idle'
  render()
})

subscribeSettings((settings) => {
  listener.rmsMin = gateToRms(settings.gate)
  listener.setHoldMs(settings.holdMs)
  gateMarkEl.style.left = `${gateMarkRatio(listener.rmsMin) * 100}%`
})

startButton.addEventListener('click', () => {
  if (kind === 'input') {
    void onInputPrimary()
    return
  }
  if (kind === 'mobile') {
    void playMobile()
    return
  }
  if (phase === 'idle' || phase === 'passed') void begin()
  else if (phase === 'listening') finishRound()
})
replayButton.addEventListener('click', () => {
  if (kind === 'mobile') {
    randomizeMobile()
    return
  }
  if (kind === 'input') {
    restartInput()
    return
  }
  if (phase === 'listening' || phase === 'playing') void present()
})
roundTab.addEventListener('click', () => setKind('round'))
inputTab.addEventListener('click', () => setKind('input'))
mobileTab.addEventListener('click', () => setKind('mobile'))
wideButton.addEventListener('click', () => {
  void enterWide()
})
wideExit.addEventListener('click', () => {
  leaveWide()
})
window.addEventListener('resize', () => {
  if (wideOpen) layoutWide()
})
document.addEventListener('fullscreenchange', () => {
  if (wideOpen && wideFullscreen && document.fullscreenElement == null) leaveWide()
})
mobileNoteSelect.addEventListener('change', () => {
  mobileNote = storedMidiValue(Number(mobileNoteSelect.value), mobileNote)
  localStorage.setItem(MOBILE_KEY, String(mobileNote))
  liveMidi = null
  clearTrace()
  render()
})
fillMobileNotes()
render()
subscribeTuneRange(() => {
  if (kind === 'round' && (phase === 'idle' || phase === 'passed')) render()
})

export function stopIntonation(): void {
  token += 1
  abort?.abort()
  abort = null
  haltMic()
  silenceSpeech()
  clearTrace()
  phase = 'idle'
  inputPhase = 'idle'
  mobilePhase = 'idle'
  leaveWide(false)
  selfInput = createSelfInput()
  liveMidi = null
  render()
}

export function showIntonation(): void {
  if (kind === 'mobile' && mobilePhase === 'idle') void listenMobile()
}

export function handleIntonationSpace(): void {
  if (kind === 'input') {
    void onInputPrimary()
    return
  }
  if (kind === 'mobile') {
    void playMobile()
    return
  }
  if (phase === 'playing') return
  if (phase === 'listening') void present()
  else void begin()
}

async function begin(): Promise<void> {
  const range = readTuneRange()
  targets = makeRound(ROUND_LENGTH, Math.random, range.low, range.high)
  index = 0
  statusEl.textContent = ''
  clearTrace()
  await present()
}

async function present(): Promise<void> {
  if (targets.length !== ROUND_LENGTH) {
    const range = readTuneRange()
    targets = makeRound(ROUND_LENGTH, Math.random, range.low, range.high)
  }
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  phase = 'playing'
  lastPrompt = ''
  clearTrace()
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
  clearTrace()
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

function onInputFrame(speaking: boolean, result: LockResult): void {
  if (speaking || inputPhase !== 'live') return
  const step = stepSelfInput(
    selfInput,
    {
      time: performance.now(),
      freq: result.freq,
      midi: result.midi,
      stable: result.stable,
    },
    Math.round(readSettings().noteSeconds * 1000),
  )
  selfInput = step.state
  if (step.locked != null || step.armed) clearTrace()
  const singing = selfInput.phase === 'sing' && !selfInput.waitGap && result.freq != null
  liveMidi = singing ? result.midi : null
  if (singing && result.freq != null) rememberPitch(result.freq)
  render()
}

function showVerdict(result: LockResult, advanceOnMatch: boolean): void {
  if (!result.stable) {
    if (result.note) noteEl.textContent = formatNote(result.note)
    noteEl.className = 'note is-live'
    detailEl.textContent = '再稳一下'
    extraEl.textContent = ''
    return
  }
  const target = currentTarget()
  if (target == null || result.freq == null) return
  const verdict = judgePitch(result.freq, target)
  noteEl.textContent = verdictText(verdict)
  noteEl.className = verdict === 'match' ? 'note is-tuned' : 'note is-stable'
  const sung = result.note ? formatNote(result.note) : ''
  detailEl.textContent = sung ? `唱成了 ${sung}` : '再稳一下'
  extraEl.textContent = verdict === 'match' ? '' : verdictText(verdict)
  if (verdict !== 'match') prompt(verdictText(verdict))
  else if (advanceOnMatch) advance()
}

async function onInputPrimary(): Promise<void> {
  if (inputPhase === 'idle') await startInput()
  else stopInput()
}

function restartInput(): void {
  selfInput = createSelfInput()
  liveMidi = null
  clearTrace()
  statusEl.textContent = ''
  if (inputPhase !== 'live') {
    void startInput()
    return
  }
  render()
}

async function startInput(): Promise<void> {
  selfInput = createSelfInput()
  liveMidi = null
  clearTrace()
  statusEl.textContent = ''
  inputPhase = 'live'
  haltMic()
  render()
  const opened = await openInputMic()
  if (!opened && inputPhase === 'live') {
    inputPhase = 'idle'
    render()
  }
}

function stopInput(): void {
  haltMic()
  silenceSpeech()
  selfInput = createSelfInput()
  liveMidi = null
  clearTrace()
  inputPhase = 'idle'
  render()
}

async function openInputMic(): Promise<boolean> {
  try {
    return await listener.startMic()
  } catch (error) {
    statusEl.textContent = micErrorMessage(error)
    return false
  }
}

function setKind(next: Kind): void {
  if (next === kind) return
  kind = next
  localStorage.setItem(KIND_KEY, kind)
  token += 1
  abort?.abort()
  haltMic()
  silenceSpeech()
  clearTrace()
  phase = 'idle'
  inputPhase = 'idle'
  mobilePhase = 'idle'
  leaveWide(false)
  selfInput = createSelfInput()
  liveMidi = null
  statusEl.textContent = ''
  render()
  if (kind === 'mobile') void listenMobile()
}

function render(): void {
  applyKind()
  if (kind === 'input') {
    renderInput()
    return
  }
  if (kind === 'mobile') {
    renderMobile()
    return
  }
  const busy = phase === 'playing' || phase === 'listening'
  startButton.disabled = phase === 'playing'
  replayButton.disabled = !busy
  startButton.textContent =
    phase === 'playing' ? '正在播放…' : phase === 'listening' ? '结束' : phase === 'passed' ? '再来一轮' : '开始'
  replayButton.textContent = '再听一次'
  paintDots()
  if (phase === 'idle') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    const range = readTuneRange()
    detailEl.textContent = `从 ${noteName(range.low)} 到 ${noteName(range.high)}，点开始`
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
  paintTrace()
}

function renderInput(): void {
  const running = inputPhase === 'live'
  startButton.disabled = false
  replayButton.disabled = !running
  replayButton.textContent = selfInput.target == null ? '重弹' : '换一个音'
  startButton.textContent = running ? '结束' : '听我弹'
  if (!running) {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '按住琴上的一个音'
    extraEl.textContent = ''
    renderMeter(0)
    root.dataset.state = 'idle'
    paintTrace()
    return
  }
  const target = selfInput.target
  if (selfInput.phase === 'sing' && selfInput.waitGap && target != null) {
    noteEl.textContent = noteName(target)
    noteEl.className = 'note is-tuned'
    detailEl.textContent = '松开后再唱'
    extraEl.textContent = ''
  } else if (selfInput.phase === 'sing') {
    paintSungReadout(target)
  } else if (selfInput.pendingMidi != null) {
    noteEl.textContent = noteName(selfInput.pendingMidi)
    noteEl.className = 'note is-live'
    detailEl.textContent = '再按住一会儿'
    extraEl.textContent = ''
  } else {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '按住琴上的一个音'
    extraEl.textContent = ''
  }
  root.dataset.state = selfInput.phase === 'sing' && !selfInput.waitGap ? 'listening' : 'idle'
  paintTrace()
}

function renderMobile(): void {
  const playing = mobilePhase === 'playing'
  startButton.disabled = playing
  startButton.textContent = playing ? '正在播放…' : '播放'
  replayButton.disabled = playing
  replayButton.textContent = '随机'
  mobileNoteSelect.disabled = playing
  mobileNoteSelect.value = String(mobileNote)
  if (playing) {
    noteEl.textContent = noteName(mobileNote)
    noteEl.className = 'note is-tuned'
    detailEl.textContent = '先听'
    extraEl.textContent = ''
  } else if (mobilePhase === 'listening') {
    paintSungReadout(mobileNote)
  } else {
    noteEl.textContent = noteName(mobileNote)
    noteEl.className = 'note is-tuned'
    detailEl.textContent = '点播放，再对着亮线唱'
    extraEl.textContent = ''
  }
  if (mobilePhase !== 'listening') renderMeter(0)
  root.dataset.state = mobilePhase
  paintTrace()
}

async function enterWide(): Promise<void> {
  if (kind !== 'mobile' || wideOpen) return
  wideOpen = true
  wideSide = 'left'
  document.body.classList.add('is-tune-wide')
  layoutWide()
  window.addEventListener('deviceorientation', onWideTilt)
  const orientationEvent = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<string>
  }
  const permit = orientationEvent.requestPermission?.()
  const fullscreen = document.documentElement.requestFullscreen?.()
  try {
    await permit
  } catch {
    // Motion permission was declined. The portrait screen still uses the landscape layout.
  }
  try {
    await fullscreen
  } catch {
    // The page still fills the window when the browser will not go fullscreen.
  }
  wideFullscreen = document.fullscreenElement != null
  layoutWide()
}

function leaveWide(renderAfter = true): void {
  if (!wideOpen && !document.body.classList.contains('is-tune-wide')) return
  wideOpen = false
  wideFullscreen = false
  wideSide = 'left'
  document.body.classList.remove('is-tune-wide')
  window.removeEventListener('deviceorientation', onWideTilt)
  clearWideFrame()
  if (document.fullscreenElement != null) void document.exitFullscreen?.()
  if (renderAfter) render()
}

function onWideTilt(event: DeviceOrientationEvent): void {
  const side = nextWideSide(event.gamma, wideSide)
  if (side === wideSide) return
  wideSide = side
  layoutWide()
}

function layoutWide(): void {
  if (!wideOpen) return
  const frame = wideFrame(wideSide, { width: window.innerWidth, height: window.innerHeight })
  if (frame == null) {
    clearWideFrame()
    return
  }
  root.style.width = `${frame.width}px`
  root.style.height = `${frame.height}px`
  root.style.top = `${frame.top}px`
  root.style.left = `${frame.left}px`
  root.style.right = 'auto'
  root.style.bottom = 'auto'
  root.style.transformOrigin = 'top left'
  root.style.transform = frame.transform
}

function clearWideFrame(): void {
  root.style.width = ''
  root.style.height = ''
  root.style.top = ''
  root.style.left = ''
  root.style.right = ''
  root.style.bottom = ''
  root.style.transform = ''
  root.style.transformOrigin = ''
}

function randomizeMobile(): void {
  if (kind !== 'mobile' || mobilePhase === 'playing') return
  const range = readTuneRange()
  mobileNote = pickMobileNote(mobileNote, Math.random, range.low, range.high)
  localStorage.setItem(MOBILE_KEY, String(mobileNote))
  void playMobile()
}

function onMobileFrame(speaking: boolean, result: LockResult): void {
  if (speaking || mobilePhase !== 'listening') return
  if (result.freq == null) {
    if (liveMidi == null) return
    liveMidi = null
    render()
    return
  }
  liveMidi = result.midi
  rememberPitch(result.freq)
  render()
}

async function playMobile(): Promise<void> {
  if (kind !== 'mobile' || mobilePhase === 'playing') return
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  mobilePhase = 'playing'
  liveMidi = null
  clearTrace()
  haltMic()
  statusEl.textContent = ''
  render()
  try {
    await playMidiSequence([mobileNote], () => {}, controller.signal)
  } catch (error) {
    if (controller.signal.aborted || run !== token) return
    statusEl.textContent = error instanceof Error ? error.message : '这个音没有播出来。'
    await listenMobile(run)
    return
  }
  if (controller.signal.aborted || run !== token) return
  await listenMobile(run)
}

async function listenMobile(run = token): Promise<void> {
  if (kind !== 'mobile' || run !== token) return
  mobilePhase = 'listening'
  render()
  try {
    const started = await listener.startMic()
    if (run !== token || kind !== 'mobile') {
      if (kind !== 'mobile') haltMic()
      return
    }
    if (!started) {
      mobilePhase = 'idle'
      render()
    }
  } catch (error) {
    if (run !== token || kind !== 'mobile') return
    mobilePhase = 'idle'
    statusEl.textContent = micErrorMessage(error)
    render()
  }
}

function paintSungReadout(target: number | null): void {
  if (target == null) {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '对着亮线唱'
    extraEl.textContent = ''
    return
  }
  if (liveMidi != null) {
    noteEl.textContent = noteName(liveMidi)
    noteEl.className = 'note is-live'
    detailEl.textContent = '对着亮线看'
    extraEl.textContent = ''
    return
  }
  noteEl.textContent = noteName(target)
  noteEl.className = 'note is-tuned'
  detailEl.textContent = '对着亮线唱'
  extraEl.textContent = ''
}

function applyKind(): void {
  const input = kind === 'input'
  const mobile = kind === 'mobile'
  root.dataset.kind = kind
  roundEl.hidden = input || mobile
  mobileEl.hidden = !mobile
  roundTab.setAttribute('aria-pressed', kind === 'round' ? 'true' : 'false')
  inputTab.setAttribute('aria-pressed', input ? 'true' : 'false')
  mobileTab.setAttribute('aria-pressed', mobile ? 'true' : 'false')
  titleEl.textContent = mobile ? '外出练这个音' : input ? '对着琴上的音唱' : '连准十个音'
  ledeEl.textContent = mobile
    ? '先看波形。点「播放」听这个音，或点「随机」换一个并马上播放。再对着亮线唱。准不准自己看线。'
    : input
      ? '先按住琴上的一个音。记下来以后松开，对着亮线唱。准不准自己看线。唱完点「换一个音」，想停点「结束」。'
      : '先听一个音，再唱成同一个音。准了才弹下一个。连续十个都准，这一轮过关。'
  hintEl.textContent = mobile
    ? '波形下面是「播放」和「随机」。当前音在按钮下面。点「全屏」后只留波形、播放和随机。系统锁在竖屏时，也会固定用横屏的排法。点「随机」会在「设置」里的音准范围里换一个音，并马上播放，和十个音用的是同一段。这里不判断，也不念出来。'
    : input
      ? '点「听我弹」，按住一个音，直到屏幕记下它。松开后对着中间的亮线唱，音高线贴上去就是准。这里不判断，也不念出来。唱完自己点「换一个音」。想停，点「结束」。'
      : '中间的亮线是要唱的音，音高线贴上去就准。浅色带是上下 25 音分。先稳住「设置」里的那段时间，再判断。请戴耳机，免得弹出的音被当成你唱的。'
}

function rememberPitch(freq: number): void {
  const target = currentTarget()
  if (target == null) return
  trace.push({ time: performance.now(), cents: (freqToMidi(freq) - target) * 100 })
  const latest = trace.at(-1)
  if (!latest) return
  const cutoff = latest.time - TRACE_MS
  while (trace.length > 1 && trace[0].time < cutoff) trace.shift()
  if (trace.length > 2000) trace.splice(0, trace.length - 2000)
}

function clearTrace(): void {
  trace = []
}

function currentTarget(): number | null {
  if (kind === 'mobile') return mobileNote
  if (kind === 'input') {
    if (inputPhase !== 'live') return null
    return selfInput.target
  }
  if (phase === 'idle' || targets.length === 0) return null
  return targets[Math.min(index, targets.length - 1)] ?? null
}

function storedKind(): Kind {
  const stored = localStorage.getItem(KIND_KEY)
  if (stored === 'input' || stored === 'mobile') return stored
  return 'round'
}

function paintTrace(): void {
  const target = currentTarget()
  waveEl.replaceChildren()
  waveEl.setAttribute('aria-label', target == null ? '音高线，亮线是要唱的音' : `音高线，亮线是 ${noteName(target)}`)
  const bandTop = traceY(TRACE_MATCH_CENTS)
  const bandBottom = traceY(-TRACE_MATCH_CENTS)
  const band = document.createElementNS(SVG_NS, 'rect')
  band.setAttribute('x', String(PLOT_LEFT))
  band.setAttribute('y', bandTop.toFixed(1))
  band.setAttribute('width', String(PLOT_RIGHT - PLOT_LEFT))
  band.setAttribute('height', (bandBottom - bandTop).toFixed(1))
  band.setAttribute('fill', '#f0b429')
  band.setAttribute('opacity', '0.16')
  waveEl.append(band)
  for (const cents of TRACE_GUIDE_CENTS) {
    const y = traceY(cents)
    const line = document.createElementNS(SVG_NS, 'line')
    line.setAttribute('x1', String(PLOT_LEFT))
    line.setAttribute('x2', String(PLOT_RIGHT))
    line.setAttribute('y1', y.toFixed(1))
    line.setAttribute('y2', y.toFixed(1))
    line.setAttribute('stroke', '#3a3b32')
    line.setAttribute('stroke-width', '1')
    line.setAttribute('stroke-dasharray', '2 4')
    waveEl.append(line)
    const label = document.createElementNS(SVG_NS, 'text')
    label.setAttribute('x', String(PLOT_LEFT - 8))
    label.setAttribute('y', y.toFixed(1))
    label.setAttribute('text-anchor', 'end')
    label.setAttribute('dominant-baseline', 'middle')
    label.textContent = cents > 0 ? `+${cents}` : String(cents)
    waveEl.append(label)
  }
  const targetY = traceY(0)
  const glow = document.createElementNS(SVG_NS, 'line')
  glow.setAttribute('x1', String(PLOT_LEFT))
  glow.setAttribute('x2', String(PLOT_RIGHT))
  glow.setAttribute('y1', targetY.toFixed(1))
  glow.setAttribute('y2', targetY.toFixed(1))
  glow.setAttribute('stroke', '#f0b429')
  glow.setAttribute('stroke-width', '8')
  glow.setAttribute('stroke-linecap', 'round')
  glow.setAttribute('opacity', '0.28')
  waveEl.append(glow)
  const axis = document.createElementNS(SVG_NS, 'line')
  axis.setAttribute('x1', String(PLOT_LEFT))
  axis.setAttribute('x2', String(PLOT_RIGHT))
  axis.setAttribute('y1', targetY.toFixed(1))
  axis.setAttribute('y2', targetY.toFixed(1))
  axis.setAttribute('stroke', '#f0b429')
  axis.setAttribute('stroke-width', '2.5')
  axis.setAttribute('stroke-linecap', 'round')
  waveEl.append(axis)
  const name = document.createElementNS(SVG_NS, 'text')
  name.setAttribute('class', target == null ? '' : 'target')
  name.setAttribute('x', String(PLOT_LEFT - 8))
  name.setAttribute('y', targetY.toFixed(1))
  name.setAttribute('text-anchor', 'end')
  name.setAttribute('dominant-baseline', 'middle')
  name.textContent = target == null ? '目标' : noteName(target)
  waveEl.append(name)
  const end = trace.at(-1)?.time ?? 0
  const start = end - TRACE_MS
  const windowed = trace.filter((point) => point.time >= start)
  const width = PLOT_RIGHT - PLOT_LEFT
  const latest = windowed.at(-1)
  const matched = latest != null && Math.abs(latest.cents) <= TRACE_MATCH_CENTS
  for (const segment of traceSegments(windowed)) {
    const cents = smoothTrace(segment.map((point) => point.cents))
    const points = segment.map((point, index) => ({
      x: PLOT_LEFT + ((point.time - start) / TRACE_MS) * width,
      y: traceY(cents[index] ?? point.cents),
    }))
    const line = document.createElementNS(SVG_NS, 'path')
    line.setAttribute('d', tracePath(points))
    line.setAttribute('fill', 'none')
    line.setAttribute('stroke', matched ? '#d6e07a' : '#f4f0e6')
    line.setAttribute('stroke-width', '2.5')
    line.setAttribute('stroke-linejoin', 'round')
    line.setAttribute('stroke-linecap', 'round')
    waveEl.append(line)
  }
  if (latest) {
    const dot = document.createElementNS(SVG_NS, 'circle')
    dot.setAttribute('cx', String(PLOT_RIGHT))
    dot.setAttribute('cy', traceY(latest.cents).toFixed(1))
    dot.setAttribute('r', '3.5')
    dot.setAttribute('fill', matched ? '#d6e07a' : '#f4f0e6')
    waveEl.append(dot)
  }
}

function tracePath(points: readonly { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(' ')
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

function fillMobileNotes(): void {
  const options = Array.from({ length: RANGE_CEILING - RANGE_FLOOR + 1 }, (_, index) => {
    const midi = RANGE_FLOOR + index
    const option = document.createElement('option')
    option.value = String(midi)
    option.textContent = noteName(midi)
    return option
  })
  mobileNoteSelect.replaceChildren(...options)
}

function storedMidi(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw == null || raw === '') return fallback
  return storedMidiValue(Number(raw), fallback)
}

function storedMidiValue(value: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback
  return Math.min(RANGE_CEILING, Math.max(RANGE_FLOOR, value))
}

function noteName(midi: number): string {
  return formatNote(midiToName(midi))
}

function renderMeter(rms: number): void {
  const level = Math.min(1, Math.sqrt(rms) / 0.45)
  levelEl.style.transform = `scaleX(${level})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}
