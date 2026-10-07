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

// ボーカル音源から歌い出しの位置を推定
export function autoTiming(buffer, n) {
  const d = buffer.getChannelData(0); const sr = buffer.sampleRate; const hop = Math.floor(sr * 0.05);
  const rms = [];
  for (let i = 0; i + hop < d.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j += 4) s += d[j] * d[j]; rms.push(Math.sqrt(s / (hop / 4))); }
  const sorted = [...rms].sort((a, b) => a - b);
  const th = sorted[Math.floor(sorted.length * 0.95)] * 0.18;
  const cands = []; let quiet = 0;
  rms.forEach((v, i) => {
    if (v < th) quiet++;
    else { if (quiet >= 6) cands.push({ t: i * 0.05, gap: quiet }); quiet = 0; }
  });
  let pick = cands;
  if (cands.length > n) pick = [...cands].sort((a, b) => b.gap - a.gap).slice(0, n).sort((a, b) => a.t - b.t);
  const times = pick.map((c) => Math.round(c.t * 10) / 10);
  while (times.length < n) times.push(Math.round(((times[times.length - 1] || 0) + 3) * 10) / 10);
  return times;
}
