export type PitchSample = {
  time: number
  midi: number
}

export const NOTE_LOW = 60
export const NOTE_HIGH = 72
export const PEAK_LIMIT_MS = 1000
export const PEAK_WINDOW = 0.55
export const SLIDE_DROP = 1.2
export const TILT_MIN = 3
export const TILT_GAP_MS = 220
export const TILT_MIN_MS = 80
export const TILT_MAX_MS = 1000
export const LONG_MIN_MS = 3000
export const PITCH_WINDOW = PEAK_WINDOW

export function scaleNotes(): number[] {
  return Array.from({ length: NOTE_HIGH - NOTE_LOW + 1 }, (_, index) => NOTE_LOW + index)
}

export type SlideRead = {
  touched: boolean
  peakMs: number
  slid: boolean
  short: boolean
  passed: boolean
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

export function readSlide(samples: readonly PitchSample[], target: number, now = samples.at(-1)?.time ?? 0): SlideRead {
  let touchAt: number | null = null
  let leftAt: number | null = null
  let slid = false
  for (const sample of samples) {
    if (touchAt == null) {
      if (Math.abs(sample.midi - target) <= PEAK_WINDOW) touchAt = sample.time
      continue
    }
    if (leftAt == null && sample.midi < target - PEAK_WINDOW) leftAt = sample.time
    if (sample.midi <= target - SLIDE_DROP) slid = true
  }
  if (touchAt == null) return { touched: false, peakMs: 0, slid: false, short: false, passed: false }
  const peakMs = Math.max(0, (leftAt ?? now) - touchAt)
  const short = peakMs <= PEAK_LIMIT_MS
  return { touched: true, peakMs, slid, short, passed: short && slid }
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

function median(samples: readonly PitchSample[]): number {
  const values = samples.map((sample) => sample.midi).sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  if (values.length % 2 === 1) return values[mid]
  return (values[mid - 1] + values[mid]) / 2
}
