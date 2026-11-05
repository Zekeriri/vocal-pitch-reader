export const PIANO_SAMPLES = [
  { midi: 45, file: 'A2.mp3' },
  { midi: 48, file: 'C3.mp3' },
  { midi: 51, file: 'Ds3.mp3' },
  { midi: 54, file: 'Fs3.mp3' },
  { midi: 57, file: 'A3.mp3' },
  { midi: 60, file: 'C4.mp3' },
  { midi: 63, file: 'Ds4.mp3' },
  { midi: 66, file: 'Fs4.mp3' },
  { midi: 69, file: 'A4.mp3' },
  { midi: 72, file: 'C5.mp3' },
] as const

export function nearestPianoSample(midi: number): { midi: number; file: string; rate: number } {
  let best: (typeof PIANO_SAMPLES)[number] = PIANO_SAMPLES[0]
  let bestDistance = Infinity
  for (const sample of PIANO_SAMPLES) {
    const distance = Math.abs(sample.midi - midi)
    if (distance < bestDistance) {
      best = sample
      bestDistance = distance
    }
  }
  return {
    midi: best.midi,
    file: best.file,
    rate: 2 ** ((midi - best.midi) / 12),
  }
}
