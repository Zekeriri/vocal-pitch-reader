import { readSettings } from './settings.ts'
import { timbreSpec, type TimbrePartial } from './timbre.ts'

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

function tone(context: AudioContext, freq: number, signal: AbortSignal): Promise<void> {
  const spec = timbreSpec(readSettings().timbre)
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const master = context.createGain()
    master.gain.value = 0.9
    master.connect(context.destination)
    const now = context.currentTime
    const stopAt = now + spec.seconds + 0.03
    let pending = spec.partials.length + (spec.noise > 0 ? 1 : 0)
    const done = () => {
      pending -= 1
      if (pending > 0) return
      master.disconnect()
      resolve()
    }
    if (spec.noise > 0) scheduleNoise(context, master, now, spec.noise, done)
    const weight = spec.partials.reduce((sum, partial) => sum + partial.gain, 0)
    for (const partial of spec.partials) {
      schedulePartial(context, master, freq, partial, weight, spec.attack, spec.inharmonicity, now, spec.seconds, stopAt, done)
    }
  })
}

function schedulePartial(
  context: AudioContext,
  master: GainNode,
  freq: number,
  partial: TimbrePartial,
  weight: number,
  attack: number,
  inharmonicity: number,
  now: number,
  seconds: number,
  stopAt: number,
  done: () => void,
): void {
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'sine'
  const stretch = 1 + inharmonicity * partial.ratio * partial.ratio
  osc.frequency.value = freq * partial.ratio * stretch
  const peak = Math.max(0.0002, (0.22 * partial.gain) / weight)
  const rise = Math.min(attack, seconds * 0.35)
  const release = Math.max(now + rise + 0.04, now + seconds * partial.decay)
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + rise)
  gain.gain.exponentialRampToValueAtTime(0.0001, Math.min(stopAt, release))
  osc.connect(gain)
  gain.connect(master)
  osc.start(now)
  osc.stop(stopAt)
  osc.onended = () => {
    osc.disconnect()
    gain.disconnect()
    done()
  }
}

function scheduleNoise(
  context: AudioContext,
  master: GainNode,
  now: number,
  amount: number,
  done: () => void,
): void {
  const length = Math.max(1, Math.floor(context.sampleRate * 0.03))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index++) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length)
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = buffer
  filter.type = 'highpass'
  filter.frequency.value = 1400
  gain.gain.setValueAtTime(amount, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start(now)
  source.stop(now + 0.05)
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
    done()
  }
}

export async function playMidiSequence(
  midis: number[],
  onIndex: (index: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const context = new AudioContext()
  try {
    await context.resume()
    for (let index = 0; index < midis.length; index++) {
      if (signal.aborted) return
      onIndex(index)
      await tone(context, midiToFreq(midis[index]), signal)
      await wait(50, signal)
    }
  } finally {
    if (context.state !== 'closed') await context.close()
  }
}
