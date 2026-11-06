import { PitchListener, micErrorMessage } from './audio.ts'
import { clampPhraseShift, hearSongNote, phraseShiftBounds, songById, transposePhrase } from './ocarina-songs.ts'
import { MatchHold } from './intonation-round.ts'
import { formatNote, midiToName } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, readSettings, subscribeSettings } from './settings.ts'
import { silenceSpeech, speakChinese } from './speak.ts'

const SONG_KEY = 'pitch-reader-ocarina'
const SHIFT_KEY = 'pitch-reader-ocarina-shift'
const DEFAULT_SHIFT = -12

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
const shiftSelect = document.querySelector<HTMLSelectElement>('#ocarina-shift')!

type Phase = 'idle' | 'playing' | 'singing' | 'learned'

let song = songById(localStorage.getItem(SONG_KEY) ?? 'lullaby')
let shift = readShift()
let shiftSong = ''
let phase: Phase = 'idle'
let step = 0
let token = 0
let abort: AbortController | null = null
let expectStop = false
const matched = new MatchHold()

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'singing' || detection.speaking) return
  const freq = detection.result.freq
  if (freq == null) return
  const hear = hearSongNote(freq, phrase()[step])
  const now = performance.now()
  const holdMs = readSettings().holdMs
  if (hear === 'match') {
    noteEl.textContent = noteName(phrase()[step])
    noteEl.className = 'note is-tuned'
    detailEl.textContent = '稳住'
    extraEl.textContent = ''
    if (matched.push(now, true, holdMs)) advance()
    return
  }
  matched.reset()
  if (hear === 'wrong') {
    noteEl.textContent = '不对'
    noteEl.className = 'note is-stable'
    detailEl.textContent = detection.result.note ? `唱成了 ${formatNote(detection.result.note)}` : '换一个音'
    extraEl.textContent = '不对'
    return
  }
  noteEl.textContent = hear === 'low' ? '低了' : '高了'
  noteEl.className = 'note is-stable'
  detailEl.textContent = `这个音是 ${noteName(phrase()[step])}`
  extraEl.textContent = hear === 'low' ? '低了' : '高了'
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
shiftSelect.addEventListener('change', () => {
  if (phase === 'playing' || phase === 'singing') return
  shift = clampPhraseShift(song.notes, Number(shiftSelect.value))
  localStorage.setItem(SHIFT_KEY, String(shift))
  render()
})

render()

export function stopOcarina(): void {
  token += 1
  abort?.abort()
  abort = null
  haltMic()
  silenceSpeech()
  phase = 'idle'
  step = 0
  render()
}

export function handleOcarinaSpace(): void {
  if (phase === 'playing') return
  if (phase === 'singing') void present()
  else void begin()
}

function choose(id: string): void {
  song = songById(id)
  shift = clampPhraseShift(song.notes, shift)
  localStorage.setItem(SONG_KEY, song.id)
  localStorage.setItem(SHIFT_KEY, String(shift))
  phase = 'idle'
  step = 0
  render()
}

async function begin(): Promise<void> {
  step = 0
  statusEl.textContent = ''
  await present()
}

async function present(): Promise<void> {
  const notes = phrase()
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  phase = 'playing'
  matched.reset()
  haltMic()
  render()
  try {
    await playMidiSequence([notes[step]], () => {
      noteEl.textContent = noteName(notes[step])
      noteEl.className = 'note is-live'
      detailEl.textContent = '先听'
    }, controller.signal, readSettings().noteSeconds)
  } catch (error) {
    if (controller.signal.aborted || run !== token) return
    phase = 'idle'
    statusEl.textContent = error instanceof Error ? error.message : '这个音没有播出来。'
    render()
    return
  }
  if (controller.signal.aborted || run !== token) return
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

function advance(): void {
  if (phase !== 'singing') return
  step += 1
  matched.reset()
  if (step >= phrase().length) {
    token += 1
    phase = 'learned'
    haltMic()
    render()
    speakChinese('学会了')
    return
  }
  void present()
}

function finish(): void {
  token += 1
  abort?.abort()
  haltMic()
  silenceSpeech()
  phase = 'idle'
  step = 0
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
  const notes = phrase()
  replayButton.disabled = !busy
  fillShift(busy)
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
    detailEl.textContent = '点开始，听第一个音'
    extraEl.textContent = ''
    renderMeter(0)
  } else if (phase === 'playing') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '先听'
    extraEl.textContent = ''
  } else if (phase === 'singing') {
    noteEl.textContent = noteName(notes[step])
    noteEl.className = 'note is-empty'
    detailEl.textContent = `哼第 ${step + 1} 个音，哼准再继续`
    extraEl.textContent = ''
  } else if (phase === 'learned') {
    noteEl.textContent = '学会了'
    noteEl.className = 'note is-tuned'
    detailEl.textContent = song.title
    extraEl.textContent = '学会了'
  }
  root.dataset.state = phase
}

function phrase(): number[] {
  return transposePhrase(song.notes, shift)
}

function readShift(): number {
  const raw = localStorage.getItem(SHIFT_KEY)
  const parsed = raw == null || raw === '' ? DEFAULT_SHIFT : Number(raw)
  return clampPhraseShift(song.notes, Number.isInteger(parsed) ? parsed : DEFAULT_SHIFT)
}

function fillShift(busy: boolean): void {
  if (shiftSong !== song.id) {
    const { min, max } = phraseShiftBounds(song.notes)
    const low = Math.min(...song.notes)
    const high = Math.max(...song.notes)
    const options: HTMLOptionElement[] = []
    for (let value = min; value <= max; value += 1) {
      const option = document.createElement('option')
      option.value = String(value)
      option.textContent = `${noteName(low + value)}–${noteName(high + value)}`
      options.push(option)
    }
    shiftSelect.replaceChildren(...options)
    shiftSong = song.id
  }
  shiftSelect.value = String(shift)
  shiftSelect.disabled = busy
}

function paintNotes(): void {
  notesEl.replaceChildren(
    ...phrase().map((midi, index) => {
      const item = document.createElement('li')
      item.textContent = noteName(midi)
      if ((phase === 'playing' || phase === 'singing') && index === step) item.classList.add('is-now')
      if ((phase === 'playing' || phase === 'singing') && index < step) item.classList.add('is-reached')
      if (phase === 'learned') item.classList.add('is-reached')
      return item
    }),
  )
}

function noteName(midi: number): string {
  return formatNote(midiToName(midi))
}

function renderMeter(rms: number): void {
  const level = Math.min(1, Math.sqrt(rms) / 0.45)
  levelEl.style.transform = `scaleX(${level})`
  levelEl.classList.toggle('hot', rms >= listener.rmsMin)
}
