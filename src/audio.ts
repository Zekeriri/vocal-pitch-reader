import { MedianPitch, NoteLock, PitchDetector, type LockResult } from './pitch.ts'
import { NoteVoice, releaseAudioSession, resumeContext, setAudioSession, unlockAudio } from './speak.ts'

export type ListenMode = 'idle' | 'mic' | 'test'

export type Detection = {
  mode: Exclude<ListenMode, 'idle'>
  rms: number
  result: LockResult
  speaking: boolean
  voiceError: string | null
}

type WorkletMessage = {
  samples: Float32Array
  rms: number
}

const CLARITY_MIN = 0.82

export class PitchListener {
  private readonly onDetect: (detection: Detection) => void
  private readonly onStop: (kind: Exclude<ListenMode, 'idle'>) => void
  private context: AudioContext | null = null
  private stream: MediaStream | null = null
  private worklet: AudioWorkletNode | null = null
  private monitor: GainNode | null = null
  private oscillator: OscillatorNode | null = null
  private detector = new PitchDetector()
  private median = new MedianPitch(3)
  private lock = new NoteLock()
  private voice = new NoteVoice()
  private voiceError: string | null = null
  private unwatchContext: (() => void) | null = null
  private token = 0
  private testTimer = 0
  mode: ListenMode = 'idle'
  rmsMin = 0.008

  constructor(
    onDetect: (detection: Detection) => void,
    onStop: (kind: Exclude<ListenMode, 'idle'>) => void = () => {},
  ) {
    this.onDetect = onDetect
    this.onStop = onStop
  }

  setHoldMs(ms: number): void {
    this.lock.setHoldMs(ms)
  }

  async startMic(): Promise<boolean> {
    this.token++
    this.teardown()
    const token = this.token
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('这台浏览器没有麦克风接口。')
    }

    // iPhone 默认把网页合成声静音，录音时还会改走听筒。
    // 先保持 auto 让麦克风能打开，拿到麦之后再切到边录边放，把声音送回扬声器或耳机。
    setAudioSession('auto')
    this.voice.prime()
    this.voiceError = null
    const streamPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: { ideal: false },
        noiseSuppression: { ideal: false },
        autoGainControl: { ideal: false },
        channelCount: { ideal: 1 },
      },
    })
    const context = new AudioContext()
    this.context = context
    this.watchContext(context)
    unlockAudio(context)

    try {
      await resumeContext(context)
      const stream = await streamPromise
      if (token !== this.token) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }
      setAudioSession('play-and-record')
      await resumeContext(context)
      await this.attach(context, token)
      if (token !== this.token || !this.worklet) {
        stream.getTracks().forEach((track) => track.stop())
        return false
      }
      this.stream = stream
      const source = context.createMediaStreamSource(stream)
      source.connect(this.worklet)
      if (this.monitor) this.monitor.gain.value = 0
      this.mode = 'mic'
      return true
    } catch (error) {
      streamPromise.then((stream) => stream.getTracks().forEach((track) => track.stop())).catch(() => {})
      if (token === this.token) this.teardown()
      throw error
    }
  }

  async startTest(freq = 196): Promise<boolean> {
    this.token++
    this.teardown()
    const token = this.token
    setAudioSession('playback')
    this.voice.prime()
    this.voiceError = null
    const context = new AudioContext()
    this.context = context
    this.watchContext(context)
    unlockAudio(context)
    try {
      await resumeContext(context)
      await this.attach(context, token)
      if (token !== this.token || !this.worklet) return false

      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = freq
      oscillator.connect(this.worklet)
      oscillator.start()
      this.oscillator = oscillator
      if (this.monitor) this.monitor.gain.value = 0.12
      this.mode = 'test'
      this.testTimer = window.setTimeout(() => {
        if (this.token !== token) return
        this.stop()
      }, 2200)
      return true
    } catch (error) {
      if (token === this.token) this.teardown()
      throw error
    }
  }

  stop(): void {
    const kind = this.mode
    this.token++
    this.teardown()
    if (kind === 'mic' || kind === 'test') this.onStop(kind)
  }

  private async attach(context: AudioContext, token: number): Promise<void> {
    const workletUrl = new URL(
      'pitch-worklet.js',
      new URL(import.meta.env.BASE_URL, window.location.href),
    )
    await context.audioWorklet.addModule(workletUrl)
    if (token !== this.token) return
    const worklet = new AudioWorkletNode(context, 'pitch-reader')
    const monitor = context.createGain()
    monitor.gain.value = 0
    worklet.connect(monitor)
    monitor.connect(context.destination)
    worklet.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      if (token !== this.token) return
      this.handleFrame(event.data)
    }
    this.worklet = worklet
    this.monitor = monitor
    this.lock.reset()
    this.median.reset()
  }

  private handleFrame(frame: WorkletMessage): void {
    if (this.mode === 'idle' || !this.context) return
    const speaking = this.voice.playing
    const estimate =
      frame.rms >= this.rmsMin ? this.detector.detect(frame.samples, this.context.sampleRate) : null
    const freq = estimate && estimate.clarity >= CLARITY_MIN ? estimate.freq : null
    if (speaking) {
      this.onDetect({
        mode: this.mode,
        rms: frame.rms,
        result: {
          note: null,
          midi: null,
          freq: null,
          cents: null,
          stable: false,
          announce: null,
        },
        speaking: true,
        voiceError: this.voiceError,
      })
      return
    }
    const smoothed = this.median.push(freq)
    const result = this.lock.update(performance.now(), smoothed)
    if (result.announce) {
      const announced = result.announce
      void this.voice.play(announced).then(
        (ok) => {
          if (ok) this.voiceError = null
          else if (this.voice.lastError) this.voiceError = this.voice.lastError
        },
        () => {
          this.voiceError = this.voice.lastError ?? '音名没有播出来。请把音量打开后再试。'
        },
      )
    }
    this.onDetect({
      mode: this.mode,
      rms: frame.rms,
      result,
      speaking: false,
      voiceError: this.voiceError,
    })
  }

  private watchContext(context: AudioContext): void {
    this.unwatchContext?.()
    const onState = () => {
      if (context.state === 'closed') return
      if (context.state !== 'running') void resumeContext(context).catch(() => {})
    }
    context.addEventListener('statechange', onState)
    this.unwatchContext = () => context.removeEventListener('statechange', onState)
  }

  private teardown(): void {
    this.unwatchContext?.()
    this.unwatchContext = null
    this.voice.stop()
    releaseAudioSession()
    window.clearTimeout(this.testTimer)
    this.testTimer = 0
    if (this.oscillator) {
      try {
        this.oscillator.stop()
      } catch {
        // already stopped
      }
      this.oscillator.disconnect()
      this.oscillator = null
    }
    this.worklet?.disconnect()
    this.worklet = null
    this.monitor?.disconnect()
    this.monitor = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') void context.close()
    this.mode = 'idle'
    this.lock.reset()
    this.median.reset()
  }
}

export function micErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return '麦克风被拦住了。在浏览器地址栏允许麦克风后再试。'
    }
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') {
      return '没有找到可用的麦克风。'
    }
  }
  if (error instanceof Error && error.message) return error.message
  return '麦克风打不开。'
}
