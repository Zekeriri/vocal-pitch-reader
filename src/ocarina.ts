import { PitchListener, micErrorMessage } from './audio.ts'
import { followMelody, RELATIVE_STEPS, songById, songIntervals, songNoteSeconds } from './ocarina-songs.ts'
import { formatNote, freqToMidi, midiToName } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, subscribeSettings } from './settings.ts'
import { silenceSpeech, speakChinese } from './speak.ts'

const SONG_KEY = 'pitch-reader-ocarina'
const SVG_NS = 'http://www.w3.org/2000/svg'

const root = document.querySelector<HTMLElement>('#ocarina')!
const notesEl = document.querySelector<HTMLOListElement>('#ocarina-notes')!
const noteEl = document.querySelector<HTMLElement>('#ocarina-note')!
const detailEl = document.querySelector<HTMLElement>('#ocarina-detail')!
const extraEl = document.querySelector<HTMLElement>('#ocarina-extra')!
const levelEl = document.querySelector<HTMLElement>('#ocarina-level')!
const gateMarkEl = document.querySelector<HTMLElement>('#ocarina-gate')!
const playButton = document.querySelector<HTMLButtonElement>('#ocarina-play')!
const replayButton = document.querySelector<HTMLButtonElement>('#ocarina-replay')!
const statusEl = document.querySelector<HTMLElement>('#ocarina-status')!
const songButtons = document.querySelectorAll<HTMLButtonElement>('[data-song]')
const laneEl = document.querySelector<SVGSVGElement>('#ocarina-lane')!

type Phase = 'idle' | 'playing' | 'singing' | 'learned'

let song = songById(localStorage.getItem(SONG_KEY) ?? 'lullaby')
let phase: Phase = 'idle'
let step = 0
let anchor: number | null = null
let preview: number | null = null
let heldClass: number | null = null
let playIndex = -1
const trail: number[] = []
let token = 0
let abort: AbortController | null = null
let expectStop = false

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'singing' || detection.speaking) return
  const { result } = detection
  if (result.freq == null) {
    preview = null
    heldClass = null
    paintLane(null)
    return
  }
  const midiFloat = freqToMidi(result.freq)
  if (preview == null) preview = midiFloat
  const rel = midiFloat - (anchor ?? preview)
  trail.push(rel)
  if (trail.length > 36) trail.shift()
  paintLane(rel)
  if (!result.stable || result.midi == null) return
  const sungClass = pitchClass(result.midi)
  if (sungClass === heldClass) return
  heldClass = sungClass
  takeNote(midiFloat)
}, () => {
  if (expectStop || phase !== 'singing') return
  phase = 'idle'
  render()
})

subscribeSettings((settings) => {
  listener.rmsMin = gateToRms(settings.gate)
  listener.setHoldMs(settings.holdMs)
  gateMarkEl.style.left = `${gateMarkRatio(listener.rmsMin) * 100}%`
})

playButton.addEventListener('click', () => {
  if (phase === 'singing' || phase === 'playing') finish()
  else void begin()
})
replayButton.addEventListener('click', () => {
  if (phase === 'playing' || phase === 'singing') void present()
})
for (const button of songButtons) {
  button.addEventListener('click', () => {
    if (phase === 'playing' || phase === 'singing') return
    choose(button.dataset.song ?? 'lullaby')
  })
}
render()

export function stopOcarina(): void {
  token += 1
  abort?.abort()
  abort = null
  haltMic()
  silenceSpeech()
  phase = 'idle'
  playIndex = -1
  resetAttempt()
  render()
}

export function handleOcarinaSpace(): void {
  if (phase === 'playing') return
  if (phase === 'singing') void present()
  else void begin()
}

function choose(id: string): void {
  song = songById(id)
  localStorage.setItem(SONG_KEY, song.id)
  phase = 'idle'
  resetAttempt()
  render()
}

async function begin(): Promise<void> {
  step = 0
  statusEl.textContent = ''
  await present()
}

async function present(): Promise<void> {
  const notes = song.notes
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  phase = 'playing'
  playIndex = -1
  resetAttempt()
  haltMic()
  render()
  try {
    await playMidiSequence(notes, (index) => {
      playIndex = index
      noteEl.textContent = noteName(notes[index])
      noteEl.className = 'note is-live'
      detailEl.textContent = '先听整首'
      paintNotes()
      paintLane(null)
    }, controller.signal, songNoteSeconds(song))
  } catch (error) {
    if (controller.signal.aborted || run !== token) return
    phase = 'idle'
    playIndex = -1
    statusEl.textContent = error instanceof Error ? error.message : '这首没有播出来。'
    render()
    return
  }
  if (controller.signal.aborted || run !== token) return
  playIndex = -1
  resetAttempt()
  phase = 'singing'
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

function takeNote(midi: number): void {
  if (phase !== 'singing') return
  const notes = song.notes
  const next = followMelody(step, midi, anchor, notes)
  if (next.anchor !== anchor) trail.length = 0
  anchor = next.anchor
  preview = next.anchor
  if (next.progress >= notes.length) {
    step = notes.length
    token += 1
    phase = 'learned'
    haltMic()
    render()
    speakChinese('学会了')
    return
  }
  const matched = next.progress > step
  step = next.progress
  noteEl.textContent = noteName(Math.round(midi))
  noteEl.className = matched ? 'note is-tuned' : 'note is-stable'
  detailEl.textContent = matched ? '记下了' : '重来'
  extraEl.textContent = matched ? '' : '重来'
  paintNotes()
  paintLane(0)
}

function finish(): void {
  token += 1
  abort?.abort()
  haltMic()
  silenceSpeech()
  phase = 'idle'
  playIndex = -1
  resetAttempt()
  render()
}

function haltMic(): void {
  if (listener.mode === 'idle') return
  expectStop = true
  listener.stop()
  expectStop = false
}

function render(): void {
  const busy = phase === 'playing' || phase === 'singing'
  replayButton.disabled = !busy
  for (const button of songButtons) {
    button.disabled = busy
    button.setAttribute('aria-pressed', button.dataset.song === song.id ? 'true' : 'false')
  }
  playButton.textContent =
    phase === 'playing' || phase === 'singing' ? '结束' : phase === 'learned' ? '再来一次' : '开始'
  paintNotes()
  if (phase === 'idle') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '点开始，先听整首'
    extraEl.textContent = ''
    renderMeter(0)
  } else if (phase === 'playing') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '先听整首'
    extraEl.textContent = ''
  } else if (phase === 'singing') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '从任意音高，按这个形状哼'
    extraEl.textContent = ''
  } else if (phase === 'learned') {
    noteEl.textContent = '学会了'
    noteEl.className = 'note is-tuned'
    detailEl.textContent = song.title
    extraEl.textContent = '学会了'
  }
  root.dataset.state = phase
  paintLane(phase === 'singing' ? (anchor == null ? null : 0) : null)
}

function resetAttempt(): void {
  step = 0
  anchor = null
  preview = null
  heldClass = null
  trail.length = 0
}

function paintNotes(): void {
  notesEl.replaceChildren(
    ...song.notes.map((midi, index) => {
      const item = document.createElement('li')
      item.textContent = noteName(midi)
      if (phase === 'playing' && index === playIndex) item.classList.add('is-now')
      if (phase === 'singing' && index === step) item.classList.add('is-now')
      if ((phase === 'playing' || phase === 'singing') && index < step) item.classList.add('is-reached')
      if (phase === 'learned') item.classList.add('is-reached')
      return item
    }),
  )
}

function noteName(midi: number): string {
  return formatNote(midiToName(midi))
}

function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12
}

function paintLane(liveRel: number | null): void {
  const intervals = songIntervals(song.notes)
  const minRel = Math.min(...intervals) - 3
  const maxRel = Math.max(...intervals) + 3
  const width = 360
  const height = 168
  const padX = 14
  const padY = 16
  const innerW = width - padX * 2
  const innerH = height - padY * 2
  const colW = innerW / intervals.length
  const semitone = innerH / (maxRel - minRel)
  const yOf = (rel: number) => padY + (1 - (rel - minRel) / (maxRel - minRel)) * innerH
  const current = phase === 'playing' ? playIndex : Math.min(step, intervals.length - 1)
  laneEl.replaceChildren()
  intervals.forEach((interval, index) => {
    const reached = phase === 'learned' || index < step
    const now = (phase === 'playing' && index === playIndex) || (phase === 'singing' && index === step)
    const x = padX + index * colW
    const zoneH = semitone * RELATIVE_STEPS * 2
    laneEl.append(
      svgEl('rect', {
        x: String(x + 6),
        y: String(yOf(interval) - zoneH / 2),
        width: String(colW - 12),
        height: String(zoneH),
        rx: '8',
        fill: now ? 'rgba(240, 180, 41, 0.22)' : 'rgba(240, 180, 41, 0.08)',
      }),
      svgEl('rect', {
        x: String(x + 10),
        y: String(yOf(interval) - semitone * 0.55),
        width: String(colW - 20),
        height: String(semitone * 1.1),
        rx: '7',
        fill: reached ? '#d6e07a' : now ? '#f0b429' : '#3a3b32',
      }),
    )
  })
  if (liveRel == null || phase !== 'singing') return
  const column = Math.min(Math.max(current, 0), intervals.length - 1)
  const expected = intervals[column] ?? 0
  const close = Math.abs(foldSteps(liveRel - expected)) <= RELATIVE_STEPS
  const points = trail
    .map((rel, index) => {
      const x = padX + column * colW + 8 + ((colW - 16) * index) / Math.max(trail.length - 1, 1)
      return `${x.toFixed(1)},${clampY(yOf(rel), padY, padY + innerH).toFixed(1)}`
    })
    .join(' ')
  if (points) {
    laneEl.append(svgEl('polyline', {
      points,
      fill: 'none',
      stroke: 'rgba(244, 240, 230, 0.75)',
      'stroke-width': '2.5',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }))
  }
  laneEl.append(svgEl('circle', {
    cx: String(padX + column * colW + colW / 2),
    cy: String(clampY(yOf(liveRel), padY, padY + innerH)),
    r: '7',
    fill: close ? '#d6e07a' : '#f4f0e6',
  }))
}

function foldSteps(error: number): number {
  let diff = error
  while (diff > 6) diff -= 12
  while (diff < -6) diff += 12
  return diff
}

function clampY(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function svgEl(name: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value)
  return node
}

function renderMeter(rms: number): void {
  const level = Math.min(1, Math.sqrt(rms) / 0.45)
  levelEl.style.transform = `scaleX(${level})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}
