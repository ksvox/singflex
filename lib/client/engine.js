import { SoundTouch, SimpleFilter } from 'soundtouchjs';

// ボーカルと伴奏を同時に鳴らし、音量・キー・テンポをその場で変えるエンジン
export class KaraokeEngine {
  constructor() {
    this.ctx = null; this.vocal = null; this.track = null;
    this.gv = 0; this.gt = 1; this.playing = false;
    this.loopA = null; this.loopB = null; this.onEnd = null;
    this.soft = true; // 伴奏の高音(キンキン)を少しだけ和らげる
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
    // 伴奏だけにかける「高音やわらげ」(5kHzあたりから下げ始め、8kHzより上を約5〜6dB下げる。ボーカルには触らない)
    const c = shelf(this.sr, 5000, -6);
    const zL = [0, 0, 0, 0], zR = [0, 0, 0, 0];
    const run = (x, z) => { const y = c.b0 * x + c.b1 * z[0] + c.b2 * z[1] - c.a1 * z[2] - c.a2 * z[3]; z[1] = z[0]; z[0] = x; z[3] = z[2]; z[2] = y; return y; };
    const source = {
      extract(target, numFrames, position) {
        const n = Math.max(0, Math.min(numFrames, self.len - position));
        const gv = self.gv, gt = self.gt, soft = self.soft;
        for (let i = 0; i < n; i++) {
          const p = position + i;
          let l = tL[p] || 0, r = tR[p] || 0;
          if (soft) { l = run(l, zL); r = run(r, zR); }
          target[i * 2] = (vL[p] || 0) * gv + l * gt;
          target[i * 2 + 1] = (vR[p] || 0) * gv + r * gt;
        }
        return n;
      }
    };
    this.source = source;
    this.st = new SoundTouch();
    this.filter = new SimpleFilter(source, this.st, () => {});
    this.node = this.ctx.createScriptProcessor(4096, 2, 2);
    const buf = new Float32Array(4096 * 2);
    this.node.onaudioprocess = (e) => {
      const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
      if (!this.playing) { L.fill(0); R.fill(0); return; }
      if (this.loopB != null && this.time >= this.loopB) this.seek(this.loopA);
      // 原曲のキー・テンポの時は、キー・テンポ変換を通さずそのまま鳴らす(変換による薄い金属音を避ける)
      let got;
      if (this.isPlain()) {
        got = this.source.extract(buf, 4096, this.filter._sourcePosition);
        this.filter._sourcePosition += got; this.wasPlain = true;
      } else {
        if (this.wasPlain) { this.filter.sourcePosition = this.filter._sourcePosition; this.wasPlain = false; }
        got = this.filter.extract(buf, 4096);
      }
      for (let i = 0; i < 4096; i++) { L[i] = i < got ? buf[i * 2] : 0; R[i] = i < got ? buf[i * 2 + 1] : 0; }
      if (got === 0) { this.playing = false; this.seek(0); this.onEnd && this.onEnd(); }
    };
    this.node.connect(this.ctx.destination);
  }
  get duration() { return this.len ? this.len / this.sr : 0; }
  get time() {
    if (!this.filter) return 0;
    const lag = this.isPlain() ? 4096 / this.sr : (4096 * 1.5) / this.sr * (this.st ? this.st.tempo : 1);
    return Math.max(0, this.filter.sourcePosition / this.sr - (this.playing ? lag : 0));
  }
  async play() { if (this.ctx.state !== 'running') await this.ctx.resume(); this.playing = true; }
  pause() { this.playing = false; }
  seek(t) { if (this.filter) this.filter.sourcePosition = Math.floor(Math.max(0, Math.min(t, this.duration - 0.05)) * this.sr); }
  setVocal(v) { this.gv = Math.pow(v / 100, 1.6); }
  setTrack(v) { this.gt = Math.pow(v / 100, 1.6); }
  isPlain() { return !this.semi && (this.tempoPct || 100) === 100; }
  setKey(semi) { this.semi = semi; this.st.pitchSemitones = semi; }
  setTempo(pct) { this.tempoPct = pct; this.st.tempo = pct / 100; }
  setSoft(on) { this.soft = !!on; }
  setLoop(a, b) { this.loopA = a; this.loopB = b; }
  destroy() { try { this.playing = false; this.node && this.node.disconnect(); this.ctx && this.ctx.close(); } catch {} }
}

// ハイシェルフの係数(RBJの式)
function shelf(sr, f0, dB) {
  const A = Math.pow(10, dB / 40), w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w);
  const al = sn / 2 * Math.sqrt((A + 1 / A) * (1 / 0.8 - 1) + 2), sq = 2 * Math.sqrt(A) * al;
  const a0 = (A + 1) - (A - 1) * cs + sq;
  return {
    b0: A * ((A + 1) + (A - 1) * cs + sq) / a0,
    b1: -2 * A * ((A - 1) + (A + 1) * cs) / a0,
    b2: A * ((A + 1) + (A - 1) * cs - sq) / a0,
    a1: 2 * ((A - 1) - (A + 1) * cs) / a0,
    a2: ((A + 1) - (A - 1) * cs - sq) / a0
  };
}
