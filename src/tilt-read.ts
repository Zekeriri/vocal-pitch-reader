export type PitchSample = {
  time: number
  midi: number
}

export const SLIDE_FROM = 72
export const SLIDE_TO = 60
export const SLIDE_LIMIT_MS = 1000
export const TILT_MIN = 3
export const TILT_GAP_MS = 220
export const TILT_MIN_MS = 80
export const TILT_MAX_MS = 1000
export const LONG_MIN_MS = 3000
export const PITCH_WINDOW = 1

export type SlideRead = {
  durationMs: number
  from: number | null
  to: number | null
  short: boolean
  covered: boolean
}

export type TiltRead = {
  count: number
  openTooLong: boolean
}

export type SustainRead = {
  heldMs: number
  live: boolean
  away: boolean
}

export function readSlide(samples: readonly PitchSample[]): SlideRead {
  if (samples.length < 3) {
    return { durationMs: 0, from: null, to: null, short: false, covered: false }
  }
  const durationMs = samples[samples.length - 1].time - samples[0].time
  const from = average(samples.slice(0, Math.max(1, Math.ceil(samples.length * 0.25))))
  const to = average(samples.slice(Math.floor(samples.length * 0.75)))
  return {
    durationMs,
    from,
    to,
    short: durationMs >= 120 && durationMs <= SLIDE_LIMIT_MS,
    covered: from >= SLIDE_FROM - 3 && to <= SLIDE_TO + 4 && from - to >= 5,
  }
}

export function readTilts(samples: readonly PitchSample[], target: number, now: number): TiltRead {
  const groups = bursts(samples, TILT_GAP_MS)
  let count = 0
  let openTooLong = false
  groups.forEach((group, index) => {
    const open = index === groups.length - 1 && now - group[group.length - 1].time <= TILT_GAP_MS
    const duration = group[group.length - 1].time - group[0].time
    const onPitch = Math.abs(median(group) - target) <= PITCH_WINDOW
    if (open && onPitch && duration > TILT_MAX_MS) {
      openTooLong = true
      return
    }
    if (onPitch && duration >= TILT_MIN_MS && duration <= TILT_MAX_MS) count += 1
  })
  return { count, openTooLong }
}

export function readSustain(
  samples: readonly PitchSample[],
  target: number,
  now: number,
  tolerance = PITCH_WINDOW,
  gapMs = 300,
): SustainRead {
  let best = 0
  let segmentStart: number | null = null
  let lastOn: number | null = null
  for (const sample of samples) {
    if (Math.abs(sample.midi - target) > tolerance) {
      if (segmentStart != null && lastOn != null) best = Math.max(best, lastOn - segmentStart)
      segmentStart = null
      lastOn = null
      continue
    }
    if (segmentStart == null || (lastOn != null && sample.time - lastOn > gapMs)) {
      if (segmentStart != null && lastOn != null) best = Math.max(best, lastOn - segmentStart)
      segmentStart = sample.time
    }
    lastOn = sample.time
  }
  let current = 0
  let live = false
  if (segmentStart != null && lastOn != null && now - lastOn <= gapMs) {
    current = now - segmentStart
    live = true
  } else if (segmentStart != null && lastOn != null) {
    current = lastOn - segmentStart
  }
  const latest = samples[samples.length - 1]
  const away = !live && latest != null && Math.abs(latest.midi - target) > tolerance && current === 0 && best === 0
  return { heldMs: Math.max(best, current), live, away }
}

function bursts(samples: readonly PitchSample[], gapMs: number): PitchSample[][] {
  const groups: PitchSample[][] = []
  for (const sample of samples) {
    const last = groups[groups.length - 1]
    const previous = last?.[last.length - 1]
    if (!last || !previous || sample.time - previous.time > gapMs) groups.push([sample])
    else last.push(sample)
  }
  return groups
}

function average(samples: readonly PitchSample[]): number {
  return samples.reduce((sum, sample) => sum + sample.midi, 0) / samples.length
}

function median(samples: readonly PitchSample[]): number {
  const values = samples.map((sample) => sample.midi).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  if (values.length % 2 === 1) return values[mid]
  return (values[mid - 1] + values[mid]) / 2
}
