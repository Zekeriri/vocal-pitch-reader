export const TIMBRES = [
  { id: 'piano', label: '钢琴' },
  { id: 'sine', label: '正弦' },
  { id: 'organ', label: '管风琴' },
  { id: 'flute', label: '长笛' },
] as const

export type TimbreId = (typeof TIMBRES)[number]['id']

export type TimbrePartial = {
  ratio: number
  gain: number
  /** Fraction of the note length before this partial is gone. */
  decay: number
  /** Level left after the hammer, as a fraction of the peak. */
  body: number
  detuneCents: number
}

export type TimbreSpec = {
  partials: TimbrePartial[]
  attack: number
  noise: number
  /** Short hammer knock, rather than a breath. */
  hammer: boolean
  /** Close a lowpass after the attack so the sustain is warmer than the strike. */
  soften: boolean
  inharmonicity: number
  seconds: number
}

const SPECS: Record<TimbreId, TimbreSpec> = {
  piano: {
    partials: [
      { ratio: 1, gain: 1, decay: 1, body: 0.7, detuneCents: 5 },
      { ratio: 2, gain: 0.4, decay: 0.7, body: 0.34, detuneCents: 6 },
      { ratio: 3, gain: 0.2, decay: 0.4, body: 0.2, detuneCents: 7 },
      { ratio: 4, gain: 0.1, decay: 0.24, body: 0.14, detuneCents: 0 },
      { ratio: 5, gain: 0.055, decay: 0.15, body: 0.12, detuneCents: 0 },
      { ratio: 6, gain: 0.03, decay: 0.1, body: 0.1, detuneCents: 0 },
      { ratio: 7, gain: 0.016, decay: 0.07, body: 0.1, detuneCents: 0 },
    ],
    attack: 0.006,
    noise: 0.08,
    hammer: true,
    soften: true,
    inharmonicity: 0.00028,
    seconds: 1.85,
  },
  sine: {
    partials: [{ ratio: 1, gain: 1, decay: 1, body: 1, detuneCents: 0 }],
    attack: 0.03,
    noise: 0,
    hammer: false,
    soften: false,
    inharmonicity: 0,
    seconds: 0.42,
  },
  organ: {
    partials: [
      { ratio: 1, gain: 0.72, decay: 1, body: 0.94, detuneCents: 0 },
      { ratio: 2, gain: 0.46, decay: 1, body: 0.94, detuneCents: 0 },
      { ratio: 3, gain: 0.3, decay: 1, body: 0.94, detuneCents: 0 },
      { ratio: 4, gain: 0.16, decay: 1, body: 0.94, detuneCents: 0 },
      { ratio: 6, gain: 0.08, decay: 1, body: 0.94, detuneCents: 0 },
    ],
    attack: 0.045,
    noise: 0,
    hammer: false,
    soften: false,
    inharmonicity: 0,
    seconds: 0.5,
  },
  flute: {
    partials: [
      { ratio: 1, gain: 1, decay: 1, body: 0.82, detuneCents: 0 },
      { ratio: 2, gain: 0.16, decay: 0.85, body: 0.5, detuneCents: 0 },
      { ratio: 3, gain: 0.04, decay: 0.55, body: 0.3, detuneCents: 0 },
    ],
    attack: 0.09,
    noise: 0.035,
    hammer: false,
    soften: false,
    inharmonicity: 0,
    seconds: 0.5,
  },
}

export function isTimbre(value: string | null): value is TimbreId {
  return TIMBRES.some((item) => item.id === value)
}

export function timbreSpec(id: TimbreId): TimbreSpec {
  return SPECS[id]
}
