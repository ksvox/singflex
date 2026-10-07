import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import AdminGate from '../../../components/AdminGate';
import { adminFetch, adminHeaders } from '../../../lib/client/firebaseClient';
import { saveSong, uploadTo, resizeJacket, adminAudio } from '../../../lib/client/admin';
import { cleanLyrics, textToLines, linesToText, vocalEnvelope, placeRepeats, fillSections } from '../../../lib/client/lyrics';
import { estimateChords } from '../../../lib/client/chords';
import { pdfText } from '../../../lib/client/pdf';
import { fmt } from '../../../lib/client/song';

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
  const player = useRef(null);
  const envRef = useRef(null);
  const keyRef = useRef(null);
  const rowRefs = useRef([]);

  const load = async () => {
    const d = await adminFetch('/api/admin/song?id=' + id);
    setS(d); setLines(d.lines || []); setText(linesToText(d.lines || [])); setJp(d.jp || '');
    setChordTxt((d.chords || []).map((c) => `${c.t} ${c.c}`).join('\n'));
  };
  useEffect(() => { load(); return () => stop(); }, [id]);

  const save = async (data, note = '保存しました') => { await saveSong({ id, ...data }); setMsg(note); load(); };

  // ---- 簡易プレーヤー(タイミング付け用)----
  const startAt = (off) => {
    stop();
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const srcs = [aud.vocal, aud.track].map((b) => { const n = ctx.createBufferSource(); n.buffer = b; n.connect(ctx.destination); n.start(0, Math.max(0, off)); return n; });
    const t0 = ctx.currentTime - off;
    const timer = setInterval(() => setT(ctx.currentTime - t0), 50);
    player.current = { ctx, srcs, timer, now: () => ctx.currentTime - t0 };
  };
  function stop() { const p = player.current; if (p) { clearInterval(p.timer); p.srcs.forEach((n) => { try { n.stop(); } catch {} }); p.ctx.close(); player.current = null; } }
  const loadAudio = async () => {
    setMsg('音源を読み込み中…');
    const [vocal, track] = await Promise.all([adminAudio(s.vocalKey), adminAudio(s.trackKey)]);
    setAud({ vocal, track }); setMsg('音源を読み込みました');
    // コードが未保存なら、裏で推定して自動保存(タイミングの作業はそのまま続けられます)
    if (!(s.chords && s.chords.length)) {
      try {
        setChordMsg('コードを推定中…(終わると自動で保存します)');
        const cs = await estimateChords(track, (p) => setChordMsg(`コードを推定中… ${Math.round(p * 100)}%(終わると自動で保存します)`));
        await saveSong({ id, chords: cs });
        setChordTxt(cs.map((c) => `${c.t} ${c.c}`).join('\n'));
        setS((x) => ({ ...x, chords: cs }));
        setChordMsg('コードを推定して保存しました。おかしな所は下で直して「コードを保存」を押してください。');
      } catch (e) { setChordMsg('コードを推定できませんでした: ' + e.message); }
    }
  };
  // ---- タップ記録 ----
  // 次に記録する行(楽段モードなら次の楽段の1行目)
  const nextIdx = (i) => {
    if (!secMode) return Math.min(i + 1, lines.length - 1);
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
  // 記録を再開する位置(ひとつ前の行の1秒前から)
  const resumeFrom = (i) => { const prev = lines[i - 1]?.t; return prev != null ? prev - 1 : Math.max(0, (lines[i]?.t ?? 0) - 3); };
  const back = () => {
    let i = Math.max(0, tapIdx - 1);
    if (secMode) { while (i > 0 && !lines[i].start) i--; }
    setTapIdx(i);
    if (player.current) startAt(resumeFrom(i));
  };
  const firstEmpty = (ls) => { const k = ls.findIndex((l) => l.t == null && (!secMode || l.start)); return k < 0 ? ls.length - 1 : k; };
  const env = () => { if (!envRef.current) envRef.current = vocalEnvelope(aud.vocal); return envRef.current; };
  const autoFill = () => {
    const r = fillSections(lines, env());
    setLines(r.lines);
    setMsg(`楽段の中の${r.filled}行に時間を入れました。${r.skipped.length ? `楽段の頭が未記録のため飛ばした楽段: ${r.skipped.join('、')}。` : ''}「最初から再生(確認)」で流し聴きして、ずれた行だけ直してください。`);
  };
  const autoRepeat = () => {
    const r = placeRepeats(lines, env());
    setLines(r.lines);
    setTapIdx(firstEmpty(r.lines));
    setMsg(r.placed
      ? `繰り返し部分を${r.placed}か所に配置しました。${r.missed ? `(${r.missed}か所は見つからず)` : ''}まだ空欄の行は、スペースキーで続きを記録してください。`
      : '配置できる繰り返しがありませんでした。同じ歌詞の区間の1回目を、先に最後まで記録してください。');
  };
  const shiftAll = (d) => setLines((ls) => ls.map((l) => (l.t == null ? l : { ...l, t: Math.max(0, Math.round((l.t + d) * 10) / 10) })));
  const clearAll = () => { if (!confirm('この曲の歌詞タイミングを全部消して、最初からやり直しますか?(保存するまでは元に戻せます)')) return; stop(); setLines((ls) => ls.map((l) => ({ ...l, t: null }))); setTapIdx(0); setT(0); };
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
    } else if (e.code === 'ArrowLeft') { e.preventDefault(); back(); }
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

  const nudge = (i, d) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: Math.max(0, Math.round(((l.t || 0) + d) * 10) / 10) } : l)));
  const setTime = (i, v) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, t: v === '' ? null : Number(v) } : l)));

  if (!s) return <p>読み込み中…</p>;
  const can = s.vocalKey && s.trackKey;
  return (
    <>
      <p><Link href="/admin">← 曲の一覧</Link></p>
      <h1>{s.title}</h1>
      {msg && <div className="msg">{msg}</div>}

      <h2>基本情報</h2>
      <div className="card">
        <label>曲名<input type="text" defaultValue={s.title} id="f-title" /></label>
        <label style={{ display: 'block', marginTop: 8 }}>EP名(EP収録曲のみ)<input type="text" defaultValue={s.ep || ''} id="f-ep" /></label>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => save({ title: document.getElementById('f-title').value.trim(), ep: document.getElementById('f-ep').value.trim() })}>保存</button>
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
          <button className="btn pri" onClick={async () => {
            setMsg('門弟アプリの歌詞PDFを読み込み中…');
            try {
              const r = await fetch('/api/admin/pdf?id=' + id, { headers: await adminHeaders() });
              if (!r.ok) { setMsg('この曲の歌詞PDFは門弟アプリに登録されていません。下からPDFファイルを選んでください。'); return; }
              const raw = await pdfText(await r.blob());
              const c = cleanLyrics(raw, s.title); setText(c.text); setJp(c.jp);
              setMsg('読み込みました。折り返し・繰り返し・和訳の分かれ方を確認して「歌詞を保存」を押してください。');
            } catch (e) { setMsg('読み込めませんでした: ' + e.message); }
          }}>門弟アプリの歌詞PDFから読み込む</button>
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
          <button className="btn pri" onClick={() => { const nl = textToLines(text, s.lines || []); save({ lines: nl, jp, timed: nl.every((l) => l.t != null) }, '歌詞を保存しました'); }}>歌詞を保存</button>
        </div>
      </div>

      <h2>歌詞のタイミング</h2>
      <div className="card">
        {!can && <p>先にボーカルと伴奏を登録してください。</p>}
        {can && !aud && <button className="btn" onClick={loadAudio}>音源を読み込む</button>}
        {aud && (<>
          <div style={{ fontSize: 13, background: '#fff8ea', border: '1px solid #eadfcd', borderRadius: 8, padding: '8px 12px', marginBottom: 10, lineHeight: 1.7 }}>
            <b>記録のしかた</b><br />
            ① 「楽段の頭だけ記録」をオンにして<b>スペースキー</b>で再生。[Verse] や [Chorus] の1行目の歌い出しでスペースを押します(楽段の数だけ叩けば終わり)。<br />
            ② 「楽段の中を自動で割り振り」を押すと、楽段の中の行に時間が入ります。<br />
            ③ 「最初から再生(確認)」で流し聴きして、ずれた行だけ ▶ と ±0.1 で直すか、「ここから記録」でタップし直します。<br />
            ・叩き損ねたら <b>←キー</b> で戻って少し前から再生し直します。<b>Esc</b> で停止。<br />
            ・「楽段の頭だけ記録」をオフにすると、全部の行を1行ずつ記録できます。
          </div>
          {chordMsg && <div className="msg" style={{ marginBottom: 8 }}>{chordMsg}</div>}
          <div className="row" style={{ marginBottom: 8 }}>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={secMode} onChange={(e) => { setSecMode(e.target.checked); if (e.target.checked) { let k = tapIdx; while (k > 0 && !lines[k].start) k--; setTapIdx(k); } }} />楽段の頭だけ記録({sectionCount}か所)</label>
          </div>
          <div className="row">
            <button className="btn" onClick={() => { setTapIdx(0); startAt(0); }}>最初から記録</button>
            <button className="btn" onClick={() => startAt(0)}>最初から再生(確認)</button>
            <button className="btn" onClick={stop}>停止</button>
            <span className="mono">{fmt(t)}</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn pri" onClick={autoFill}>楽段の中を自動で割り振り</button>
            <button className="btn" onClick={autoRepeat}>繰り返し部分を自動で配置</button>
            <button className="btn" onClick={() => shiftAll(-0.1)}>全行 −0.1秒</button>
            <button className="btn" onClick={() => shiftAll(0.1)}>全行 +0.1秒</button>
            <button className="btn" onClick={() => setTapIdx(firstEmpty(lines))}>記録位置を最初の空欄へ</button>
            <button className="btn" onClick={clearAll}>時間を全部消す</button>
          </div>
          <div style={{ marginTop: 10 }}>
            {lines.map((l, i) => (
              <div key={i} ref={(el) => { rowRefs.current[i] = el; }} className={'tl' + (player.current && l.t != null && l.t <= t && (lines[i + 1]?.t ?? 1e9) > t ? ' now' : '')} style={i === tapIdx ? { boxShadow: 'inset 4px 0 0 #7a3d21' } : null}>
                <input type="number" step="0.1" value={l.t ?? ''} onChange={(e) => setTime(i, e.target.value)} />
                <span>{l.start && l.sec ? <b style={{ color: '#7a3d21' }}>[{l.sec}] </b> : null}{l.text}</span>
                <span className="row" style={{ gap: 4 }}>
                  <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => nudge(i, -0.1)}>-0.1</button>
                  <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => nudge(i, 0.1)}>+0.1</button>
                  <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => startAt(l.t != null ? l.t - 1.5 : resumeFrom(i))}>▶</button>
                  <button className="btn" style={{ minHeight: 34, padding: '0 8px' }} onClick={() => setTapIdx(i)}>ここから記録</button>
                </span>
              </div>
            ))}
          </div>
          <div className="sticky">
            <div style={{ textAlign: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#a8957a', minHeight: 18 }}>{lines[tapIdx - 1]?.text || ''}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#3a2a18', lineHeight: 1.4 }}>
                {lines[tapIdx]?.start && lines[tapIdx]?.sec ? <span style={{ fontSize: 14, color: '#7a3d21' }}>[{lines[tapIdx].sec}] </span> : null}{lines[tapIdx]?.text || ''}
              </div>
              <div style={{ fontSize: 15, color: '#7a6a54', minHeight: 20 }}>{lines[tapIdx + 1]?.text || '(最後の行)'}</div>
              <div style={{ fontSize: 12, color: '#7a6a54', marginTop: 4 }}>{tapIdx + 1} / {lines.length} 行目{secMode ? '(楽段の頭だけ)' : ''} ・ スペース=歌い出し ← =1行戻る Esc=停止</div>
            </div>
            <button className="btn pri tap" onClick={() => { if (!player.current) startAt(resumeFrom(tapIdx)); else tap(0); }}>{player.current ? 'この行の歌い出し!' : 'ここから再生して記録'}</button>
            <div className="row" style={{ marginTop: 8 }}><button className="btn pri" onClick={() => save({ lines, timed: lines.every((l) => l.t != null) }, 'タイミングを保存しました')}>タイミングを保存</button></div>
          </div>
        </>)}
      </div>

      <h2>コード(参考表示)</h2>
      <div className="card">
        {aud ? <button className="btn" onClick={async () => { setMsg('コードを推定中…(1〜2分かかります)'); const cs = await estimateChords(aud.track, (p) => setMsg(`コードを推定中… ${Math.round(p * 100)}%`)); setChordTxt(cs.map((c) => `${c.t} ${c.c}`).join('\n')); setMsg('推定しました。おかしな所は直して保存してください(秒数 コード名)。'); }}>伴奏からコードを推定</button>
          : <p>上の「音源を読み込む」の後に推定できます。</p>}
        <textarea value={chordTxt} onChange={(e) => setChordTxt(e.target.value)} style={{ minHeight: 160, marginTop: 8 }} placeholder={'12.4 Am\n14.2 F'} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn pri" onClick={() => {
            const cs = chordTxt.split('\n').map((r) => r.trim().split(/\s+/)).filter((p) => p.length >= 2 && !isNaN(Number(p[0]))).map((p) => ({ t: Number(p[0]), c: p[1] })).sort((a, b) => a.t - b.t);
            save({ chords: cs }, 'コードを保存しました');
          }}>コードを保存</button>
        </div>
      </div>

      <h2>リリックビデオ</h2>
      <div className="card"><Link className="btn pri" href={'/admin/video/' + id}>リリックビデオを作る</Link></div>
    </>
  );
}

export default function Page() { const { query } = useRouter(); return <AdminGate>{query.id ? <Editor id={query.id} /> : null}</AdminGate>; }
