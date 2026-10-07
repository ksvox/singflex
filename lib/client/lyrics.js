// 歌詞PDFの文字を、カラオケ用に整える
const JP = /[\u3040-\u30ff\u3400-\u9fff]/;
const TAG = /^\[\s*(★)?\s*([^\]]+?)\s*\]$/;

export function cleanLyrics(raw, title = '') {
  const rows = raw.split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sections = []; const jp = [];
  let cur = null;
  rows.forEach((line, idx) => {
    if (/k.?s\s*vox\s*record/i.test(line)) return;
    // 先頭の曲名だけ消す(歌詞の途中に出てくる同じ文字の行は残す)
    if (!cur && (idx === 0 || (title && line.toLowerCase() === title.toLowerCase()))) { if (!TAG.test(line) && !JP.test(line)) return; }
    if (JP.test(line)) {
      const last = jp[jp.length - 1];
      if (last && last.length >= 18 && line.length <= 8) jp[jp.length - 1] = last + line; else jp.push(line);
      return;
    }
    const m = line.match(TAG);
    if (m) { cur = { label: m[2].trim(), rep: !!m[1], lines: [] }; sections.push(cur); return; }
    if (/^★\s*rep/i.test(line)) { if (cur) cur.rep = true; return; }
    if (!cur) { cur = { label: '', rep: false, lines: [] }; sections.push(cur); }
    const prev = cur.lines[cur.lines.length - 1];
    if (prev && /^[a-z]/.test(line) && !/^i\b/.test(line)) cur.lines[cur.lines.length - 1] = prev + ' ' + line;
    else cur.lines.push(line);
  });
  // 省略された繰り返し([Chorus]だけ・★Rep)を展開
  sections.forEach((s, i) => {
    if (s.rep || s.lines.length === 0) {
      for (let j = i - 1; j >= 0; j--) {
        if (sections[j].label === s.label && sections[j].lines.length) { s.lines = s.rep && s.lines.length ? s.lines : [...sections[j].lines]; break; }
      }
    }
  });
  return { text: toText(sections.filter((s) => s.lines.length)), jp: jp.join('\n') };
}

export function toText(sections) {
  return sections.map((s) => (s.label ? `[${s.label}]\n` : '') + s.lines.join('\n')).join('\n\n');
}

// 編集欄の文字 → 行データ(タイミングは同じ行数なら引き継ぐ)
export function textToLines(text, oldLines = []) {
  const out = []; let sec = ''; let fresh = true;
  text.split(/\r?\n/).forEach((l) => {
    const s = l.trim();
    if (!s) return;
    const m = s.match(TAG);
    if (m) { sec = m[2].trim(); fresh = true; return; }
    out.push({ sec, start: fresh, text: s, t: null });
    fresh = false;
  });
  carryTimes(oldLines, out);
  return out;
}

// 歌詞を直しても、変わっていない行のタイミングは残す
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function carryTimes(oldL, newL) {
  const a = oldL.map((l) => key(l.text)); const b = newL.map((l) => key(l.text));
  const n = a.length; const m = b.length;
  // 同じ行の対応(最長共通部分)
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = []; let i = 0; let j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  pairs.push([n, m]);
  let pi = 0; let pj = 0;
  pairs.forEach(([x, y]) => {
    // 変わった部分:行数が同じなら、言葉を直しただけとみなして位置どおりに引き継ぐ
    if (x - pi === y - pj) for (let k = 0; k < x - pi; k++) newL[pj + k].t = oldL[pi + k].t ?? null;
    if (x < n) newL[y].t = oldL[x].t ?? null;
    pi = x + 1; pj = y + 1;
  });
}

// 今より先の「次の歌い出し」(0.6秒以上の無音のあとに声が入る所)
export function nextOnset(env, now) {
  const N = env.length;
  const sorted = Array.from(env).sort((x, y) => x - y);
  const quiet = sorted[Math.floor(N * 0.15)]; const loud = sorted[Math.floor(N * 0.95)];
  const th = quiet + (loud - quiet) * 0.35;
  let q = 0;
  for (let f = Math.max(0, Math.floor(now / HOP)); f < N; f++) {
    if (env[f] <= th) q++;
    else { if (q >= 30 && f * HOP > now + 1.5) return f * HOP; q = 0; }
  }
  return null;
}

export function linesToText(lines) {
  let txt = '';
  lines.forEach((l, i) => {
    if (l.start) txt += (i ? '\n' : '') + (l.sec ? `[${l.sec}]\n` : '');
    txt += l.text + '\n';
  });
  return txt.trim();
}

// 今歌っている行の番号
export function currentLine(lines, t) {
  let idx = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].t != null && lines[i].t <= t) idx = i; else if (lines[i].t != null) break; }
  return idx;
}

// 区間ジャンプ用(同じ名前が続く場合は番号付き)
export function sectionMarks(lines) {
  const marks = []; const count = {};
  lines.forEach((l, i) => {
    if (l.start && l.sec && l.t != null) {
      count[l.sec] = (count[l.sec] || 0) + 1;
      marks.push({ label: count[l.sec] > 1 ? `${l.sec} ${count[l.sec]}` : l.sec, t: l.t, i });
    }
  });
  return marks;
}

// ---- 繰り返し部分の自動配置(AIは使わず、音の大きさの変化を比べるだけ)----
const HOP = 0.02; // 0.02秒きざみ

// ボーカル音源 → 音の大きさの並び
export function vocalEnvelope(buffer) {
  const d = buffer.getChannelData(0); const sr = buffer.sampleRate; const hop = Math.floor(sr * HOP);
  const n = Math.floor(d.length / hop); const env = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0; const a = f * hop;
    for (let j = a; j < a + hop; j += 4) s += d[j] * d[j];
    env[f] = Math.log10(Math.sqrt(s / (hop / 4)) + 1e-4);
  }
  return env;
}

// 区間(ブロック)ごとにまとめる
function blocks(lines) {
  const out = [];
  lines.forEach((l, i) => {
    if (l.start || !out.length) out.push({ from: i, to: i });
    else out[out.length - 1].to = i;
  });
  out.forEach((b) => { b.key = lines.slice(b.from, b.to + 1).map((l) => l.text.toLowerCase().replace(/[^a-z0-9']/g, '')).join('|'); });
  return out;
}

const has = (v) => v != null && !isNaN(v);

// 1回目を記録済みのブロックと同じ歌詞のブロックを、波形の似ている場所に置く
export function placeRepeats(lines, env) {
  const ls = lines.map((l) => ({ ...l }));
  const bl = blocks(ls);
  const N = env.length; const dur = N * HOP;
  const ps = new Float64Array(N + 1); const ps2 = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) { ps[i + 1] = ps[i] + env[i]; ps2[i + 1] = ps2[i] + env[i] * env[i]; }
  let placed = 0; let missed = 0;

  bl.forEach((b, bi) => {
    const mine = ls.slice(b.from, b.to + 1);
    if (mine.every((l) => has(l.t))) return;
    const src = bl.slice(0, bi).find((x) => x.key === b.key && ls.slice(x.from, x.to + 1).every((l) => has(l.t)));
    if (!src) return;

    // お手本(1回目)の範囲
    const st = ls.slice(src.from, src.to + 1).map((l) => l.t);
    const s0 = st[0]; const sLast = st[st.length - 1];
    const after = ls[src.to + 1];
    const tail = after && has(after.t) && after.t > sLast ? Math.min(after.t - sLast, 4) : 3;
    const a = Math.floor(s0 / HOP); const L = Math.max(10, Math.floor((sLast + tail - s0) / HOP));
    if (a + L > N) { missed++; return; }
    let mt = 0; for (let k = 0; k < L; k++) mt += env[a + k]; mt /= L;
    let vt = 0; for (let k = 0; k < L; k++) vt += (env[a + k] - mt) ** 2;
    const sdT = Math.sqrt(vt); if (sdT < 1e-6) { missed++; return; }

    // 探す範囲:前後の記録済みの行のあいだ
    let lo = 0; for (let i = b.from - 1; i >= 0; i--) if (has(ls[i].t)) { lo = ls[i].t + 0.3; break; }
    let hi = dur; for (let i = b.to + 1; i < ls.length; i++) if (has(ls[i].t)) { hi = ls[i].t; break; }
    const span = sLast - s0;
    const pLo = Math.ceil(lo / HOP); const pHi = Math.min(Math.floor((hi - span - 0.1) / HOP), N - L);
    let best = -1; let bestP = -1;
    for (let p = pLo; p <= pHi; p++) {
      const sw = ps[p + L] - ps[p]; const mw = sw / L;
      const vw = ps2[p + L] - ps2[p] - L * mw * mw; if (vw <= 1e-9) continue;
      let dot = 0; for (let k = 0; k < L; k++) dot += (env[a + k] - mt) * env[p + k];
      const sc = dot / (sdT * Math.sqrt(vw));
      if (sc > best) { best = sc; bestP = p; }
    }
    if (bestP < 0 || best < 0.45) { missed++; return; }
    const off = bestP * HOP - s0;
    for (let k = 0; k <= b.to - b.from; k++) ls[b.from + k].t = Math.round((st[k] + off) * 10) / 10;
    placed++;
  });
  return { lines: ls, placed, missed };
}

// ---- 楽段の中を自動で割り振り(楽段の頭と、ボーカルの息継ぎ・各行の音節数から推定)----
export function syllables(text) {
  const words = text.toLowerCase().replace(/[^a-z'\s]/g, ' ').split(/\s+/).filter(Boolean);
  let n = 0;
  words.forEach((w) => { const v = (w.replace(/e$/, '').match(/[aeiouy]+/g) || []).length; n += Math.max(1, v); });
  return Math.max(1, n);
}

export function fillSections(lines, env) {
  const ls = lines.map((l) => ({ ...l }));
  const N = env.length;
  const sorted = Array.from(env).sort((a, b) => a - b);
  const quiet = sorted[Math.floor(N * 0.15)]; const loud = sorted[Math.floor(N * 0.95)];
  const th = quiet + (loud - quiet) * 0.35;
  const voiced = new Uint8Array(N); for (let i = 0; i < N; i++) voiced[i] = env[i] > th ? 1 : 0;
  const fr = (t) => Math.max(0, Math.min(N - 1, Math.round(t / HOP)));

  // 歌い出しの候補(0.15秒以上の無音のあとに声が始まる所)
  const onsets = []; let q = 0;
  for (let i = 0; i < N; i++) { if (!voiced[i]) q++; else { if (q >= 8) onsets.push({ t: i * HOP, gap: q * HOP }); q = 0; } }

  // 区間の中で「歌い終わり」を探す(後ろの離れた短いハミングは除く)
  const singEnd = (a, b) => {
    const segs = []; let st = -1; let lastV = -1;
    for (let i = fr(a); i < fr(b); i++) {
      if (voiced[i]) { if (st < 0 || (i - lastV) * HOP > 0.25) { if (st >= 0) segs.push([st, lastV]); st = i; } lastV = i; }
    }
    if (st >= 0) segs.push([st, lastV]);
    while (segs.length > 1) {
      const lastS = segs[segs.length - 1]; const prev = segs[segs.length - 2];
      if ((lastS[0] - prev[1]) * HOP >= 1.2 && (lastS[1] - lastS[0]) * HOP < 3) segs.pop(); else break;
    }
    return segs.length ? segs[segs.length - 1][1] * HOP + 0.2 : b;
  };

  let filled = 0; const skipped = [];
  let i = 0;
  while (i < ls.length) {
    if (ls[i].t == null) {
      // 楽段の頭が未記録なら、その楽段は飛ばす
      if (ls[i].start || i === 0) { const sec = ls[i].sec || '(見出しなし)'; if (!skipped.includes(sec)) skipped.push(sec); }
      i++; continue;
    }
    // ls[i] が記録済み → 続く空欄の行(同じ楽段の中だけ)を埋める
    let j = i + 1; while (j < ls.length && ls[j].t == null && !ls[j].start) j++;
    const m = j - i - 1;
    if (m > 0) {
      const Ta = ls[i].t;
      const nextT = j < ls.length && ls[j].t != null ? ls[j].t : null;
      const inside = nextT != null && !ls[j].start; // 次の記録済みが同じ楽段の中
      const limit = nextT != null ? nextT : N * HOP;
      const Te = inside ? nextT : Math.max(Ta + 1, singEnd(Ta, limit));
      const syl = []; for (let k = i; k < j; k++) syl.push(syllables(ls[k].text));
      const total = syl.reduce((a, b) => a + b, 0);
      const avg = (Te - Ta) / (m + 1);
      const w = Math.min(2.5, Math.max(0.6, avg * 0.4));
      let prev = Ta; let cum = syl[0];
      for (let k = 1; k <= m; k++) {
        const exp = Ta + (Te - Ta) * (cum / total);
        let best = null; let bestScore = Infinity;
        onsets.forEach((o) => {
          if (o.t <= prev + 0.4 || o.t >= Te - 0.3 || Math.abs(o.t - exp) > w) return;
          const sc = Math.abs(o.t - exp) / w - Math.min(o.gap, 1) * 0.8;
          if (sc < bestScore) { bestScore = sc; best = o; }
        });
        const t = best ? best.t : Math.max(prev + 0.4, exp);
        ls[i + k].t = Math.round(t * 10) / 10; prev = t; cum += syl[k]; filled++;
      }
    }
    i = j;
  }
  return { lines: ls, filled, skipped };
}
