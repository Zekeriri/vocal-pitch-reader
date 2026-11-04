import silenceUrl from './silence.mp3'
import { NOTE_SLOT_COUNT, noteSlotIndex } from './pitch.ts'

function noteUrl(index: number): string {
  const name = `notes/n${String(index).padStart(2, '0')}.mp3`
  return new URL(name, new URL(import.meta.env.BASE_URL, window.location.href)).href
}

function voiceErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return '手机拦住了声音。点「停止」，再点一次「开始听」。'
  }
  if (error instanceof Error && error.message) return error.message
  return '音名没有播出来。请把音量打开后再试。'
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function decodeAudio(context: AudioContext, encoded: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false
    const ok = (buffer: AudioBuffer) => {
      if (settled) return
      settled = true
      resolve(buffer)
    }
    const bad = () => {
      if (settled) return
      settled = true
      reject(new Error('音名声音加载失败'))
    }
    const result = context.decodeAudioData(encoded.slice(0), ok, bad) as Promise<AudioBuffer> | undefined
    if (result && typeof result.then === 'function') void result.then(ok, bad)
  })
}

function mountAudio(marker: string): HTMLAudioElement {
  const audio = new Audio()
  audio.preload = 'auto'
  audio.setAttribute('playsinline', 'true')
  audio.setAttribute('webkit-playsinline', 'true')
  audio.dataset.noteVoice = marker
  audio.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0.02;pointer-events:none'
  document.body.append(audio)
  return audio
}

export class NoteVoice {
  private keeper: HTMLAudioElement | null = null
  private noteAudio: HTMLAudioElement | null = null
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private stopTimer = 0
  private playToken = 0
  private holding = false
  playing = false
  lastError: string | null = null

  prime(): void {
    this.holding = true
    const keeper = this.keeperElement()
    keeper.loop = true
    keeper.volume = 1
    if (!keeper.src) keeper.src = silenceUrl
    this.resumeElement(keeper)
    const note = this.noteElement()
    if (!note.src) {
      note.src = silenceUrl
      this.resumeElement(note)
    }
  }

  attach(context: AudioContext): void {
    this.context = context
    this.gain?.disconnect()
    const gain = context.createGain()
    gain.gain.value = 1
    gain.connect(context.destination)
    this.gain = gain
  }

  stop(): void {
    this.playToken += 1
    this.holding = false
    this.playing = false
    window.clearTimeout(this.stopTimer)
    this.stopSource()
    this.keeper?.pause()
    this.noteAudio?.pause()
    this.gain?.disconnect()
    this.gain = null
    this.context = null
  }

  async play(note: string): Promise<boolean> {
    const index = noteSlotIndex(note)
    if (index == null || index >= NOTE_SLOT_COUNT) return false
    const token = ++this.playToken
    this.lastError = null
    window.clearTimeout(this.stopTimer)
    this.playing = true
    try {
      await this.playFile(index, token)
      return true
    } catch (error) {
      if (token !== this.playToken) return false
      try {
        await this.playBuffer(index, token)
        return true
      } catch {
        if (token === this.playToken) {
          this.playing = false
          this.lastError = voiceErrorMessage(error)
        }
        throw error
      }
    }
  }

  private async playFile(index: number, token: number): Promise<void> {
    const audio = this.noteElement()
    const url = noteUrl(index)
    audio.loop = false
    audio.muted = false
    audio.volume = 1
    if (audio.src !== url) audio.src = url
    try {
      audio.currentTime = 0
    } catch {
      // 文件还没开始时，有的浏览器不允许先跳到开头。
    }
    await withTimeout(audio.play(), 8000, '音名没有播出来。请把音量打开后再试。')
    if (token !== this.playToken) return
    this.armStop(token, 2100)
  }

  private async playBuffer(index: number, token: number): Promise<void> {
    const context = this.context
    const gain = this.gain
    if (!context || !gain) throw new Error('音名没有播出来。请把音量打开后再试。')
    await resumeContext(context)
    const response = await fetch(noteUrl(index))
    if (!response.ok) throw new Error('音名声音加载失败')
    const buffer = await decodeAudio(context, await response.arrayBuffer())
    if (token !== this.playToken || this.context !== context) return
    this.stopSource()
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(gain)
    source.onended = () => {
      if (this.source !== source) return
      this.playing = false
      this.source = null
    }
    this.source = source
    this.playing = true
    source.start(0)
    this.armStop(token, buffer.duration * 1000 + 80)
  }

  private armStop(token: number, ms: number): void {
    window.clearTimeout(this.stopTimer)
    this.stopTimer = window.setTimeout(() => {
      if (this.playToken !== token) return
      this.playing = false
    }, ms)
  }

  private resumeElement(audio: HTMLAudioElement): void {
    if (!audio.paused) return
    void audio.play().catch(() => {})
  }

  private keeperElement(): HTMLAudioElement {
    if (this.keeper) return this.keeper
    const audio = mountAudio('keeper')
    audio.addEventListener('pause', () => {
      if (!this.holding) return
      window.setTimeout(() => {
        if (!this.holding || !audio.paused) return
        this.resumeElement(audio)
      }, 200)
    })
    this.keeper = audio
    return audio
  }

  private noteElement(): HTMLAudioElement {
    if (this.noteAudio) return this.noteAudio
    this.noteAudio = mountAudio('note')
    return this.noteAudio
  }

  private stopSource(): void {
    const source = this.source
    if (!source) return
    this.source = null
    source.onended = null
    try {
      source.stop()
    } catch {
      // 已经停了。
    }
    source.disconnect()
  }
}

export function unlockAudio(context: AudioContext): void {
  const buffer = context.createBuffer(1, 1, context.sampleRate)
  const source = context.createBufferSource()
  source.buffer = buffer
  source.connect(context.destination)
  source.start()
  void resumeContext(context)
}

export function resumeContext(context: AudioContext): Promise<void> {
  if (context.state === 'running' || context.state === 'closed') return Promise.resolve()
  return context.resume().then(() => undefined)
}

export type AudioSessionType = 'auto' | 'playback' | 'play-and-record'

export function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = type
  } catch {
    // 旧系统没有这个开关。
  }
}

export function releaseAudioSession(): void {
  setAudioSession('playback')
  setAudioSession('auto')
}
