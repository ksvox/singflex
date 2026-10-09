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

// カウントの「カッ」という音(1つ目だけ高い音)
export function clickSamples(sr, beatSamples, n = 4) {
  const len = Math.round(beatSamples * n) + Math.round(0.05 * sr);
  const c = new Float32Array(len);
  for (let k = 0; k < n; k++) {
    const st = Math.round(k * beatSamples); const f = k === 0 ? 1600 : 1100;
    for (let i = 0; i < 0.04 * sr && st + i < len; i++) c[st + i] += 0.5 * Math.sin(2 * Math.PI * f * i / sr) * Math.exp(-i / (0.008 * sr));
  }
  return c;
}
