// Hammered-string piano. Each note is one or more slightly detuned delay lines
// with a short hammer, a lowpass in the loop, and a damper at the end.
// The shape follows the same idea as a waveguide piano: the string rings,
// the hammer is only the attack, and the note lasts as long as it was asked to.
class StringLoop {
  constructor(sampleRate, freq, seconds) {
    this.sampleRate = sampleRate
    this.total = Math.max(1, Math.floor(seconds * sampleRate))
    this.played = 0
    this.dampStart = Math.floor(this.total * 0.84)

    const cutoff = Math.min(4800, Math.max(700, freq * 5))
    this.pole = Math.exp((-2 * Math.PI * cutoff) / sampleRate)
    this.lowpass = 0

    this.dispersion = Math.max(0.08, Math.min(0.7, 160 / (freq + 80)))
    this.dispersionIn = 0
    this.dispersionOut = 0

    const filterDelay = this.pole / (1 - this.pole)
    const dispersionDelay = (1 - this.dispersion) / (1 + this.dispersion)
    this.delay = Math.max(2, sampleRate / freq - filterDelay - dispersionDelay)
    this.size = Math.ceil(this.delay) + 2
    this.buffer = new Float32Array(this.size)
    this.cursor = 0

    const ring = Math.max(0.8, seconds * 4)
    const loopGain = 10 ** (-3 / Math.max(1, ring * freq))
    const omega = (2 * Math.PI * freq) / sampleRate
    const real = 1 - this.pole * Math.cos(omega)
    const imag = this.pole * Math.sin(omega)
    const magnitude = (1 - this.pole) / Math.sqrt(real * real + imag * imag)
    // Keep the fundamental on the requested ring. The lowpass still darkens the harmonics.
    this.loopGain = Math.min(1.08, loopGain / Math.max(0.25, magnitude))
    this.hammer(freq)
  }

  hammer(freq) {
    const length = Math.min(this.size - 1, Math.max(8, Math.floor(this.sampleRate * (0.0022 + 40 / (freq + 80)))))
    let color = 0
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1
      color = color * 0.78 + white * 0.22
      const window = Math.sin((Math.PI * (index + 0.5)) / length) ** 1.3
      this.buffer[index] += color * window
    }
  }

  step() {
    if (this.played >= this.total) return 0
    let readAt = this.cursor - this.delay
    while (readAt < 0) readAt += this.size
    const index = Math.floor(readAt) % this.size
    const fraction = readAt - Math.floor(readAt)
    const next = (index + 1) % this.size
    const delayed = this.buffer[index] * (1 - fraction) + this.buffer[next] * fraction
    this.lowpass = (1 - this.pole) * delayed + this.pole * this.lowpass
    const input = this.lowpass
    const dispersed = this.dispersion * (input - this.dispersionOut) + this.dispersionIn
    this.dispersionIn = input
    this.dispersionOut = dispersed
    const loop = dispersed * this.loopGain
    this.buffer[this.cursor] = loop
    this.cursor += 1
    if (this.cursor >= this.size) this.cursor = 0
    this.played += 1
    if (this.played <= this.dampStart) return loop
    const fade = 1 - (this.played - this.dampStart) / (this.total - this.dampStart)
    return loop * fade * fade
  }
}

function stringPlan(freq) {
  if (freq < 140) return [0]
  if (freq < 520) return [-2.4, 2.4]
  return [-3.1, 0, 3.2]
}

class PianoNote {
  constructor(sampleRate, freq, seconds) {
    this.strings = stringPlan(freq).map((cents) => new StringLoop(sampleRate, freq * 2 ** (cents / 1200), seconds))
    this.clickTotal = Math.max(1, Math.floor(sampleRate * 0.006))
    this.clickLeft = this.clickTotal
    this.click = 0
  }

  step() {
    let sum = 0
    for (const string of this.strings) sum += string.step()
    sum /= this.strings.length
    if (this.clickLeft > 0) {
      this.click = this.click * 0.55 + (Math.random() * 2 - 1) * 0.45
      sum += this.click * (this.clickLeft / this.clickTotal) * 0.15
      this.clickLeft -= 1
    }
    return sum
  }
}

class PianoVoice extends AudioWorkletProcessor {
  constructor() {
    super()
    this.notes = []
    this.previous = 0
    this.blocked = 0
    this.port.onmessage = (event) => {
      const data = event.data
      if (!data) return
      if (data.type === 'stop') {
        this.notes = []
        return
      }
      if (data.type === 'note') {
        const freq = Number(data.freq)
        const seconds = Number(data.seconds)
        if (freq > 20 && seconds > 0) this.notes.push(new PianoNote(sampleRate, freq, seconds))
        this.port.postMessage({ type: 'armed' })
      }
    }
  }

  process(_inputs, outputs) {
    const channel = outputs[0] && outputs[0][0]
    if (!channel) return true
    const right = outputs[0][1] || channel
    for (let index = 0; index < channel.length; index += 1) {
      let mix = 0
      for (const note of this.notes) mix += note.step()
      const blocked = mix - this.previous + 0.995 * this.blocked
      this.previous = mix
      this.blocked = blocked
      const sample = Math.max(-0.85, Math.min(0.85, blocked * 0.72))
      channel[index] = sample
      right[index] = sample
    }
    this.notes = this.notes.filter((note) => note.strings.some((string) => string.played < string.total))
    return true
  }
}

registerProcessor('piano-voice', PianoVoice)
