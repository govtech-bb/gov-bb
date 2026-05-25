// AudioWorkletProcessor: downsample mic input to 16 kHz mono PCM16
// and post 1024-sample frames to the main thread.
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.frameSize = 1024;
    this.acc = [];
    this.accLen = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;

    const ratio = sampleRate / this.targetRate;
    const outLen = Math.floor(channel.length / ratio);
    const out = new Int16Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const src = channel[Math.floor(i * ratio)] || 0;
      const clipped = Math.max(-1, Math.min(1, src));
      out[i] = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff;
    }

    this.acc.push(out);
    this.accLen += out.length;

    while (this.accLen >= this.frameSize) {
      const frame = new Int16Array(this.frameSize);
      let written = 0;
      while (written < this.frameSize && this.acc.length) {
        const head = this.acc[0];
        const need = this.frameSize - written;
        if (head.length <= need) {
          frame.set(head, written);
          written += head.length;
          this.acc.shift();
        } else {
          frame.set(head.subarray(0, need), written);
          this.acc[0] = head.subarray(need);
          written += need;
        }
      }
      this.accLen -= this.frameSize;
      this.port.postMessage(frame.buffer, [frame.buffer]);
    }
    return true;
  }
}

registerProcessor("pcm-capture", PcmCaptureProcessor);
