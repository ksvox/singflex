// 伴奏の音からテンポ(BPM)と拍の位置を調べる(AIは使わず、音の立ち上がりの周期を数えるだけ)
export function detectTempo(buffer, vocalStart) {
  const sr = buffer.sampleRate; const hop = Math.round(sr * 0.01); // 0.01秒きざみ
  const a = buffer.getChannelData(0); const b = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : a;
  const N = Math.floor(Math.min(buffer.duration, 90) * sr / hop);
  // 打楽器が拾いやすいよう、変化の大きさ(高い音寄り)で音の強さを測る
  const e = new Float32Array(N); let prev = 0;
  for (let f = 0; f < N; f++) {
    let s = 0;
    for (let j = f * hop; j < (f + 1) * hop; j += 2) { const x = (a[j] + b[j]) / 2; const dx = x - prev; prev = x; s += dx * dx + 0.2 * x * x; }
    e[f] = Math.log(1e-9 + s);
  }
  // 音の立ち上がり(強くなった所だけ)
  const o = new Float32Array(N);
  for (let f = 1; f < N; f++) o[f] = Math.max(0, e[f] - e[f - 1]);
  let m = 0; for (let f = 0; f < N; f++) m += o[f]; m /= N;
  for (let f = 0; f < N; f++) o[f] = Math.max(0, o[f] - m);
  // 周期を探す(60〜190 BPM。中くらいのテンポを少し優先して、倍・半分の取り違えを減らす)
  const r = new Float32Array(102);
  for (let L = 30; L <= 101; L++) { let s = 0; for (let f = 0; f + L < N; f++) s += o[f] * o[f + L]; r[L] = s; }
  let best = 30, bs = -1;
  for (let L = 31; L <= 100; L++) {
    const bpm = 6000 / L; const w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 112) / 0.9, 2));
    if (r[L] >= r[L - 1] && r[L] >= r[L + 1] && r[L] * w > bs) { bs = r[L] * w; best = L; }
  }
  // 小数点以下まで詰める
  const y0 = r[best - 1], y1 = r[best], y2 = r[best + 1];
  const P = best + (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  // 拍の位置(周期にいちばんよく乗る位置)
  let phi = 0, ps = -1;
  for (let p = 0; p < P; p += 0.5) {
    let s = 0; for (let k = 0; p + k * P < N; k++) { const q = Math.round(p + k * P); s += (o[q] || 0) + 0.5 * ((o[q - 1] || 0) + (o[q + 1] || 0)); }
    if (s > ps) { ps = s; phi = p; }
  }
  const beat = P * 0.01; let first = phi * 0.01;
  // 歌い出しに一番近い拍を「カウントの次の拍」にする
  let offset = first;
  if (vocalStart != null && !isNaN(vocalStart)) { const k = Math.round((vocalStart - first) / beat); offset = first + k * beat; if (offset < 0) offset = offset > -beat * 0.3 ? 0 : offset + beat; }
  return { bpm: Math.round(6000 / P * 10) / 10, offset: Math.round(offset * 100) / 100 };
}

// ドラムスティックの「カッ」という音(1つ目=小節の頭だけ少し強く)
export function stickSamples(sr, accent) {
  const len = Math.round(0.07 * sr); const c = new Float32Array(len);
  let px = 0, hp = 0;
  for (let i = 0; i < len; i++) {
    const noise = (Math.random() * 2 - 1) * Math.exp(-i / (0.0018 * sr));
    hp = 0.92 * (hp + noise - px); px = noise; // 木を叩いた「カッ」の高い成分
    const body = 0.55 * Math.sin(2 * Math.PI * 2100 * i / sr) * Math.exp(-i / (0.011 * sr)) + 0.25 * Math.sin(2 * Math.PI * 3600 * i / sr) * Math.exp(-i / (0.005 * sr));
    c[i] = (0.6 * hp + body) * (accent ? 0.85 : 0.6);
  }
  return c;
}

// カウント: 歌い出しの拍(1〜4拍目)の前の拍を鳴らす。1拍目から歌うなら前の小節の4つ、4拍目から歌うなら1・2・3の3つ
export function countPlan(bpm, offset, beatNo) {
  const beat = 60 / bpm; const b = Math.min(4, Math.max(1, Number(beatNo) || 1));
  const n = b === 1 ? 4 : b - 1;
  const first = (offset || 0) - n * beat; // 最初のカウントの時刻(曲の頭より前ならマイナス)
  return { beat, n, first };
}

export function clickSamples(sr, beatSamples, n, delaySamples = 0) {
  const len = Math.round(delaySamples + beatSamples * n) + Math.round(0.08 * sr);
  const c = new Float32Array(len);
  const hi = stickSamples(sr, true), lo = stickSamples(sr, false);
  for (let k = 0; k < n; k++) {
    const st = Math.round(delaySamples + k * beatSamples); const s = k === 0 ? hi : lo;
    for (let i = 0; i < s.length && st + i < len; i++) c[st + i] += s[i];
  }
  return c;
}
