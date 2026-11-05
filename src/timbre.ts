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
  decay: number
}

export type TimbreSpec = {
  partials: TimbrePartial[]
  attack: number
  noise: number
  inharmonicity: number
  seconds: number
}

const SPECS: Record<TimbreId, TimbreSpec> = {
  piano: {
    partials: [
      { ratio: 1, gain: 1, decay: 1 },
      { ratio: 2, gain: 0.48, decay: 0.58 },
      { ratio: 3, gain: 0.24, decay: 0.38 },
      { ratio: 4, gain: 0.13, decay: 0.26 },
      { ratio: 5, gain: 0.07, decay: 0.18 },
      { ratio: 6, gain: 0.04, decay: 0.14 },
    ],
    attack: 0.012,
    noise: 0.16,
    inharmonicity: 0.0004,
    seconds: 0.64,
  },
  sine: {
    partials: [{ ratio: 1, gain: 1, decay: 1 }],
    attack: 0.03,
    noise: 0,
    inharmonicity: 0,
    seconds: 0.42,
  },
  organ: {
    partials: [
      { ratio: 1, gain: 0.72, decay: 1 },
      { ratio: 2, gain: 0.46, decay: 1 },
      { ratio: 3, gain: 0.3, decay: 1 },
      { ratio: 4, gain: 0.16, decay: 1 },
      { ratio: 6, gain: 0.08, decay: 1 },
    ],
    attack: 0.045,
    noise: 0,
    inharmonicity: 0,
    seconds: 0.5,
  },
  flute: {
    partials: [
      { ratio: 1, gain: 1, decay: 1 },
      { ratio: 2, gain: 0.16, decay: 0.85 },
      { ratio: 3, gain: 0.04, decay: 0.55 },
    ],
    attack: 0.09,
    noise: 0.035,
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
