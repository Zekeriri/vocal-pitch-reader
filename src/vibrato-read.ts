export type VibratoSample = {
  time: number
  midi: number
}

export type VibratoSpeed = 'slow' | 'medium' | 'fast' | 'faster'

export type VibratoRead = {
  cycles: number
  rate: number | null
  depthCents: number | null
}

export const CYCLE_MARKS = 9
export const CYCLE_MIN = 7
export const MIN_SWING_CENTS = 35

export const SPEEDS: readonly { id: VibratoSpeed; title: string; low: number; high: number; label: string }[] = [
  { id: 'slow', title: '慢速', low: 3, high: 4, label: '3～4 次/秒' },
  { id: 'medium', title: '中速', low: 4, high: 5, label: '4～5 次/秒' },
  { id: 'fast', title: '快速', low: 5, high: 6, label: '5～6 次/秒' },
  { id: 'faster', title: '超快', low: 6, high: Infinity, label: '6 次/秒以上' },
]

const WAVE_PX_PER_CENT = 0.5

export function displayCents(cents: readonly number[]): number[] {
  return smoothCents(smoothCents(cents))
}

export function displayWaveY(cents: number): number {
  return Math.min(106, Math.max(14, 60 - cents * WAVE_PX_PER_CENT))
}

function smoothCents(cents: readonly number[]): number[] {
  return cents.map((_, index) => {
    const left = cents[Math.max(0, index - 1)]
    const mid = cents[index]
    const right = cents[Math.min(cents.length - 1, index + 1)]
    return (left + mid + right) / 3
  })
}

export function speedForRate(rate: number): VibratoSpeed | null {
  const rounded = Math.round(rate * 100) / 100
  const found = SPEEDS.find((speed) => rounded >= speed.low && rounded < speed.high)
  return found?.id ?? null
}

export function readVibrato(
  samples: readonly VibratoSample[],
  now = samples.at(-1)?.time ?? 0,
  rateWindowMs = 2000,
): VibratoRead {
  const cycles = countCycles(samples)
  const recent = samples.filter((sample) => sample.time >= now - rateWindowMs)
  const rate = rateOf(recent)
  return {
    cycles,
    rate,
    depthCents: depthOf(recent.length >= 4 ? recent : samples),
  }
}

function countCycles(samples: readonly VibratoSample[]): number {
  return Math.floor(turns(samples).length / 2)
}

function rateOf(samples: readonly VibratoSample[]): number | null {
  const marks = turns(samples)
  const periods: number[] = []
  for (let index = 0; index + 2 < marks.length; index += 2) {
    periods.push(marks[index + 2] - marks[index])
  }
  if (periods.length === 0) return null
  const mean = periods.reduce((sum, period) => sum + period, 0) / periods.length
  if (mean <= 0) return null
  return 1000 / mean
}

function depthOf(samples: readonly VibratoSample[]): number | null {
  if (samples.length < 4) return null
  let low = samples[0].midi
  let high = samples[0].midi
  for (const sample of samples) {
    if (sample.midi < low) low = sample.midi
    if (sample.midi > high) high = sample.midi
  }
  return ((high - low) * 100) / 2
}

function turns(samples: readonly VibratoSample[], minCents = MIN_SWING_CENTS): number[] {
  if (samples.length < 3) return []
  const center = samples.reduce((sum, sample) => sum + sample.midi, 0) / samples.length
  const cents = samples.map((sample) => (sample.midi - center) * 100)
  let extreme = cents[0]
  let extremeAt = samples[0].time
  let direction: 1 | -1 | 0 = 0
  const marks: number[] = []
  for (let index = 1; index < cents.length; index += 1) {
    const value = cents[index]
    if (direction === 0) {
      if (value >= extreme + minCents) {
        direction = 1
        extreme = value
        extremeAt = samples[index].time
      } else if (value <= extreme - minCents) {
        direction = -1
        extreme = value
        extremeAt = samples[index].time
      } else if (Math.abs(value) > Math.abs(extreme)) {
        extreme = value
        extremeAt = samples[index].time
      }
      continue
    }
    if (direction === 1) {
      if (value >= extreme) {
        extreme = value
        extremeAt = samples[index].time
      } else if (extreme - value >= minCents) {
        marks.push(extremeAt)
        direction = -1
        extreme = value
        extremeAt = samples[index].time
      }
    } else if (value <= extreme) {
      extreme = value
      extremeAt = samples[index].time
    } else if (value - extreme >= minCents) {
      marks.push(extremeAt)
      direction = 1
      extreme = value
      extremeAt = samples[index].time
    }
  }
  return marks
}
