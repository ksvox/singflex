// 歌詞PDFの文字を、カラオケ用に整える
const JP = /[\u3040-\u30ff\u3400-\u9fff]/;
const TAG = /^\[\s*(★)?\s*([^\]]+?)\s*\]$/;

export function cleanLyrics(raw, title = '') {
  const rows = raw.split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const sections = []; const jp = [];
  let cur = null;
  rows.forEach((line, idx) => {
    if (/k.?s\s*vox\s*record/i.test(line)) return;
    if (idx === 0 || (title && line.toLowerCase() === title.toLowerCase())) { if (!TAG.test(line) && !JP.test(line)) return; }
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
  if (oldLines.length === out.length) out.forEach((l, i) => { l.t = oldLines[i].t ?? null; });
  return out;
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
