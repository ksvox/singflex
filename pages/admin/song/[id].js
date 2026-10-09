import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AdminGate from '../../../components/AdminGate';
import { adminFetch, adminHeaders } from '../../../lib/client/firebaseClient';
import { saveSong, uploadTo, resizeJacket, adminAudio, stampDate } from '../../../lib/client/admin';
import { cleanLyrics, textToLines, linesToText, vocalEnvelope, fillSections, syllables } from '../../../lib/client/lyrics';
import { estimateChords } from '../../../lib/client/chords';
import { pdfText } from '../../../lib/client/pdf';
import { fmt } from '../../../lib/client/song';
import { detectTempo, countPlan, stickSamples } from '../../../lib/client/tempo';
import { analyzeLines, memoSource, memoSections, groupAt } from '../../../lib/client/english';
import MemoLine, { MemoLegend } from '../../../components/MemoLine';

// ---- 英語歌唱メソッドの歌詞メモ(控え室のホワイトボード)----
const MODES = [
  ['r', 'アクセント(赤)', '赤くしたい母音の文字を押します。もう一度押すと消えます。'],
  ['b', '内容語(太字)', '語を押すと太字のオン/オフが切り替わります。'],
  ['l', 'リンキング(波線)', 'つなげる2語のうち、前の語(または語と語のすき間)を押すとオン/オフ。'],
  ['h', '難しい単語(マーカー)', '語を押すとマーカーのオン/オフが切り替わります。'],
  ['i', '熟語・慣用句(下線)', '最初の語→最後の語の順に押すと下線でまとめます。下線の語を押すと外れます。']
];
function MemoEditor({ id, s, onSaved }) {
  const lines = s.lines || [];
  const src = memoSource(lines);
  const fresh = !!(s.memo && s.memo.length === lines.length && s.memoSrc === src);
  const [memo, setMemo] = useState(fresh ? s.memo : null);
  const [mode, setMode] = useState('r');
  const [pend, setPend] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const secs = useMemo(() => memoSections(lines), [s]);

  const analyze = async () => {
    if ((memo || s.memo) && !confirm('分析し直すと、手直しした印は消えます。よろしいですか?')) return;
    setBusy(true); setNote('発音辞書を読み込んで分析中…');
    try {
      const st = await adminFetch('/api/admin/settings').catch(() => ({}));
      setMemo(await analyzeLines(lines, st.idioms || null)); setDirty(true);
      setNote('分析しました。おかしな印は下で手直しして、「歌詞メモを保存」を押してください。');
    } catch (e) { setNote('分析できませんでした: ' + e.message); }
    setBusy(false);
  };
  // 1行を直す(同じ歌詞の行=繰り返しのサビなどにも同じ印を付ける)
  const edit = (i, fn) => {
    setMemo((ms) => {
      const n = ms.slice(); const w = n[i].w.map((t) => ({ ...t })); fn(w);
      lines.forEach((l, j) => { n[j] = j === i || l.text === lines[i].text ? { w: w.map((t) => ({ ...t })) } : n[j]; });
      return n;
    });
    setDirty(true);
  };
  const pick = (i, k, c) => {
    if (mode === 'r') { if (c < 0) return; edit(i, (w) => { const t = w[k]; if (t.as != null && c >= t.as && c < t.ae) { delete t.as; delete t.ae; } else { const [a, b] = groupAt(t.t, c); t.as = a; t.ae = b; } }); }
    else if (mode === 'b' || mode === 'h') { if (c < 0) return; edit(i, (w) => { if (w[k][mode]) delete w[k][mode]; else w[k][mode] = 1; }); }
    else if (mode === 'l') { if (k >= memo[i].w.length - 1) return; edit(i, (w) => { if (w[k].l) delete w[k].l; else w[k].l = 1; }); }
    else if (mode === 'i') {
      if (c < 0) return;
      const g = memo[i].w[k].i;
      if (g) { edit(i, (w) => w.forEach((t) => { if (t.i === g) delete t.i; })); setPend(null); return; }
      if (!pend || pend.i !== i) { setPend({ i, k }); setNote(`「${memo[i].w[k].t}」から。最後の語を押してください。`); return; }
      const a = Math.min(pend.k, k); const b = Math.max(pend.k, k); setPend(null); setNote('');
      if (a === b) return;
      edit(i, (w) => { if (w.slice(a, b + 1).some((t) => t.i)) return; const ng = Math.max(0, ...w.map((t) => t.i || 0)) + 1; for (let x = a; x <= b; x++) w[x].i = ng; });
    }
  };
  const save = async () => {
    setBusy(true);
    try { await saveSong({ id, memo, memoSrc: src, memoAt: Date.now() }); setDirty(false); setNote('歌詞メモを保存しました(控え室に表示されます)'); onSaved && onSaved(); }
    catch (e) { setNote('保存できませんでした: ' + e.message); }
    setBusy(false);
  };

  if (!lines.length) return <div className="card"><p>先に歌詞を保存してください。歌詞がない曲は、控え室に「この曲の歌詞メモは準備中です」と表示されます。</p></div>;
  return (
    <div className="card">
      {!fresh && s.memo && !memo && <div className="msg">歌詞が変わったため、今の歌詞メモは控え室に表示されていません。「分析する」でもう一度作ってください。</div>}
      <div className="row">
        <button className="btn pri" disabled={busy} onClick={analyze}>{memo ? '分析し直す' : '分析する'}</button>
        {memo && <button className={'btn' + (dirty ? ' pri' : '')} disabled={busy || !dirty} onClick={save}>{dirty ? '歌詞メモを保存' : '✓ 保存済み'}</button>}
        <span style={{ fontSize: 12, color: '#7a6a54' }}>{s.memoAt && fresh ? '最終保存: ' + stampDate(s.memoAt) : ''}</span>
      </div>
      {note && <div className="msg">{note}</div>}
      {memo && (<>
        <div className="memo-tools">
          {MODES.map(([k, label]) => <button key={k} className={'btn' + (mode === k ? ' on' : '')} onClick={() => { setMode(k); setPend(null); }}>{label}</button>)}
        </div>
        <p style={{ fontSize: 12, color: '#7a6a54', margin: '6px 0' }}>{MODES.find((m) => m[0] === mode)[2]} 同じ歌詞の行(繰り返しのサビなど)にも同じ印が付きます。</p>
        <MemoLegend className="lg" />
        {secs.map((x) => (
          <div key={x.label}>
            <div className="memo-sec">[{x.label}]</div>
            {x.idx.map((i) => <MemoLine key={i} tokens={memo[i].w} className={'memo-ed' + (pend && pend.i === i ? ' pending' : '')} onPick={(k, c) => pick(i, k, c)} />)}
          </div>
        ))}
      </>)}
    </div>
  );
}

function Editor({ id }) {
  const [s, setS] = useState(null);
  const [text, setText] = useState('');
  const [jp, setJp] = useState('');
  const [lines, setLines] = useState([]);
  const [chordTxt, setChordTxt] = useState('');
  const [msg, setMsg] = useState('');
  const [aud, setAud] = useState(null);
  const [t, setT] = useState(0);
  const [tapIdx, setTapIdx] = useState(0);
  const [secMode, setSecMode] = useState(true);
  const [chordMsg, setChordMsg] = useState('');
  const [playRow, setPlayRow] = useState(null);
  const [seekV, setSeekV] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [doneKey, setDoneKey] = useState(null);
  const [cnt, setCnt] = useState({ on: false, bpm: '', offset: '', beat: 1 });
  const player = useRef(null);
  const envRef = useRef(null);
  const keyRef = useRef(null);
  const rowRefs = useRef([]);

  const load = async () => {
    const d = await adminFetch('/api/admin/song?id=' + id);
    setS(d); setLines(d.lines || []); setText(linesToText(d.lines || [])); setJp(d.jp || '');
    setChordTxt((d.chords || []).map((c) => `${c.t} ${c.c}`).join('\n'));
    const v0 = (d.lines || []).find((l) => l.t != null);
    setCnt(d.count ? { on: !!d.count.on, bpm: d.count.bpm ?? '', offset: d.count.offset ?? (v0 ? v0.t : ''), beat: d.count.beat || 1 } : { on: false, bpm: '', offset: v0 ? v0.t : '', beat: 1 });
  };
  useEffect(() => { load(); return () => stop(); }, [id]);

  const save = async (data, note = '保存しました') => { await saveSong({ id, ...data }); setMsg(note); load(); };
  // ボタンの「処理中…」「✓ 完了」表示
  const act = async (key, fn) => {
    if (busyKey) return;
    setBusyKey(key);
    try { await fn(); setDoneKey(key); setTimeout(() => setDoneKey((k) => (k === key ? null : k)), 2200); }
    catch (e) { setMsg(e.message); }
    setBusyKey(null);
  };
  const lbl = (key, label, done = '✓ 完了') => (busyKey === key ? '処理中…' : doneKey === key ? done : label);
  const bcls = (key, base = 'btn') => base + (doneKey === key ? ' done' : '');
  // お知らせは数秒で消える(「…」で終わる途中経過は残す)
  useEffect(() => { if (!msg || msg.endsWith('…')) return; const tm = setTimeout(() => setMsg(''), 5000); return () => clearTimeout(tm); }, [msg]);

  // ---- 簡易プレーヤー(タイミング付け用)----
  const startAt = (off) => {
    stop();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const srcs = [aud.vocal, aud.track].map((b) => { const n = ctx.createBufferSource(); n.buffer = b; n.connect(ctx.destination); n.start(0, Math.max(0, off)); return n; });
    const t0 = ctx.currentTime - off;
    const timer = setInterval(() => setT(ctx.currentTime - t0), 50);
    player.current = { ctx, srcs, timer, now: () => ctx.currentTime - t0 };
  };
  function stop() { const p = player.current; setPlayRow(null); if (p) { clearInterval(p.timer); p.srcs.forEach((n) => { try { n.stop(); } catch {} }); p.ctx.close(); player.current = null; setT((x) => x + 0); } }
  const seekBy = (d) => { if (player.current) startAt(Math.max(0, player.current.now() + d)); };
  // 各行の ▶:1回目で再生、2回目で停止
  const togglePlay = (i) => {
    if (player.current && playRow === i) { stop(); return; }
    const l = lines[i];
    startAt(l.t != null ? Math.max(0, l.t - 1.5) : resumeFrom(i));
    setPlayRow(i);
  };
  const loadAudio = async () => {
    setMsg('音源を読み込み中…');
    const [vocal, track] = await Promise.all([adminAudio(s.vocalKey), adminAudio(s.trackKey)]);
    setAud({ vocal, track }); setMsg('音源を読み込みました');
    // コードが未保存なら、裏で推定して自動保存(タイミングの作業はそのまま続けられます)
    if (!(s.chords && s.chords.length)) (async () => {
      try {
        setChordMsg('コードを推定中…(終わると自動で保存します)');
        const cs = await estimateChords(track, (p) => setChordMsg(`コードを推定中… ${Math.round(p * 100)}%(終わると自動で保存します)`));
        await saveSong({ id, chords: cs });
        setChordTxt(cs.map((c) => `${c.t} ${c.c}`).join('\n'));
        setS((x) => ({ ...x, chords: cs }));
        setChordMsg('コードを推定して保存しました。おかしな所は下で直して「コードを保存」を押してください。');
      } catch (e) { setChordMsg('コードを推定できませんでした: ' + e.message); }
    })();
  };
  // ---- タップ記録 ----
  // 次に記録する行:楽段の頭を叩いたら次の楽段の頭へ/楽段の途中の行(手直し)を叩いたらすぐ下の行へ
  const nextIdx = (i) => {
    if (!secMode || !lines[i]?.start) return Math.min(i + 1, lines.length - 1);
    for (let k = i + 1; k < lines.length; k++) if (lines[k].start) return k;
    return i;
  };
  const tap = (lag = 0) => {
    if (!player.current || !lines.length) return;
    const now = Math.max(0, Math.round((player.current.now() - lag) * 10) / 10);
    const i = tapIdx;
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: now } : l)));
    const n = nextIdx(i);
    if (n === i) setMsg(secMode ? '最後の楽段まで記録しました。「楽段の中を自動で割り振り」を押してください。' : '最終行まで記録しました。確認して「タイミングを保存」を押してください。');
    setTapIdx(n);
  };
  const env = () => { if (!envRef.current) envRef.current = vocalEnvelope(aud.vocal); return envRef.current; };
  // 記録を始める位置:すぐ上の行の1秒前から(曲の最初には戻らない)
  // すぐ上の行がまだ空欄なら、記録済みの楽段から「1音節あたりの秒数」を出して、だいたいの位置を見積もる
  const resumeFrom = (i) => {
    if (i <= 0) return 0;
    // その行とすぐ上の行のうち、早いほうの時間の3秒前(どちらかがずれていても、叩きたい所より後から始まらない)
    const known = [lines[i].t, lines[i - 1].t].filter((v) => v != null);
    if (known.length) return Math.max(0, Math.min(...known) - 3);
    // どちらも空欄なら、記録済みの楽段から歌う速さを出して見積もる
    let k = i - 1; while (k >= 0 && lines[k].t == null) k--;
    if (k < 0) return 0;
    const heads = lines.map((l, x) => ({ l, x })).filter((o) => o.l.t != null);
    const rates = [];
    for (let h = 0; h + 1 < heads.length; h++) {
      const a = heads[h]; const b = heads[h + 1];
      let n = 0; for (let x = a.x; x < b.x; x++) n += syllables(lines[x].text);
      if (n >= 8 && b.l.t > a.l.t) rates.push((b.l.t - a.l.t) / n);
    }
    const rate = rates.length ? Math.min(...rates) : 0.28;
    let n = 0; for (let x = k; x < i; x++) n += syllables(lines[x].text);
    return Math.max(lines[k].t, lines[k].t + n * rate - 3);
  };
  const back = () => {
    let i = Math.max(0, tapIdx - 1);
    if (secMode && lines[tapIdx]?.start) { while (i > 0 && !lines[i].start) i--; }
    setTapIdx(i);
    if (player.current) startAt(resumeFrom(i));
  };
  const autoFill = () => {
    const r = fillSections(lines, env());
    setLines(r.lines);
    setMsg(`楽段の中の${r.filled}行に時間を入れました。${r.skipped.length ? `楽段の頭が未記録のため飛ばした楽段: ${r.skipped.join('、')}。` : ''}「最初から再生(確認)」で流し聴きして、ずれた行だけ直してください。`);
  };
  // 最初から記録:入っている時間を全部消してから始める
  const recordFromStart = () => {
    if (lines.some((l) => l.t != null) && !confirm('今入っている時間を全部消して、最初から記録しますか?(「タイミングを保存」を押すまでは、画面を開き直せば元に戻せます)')) return;
    setLines((ls) => ls.map((l) => ({ ...l, t: null })));
    setTapIdx(0); setMsg('');
    startAt(0);
  };
  const sectionCount = lines.filter((l) => l.start).length;

  // キーボード:スペース=歌い出し/←=1行戻る/Esc=停止
  keyRef.current = (e) => {
    const tg = e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (e.repeat) return;
      if (!player.current) startAt(resumeFrom(tapIdx)); else tap(Math.max(0, (performance.now() - e.timeStamp) / 1000));
    } else if (e.code === 'ArrowLeft') { e.preventDefault(); seekBy(-3); }
    else if (e.code === 'ArrowRight') { e.preventDefault(); seekBy(3); }
    else if (e.code === 'Backspace') { e.preventDefault(); back(); }
    else if (e.code === 'Escape') { stop(); setT((x) => x); }
  };
  useEffect(() => {
    if (!aud) return;
    const down = (e) => keyRef.current && keyRef.current(e);
    const up = (e) => { if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) e.preventDefault(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [aud]);
  // 記録中の行が見える位置までスクロール
  useEffect(() => { const el = rowRefs.current[tapIdx]; if (el && player.current) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [tapIdx]);

  // ---- カウント(歌い出しのドンカマ)----
  // 歌い出しの時刻は「歌詞のタイミング」の1行目。テンポだけ自動で調べ、何拍目から歌うかを先生が選ぶ
  const firstLineT = () => { const f = (lines.length ? lines : s.lines || []).find((l) => l.t != null); return f ? f.t : null; };
  const detectCount = () => {
    const v0 = firstLineT();
    const r = detectTempo(aud.track, v0);
    setCnt((c) => ({ ...c, on: c.on || (v0 != null && v0 < 2.5), bpm: r.bpm, offset: c.offset === '' && v0 != null ? v0 : c.offset }));
    setMsg(`テンポは ${r.bpm} と判定しました。「歌い出しは何拍目?」を選んで、「カウント付きで確認」で聞いてください。`);
  };
  // カウント → 曲。歌い出しの後も16拍だけ小さくスティックを重ねて、拍が合っているか確かめられる
  const playCount = () => {
    stop();
    const bpm = Number(cnt.bpm); const off = Number(cnt.offset) || 0;
    if (!(bpm > 0)) { setMsg('先にテンポを入れてください(「テンポを自動で調べる」)'); return; }
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const p = countPlan(bpm, off, cnt.beat);
    const T0 = ctx.currentTime + 0.15 + Math.max(0, -p.first); // 曲の頭の時刻
    const mk = (acc) => { const d = stickSamples(ctx.sampleRate, acc); const b = ctx.createBuffer(1, d.length, ctx.sampleRate); b.getChannelData(0).set(d); return b; };
    const hi = mk(true), lo = mk(false);
    const hit = (at, acc, vol) => { const n = ctx.createBufferSource(); n.buffer = acc ? hi : lo; const g = ctx.createGain(); g.gain.value = vol; n.connect(g); g.connect(ctx.destination); n.start(at); };
    for (let k = 0; k < p.n; k++) hit(T0 + p.first + k * p.beat, k === 0, 1);
    // 歌い出しの後の確認用(小節の頭=強く)
    const bNo = Math.min(4, Math.max(1, Number(cnt.beat) || 1));
    for (let k = 0; k < 16; k++) hit(T0 + off + k * p.beat, (bNo - 1 + k) % 4 === 0, 0.4);
    const srcs = [aud.vocal, aud.track].map((b) => { const n = ctx.createBufferSource(); n.buffer = b; n.connect(ctx.destination); n.start(T0, 0); return n; });
    const timer = setInterval(() => setT(Math.max(0, ctx.currentTime - T0)), 50);
    player.current = { ctx, srcs, timer, now: () => ctx.currentTime - T0 };
    setPlayRow(-2);
  };
  const adjCount = (k, d) => setCnt((c) => ({ ...c, [k]: Math.max(0, Math.round(((Number(c[k]) || 0) + d) * 100) / 100) }));

  const nudge = (i, d) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: Math.max(0, Math.round(((l.t || 0) + d) * 10) / 10) } : l)));
  const setTime = (i, v) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: v === '' ? null : Number(v) } : l)));

  if (!s) return <p>読み込み中…</p>;
  const can = s.vocalKey && s.trackKey;
  return (
    <>
      <p><Link href="/admin">← 曲の一覧</Link></p>
      <h1>{s.title}</h1>
      <p style={{ margin: '4px 0 0' }}><a className="btn" href={'/booth/' + id} target="_blank" rel="noreferrer">生徒画面で見る ↗</a></p>
      {msg && <div className="toast">{msg}</div>}

      <h2>基本情報</h2>
      <div className="card">
        <label>曲名<input type="text" defaultValue={s.title} id="f-title" /></label>
        <label style={{ display: 'block', marginTop: 8 }}>EP名(EP収録曲のみ)<input type="text" defaultValue={s.ep || ''} id="f-ep" /></label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className={bcls('info')} disabled={!!busyKey} onClick={() => act('info', () => save({ title: document.getElementById('f-title').value.trim(), ep: document.getElementById('f-ep').value.trim() }))}>{lbl('info', '保存', '✓ 保存済み')}</button>
          <label className="row" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={!!s.ready} onChange={(e) => save({ ready: e.target.checked }, e.target.checked ? '公開しました(生徒の一覧に出ます)' : '非公開にしました')} />生徒に公開する</label>
        </div>
      </div>

      <h2>音源・ジャケット(差し替え)</h2>
      <div className="card">
        {[['vocal', 'ボーカル(MP3)', 'audio/*'], ['track', '伴奏(MP3)', 'audio/*'], ['jacket', 'ジャケット', 'image/*']].map(([k, label, acc]) => (
          <div key={k} className="row" style={{ marginBottom: 8 }}>
            <span style={{ width: 120 }}>{label} {s[k + 'Key'] ? <span className="ok">✓</span> : <span className="ng">未登録</span>}</span>
            <input type="file" accept={acc} onChange={async (e) => {
              const f = e.target.files[0]; if (!f) return;
              setMsg('アップロード中…');
              const key = `songs/${id}/${k}.${k === 'jacket' ? 'jpg' : 'mp3'}`;
              const blob = k === 'jacket' ? await resizeJacket(f) : f;
              await uploadTo(key, blob, k === 'jacket' ? 'image/jpeg' : 'audio/mpeg');
              save({ [k + 'Key']: key }, 'アップロードしました');
            }} />
          </div>
        ))}
      </div>

      <h2>歌詞と和訳</h2>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <button className={bcls('pdf', 'btn pri')} disabled={!!busyKey} onClick={() => act('pdf', async () => {
            setMsg('門弟アプリの歌詞PDFを読み込み中…');
            {
              const r = await fetch('/api/admin/pdf?id=' + id, { headers: await adminHeaders() });
              if (!r.ok) throw new Error('この曲の歌詞PDFは門弟アプリに登録されていません。下からPDFファイルを選んでください。');
              const raw = await pdfText(await r.blob());
              const c = cleanLyrics(raw, s.title); setText(c.text); setJp(c.jp);
              setMsg('読み込みました。折り返し・繰り返し・和訳の分かれ方を確認して「歌詞を保存」を押してください。');
            }
          })}>{lbl('pdf', '門弟アプリの歌詞PDFから読み込む', '✓ 読み込みました')}</button>
        </div>
        <div className="row"><span>PDFファイルを選んで読み込む:</span>
          <input type="file" accept="application/pdf" onChange={async (e) => {
            const f = e.target.files[0]; if (!f) return;
            const raw = await pdfText(f);
            const r = cleanLyrics(raw, s.title);
            setText(r.text); setJp(r.jp);
            setMsg('PDFから読み込みました。折り返し・繰り返し・和訳の分かれ方を確認して「歌詞を保存」を押してください。');
          }} />
        </div>
        <p style={{ fontSize: 12, color: '#7a6a54' }}>[Verse 1] のような見出しの次の行から、その区間の歌詞です。1行=カラオケの1行になります。</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
        <p style={{ marginBottom: 4 }}>和訳(ワンコーラス分・控え室に表示)</p>
        <textarea value={jp} onChange={(e) => setJp(e.target.value)} style={{ minHeight: 140, fontFamily: 'inherit' }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className={bcls('lyr', 'btn pri')} disabled={!!busyKey} onClick={() => act('lyr', () => { const nl = textToLines(text, lines.length ? lines : (s.lines || [])); return save({ lines: nl, jp, timed: nl.every((l) => l.t != null) }, '歌詞を保存しました'); })}>{lbl('lyr', '歌詞を保存', '✓ 保存済み')}</button>
        </div>
      </div>

      <h2>歌詞のタイミング</h2>
      <div className="card">
        {!can && <p>先にボーカルと伴奏を登録してください。</p>}
        {can && !aud && <button className="btn pri" disabled={!!busyKey} onClick={() => act('aud', loadAudio)}>{busyKey === 'aud' ? '音源を読み込み中…' : '音源を読み込む'}</button>}
        {aud && (<>
          <div style={{ fontSize: 13, background: '#fff8ea', border: '1px solid #eadfcd', borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.7 }}>
            <b>記録のしかた(3ステップ)</b><br />
            ① <b>楽段の頭を記録</b>:「最初から記録」を押し、[Verse] や [Chorus] の1行目の歌い出しで<b>スペースキー</b>。楽段の数だけ叩けば終わりです。途中で止めたら、次に叩く楽段の「ここから記録」→ スペースキーで、すぐ上の行の少し前から再生が始まります。<br />
            ② <b>楽段の中を自動で割り振り</b>:ボタンを押すと、楽段の中の行に時間が入ります。<br />
            ③ <b>ずれた行を直す</b>:「最初から再生(確認)」で流し聴きし、ずれた行は ±0.1 で直すか、その行の「ここから記録」→ スペースキー(再生開始)→ 歌い出しでスペースキー → Esc で止める。<br />
            ・再生中は <b>←→キー</b> で3秒戻す/進める、画面下のバーで好きな位置から再生できます(次に叩く行は変わりません)。<br />
            ・叩き損ねたら <b>Backspaceキー</b> で1つ戻ります。各行の ▶ は押すたびに再生/停止。最後に「タイミングを保存」を忘れずに。
          </div>
          {chordMsg && <div className="msg" style={{ marginBottom: 8 }}>{chordMsg}</div>}
          <div className="row" style={{ marginBottom: 8 }}>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={secMode} onChange={(e) => { setSecMode(e.target.checked); if (e.target.checked) { let k = tapIdx; while (k > 0 && !lines[k].start) k--; setTapIdx(k); } }} />楽段の頭だけ記録({sectionCount}か所)</label>
          </div>
          <div className="row">
            <button className="btn" onClick={recordFromStart}>① 最初から記録</button>
            <button className={bcls('fill', 'btn pri')} onClick={() => { autoFill(); setDoneKey('fill'); setTimeout(() => setDoneKey((k) => (k === 'fill' ? null : k)), 2200); }}>{doneKey === 'fill' ? '✓ 割り振りました' : '② 楽段の中を自動で割り振り'}</button>
            <button className={'btn' + (player.current && playRow === -1 ? ' play-on' : '')} onClick={() => { if (player.current && playRow === -1) { stop(); return; } startAt(0); setPlayRow(-1); }}>{player.current && playRow === -1 ? '■ 確認の再生を止める' : '③ 最初から再生(確認)'}</button>
            <button className="btn" onClick={stop}>停止</button>
            <span className="mono">{fmt(t)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            {lines.map((l, i) => (
              <div key={i} ref={(el) => { rowRefs.current[i] = el; }} className={'tl' + (player.current && l.t != null && l.t <= t && (lines[i + 1]?.t ?? 1e9) > t ? ' now' : '')} style={i === tapIdx ? { boxShadow: 'inset 4px 0 0 #7a3d21' } : null}>
                <span className="tbox">
                  <input type="number" step="0.1" value={l.t ?? ''} onChange={(e) => setTime(i, e.target.value)} />
                  <span className="spin">
                    <button type="button" title="1秒進める" onClick={() => nudge(i, 1)}>▲</button>
                    <button type="button" title="1秒戻す" onClick={() => nudge(i, -1)}>▼</button>
                  </span>
                </span>
                <span>{l.start && l.sec ? <b style={{ color: '#7a3d21' }}>[{l.sec}] </b> : null}{l.text}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => nudge(i, -0.1)}>-0.1</button>
                  <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => nudge(i, 0.1)}>+0.1</button>
                  <button className={'btn' + (player.current && playRow === i ? ' play-on' : '')} style={{ minHeight: 34, padding: '0 10px' }} title="押すたびに再生/停止" onClick={() => togglePlay(i)}>{player.current && playRow === i ? '■' : '▶'}</button>
                  <button className={'btn' + (i === tapIdx ? ' play-on' : '')} style={{ minHeight: 34, padding: '0 8px' }} onClick={() => { setTapIdx(i); setMsg(`${i + 1}行目を「次に叩く行」にしました。スペースキーで少し前から再生します。`); }}>ここから記録</button>
                </span>
              </div>
            ))}
          </div>
          <div className="sticky">
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#a8957a', minHeight: 18 }}>{lines[tapIdx - 1]?.text || ''}</div>
              <div style={{ fontSize: 12, color: '#7a3d21', letterSpacing: 2 }}>次に叩く行{lines[tapIdx]?.start && lines[tapIdx]?.sec ? `:[${lines[tapIdx].sec}] の1行目` : ''}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#3a2a18', lineHeight: 1.4 }}>
                {lines[tapIdx]?.start && lines[tapIdx]?.sec ? <span style={{ fontSize: 14, color: '#7a3d21' }}>[{lines[tapIdx].sec}] </span> : null}{lines[tapIdx]?.text || ''}
              </div>
              <div style={{ fontSize: 15, color: '#7a6a54', minHeight: 20 }}>{lines[tapIdx + 1]?.text || '(最後の行)'}</div>
              <div style={{ fontSize: 12, color: '#7a6a54', marginTop: 4 }}>{tapIdx + 1} / {lines.length} 行目 ・ スペース=再生/歌い出し ←→ =3秒戻す/進める Backspace=1つ戻る Esc=停止</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
              <span className="mono" style={{ fontSize: 12 }}>{fmt(seekV ?? t)}</span>
              <input type="range" className="seek" min={0} max={Math.floor(aud.vocal.duration)} step={0.1} value={seekV ?? t}
                onChange={(e) => setSeekV(Number(e.target.value))}
                onPointerUp={(e) => { const v = Number(e.target.value); setSeekV(null); startAt(v); }}
                onKeyUp={(e) => { const v = Number(e.target.value); setSeekV(null); startAt(v); }} />
              <span className="mono" style={{ fontSize: 12 }}>{fmt(aud.vocal.duration)}</span>
            </div>
            <button className="btn pri tap" onClick={() => { if (!player.current) startAt(resumeFrom(tapIdx)); else tap(0); }}>{player.current ? 'この行の歌い出し!' : 'ここから再生して記録'}</button>
            <div className="row" style={{ marginTop: 8 }}><button className={bcls('tim', 'btn pri')} disabled={!!busyKey} onClick={() => act('tim', () => save({ lines, timed: lines.every((l) => l.t != null) }, 'タイミングを保存しました'))}>{lbl('tim', 'タイミングを保存', '✓ 保存済み')}</button></div>
          </div>
        </>)}
      </div>

      <h2>カウント(いきなり歌い出す曲のドンカマ)</h2>
      <div className="card">
        <p style={{ fontSize: 13, color: '#7a6a54', margin: '0 0 8px' }}>オンにした曲は、生徒が曲の頭から再生した時だけ、歌い出しの前にスティックのカウントが鳴ります。1拍目から歌う曲は「1・2・3・4」の4つ、4拍目から歌う曲は「1・2・3」の3つです。歌い出しの時刻は「歌詞のタイミング」の1行目を使います。</p>
        {!aud && <p>上の「歌詞のタイミング」で「音源を読み込む」を押すと、テンポの自動判定と確認ができます。</p>}
        <div className="row" style={{ marginTop: 6 }}>
          <b style={{ width: 130 }}>① テンポ(BPM)</b>
          {aud && <button className="btn pri" onClick={detectCount}>自動で調べる</button>}
          <input type="number" step="0.1" value={cnt.bpm} onChange={(e) => setCnt((c) => ({ ...c, bpm: e.target.value }))} style={{ width: 100 }} />
          <button className="btn" onClick={() => setCnt((c) => ({ ...c, bpm: Math.round(Number(c.bpm) * 2 * 10) / 10 }))}>×2</button>
          <button className="btn" onClick={() => setCnt((c) => ({ ...c, bpm: Math.round((Number(c.bpm) / 2) * 10) / 10 }))}>÷2</button>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <b style={{ width: 130 }}>② 歌い出しは何拍目?</b>
          {[1, 2, 3, 4].map((b) => (
            <button key={b} className={'btn' + (Number(cnt.beat) === b ? ' pri' : '')} onClick={() => setCnt((c) => ({ ...c, beat: b }))}>{b}拍目{b === 1 ? '(4つ鳴る)' : `(${b - 1}つ鳴る)`}</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <b style={{ width: 130 }}>③ 確認</b>
          {aud && <button className={'btn pri' + (player.current && playRow === -2 ? ' play-on' : '')} onClick={() => { if (player.current && playRow === -2) { stop(); return; } playCount(); }}>{player.current && playRow === -2 ? '■ 止める' : '▶ カウント付きで確認'}</button>}
          <label className="row" style={{ marginLeft: 'auto' }}><input type="checkbox" checked={!!cnt.on} onChange={(e) => setCnt((c) => ({ ...c, on: e.target.checked }))} />この曲にカウントを入れる</label>
        </div>
        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>微調整(歌い出しが少し早い・遅いと感じた時だけ)</summary>
          <div className="row" style={{ marginTop: 8 }}>
            <span>歌い出しの時刻</span>
            <input type="number" step="0.01" value={cnt.offset} onChange={(e) => setCnt((c) => ({ ...c, offset: e.target.value }))} style={{ width: 100 }} />秒
            <button className="btn" onClick={() => adjCount('offset', -0.02)}>少し早く(-0.02)</button>
            <button className="btn" onClick={() => adjCount('offset', 0.02)}>少し遅く(+0.02)</button>
            <button className="btn" onClick={() => { const v = firstLineT(); if (v != null) setCnt((c) => ({ ...c, offset: v })); }}>1行目の時刻に戻す</button>
            <span style={{ width: '100%', height: 0 }} />
            <span>テンポ</span>
            <button className="btn" onClick={() => adjCount('bpm', -0.5)}>-0.5</button>
            <button className="btn" onClick={() => adjCount('bpm', 0.5)}>+0.5</button>
          </div>
        </details>
        <div className="row" style={{ marginTop: 10 }}>
          <button className={bcls('cnt', 'btn pri')} disabled={!!busyKey} onClick={() => act('cnt', () => save({ count: { on: !!cnt.on, bpm: Number(cnt.bpm) || 0, offset: Number(cnt.offset) || 0, beat: Number(cnt.beat) || 1 } }, 'カウントの設定を保存しました'))}>{lbl('cnt', 'カウントの設定を保存', '✓ 保存済み')}</button>
        </div>
      </div>

      <h2>コード(参考表示)</h2>
      <div className="card">
        {aud ? <button className={bcls('chordEst')} disabled={!!busyKey} onClick={() => act('chordEst', async () => { setChordMsg('コードを推定中…(1〜2分かかります)'); const cs = await estimateChords(aud.track, (p) => setChordMsg(`コードを推定中… ${Math.round(p * 100)}%`)); setChordTxt(cs.map((c) => `${c.t} ${c.c}`).join('\n')); setChordMsg('推定しました。おかしな所は直して「コードを保存」を押してください(秒数 コード名)。'); })}>{lbl('chordEst', '伴奏からコードを推定し直す', '✓ 推定しました')}</button>
          : <p>上の「音源を読み込む」の後に推定できます。</p>}
        {chordMsg && <div className="msg">{chordMsg}</div>}
        <textarea value={chordTxt} onChange={(e) => setChordTxt(e.target.value)} style={{ minHeight: 160, marginTop: 8 }} placeholder={'12.4 Am\n14.2 F'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className={bcls('chordSave', 'btn pri')} disabled={!!busyKey} onClick={() => act('chordSave', () => {
            const cs = chordTxt.split('\n').map((r) => r.trim().split(/\s+/)).filter((p) => p.length >= 2 && !isNaN(Number(p[0]))).map((p) => ({ t: Number(p[0]), c: p[1] })).sort((a, b) => a.t - b.t);
            return save({ chords: cs }, 'コードを保存しました');
          })}>{lbl('chordSave', 'コードを保存', '✓ 保存済み')}</button>
        </div>
      </div>

      <h2>英語歌唱メソッドの歌詞メモ(控え室)</h2>
      <MemoEditor key={(s.memoAt || 0) + ':' + memoSource(s.lines)} id={id} s={s} onSaved={load} />

      <h2>リリックビデオ</h2>
      <div className="card row">
        <Link className="btn pri" href={'/admin/video/' + id}>リリックビデオを作る</Link>
        {s.videoMadeAt && <span className="stamp sm" title={'生成済み ' + stampDate(s.videoMadeAt)}>生成済<br />{new Date(s.videoMadeAt).getMonth() + 1}/{new Date(s.videoMadeAt).getDate()}</span>}
      </div>
    </>
  );
}

export default function Page() { const { query } = useRouter(); return <AdminGate>{query.id ? <Editor id={query.id} /> : null}</AdminGate>; }
