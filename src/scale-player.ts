import { nearestPianoSample, PIANO_SAMPLES } from './piano-samples.ts'
import { readSettings, subscribeSettings } from './settings.ts'

type PianoEngine = {
  context: AudioContext
  master: GainNode
  buffers: Map<string, AudioBuffer>
}

let opening: Promise<PianoEngine> | null = null
const playing = new Set<AudioBufferSourceNode>()

subscribeSettings((settings) => {
  applyVolume(settings.pianoVolume)
})

function applyVolume(percent: number): void {
  void opening?.then((engine) => {
    engine.master.gain.value = percent / 100
  })
}

function sampleUrl(file: string): URL {
  return new URL(`piano/${file}`, new URL(import.meta.env.BASE_URL, window.location.href))
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = window.setTimeout(finish, ms)
    const onAbort = () => finish()
    signal.addEventListener('abort', onAbort)
    function finish(): void {
      window.clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      resolve()
    }
  })
}

function engine(): Promise<PianoEngine> {
  if (opening) return opening
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = readSettings().pianoVolume / 100
  master.connect(context.destination)
  opening = (async () => {
    await context.resume()
    const buffers = new Map<string, AudioBuffer>()
    await Promise.all(
      PIANO_SAMPLES.map(async (sample) => {
        const response = await fetch(sampleUrl(sample.file))
        if (!response.ok) throw new Error('钢琴采样没有加载出来。')
        const audio = await context.decodeAudioData(await response.arrayBuffer())
        buffers.set(sample.file, audio)
      }),
    )
    return { context, master, buffers }
  })().catch((error: unknown) => {
    opening = null
    void context.close().catch(() => {})
    throw error
  })
  return opening
}

function silence(): void {
  for (const source of playing) {
    try {
      source.stop()
    } catch {
      // The note already finished.
    }
  }
  playing.clear()
}

function playOne(engine: PianoEngine, midi: number, seconds: number): void {
  const choice = nearestPianoSample(midi)
  const buffer = engine.buffers.get(choice.file)
  if (!buffer) throw new Error('钢琴采样没有加载出来。')
  const source = engine.context.createBufferSource()
  const note = engine.context.createGain()
  source.buffer = buffer
  source.playbackRate.value = choice.rate
  source.connect(note)
  note.connect(engine.master)
  const now = engine.context.currentTime
  const release = Math.min(0.16, seconds * 0.3)
  note.gain.setValueAtTime(1, now)
  note.gain.setValueAtTime(1, now + Math.max(0.01, seconds - release))
  note.gain.exponentialRampToValueAtTime(0.001, now + seconds)
  source.start(now)
  source.stop(now + seconds + 0.02)
  playing.add(source)
  source.onended = () => {
    playing.delete(source)
    source.disconnect()
    note.disconnect()
  }
}

export async function playMidiSequence(
  midis: number[],
  onIndex: (index: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const ready = await engine()
  if (signal.aborted) return
  if (ready.context.state === 'suspended') await ready.context.resume()
  ready.master.gain.value = readSettings().pianoVolume / 100
  const onAbort = () => silence()
  signal.addEventListener('abort', onAbort)
  try {
    for (let index = 0; index < midis.length; index += 1) {
      if (signal.aborted) return
      onIndex(index)
      const seconds = readSettings().noteSeconds
      playOne(ready, midis[index], seconds)
      await wait(seconds * 1000 + 40, signal)
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (signal.aborted) silence()
  }
}
