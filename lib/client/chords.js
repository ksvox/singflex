// 伴奏からコードを推定(参考表示用)
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const ALT = { Db: 1, 'D#': 3, Gb: 6, 'G#': 8, 'A#': 10 };

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ar = re[i + j], ai = im[i + j];
        const br = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const bi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ar + br; im[i + j] = ai + bi; re[i + j + len / 2] = ar - br; im[i + j + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

export async function estimateChords(buffer, onProgress) {
  const SR = 11025, N = 4096, HOP = 2048;
  const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * SR), SR);
  const src = off.createBufferSource(); src.buffer = buffer; src.connect(off.destination); src.start();
  const mono = (await off.startRendering()).getChannelData(0);
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const frames = [];
  for (let s = 0; s + N < mono.length; s += HOP) {
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let i = 0; i < N; i++) re[i] = mono[s + i] * win[i];
    fft(re, im);
    const c = new Float32Array(12); let e = 0;
    for (let k = 24; k < 750; k++) {
      const f = k * SR / N, m = Math.hypot(re[k], im[k]);
      const pc = ((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12;
      c[pc] += m; e += m;
    }
    frames.push({ c, e });
    if (onProgress && frames.length % 200 === 0) { onProgress(s / mono.length); await new Promise((r) => setTimeout(r)); }
  }
  const eMax = Math.max(...frames.map((f) => f.e)) || 1;
  const step = HOP / SR, W = 5; const labels = [];
  for (let i = 0; i < frames.length; i += 2) {
    const c = new Float32Array(12); let e = 0;
    for (let j = Math.max(0, i - W); j < Math.min(frames.length, i + W); j++) { for (let p = 0; p < 12; p++) c[p] += frames[j].c[p]; e += frames[j].e; }
    e /= 2 * W;
    if (e < eMax * 0.06) { labels.push({ t: i * step, c: 'N' }); continue; }
    let best = 'N', bs = -1;
    for (let r = 0; r < 12; r++) {
      for (const [suf, iv] of [['', [0, 4, 7]], ['m', [0, 3, 7]]]) {
        const sc = c[r] * 1.0 + c[(r + iv[1]) % 12] * 0.8 + c[(r + iv[2]) % 12] * 0.9 - c[(r + 1) % 12] * 0.3 - c[(r + 6) % 12] * 0.3;
        if (sc > bs) { bs = sc; best = NAMES[r] + suf; }
      }
    }
    labels.push({ t: i * step, c: best });
  }
  for (let i = 1; i < labels.length - 1; i++) if (labels[i - 1].c === labels[i + 1].c) labels[i].c = labels[i - 1].c;
  const runs = [];
  labels.forEach((l) => { if (!runs.length || runs[runs.length - 1].c !== l.c) runs.push({ t: Math.round(l.t * 10) / 10, c: l.c }); });
  return runs.filter((r, i) => { const next = runs[i + 1]; return !next || next.t - r.t >= 0.8; })
    .filter((r, i, a) => i === 0 || a[i - 1].c !== r.c);
}

export function transpose(chord, k) {
  if (!chord || chord === 'N' || !k) return chord === 'N' ? '' : chord;
  const m = chord.match(/^([A-G])([#b]?)(.*)$/);
  if (!m) return chord;
  const root = m[1] + m[2];
  const idx = NAMES.indexOf(root) >= 0 ? NAMES.indexOf(root) : ALT[root] ?? 0;
  return NAMES[(idx + k + 120) % 12] + m[3];
}

export function chordAt(chords, t) {
  let i = -1;
  for (let j = 0; j < chords.length; j++) { if (chords[j].t <= t) i = j; else break; }
  return { now: i >= 0 ? chords[i].c : '', next: chords[i + 1] ? chords[i + 1].c : '' };
}
