import { PitchListener, micErrorMessage } from './audio.ts'
import { hearSongNote, songById } from './ocarina-songs.ts'
import { MatchHold } from './intonation-round.ts'
import { formatNote, midiToName } from './pitch.ts'
import { playMidiSequence } from './scale-player.ts'
import { gateMarkRatio, gateToRms, readSettings, subscribeSettings } from './settings.ts'
import { silenceSpeech, speakChinese } from './speak.ts'

const SONG_KEY = 'pitch-reader-ocarina'
const PHRASE_SECONDS = 0.62

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

type Phase = 'idle' | 'playing' | 'singing' | 'learned'

let song = songById(localStorage.getItem(SONG_KEY) ?? 'lullaby')
let phase: Phase = 'idle'
let step = 0
let playIndex = -1
let token = 0
let abort: AbortController | null = null
let expectStop = false
let freshStart = false
const matched = new MatchHold()
const missed = new MatchHold()

const listener = new PitchListener((detection) => {
  renderMeter(detection.rms)
  if (phase !== 'singing' || detection.speaking) return
  const freq = detection.result.freq
  if (freq == null) {
    freshStart = false
    return
  }
  const hear = hearSongNote(freq, song.notes[step])
  const now = performance.now()
  const holdMs = readSettings().holdMs
  if (hear === 'match') {
    missed.reset()
    freshStart = false
    noteEl.textContent = noteName(song.notes[step])
    noteEl.className = 'note is-tuned'
    detailEl.textContent = '稳住'
    extraEl.textContent = ''
    if (matched.push(now, true, holdMs)) advance()
    return
  }
  matched.reset()
  if (hear === 'wrong') {
    if (freshStart && step === 0) {
      noteEl.textContent = '不对'
      noteEl.className = 'note is-stable'
      detailEl.textContent = '从头再哼'
      extraEl.textContent = '不对'
      missed.reset()
      return
    }
    noteEl.textContent = '不对'
    noteEl.className = 'note is-stable'
    detailEl.textContent = detection.result.note ? `唱成了 ${formatNote(detection.result.note)}` : '换一个音'
    extraEl.textContent = '不对'
    if (missed.push(now, true, holdMs)) restartPhrase()
    return
  }
  missed.reset()
  noteEl.textContent = hear === 'low' ? '低了' : '高了'
  noteEl.className = 'note is-stable'
  detailEl.textContent = `这个音是 ${noteName(song.notes[step])}`
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
  if (phase === 'playing' || phase === 'singing') void begin()
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
  step = 0
  playIndex = -1
  render()
}

export function handleOcarinaSpace(): void {
  if (phase === 'playing') return
  void begin()
}

function choose(id: string): void {
  song = songById(id)
  localStorage.setItem(SONG_KEY, song.id)
  phase = 'idle'
  step = 0
  playIndex = -1
  render()
}

async function begin(): Promise<void> {
  const run = ++token
  abort?.abort()
  const controller = new AbortController()
  abort = controller
  phase = 'playing'
  step = 0
  playIndex = -1
  matched.reset()
  missed.reset()
  freshStart = false
  statusEl.textContent = ''
  haltMic()
  render()
  const seconds = Math.min(PHRASE_SECONDS, readSettings().noteSeconds)
  try {
    await playMidiSequence(song.notes, (index) => {
      playIndex = index
      noteEl.textContent = noteName(song.notes[index])
      noteEl.className = 'note is-live'
      detailEl.textContent = '先听'
      paintNotes()
    }, controller.signal, seconds)
  } catch (error) {
    if (controller.signal.aborted || run !== token) return
    phase = 'idle'
    statusEl.textContent = error instanceof Error ? error.message : '这首没有播出来。'
    render()
    return
  }
  if (controller.signal.aborted || run !== token) return
  playIndex = -1
  phase = 'singing'
  step = 0
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
  missed.reset()
  if (step >= song.notes.length) {
    token += 1
    phase = 'learned'
    haltMic()
    render()
    speakChinese('学会了')
    return
  }
  render()
}

function restartPhrase(): void {
  if (phase !== 'singing') return
  freshStart = true
  if (step === 0) {
    missed.reset()
    detailEl.textContent = '从头再哼'
    return
  }
  step = 0
  matched.reset()
  missed.reset()
  noteEl.textContent = '不对'
  noteEl.className = 'note is-stable'
  detailEl.textContent = '从头再哼'
  extraEl.textContent = '不对'
  paintNotes()
}

function finish(): void {
  token += 1
  abort?.abort()
  haltMic()
  silenceSpeech()
  phase = 'idle'
  step = 0
  playIndex = -1
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
    phase === 'playing' || phase === 'singing' ? '结束' : phase === 'learned' ? '再来一次' : '先听再哼'
  paintNotes()
  if (phase === 'idle') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '先听旋律，再按顺序哼出来'
    extraEl.textContent = ''
    renderMeter(0)
  } else if (phase === 'playing') {
    noteEl.textContent = '·'
    noteEl.className = 'note is-empty'
    detailEl.textContent = '先听'
    extraEl.textContent = ''
  } else if (phase === 'singing') {
    noteEl.textContent = noteName(song.notes[step])
    noteEl.className = 'note is-empty'
    detailEl.textContent = `哼第 ${step + 1} 个音`
    extraEl.textContent = ''
  } else if (phase === 'learned') {
    noteEl.textContent = '学会了'
    noteEl.className = 'note is-tuned'
    detailEl.textContent = song.title
    extraEl.textContent = '学会了'
  }
  root.dataset.state = phase
}

function paintNotes(): void {
  notesEl.replaceChildren(
    ...song.notes.map((midi, index) => {
      const item = document.createElement('li')
      item.textContent = noteName(midi)
      if (phase === 'playing' && index === playIndex) item.classList.add('is-now')
      if (phase === 'singing' && index === step) item.classList.add('is-now')
      if (phase === 'singing' && index < step) item.classList.add('is-reached')
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
