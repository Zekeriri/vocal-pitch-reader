import { NOTE_SLOT_COUNT, noteSlotIndex } from './pitch.ts'

function notesUrl(): string {
  return new URL('notes/notes.wav', new URL(import.meta.env.BASE_URL, window.location.href)).href
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

function waitForMetadata(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const finish = () => {
      audio.removeEventListener('loadedmetadata', finish)
      audio.removeEventListener('error', fail)
      resolve()
    }
    const fail = () => {
      audio.removeEventListener('loadedmetadata', finish)
      audio.removeEventListener('error', fail)
      reject(new Error('音名声音加载失败'))
    }
    audio.addEventListener('loadedmetadata', finish)
    audio.addEventListener('error', fail)
  })
}

function seekTo(audio: HTMLAudioElement, time: number): Promise<void> {
  if (Math.abs(audio.currentTime - time) < 0.02) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      audio.removeEventListener('seeked', finish)
      window.clearTimeout(timer)
      resolve()
    }
    const timer = window.setTimeout(finish, 500)
    audio.addEventListener('seeked', finish)
    try {
      audio.currentTime = time
    } catch {
      finish()
    }
  })
}

export class NoteVoice {
  private audio: HTMLAudioElement | null = null
  private stopTimer = 0
  private playToken = 0
  private unlockPromise: Promise<void> | null = null
  private unlockError: unknown = null
  private unlocked = false
  playing = false
  lastError: string | null = null

  prime(): void {
    const audio = this.element()
    if (!audio.src) audio.src = notesUrl()
    if (this.playing) return
    audio.volume = 0
    const pending = audio.play()
    const settle = pending.then(() => {
      this.unlocked = true
      if (this.playing) return
      audio.pause()
      audio.volume = 1
    })
    if (this.unlocked || this.unlockPromise) {
      void settle.catch(() => {
        audio.volume = 1
      })
      return
    }
    this.unlockPromise = settle.catch((error: unknown) => {
      this.unlockError = error
      this.unlockPromise = null
      audio.volume = 1
    })
  }

  stop(): void {
    this.playToken += 1
    this.playing = false
    window.clearTimeout(this.stopTimer)
    this.audio?.pause()
  }

  async play(note: string): Promise<boolean> {
    const index = noteSlotIndex(note)
    if (index == null) return false
    const audio = this.element()
    const token = ++this.playToken
    this.playing = true
    this.lastError = null
    window.clearTimeout(this.stopTimer)
    try {
      if (!audio.src) audio.src = notesUrl()
      if (!this.unlocked) {
        this.prime()
        if (this.unlockPromise) await withTimeout(this.unlockPromise, 8000, '音名声音加载失败')
        if (!this.unlocked) {
          throw this.unlockError instanceof Error
            ? this.unlockError
            : new Error('音名没有播出来。请把音量打开后再试。')
        }
      }
      if (token !== this.playToken) return false
      await withTimeout(waitForMetadata(audio), 8000, '音名声音加载失败')
      if (token !== this.playToken) return false
      const slot = audio.duration / NOTE_SLOT_COUNT
      if (!Number.isFinite(slot) || slot <= 0) throw new Error('音名声音加载失败')
      audio.pause()
      await seekTo(audio, index * slot)
      if (token !== this.playToken) return false
      audio.muted = false
      audio.volume = 1
      await withTimeout(audio.play(), 8000, '音名没有播出来。请把音量打开后再试。')
      this.stopTimer = window.setTimeout(() => {
        if (this.playToken !== token) return
        audio.pause()
        this.playing = false
      }, slot * 1000 + 80)
      return true
    } catch (error) {
      if (token === this.playToken) {
        this.playing = false
        audio.pause()
        this.lastError = voiceErrorMessage(error)
      }
      throw error
    }
  }

  private element(): HTMLAudioElement {
    if (this.audio) return this.audio
    const audio = new Audio()
    audio.preload = 'auto'
    audio.setAttribute('playsinline', 'true')
    audio.setAttribute('webkit-playsinline', 'true')
    audio.setAttribute('data-note-voice', '')
    audio.style.cssText = 'position:fixed;left:-9999px;width:1px;height:1px;pointer-events:none'
    document.body.append(audio)
    this.audio = audio
    return audio
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
