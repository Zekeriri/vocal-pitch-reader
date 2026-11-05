import { readSettings } from './settings.ts'

type PianoEngine = {
  context: AudioContext
  node: AudioWorkletNode
}

let opening: Promise<PianoEngine> | null = null

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
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

function workletUrl(): URL {
  return new URL('piano-worklet.js', new URL(import.meta.env.BASE_URL, window.location.href))
}

function engine(): Promise<PianoEngine> {
  if (opening) return opening
  const context = new AudioContext()
  opening = (async () => {
    await context.resume()
    await context.audioWorklet.addModule(workletUrl())
    const node = new AudioWorkletNode(context, 'piano-voice', { outputChannelCount: [2] })
    node.connect(context.destination)
    return { context, node }
  })().catch((error: unknown) => {
    opening = null
    void context.close().catch(() => {})
    throw error
  })
  return opening
}

function silence(node: AudioWorkletNode | null): void {
  node?.port.postMessage({ type: 'stop' })
}

export async function playMidiSequence(
  midis: number[],
  onIndex: (index: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const { context, node } = await engine()
  if (signal.aborted) return
  if (context.state === 'suspended') await context.resume()
  const onAbort = () => silence(node)
  signal.addEventListener('abort', onAbort)
  try {
    for (let index = 0; index < midis.length; index += 1) {
      if (signal.aborted) return
      onIndex(index)
      const seconds = readSettings().noteSeconds
      node.port.postMessage({ type: 'note', freq: midiToFreq(midis[index]), seconds })
      await wait(seconds * 1000 + 40, signal)
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (signal.aborted) silence(node)
  }
}
