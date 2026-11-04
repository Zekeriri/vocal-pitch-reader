class PitchProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.ring = new Float32Array(2048)
    this.write = 0
    this.count = 0
    this.hop = 0
  }

  process(inputs, outputs) {
    const input = inputs[0] && inputs[0][0]
    const output = outputs[0] && outputs[0][0]
    if (!input) return true
    if (output) {
      if (output.length === input.length) output.set(input)
      else output.set(input.subarray(0, Math.min(output.length, input.length)))
    }

    for (let i = 0; i < input.length; i++) {
      this.ring[this.write] = input[i]
      this.write += 1
      if (this.write === this.ring.length) this.write = 0
    }
    this.count = Math.min(this.ring.length, this.count + input.length)
    this.hop += input.length
    if (this.count < this.ring.length || this.hop < 1024) return true
    this.hop = 0

    const samples = new Float32Array(this.ring.length)
    const head = this.ring.length - this.write
    samples.set(this.ring.subarray(this.write), 0)
    samples.set(this.ring.subarray(0, this.write), head)

    let energy = 0
    for (let i = 0; i < samples.length; i++) energy += samples[i] * samples[i]
    const rms = Math.sqrt(energy / samples.length)
    this.port.postMessage({ samples, rms }, [samples.buffer])
    return true
  }
}

registerProcessor('pitch-reader', PitchProcessor)
