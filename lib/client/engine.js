import { SoundTouch, SimpleFilter } from 'soundtouchjs';

// ボーカルと伴奏を同時に鳴らし、音量・キー・テンポをその場で変えるエンジン
export class KaraokeEngine {
  constructor() {
    this.ctx = null; this.vocal = null; this.track = null;
    this.gv = 0; this.gt = 1; this.playing = false;
    this.loopA = null; this.loopB = null; this.onEnd = null;
  }
  async load(vocalBlob, trackBlob) {
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    const dec = async (b) => this.ctx.decodeAudioData(await b.arrayBuffer());
    [this.vocal, this.track] = await Promise.all([dec(vocalBlob), dec(trackBlob)]);
    this.sr = this.track.sampleRate;
    this.len = Math.max(this.vocal.length, this.track.length);
    const ch = (b, i) => b.getChannelData(Math.min(i, b.numberOfChannels - 1));
    const vL = ch(this.vocal, 0), vR = ch(this.vocal, 1), tL = ch(this.track, 0), tR = ch(this.track, 1);
    const self = this;
    const source = {
      extract(target, numFrames, position) {
        const n = Math.max(0, Math.min(numFrames, self.len - position));
        const gv = self.gv, gt = self.gt;
        for (let i = 0; i < n; i++) {
          const p = position + i;
          target[i * 2] = (vL[p] || 0) * gv + (tL[p] || 0) * gt;
          target[i * 2 + 1] = (vR[p] || 0) * gv + (tR[p] || 0) * gt;
        }
        return n;
      }
    };
    this.st = new SoundTouch();
    this.filter = new SimpleFilter(source, this.st, () => {});
    this.node = this.ctx.createScriptProcessor(4096, 2, 2);
    const buf = new Float32Array(4096 * 2);
    this.node.onaudioprocess = (e) => {
      const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
      if (!this.playing) { L.fill(0); R.fill(0); return; }
      if (this.loopB != null && this.time >= this.loopB) this.seek(this.loopA);
      const got = this.filter.extract(buf, 4096);
      for (let i = 0; i < 4096; i++) { L[i] = i < got ? buf[i * 2] : 0; R[i] = i < got ? buf[i * 2 + 1] : 0; }
      if (got === 0) { this.playing = false; this.seek(0); this.onEnd && this.onEnd(); }
    };
    this.node.connect(this.ctx.destination);
  }
  get duration() { return this.len ? this.len / this.sr : 0; }
  get time() {
    if (!this.filter) return 0;
    const lag = (4096 * 1.5) / this.sr * (this.st ? this.st.tempo : 1);
    return Math.max(0, this.filter.sourcePosition / this.sr - (this.playing ? lag : 0));
  }
  async play() { if (this.ctx.state !== 'running') await this.ctx.resume(); this.playing = true; }
  pause() { this.playing = false; }
  seek(t) { if (this.filter) this.filter.sourcePosition = Math.floor(Math.max(0, Math.min(t, this.duration - 0.05)) * this.sr); }
  setVocal(v) { this.gv = Math.pow(v / 100, 1.6); }
  setTrack(v) { this.gt = Math.pow(v / 100, 1.6); }
  setKey(semi) { this.st.pitchSemitones = semi; }
  setTempo(pct) { this.st.tempo = pct / 100; }
  setLoop(a, b) { this.loopA = a; this.loopB = b; }
  destroy() { try { this.playing = false; this.node && this.node.disconnect(); this.ctx && this.ctx.close(); } catch {} }
}
