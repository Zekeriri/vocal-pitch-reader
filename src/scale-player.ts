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

function tone(context: BaseAudioContext, freq: number, when: number, signal: AbortSignal | null): Promise<void> {
  const spec = timbreSpec(readSettings().timbre)
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const master = context.createGain()
    master.gain.value = 0.9
    const toneBus = spec.soften ? softenedBus(context, master, when) : master
    master.connect(context.destination)
    const stopAt = when + spec.seconds + 0.04
    let pending = spec.partials.length + (spec.noise > 0 ? 1 : 0)
    const done = () => {
      pending -= 1
      if (pending > 0) return
      master.disconnect()
      resolve()
    }
    if (spec.noise > 0) scheduleNoise(context, master, when, spec.noise, spec.hammer, done)
    const weight = spec.partials.reduce((sum, partial) => sum + partial.gain, 0)
    for (const partial of spec.partials) {
      schedulePartial(context, toneBus, freq, partial, weight, spec.attack, spec.inharmonicity, when, spec.seconds, stopAt, done)
    }
  })
}

function softenedBus(context: BaseAudioContext, master: GainNode, when: number): BiquadFilterNode {
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.6
  filter.frequency.setValueAtTime(6800, when)
  filter.frequency.exponentialRampToValueAtTime(1500, when + 0.45)
  filter.connect(master)
  return filter
}

function schedulePartial(
  context: BaseAudioContext,
  master: AudioNode,
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
  const gain = context.createGain()
  const stretch = Math.sqrt(1 + inharmonicity * partial.ratio * partial.ratio)
  const stretched = freq * partial.ratio * stretch
  const voices = partial.detuneCents > 0 ? [partial.detuneCents / 2, -partial.detuneCents / 2] : [0]
  const peak = Math.max(0.0002, (0.24 * partial.gain) / weight / voices.length)
  const rise = Math.min(attack, seconds * 0.3)
  const decayEnd = Math.min(stopAt, Math.max(now + rise + 0.05, now + seconds * partial.decay))
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(peak, now + rise)
  if (partial.body < 0.92 && decayEnd - now > 0.75) {
    const bodyAt = now + rise + 0.12
    const held = Math.max(0.0002, peak * partial.body)
    const releaseAt = Math.max(bodyAt + 0.25, decayEnd - 0.32)
    gain.gain.exponentialRampToValueAtTime(held, bodyAt)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, held * 0.5), releaseAt)
    gain.gain.exponentialRampToValueAtTime(0.0001, decayEnd)
  } else {
    gain.gain.exponentialRampToValueAtTime(0.0001, decayEnd)
  }
  gain.connect(master)
  let left = voices.length
  for (const cents of voices) {
    const osc = context.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = stretched * 2 ** (cents / 1200)
    osc.connect(gain)
    osc.start(now)
    osc.stop(stopAt)
    osc.onended = () => {
      osc.disconnect()
      left -= 1
      if (left > 0) return
      gain.disconnect()
      done()
    }
  }
}

function scheduleNoise(
  context: BaseAudioContext,
  master: GainNode,
  now: number,
  amount: number,
  hammer: boolean,
  done: () => void,
): void {
  const length = Math.max(1, Math.floor(context.sampleRate * (hammer ? 0.014 : 0.03)))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index++) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length)
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = buffer
  filter.type = hammer ? 'bandpass' : 'highpass'
  filter.frequency.value = hammer ? 2400 : 1400
  filter.Q.value = 0.7
  gain.gain.setValueAtTime(amount, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + (hammer ? 0.02 : 0.045))
  source.connect(filter)
  filter.connect(gain)
  gain.connect(master)
  source.start(now)
  source.stop(now + (hammer ? 0.02 : 0.05))
  source.onended = () => {
    source.disconnect()
    filter.disconnect()
    gain.disconnect()
    done()
  }
}

export function renderNote(context: BaseAudioContext, freq: number, when = 0): Promise<void> {
  return tone(context, freq, when, null)
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
      await tone(context, midiToFreq(midis[index]), context.currentTime, signal)
      await wait(50, signal)
    }
  } finally {
    if (context.state !== 'closed') await context.close()
  }
}
