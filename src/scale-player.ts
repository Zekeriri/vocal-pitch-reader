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

function tone(context: AudioContext, freq: number, seconds: number): Promise<void> {
  return new Promise((resolve) => {
    const osc = context.createOscillator()
    const gain = context.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    osc.connect(gain)
    gain.connect(context.destination)
    const now = context.currentTime
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds)
    osc.start(now)
    osc.stop(now + seconds + 0.02)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
      resolve()
    }
  })
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
      await tone(context, midiToFreq(midis[index]), 0.42)
      await wait(60, signal)
    }
  } finally {
    if (context.state !== 'closed') await context.close()
  }
}
