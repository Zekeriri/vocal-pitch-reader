import { NOTE_SLOT_COUNT, noteSlotIndex } from './pitch.ts'

function notesUrl(): string {
  return new URL('notes/notes.wav', new URL(import.meta.env.BASE_URL, window.location.href)).href
}

export class NoteVoice {
  private encoded: Promise<ArrayBuffer> | null = null
  private buffer: AudioBuffer | null = null
  private context: AudioContext | null = null
  private gain: GainNode | null = null
  private source: AudioBufferSourceNode | null = null
  private playToken = 0
  playing = false

  attach(context: AudioContext): void {
    this.detach()
    this.context = context
    const gain = context.createGain()
    gain.gain.value = 1
    gain.connect(context.destination)
    this.gain = gain
    void this.decode()
  }

  detach(): void {
    this.playToken += 1
    this.stopSource()
    this.gain?.disconnect()
    this.gain = null
    this.buffer = null
    this.context = null
  }

  async play(note: string): Promise<boolean> {
    const index = noteSlotIndex(note)
    const context = this.context
    const gain = this.gain
    if (index == null || !context || !gain) return false
    const token = ++this.playToken
    const buffer = await this.decode()
    if (!buffer || token !== this.playToken || this.context !== context || this.gain !== gain) return false
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
    const slot = buffer.duration / NOTE_SLOT_COUNT
    source.start(0, index * slot, slot)
    window.setTimeout(() => {
      if (this.source !== source) return
      this.playing = false
      this.source = null
    }, slot * 1000 + 150)
    return true
  }

  private decode(): Promise<AudioBuffer | null> {
    if (this.buffer) return Promise.resolve(this.buffer)
    if (!this.encoded) {
      this.encoded = fetch(notesUrl()).then((response) => {
        if (!response.ok) throw new Error('音名声音加载失败')
        return response.arrayBuffer()
      })
    }
    const context = this.context
    if (!context) return Promise.resolve(null)
    return this.encoded
      .then((encoded) => context.decodeAudioData(encoded.slice(0)))
      .then((buffer) => {
        if (this.context === context) this.buffer = buffer
        return buffer
      })
      .catch((error: unknown) => {
        this.encoded = null
        throw error
      })
  }

  private stopSource(): void {
    const source = this.source
    if (!source) return
    this.source = null
    this.playing = false
    source.onended = null
    try {
      source.stop()
    } catch {
      // already stopped
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
  void context.resume()
}
